import db from '../db';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';

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

      if (tx_type === 'outflow') {
        if (currentBal < numAmount) {
          throw new Error(`الرصيد المتاح (${currentBal} ج.م) لا يكفي لإتمام عملية الصرف (${numAmount} ج.م)`);
        }
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
      if (fromBal < numAmount) {
        throw new Error(`الرصيد المتاح في (${fromAcc.name}) هو ${fromBal} ج.م ولا يكفي لتحويل ${numAmount} ج.م`);
      }

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
  }
};

export default cashRepo;
