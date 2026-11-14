import db from '../db';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';
import { partiesRepo } from './partiesRepo';
import { getEntityCurrentBalance } from '../../services/balanceService';

export const cashRepo = {
  async getAccounts() {
    const accounts = await db.treasury_accounts.toArray();
    return accounts.map(a => ({
      ...a,
      current_balance: Number(a.current_balance) || 0,
    }));
  },

  async createAccount(data, userId = 'usr-accountant') {
    const id = `acc-${Date.now()}`;
    const account = {
      id,
      name: data.name,
      account_type: data.account_type || 'treasury',
      current_balance: Number(data.initial_balance) || 0,
      bank_account_number: data.bank_account_number || '',
      bank_name: data.bank_name || '',
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await db.treasury_accounts.add(account);
    await auditRepo.log(userId, 'CREATE_ACCOUNT', 'treasury_accounts', id, null, account);
    return account;
  },

  async getTransactions(filters = {}) {
    let txs = await db.cash_transactions.reverse().sortBy('created_at');
    if (filters.accountId) {
      txs = txs.filter(t => t.account_id === filters.accountId);
    }
    if (filters.txType) {
      txs = txs.filter(t => t.tx_type === filters.txType);
    }

    const accounts = await db.treasury_accounts.toArray();
    const accMap = new Map(accounts.map(a => [a.id, a.name]));

    return txs.map(t => ({
      ...t,
      account_name: accMap.get(t.account_id) || t.account_id,
      amount: Number(t.amount) || 0,
      balance_after: Number(t.balance_after) || 0,
    }));
  },

  async recordTransaction(data, userId = 'usr-accountant') {
    const { account_id, tx_type, category, amount, description, date, tx_date } = data;
    if (date || tx_date) {
      validateNotPastDate(date || tx_date, 'تاريخ المعاملة المالية');
    }
    const numAmount = Math.max(0, Number(amount) || 0);
    if (numAmount <= 0) throw new Error('قيمة الحركة يجب أن تكون أكبر من صفر');

    const txId = `tx-${Date.now()}`;
    const txNumber = `TXN-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.treasury_accounts, db.cash_transactions], async () => {
      const account = await db.treasury_accounts.get(account_id);
      if (!account) throw new Error('الحساب المالي غير موجود');

      let currentBal = Number(account.current_balance) || 0;
      let newBal = currentBal;

      // Treasury balance is allowed to go negative/overdraft on outflows unconditionally (never blocked)
      if (tx_type === 'outflow') {
        newBal = Number((currentBal - numAmount).toFixed(2));
      } else {
        newBal = Number((currentBal + numAmount).toFixed(2));
      }

      await db.treasury_accounts.update(account_id, { current_balance: newBal });

      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id,
        tx_type,
        category: category || 'other',
        amount: numAmount,
        balance_after: newBal,
        reference_type: 'MANUAL',
        reference_id: txId,
        description: description || 'حركة مالية يدوية',
        created_by: userId,
        created_at: now,
      });
    });

    await auditRepo.log(userId, 'RECORD_CASH_TRANSACTION', 'cash_transactions', txId, null, data);
    return { success: true, txId, txNumber };
  },

  async transfer(data, userId = 'usr-accountant') {
    const { from_account_id, to_account_id, amount, notes } = data;
    const numAmount = Math.max(0, Number(amount) || 0);
    if (numAmount <= 0) throw new Error('مبلغ التحويل يجب أن يكون أكبر من صفر');
    if (from_account_id === to_account_id) throw new Error('لا يمكن التحويل لنفس الحساب');

    const now = new Date().toISOString();

    await db.transaction('rw', [db.treasury_accounts, db.cash_transactions], async () => {
      const fromAcc = await db.treasury_accounts.get(from_account_id);
      const toAcc = await db.treasury_accounts.get(to_account_id);
      if (!fromAcc || !toAcc) throw new Error('أحد الحسابات المحددة غير موجود');

      const fromBal = Number(fromAcc.current_balance) || 0;
      // Treasury balance is allowed to go negative/overdraft on transfers (never blocked)
      const newFromBal = Number((fromBal - numAmount).toFixed(2));
      const newToBal = Number(((Number(toAcc.current_balance) || 0) + numAmount).toFixed(2));

      await db.treasury_accounts.update(from_account_id, { current_balance: newFromBal });
      await db.treasury_accounts.update(to_account_id, { current_balance: newToBal });

      // Outflow from source
      await db.cash_transactions.add({
        id: `tx-${Date.now()}-out`,
        tx_number: `TXN-${Date.now().toString().slice(-4)}-OUT`,
        account_id: from_account_id,
        tx_type: 'outflow',
        category: 'transfer',
        amount: numAmount,
        balance_after: newFromBal,
        reference_type: 'TRANSFER',
        reference_id: to_account_id,
        description: `تحويل صادرة إلى (${toAcc.name}): ${notes || ''}`,
        created_by: userId,
        created_at: now,
      });

      // Inflow to destination
      await db.cash_transactions.add({
        id: `tx-${Date.now()}-in`,
        tx_number: `TXN-${Date.now().toString().slice(-4)}-IN`,
        account_id: to_account_id,
        tx_type: 'inflow',
        category: 'transfer',
        amount: numAmount,
        balance_after: newToBal,
        reference_type: 'TRANSFER',
        reference_id: from_account_id,
        description: `تحويل وارد من (${fromAcc.name}): ${notes || ''}`,
        created_by: userId,
        created_at: now,
      });
    });

    await auditRepo.log(userId, 'TRANSFER_CASH', 'treasury_accounts', from_account_id, null, data);
    return { success: true };
  },

  /**
   * Cash Disbursement: صرف النقدية المرتبطة بأكواد المصروفات
   */
  async disburseExpense(data, userId = 'usr-accountant') {
    const { expense_code_id, expense_name, account_id, amount, description, tx_date } = data;
    if (tx_date) validateNotPastDate(tx_date, 'تاريخ سند الصرف');
    const numAmount = Math.max(0, Number(amount) || 0);
    if (numAmount <= 0) throw new Error('مبلغ الصرف يجب أن يكون أكبر من صفر');

    const txId = `tx-${Date.now()}`;
    const txNumber = `TXN-EXP-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.treasury_accounts, db.cash_transactions], async () => {
      const account = await db.treasury_accounts.get(account_id);
      if (!account) throw new Error('الخزينة المحددة غير موجودة');

      const currentBal = Number(account.current_balance) || 0;
      // Treasury balance is allowed to go negative/overdraft unconditionally (never blocked)
      const newBal = Number((currentBal - numAmount).toFixed(2));
      await db.treasury_accounts.update(account_id, { current_balance: newBal });

      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id,
        tx_type: 'outflow',
        category: 'operating_expense',
        amount: numAmount,
        balance_after: newBal,
        reference_type: 'EXPENSE_DISBURSEMENT',
        reference_id: expense_code_id || null,
        description: `صرف مصروف (${expense_name || 'تشغيلي'}): ${description || ''}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'DISBURSE_EXPENSE', 'cash_transactions', txId, null, data);
    return { success: true, txId, txNumber };
  },

  /**
   * Record Supplier Payment (مدفوعات مورد)
   * Reduces supplier debt and treasury in ONE atomic transaction.
   * Treasury may go negative (never blocked).
   */
  async recordSupplierPayment(data, userId = 'usr-accountant') {
    const { supplier_id, amount, payment_date, payment_method, account_id, notes } = data;
    if (payment_date) validateNotPastDate(payment_date, 'تاريخ سند الصرف للمورد');

    const payAmount = Math.max(0, Number(amount) || 0);
    if (payAmount <= 0) throw new Error('مبلغ دفعة المورد يجب أن يكون رقماً أكبر من صفر');

    // Retrieve supplier and current balance via Central Balance Engine
    let party = await db.parties.get(supplier_id);
    if (!party && db.suppliers) {
      party = await db.suppliers.get(supplier_id);
    }
    if (!party) throw new Error('المورد أو الورشة المحددة غير موجودة بالنظام');

    const bal = await getEntityCurrentBalance(supplier_id);
    const owedBalance = Number(bal.supplierBalance) || 0;
    const isAdvance = owedBalance <= 0 || payAmount > owedBalance;

    // Default to main treasury if not provided
    let targetAccId = account_id;
    if (!targetAccId) {
      let mainAcc = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                    (await db.treasury_accounts.toCollection().first());
      if (!mainAcc) {
        mainAcc = {
          id: 'treasury-main-auto',
          code: 'TRS-01',
          name: 'الخزينة الرئيسية',
          current_balance: 0,
          opening_balance: 0,
          is_main: 1,
          is_active: 1,
          created_at: new Date().toISOString()
        };
        await db.treasury_accounts.add(mainAcc);
      }
      targetAccId = mainAcc.id;
    }

    const rnd = Math.floor(Math.random() * 100000);
    const paymentId = `spay-${Date.now()}-${rnd}`;
    const paymentNumber = `PAY-SUP-${Date.now().toString().slice(-4)}-${rnd.toString().slice(-3)}`;
    const txId = `tx-${Date.now()}-${rnd}`;
    const txNumber = `TXN-PAY-${Date.now().toString().slice(-4)}-${rnd.toString().slice(-3)}`;
    const now = new Date().toISOString();

    let finalAccBal = 0;

    await db.transaction('rw', [
      db.payments,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      const account = await db.treasury_accounts.get(targetAccId);
      if (!account) throw new Error('الخزينة المحددة غير موجودة');

      const currentAccBal = Number(account.current_balance) || 0;
      // Treasury CAN go negative (never blocked)
      finalAccBal = Number((currentAccBal - payAmount).toFixed(2));
      await db.treasury_accounts.update(targetAccId, { current_balance: finalAccBal });

      // Record in payments table (shared supplier payment ledger)
      await db.payments.add({
        id: paymentId,
        payment_number: paymentNumber,
        supplier_id,
        invoice_id: null,
        production_order_id: data.production_order_id || null,
        stage_type: data.stage_type || null,
        account_id: targetAccId,
        amount: payAmount,
        payment_date: payment_date || now.split('T')[0],
        payment_method: payment_method || 'نقداً',
        notes: notes || (isAdvance ? (owedBalance <= 0 ? 'دفعة مقدمة تحت الحساب' : 'سداد رصيد مع دفعة مقدمة تحت الحساب') : ''),
        is_advance: isAdvance ? 1 : 0,
        status: 'issued',
        created_by: userId,
        created_at: now
      });

      // Record cash transaction outflow
      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id: targetAccId,
        tx_type: 'outflow',
        category: 'supplier_payment',
        amount: payAmount,
        balance_after: finalAccBal,
        reference_type: 'SUPPLIER_PAYMENT',
        reference_id: paymentId,
        description: `سداد دفعة للمورد: ${party.name}${notes ? ' - ' + notes : (isAdvance ? ' (دفعة مقدمة تحت الحساب)' : '')}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'RECORD_SUPPLIER_PAYMENT', 'payments', paymentId, null, {
      ...data,
      paymentNumber,
      txNumber,
      balance_after: finalAccBal
    });

    return {
      success: true,
      id: paymentId,
      paymentId,
      paymentNumber,
      amount: data.amount,
      txNumber,
      treasuryBalanceAfter: finalAccBal,
      isAdvance,
      owedBalanceBefore: owedBalance
    };
  },

  /**
   * Record Customer Receipt (استلام نقدية من عميل)
   * Increases treasury and reduces customer debt in ONE atomic transaction.
   */
  async recordCustomerReceipt(data, userId = 'usr-accountant') {
    const { customer_id, amount, payment_date, payment_method, account_id, notes } = data;
    if (payment_date) validateNotPastDate(payment_date, 'تاريخ سند استلام النقدية');

    const recAmount = Math.max(0, Number(amount) || 0);
    if (recAmount <= 0) throw new Error('قيمة الدفعة المستلمة يجب أن تكون أكبر من صفر');

    // Retrieve customer and current balance via Central Balance Engine
    let party = await db.parties.get(customer_id);
    if (!party && db.customers) {
      party = await db.customers.get(customer_id);
    }
    if (!party) throw new Error('العميل المحدد غير موجود بالنظام');

    const bal = await getEntityCurrentBalance(customer_id);
    const owedBalance = Number(bal.customerBalance) || 0;
    const isAdvance = owedBalance <= 0 || recAmount > owedBalance;

    // Default to main treasury if not provided
    let targetAccId = account_id;
    if (!targetAccId) {
      let mainAcc = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                    (await db.treasury_accounts.toCollection().first());
      if (!mainAcc) {
        mainAcc = {
          id: 'treasury-main-auto',
          code: 'TRS-01',
          name: 'الخزينة الرئيسية',
          current_balance: 0,
          opening_balance: 0,
          is_main: 1,
          is_active: 1,
          created_at: new Date().toISOString()
        };
        await db.treasury_accounts.add(mainAcc);
      }
      targetAccId = mainAcc.id;
    }

    const rnd = Math.floor(Math.random() * 100000);
    const receiptId = `cpay-${Date.now()}-${rnd}`;
    const receiptNumber = `REC-CUST-${Date.now().toString().slice(-4)}-${rnd.toString().slice(-3)}`;
    const txId = `tx-${Date.now()}-${rnd}`;
    const txNumber = `TXN-REC-${Date.now().toString().slice(-4)}-${rnd.toString().slice(-3)}`;
    const now = new Date().toISOString();

    let finalAccBal = 0;

    await db.transaction('rw', [
      db.customer_payments,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      const account = await db.treasury_accounts.get(targetAccId);
      if (!account) throw new Error('الخزينة المحددة غير موجودة');

      const currentAccBal = Number(account.current_balance) || 0;
      finalAccBal = Number((currentAccBal + recAmount).toFixed(2));
      await db.treasury_accounts.update(targetAccId, { current_balance: finalAccBal });

      // Record in customer_payments table
      await db.customer_payments.add({
        id: receiptId,
        receipt_number: receiptNumber,
        customer_id,
        invoice_id: null,
        account_id: targetAccId,
        amount: recAmount,
        payment_date: payment_date || now.split('T')[0],
        payment_method: payment_method || 'نقداً',
        notes: notes || (isAdvance ? (owedBalance <= 0 ? 'دفعة مقدمة تحت الحساب' : 'سداد رصيد مع دفعة مقدمة تحت الحساب') : ''),
        is_advance: isAdvance ? 1 : 0,
        status: 'issued',
        created_by: userId,
        created_at: now
      });

      // Record cash transaction inflow
      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id: targetAccId,
        tx_type: 'inflow',
        category: 'customer_payment',
        amount: recAmount,
        balance_after: finalAccBal,
        reference_type: 'CUSTOMER_RECEIPT',
        reference_id: receiptId,
        description: `استلام دفعة نقدية من العميل: ${party.name}${notes ? ' - ' + notes : (isAdvance ? ' (دفعة مقدمة تحت الحساب)' : '')}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'RECORD_CUSTOMER_RECEIPT', 'customer_payments', receiptId, null, {
      ...data,
      receiptNumber,
      txNumber,
      balance_after: finalAccBal
    });

    return {
      success: true,
      id: receiptId,
      receiptId,
      receiptNumber,
      amount: data.amount,
      txNumber,
      treasuryBalanceAfter: finalAccBal,
      isAdvance,
      owedBalanceBefore: owedBalance
    };
  },

  /**
   * Cancel Supplier Payment via Reversing Entry (never deleted)
   */
  async cancelSupplierPayment(paymentId, reason = '', userId = 'usr-accountant') {
    const payment = await db.payments.get(paymentId);
    if (!payment) throw new Error('سند صرف دفعة المورد غير موجود');
    if (payment.status === 'cancelled') throw new Error('سند الصرف ملغي بالفعل');

    const now = new Date().toISOString();
    const txId = `tx-rev-${Date.now()}`;
    const txNumber = `TXN-REV-${Date.now().toString().slice(-4)}`;

    await db.transaction('rw', [
      db.payments,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      // 1. Mark payment as cancelled
      await db.payments.update(paymentId, {
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_at: now,
        cancelled_by: userId
      });

      // 2. Reverse effect on treasury (inflow)
      const account = await db.treasury_accounts.get(payment.account_id);
      if (account) {
        const curBal = Number(account.current_balance) || 0;
        const newBal = Number((curBal + Number(payment.amount)).toFixed(2));
        await db.treasury_accounts.update(payment.account_id, { current_balance: newBal });

        // Record reversing cash transaction
        await db.cash_transactions.add({
          id: txId,
          tx_number: txNumber,
          account_id: payment.account_id,
          tx_type: 'inflow',
          category: 'supplier_payment_reversal',
          amount: Number(payment.amount),
          balance_after: newBal,
          reference_type: 'PAYMENT_REVERSAL',
          reference_id: paymentId,
          description: `إلغاء وقيد عكسي لسند صرف المورد ${payment.payment_number}: ${reason || 'إلغاء معتمد'}`,
          created_by: userId,
          created_at: now
        });
      }
    });

    await auditRepo.log(userId, 'CANCEL_SUPPLIER_PAYMENT', 'payments', paymentId, payment, { status: 'cancelled', reason });
    return { success: true };
  },

  /**
   * Cancel Customer Receipt via Reversing Entry (never deleted)
   */
  async cancelCustomerReceipt(receiptId, reason = '', userId = 'usr-accountant') {
    const receipt = await db.customer_payments.get(receiptId);
    if (!receipt) throw new Error('سند استلام النقدية غير موجود');
    if (receipt.status === 'cancelled') throw new Error('سند الاستلام ملغي بالفعل');

    const now = new Date().toISOString();
    const txId = `tx-rev-${Date.now()}`;
    const txNumber = `TXN-REV-${Date.now().toString().slice(-4)}`;

    await db.transaction('rw', [
      db.customer_payments,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      // 1. Mark receipt as cancelled
      await db.customer_payments.update(receiptId, {
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_at: now,
        cancelled_by: userId
      });

      // 2. Reverse effect on treasury (outflow)
      const account = await db.treasury_accounts.get(receipt.account_id);
      if (account) {
        const curBal = Number(account.current_balance) || 0;
        const newBal = Number((curBal - Number(receipt.amount)).toFixed(2));
        await db.treasury_accounts.update(receipt.account_id, { current_balance: newBal });

        // Record reversing cash transaction
        await db.cash_transactions.add({
          id: txId,
          tx_number: txNumber,
          account_id: receipt.account_id,
          tx_type: 'outflow',
          category: 'customer_receipt_reversal',
          amount: Number(receipt.amount),
          balance_after: newBal,
          reference_type: 'RECEIPT_REVERSAL',
          reference_id: receiptId,
          description: `إلغاء وقيد عكسي لسند تحصيل العميل ${receipt.receipt_number}: ${reason || 'إلغاء معتمد'}`,
          created_by: userId,
          created_at: now
        });
      }
    });

    await auditRepo.log(userId, 'CANCEL_CUSTOMER_RECEIPT', 'customer_payments', receiptId, receipt, { status: 'cancelled', reason });
    return { success: true };
  },

  /**
   * Update Supplier Payment (تعديل سند صرف دفعة مورد)
   * Adjusts treasury balance by delta and updates payment record and cash transaction atomically.
   */
  async updateSupplierPayment(paymentId, updateData, userId = 'usr-accountant') {
    const payment = await db.payments.get(paymentId);
    if (!payment) throw new Error('سند صرف دفعة المورد غير موجود');
    if (payment.status === 'cancelled') throw new Error('لا يمكن تعديل سند صرف ملغي');

    const oldAmount = Number(payment.amount) || 0;
    const newAmount = updateData.amount !== undefined ? Math.max(0, Number(updateData.amount) || 0) : oldAmount;
    if (newAmount <= 0) throw new Error('مبلغ الدفعة المعدل يجب أن يكون رقماً أكبر من صفر');

    const delta = Number((newAmount - oldAmount).toFixed(2));
    const targetAccId = updateData.account_id || payment.account_id;
    const now = new Date().toISOString();

    await db.transaction('rw', [
      db.payments,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      // 1. Adjust treasury balance (if delta > 0 more paid so treasury decreases; if delta < 0 less paid so treasury increases)
      const account = await db.treasury_accounts.get(targetAccId);
      if (account && delta !== 0) {
        const curBal = Number(account.current_balance) || 0;
        const newBal = Number((curBal - delta).toFixed(2));
        await db.treasury_accounts.update(targetAccId, { current_balance: newBal });
      }

      // 2. Update payment record
      await db.payments.update(paymentId, {
        amount: newAmount,
        payment_date: updateData.payment_date || payment.payment_date,
        notes: updateData.notes !== undefined ? updateData.notes : payment.notes,
        updated_at: now,
        updated_by: userId
      });

      // 3. Update related cash transaction
      const relatedTx = await db.cash_transactions.where('reference_id').equals(paymentId).first();
      if (relatedTx) {
        await db.cash_transactions.update(relatedTx.id, {
          amount: newAmount,
          description: `تعديل سند صرف المورد ${payment.payment_number}`,
          updated_at: now
        });
      }
    });

    await auditRepo.log(userId, 'UPDATE_SUPPLIER_PAYMENT', 'payments', paymentId, payment, { amount: newAmount, delta });
    return { success: true, paymentId, oldAmount, newAmount, delta };
  },

  /**
   * Update Customer Receipt (تعديل سند تحصيل نقدية عميل)
   * Adjusts treasury balance by delta and updates receipt record and cash transaction atomically.
   */
  async updateCustomerReceipt(receiptId, updateData, userId = 'usr-accountant') {
    const receipt = await db.customer_payments.get(receiptId);
    if (!receipt) throw new Error('سند استلام النقدية غير موجود');
    if (receipt.status === 'cancelled') throw new Error('لا يمكن تعديل سند استلام ملغي');

    const oldAmount = Number(receipt.amount) || 0;
    const newAmount = updateData.amount !== undefined ? Math.max(0, Number(updateData.amount) || 0) : oldAmount;
    if (newAmount <= 0) throw new Error('قيمة الدفعة المستلمة يجب أن تكون أكبر من صفر');

    const delta = Number((newAmount - oldAmount).toFixed(2));
    const targetAccId = updateData.account_id || receipt.account_id;
    const now = new Date().toISOString();

    await db.transaction('rw', [
      db.customer_payments,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      // 1. Adjust treasury balance (if delta > 0 more received so treasury increases; if delta < 0 less received so treasury decreases)
      const account = await db.treasury_accounts.get(targetAccId);
      if (account && delta !== 0) {
        const curBal = Number(account.current_balance) || 0;
        const newBal = Number((curBal + delta).toFixed(2));
        await db.treasury_accounts.update(targetAccId, { current_balance: newBal });
      }

      // 2. Update receipt record
      await db.customer_payments.update(receiptId, {
        amount: newAmount,
        payment_date: updateData.payment_date || receipt.payment_date,
        notes: updateData.notes !== undefined ? updateData.notes : receipt.notes,
        updated_at: now,
        updated_by: userId
      });

      // 3. Update related cash transaction
      const relatedTx = await db.cash_transactions.where('reference_id').equals(receiptId).first();
      if (relatedTx) {
        await db.cash_transactions.update(relatedTx.id, {
          amount: newAmount,
          description: `تعديل سند استلام النقدية ${receipt.receipt_number}`,
          updated_at: now
        });
      }
    });

    await auditRepo.log(userId, 'UPDATE_CUSTOMER_RECEIPT', 'customer_payments', receiptId, receipt, { amount: newAmount, delta });
    return { success: true, receiptId, oldAmount, newAmount, delta };
  }
};

export default cashRepo;


