import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import BalanceCalculator, {
  resolveOpeningBalance,
  resolveOpeningType,
  normalizeOpeningBalance,
  normalizeAccountNature,
  DEFAULT_CUSTOMER_OPENING_TYPE,
} from '../../logic/balances';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';

export const salesRepo = {
  async getCustomers() {
    const list = await db.customers.toArray();
    const invoices = await db.sales_invoices.toArray();
    const returns = await db.customer_returns.toArray();

    return list.map(c => {
      const custInvoices = invoices.filter(i => i.customer_id === c.id);
      const custReturns = returns.filter(r => r.customer_id === c.id);
      // Current Balance = Opening Balance + Credit Sales - Cash In / Receipts
      const opening = resolveOpeningBalance(c, 'customer');
      const bal = BalanceCalculator.calculateCustomerBalance(custInvoices, custReturns, opening);

      return {
        ...c,
        opening_balance: opening,
        opening_balance_type: resolveOpeningType(c, 'customer'),
        total_invoiced: bal.totalInvoiced,
        total_paid: bal.totalPaid,
        balance_due: bal.balanceDue,
        outstanding_balance: bal.balanceDue,
        current_balance: bal.balanceDue,
        customer_balance: bal.balanceDue,
      };
    });
  },

  async createCustomer(data, userId = 'usr-accountant') {
    const id = `cust-${Date.now()}`;
    const opening = normalizeOpeningBalance(data.opening_balance ?? data.customer_opening_balance ?? 0);
    const customer = {
      id,
      name: data.name,
      phone: data.phone || '',
      address: data.address || '',
      tax_number: data.tax_number || '',
      customer_type: data.customer_type || 'local',
      payment_terms: data.payment_terms || 'cash',
      credit_limit: Number(data.credit_limit) || 0,
      opening_balance: opening,
      opening_balance_type: normalizeAccountNature(
        data.opening_balance_type ?? data.customer_opening_type,
        DEFAULT_CUSTOMER_OPENING_TYPE
      ),
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await db.customers.add(customer);
    await auditRepo.log(userId, 'CREATE_CUSTOMER', 'customers', id, null, customer);
    return customer;
  },

  async getCustomerStatement(id) {
    const customer = await db.customers.get(id);
    if (!customer) throw new Error('العميل غير موجود');

    const invoices = await db.sales_invoices.where('customer_id').equals(id).toArray();
    const payments = await db.customer_payments.where('customer_id').equals(id).toArray();
    const returns = await db.customer_returns.where('customer_id').equals(id).toArray();

    const opening = resolveOpeningBalance(customer, 'customer');
    const openingType = resolveOpeningType(customer, 'customer');
    const transactions = [];

    // Opening balance row (رصيد أول المدة) comes first chronologically
    if (opening > 0) {
      transactions.push({
        date: customer.created_at ? String(customer.created_at).split('T')[0] : '',
        type: 'رصيد أول المدة',
        reference: 'OPENING',
        description: `رصيد افتتاحي (${openingType === 'credit' ? 'دائن' : 'مدين'})`,
        debit: opening,
        credit: 0,
        raw_date: '0000-00-00T00:00:00.000Z',
        is_opening: true,
      });
    }

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        transactions.push({
          date: inv.invoice_date,
          type: 'فاتورة مبيعات',
          reference: inv.invoice_number,
          description: inv.notes || 'مبيعات منتجات تامة',
          debit: Number(inv.total_invoice_amount) || 0, // Customer owes us
          credit: 0,
          raw_date: inv.created_at || inv.invoice_date,
        });
      }
    }

    for (const pay of payments) {
      transactions.push({
        date: pay.payment_date,
        type: 'سند تحصيل',
        reference: pay.receipt_number,
        description: pay.notes || 'سداد دفعة نقدية/تحويل',
        debit: 0,
        credit: Number(pay.amount) || 0,
        raw_date: pay.created_at || pay.payment_date,
      });
    }

    for (const ret of returns) {
      transactions.push({
        date: ret.return_date,
        type: 'مرتجع مبيعات',
        reference: ret.return_number,
        description: ret.reason || 'رد بضاعة من العميل',
        debit: 0,
        credit: Number(ret.refund_amount) || 0,
        raw_date: ret.created_at || ret.return_date,
      });
    }

    transactions.sort((a, b) => new Date(a.raw_date).getTime() - new Date(b.raw_date).getTime());

    let runningBalance = opening;
    const ledger = transactions.map(tx => {
      runningBalance = runningBalance + tx.debit - tx.credit;
      return {
        ...tx,
        balance_after: Number(runningBalance.toFixed(2)),
      };
    });

    const bal = BalanceCalculator.calculateCustomerBalance(invoices, returns, opening);

    return {
      customer: { ...customer, opening_balance: opening, opening_balance_type: openingType, ...bal },
      statement: ledger,
      invoices,
      payments,
      summary: {
        opening_balance: opening,
        opening_balance_type: openingType,
        total_sales: bal.totalInvoiced || 0,
        total_collected: bal.totalPaid || 0,
        remaining_balance: bal.balanceDue || 0,
      },
      total_invoiced: bal.totalInvoiced,
      total_paid: bal.totalPaid,
      balance_due: bal.balanceDue,
    };
  },

  async getOutlets() {
    return await db.sales_outlets.toArray();
  },

  async createOutlet(data, userId = 'usr-owner') {
    const id = `out-${Date.now()}`;
    const outlet = {
      id,
      name: data.name,
      location: data.location || '',
      contact_phone: data.contact_phone || '',
      price_markup_percent: Number(data.price_markup_percent) || 0,
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString(),
    };
    await db.sales_outlets.add(outlet);
    await auditRepo.log(userId, 'CREATE_OUTLET', 'sales_outlets', id, null, outlet);
    return outlet;
  },

  async getSalesInvoices(outletId = null) {
    let invoices = await db.sales_invoices.reverse().sortBy('created_at');
    if (outletId) {
      invoices = invoices.filter(i => i.outlet_id === outletId);
    }
    const customers = await db.customers.toArray();
    const custMap = new Map(customers.map(c => [c.id, c.name]));
    const outlets = await db.sales_outlets.toArray();
    const outMap = new Map(outlets.map(o => [o.id, o.name]));
    const items = await db.sales_invoice_items.toArray();
    const products = await db.products.toArray();
    const prodMap = new Map(products.map(p => [p.id, p]));

    return invoices.map(i => {
      const invItems = items.filter(it => it.invoice_id === i.id).map(it => {
        const prod = prodMap.get(it.product_id);
        return {
          ...it,
          product_name: prod ? prod.name : it.product_id,
          product_code: prod ? prod.code : '',
        };
      });

      return {
        ...i,
        customer_name: custMap.get(i.customer_id) || i.customer_id,
        outlet_name: outMap.get(i.outlet_id) || 'المعرض الرئيسي',
        items: invItems,
        remaining_amount: Math.max(0, Number(((Number(i.total_invoice_amount) || 0) - (Number(i.paid_amount) || 0)).toFixed(2))),
      };
    });
  },

  async createSalesInvoice(data, userId = 'usr-accountant') {
    if (data.invoice_date) validateNotPastDate(data.invoice_date, 'تاريخ فاتورة المبيعات');
    if (data.due_date && data.payment_terms === 'credit') validateNotPastDate(data.due_date, 'تاريخ استحقاق الفاتورة');
    const id = `sinv-${Date.now()}`;
    const invoiceNumber = data.invoice_number || `INV-SLS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const paymentTerms = data.payment_terms || 'cash';
    const isExport = data.is_export ? 1 : 0;
    const currency = data.currency || 'EGP';
    const exchangeRate = Math.max(0.0001, Number(data.exchange_rate) || 1.0);

    const shipping = Math.max(0, Number(data.shipping_expense) || 0);
    const customs = Math.max(0, Number(data.customs_expense) || 0);
    const commission = Math.max(0, Number(data.commission_expense) || 0);
    const totalSellingExpenses = Number((shipping + customs + commission).toFixed(2));
    const settings = await db.settings.get(1);

    let subtotal = 0;
    let totalCogs = 0;
    const invoiceItems = [];

    // Calculate subtotal and line items
    for (let idx = 0; idx < (data.items || []).length; idx++) {
      const item = data.items[idx];
      const qty = Math.max(1, Number(item.quantity) || 1);
      const priceBeforeDiscount = Math.max(0, Number(item.price_before_discount ?? item.unit_selling_price) || 0);
      const discountValue = Math.max(0, Number(item.discount_value) || 0);
      const unitSellingPrice = Math.max(0, Number(item.unit_selling_price ?? (priceBeforeDiscount - discountValue)) || 0);
      const totalPrice = Number((qty * unitSellingPrice).toFixed(2));
      subtotal += totalPrice;

      const unitCost = Number(item.unit_cost) || 0;
      const totalItemCost = Number((qty * unitCost).toFixed(2));
      totalCogs += totalItemCost;
      const itemProfit = Number((totalPrice - totalItemCost).toFixed(2));

      invoiceItems.push({
        id: `sii-${Date.now()}-${idx}`,
        invoice_id: id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        finishing_order_id: item.finishing_order_id || null,
        quantity: qty,
        price_before_discount: priceBeforeDiscount,
        discount_value: discountValue,
        unit_cost: unitCost,
        unit_selling_price: unitSellingPrice,
        total_price: totalPrice,
        total_cost: totalItemCost,
        item_net_profit: itemProfit,
      });
    }

    const vatRate = (settings && settings.vat_enabled && !isExport) ? (Number(settings.vat_rate_percent) || 14) : 0;
    const taxAmount = Number(((subtotal * vatRate) / 100).toFixed(2));
    const totalInvoiceAmount = Number((subtotal + taxAmount).toFixed(2));

    const paidAmount = paymentTerms === 'cash'
      ? totalInvoiceAmount
      : Math.max(0, Number(data.paid_amount) || 0);

    // Validation: Credit Limit on Customer
    // Applies only to customers with type "آجل" and only to credit invoices. Cash customers are never blocked by a limit.
    if (paymentTerms === 'credit' && data.customer_id) {
      const customer = await db.customers.get(data.customer_id);
      const isCustomerCredit = customer && (
        customer.customer_deal_type === 'credit' ||
        (customer.customer_deal_type !== 'cash' && customer.payment_terms === 'credit')
      );
      if (isCustomerCredit && customer.credit_limit > 0) {
        const stmt = await this.getCustomerStatement(data.customer_id);
        const currentBalance = stmt.summary?.remaining_balance || stmt.balance_due || 0;
        const totalDueAfterThisInvoice = Number((currentBalance + (totalInvoiceAmount - paidAmount)).toFixed(2));
        const limit = Number(customer.credit_limit) || 0;

        if (totalDueAfterThisInvoice > limit) {
          const excess = Number((totalDueAfterThisInvoice - limit).toFixed(2));
          throw new Error(
            `لا يمكن حفظ الفاتورة: إجمالي مديونية العميل مع الفاتورة الحالية ستصبح (${totalDueAfterThisInvoice} ج.م) وهي تتجاوز الحد الائتماني المسموح به (${limit} ج.م) بمقدار (${excess} ج.م). يرجى تحصيل دفعة نقدية أولاً أو زيادة الحد الائتماني.`
          );
        }
      }
    }

    let status = 'unpaid';
    if (paidAmount >= totalInvoiceAmount && totalInvoiceAmount > 0) {
      status = 'paid';
    } else if (paidAmount > 0) {
      status = 'partially_paid';
    }

    const netProfit = CostCalculator.calculateNetProfit(subtotal, totalCogs, totalSellingExpenses);

    const invoice = {
      id,
      invoice_number: invoiceNumber,
      customer_id: data.customer_id,
      outlet_id: data.outlet_id || null,
      payment_terms: paymentTerms,
      invoice_date: data.invoice_date || now.split('T')[0],
      due_date: paymentTerms === 'credit' ? (data.due_date || null) : null, // Cash has NO due date
      is_export: isExport,
      currency,
      exchange_rate: exchangeRate,
      subtotal: Number(subtotal.toFixed(2)),
      tax_amount: taxAmount,
      shipping_expense: shipping,
      customs_expense: customs,
      commission_expense: commission,
      total_selling_expenses: totalSellingExpenses,
      total_invoice_amount: totalInvoiceAmount,
      total_cogs: Number(totalCogs.toFixed(2)),
      net_profit: netProfit,
      paid_amount: paidAmount,
      status,
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    await db.transaction('rw', [db.sales_invoices, db.sales_invoice_items, db.products, db.items, db.treasury_accounts, db.cash_transactions], async () => {
      await db.sales_invoices.add(invoice);
      for (const ii of invoiceItems) {
        await db.sales_invoice_items.add(ii);

        // Deduct finished stock from product and item
        const prod = await db.products.get(ii.product_id);
        if (prod) {
          const newStock = Number(((Number(prod.current_finished_stock) || 0) - ii.quantity).toFixed(2));
          await db.products.update(prod.id, { current_finished_stock: newStock });
        }
        const itemMaster = await db.items.get(ii.product_id);
        if (itemMaster) {
          const newStock = Number(((Number(itemMaster.current_stock) || 0) - ii.quantity).toFixed(2));
          await db.items.update(itemMaster.id, { current_stock: newStock });
        }
      }

      // If Cash invoice or paid amount > 0, record cash inflow in outlet treasury
      if (paidAmount > 0) {
        let treasury = null;
        if (data.outlet_id) {
          treasury = await db.treasury_accounts.where('outlet_id').equals(data.outlet_id).first();
        }
        if (!treasury) {
          treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                     (await db.treasury_accounts.where('account_type').equals('treasury').first());
        }

        if (treasury) {
          const currentBal = Number(treasury.current_balance) || 0;
          const newBal = Number((currentBal + paidAmount).toFixed(2));
          await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

          await db.cash_transactions.add({
            id: `tx-${Date.now()}`,
            tx_number: `TXN-${Date.now().toString().slice(-4)}`,
            account_id: treasury.id,
            tx_type: 'inflow',
            category: 'sales',
            amount: paidAmount,
            balance_after: newBal,
            reference_type: 'sales_invoices',
            reference_id: id,
            description: `تحصيل فاتورة مبيعات ${invoiceNumber}`,
            created_by: userId,
            created_at: now
          });
        }
      }
    });

    await auditRepo.log(userId, 'CREATE_SALES_INVOICE', 'sales_invoices', id, null, { invoiceNumber, subtotal, paymentTerms });
    return invoice;
  },

  async collectPayment(data, userId = 'usr-accountant') {
    const { customer_id, invoice_id, account_id, amount, payment_date, payment_method, notes } = data;
    if (payment_date) validateNotPastDate(payment_date, 'تاريخ سند التحصيل');
    const colAmount = Math.max(0, Number(amount) || 0);
    if (colAmount <= 0) throw new Error('مبلغ التحصيل يجب أن يكون أكبر من صفر');

    const paymentId = `cpay-${Date.now()}`;
    const receiptNumber = `REC-SLS-${Date.now().toString().slice(-4)}`;
    const txId = `tx-${Date.now()}`;
    const txNumber = `TXN-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.customer_payments, db.sales_invoices, db.treasury_accounts, db.cash_transactions], async () => {
      const account = await db.treasury_accounts.get(account_id);
      if (!account) throw new Error('الحساب المالي أو الخزينة غير موجودة');

      const currentAccBal = Number(account.current_balance) || 0;
      const newAccBal = Number((currentAccBal + colAmount).toFixed(2));
      await db.treasury_accounts.update(account_id, { current_balance: newAccBal });

      // Record customer receipt
      await db.customer_payments.add({
        id: paymentId,
        receipt_number: receiptNumber,
        customer_id,
        invoice_id: invoice_id || null,
        account_id,
        amount: colAmount,
        payment_date: payment_date || now.split('T')[0],
        payment_method: payment_method || 'cash',
        notes: notes || '',
        created_by: userId,
        created_at: now,
      });

      // Record cash inflow transaction
      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id,
        tx_type: 'inflow',
        category: 'customer_payment',
        amount: colAmount,
        balance_after: newAccBal,
        reference_type: 'sales_invoices',
        reference_id: invoice_id || null,
        description: `تحصيل من العميل: ${notes || receiptNumber}`,
        created_by: userId,
        created_at: now,
      });

      // Update invoice paid amount & status if linked
      if (invoice_id) {
        const inv = await db.sales_invoices.get(invoice_id);
        if (inv) {
          const oldPaid = Number(inv.paid_amount) || 0;
          const newPaid = Number((oldPaid + colAmount).toFixed(2));
          const totalAmt = Number(inv.total_invoice_amount) || 0;
          let newStatus = 'partially_paid';
          if (newPaid >= totalAmt) newStatus = 'paid';

          await db.sales_invoices.update(invoice_id, {
            paid_amount: newPaid,
            status: newStatus,
          });
        }
      }
    });

    await auditRepo.log(userId, 'COLLECT_CUSTOMER_PAYMENT', 'customer_payments', paymentId, null, data);
    return { success: true, paymentId, receiptNumber };
  },

  async createCustomerReturn(data, userId = 'usr-accountant') {
    const { customer_id, invoice_id, product_id, quantity, refund_amount, refund_method, return_date, reason, return_mode } = data;
    if (return_date) validateNotPastDate(return_date, 'تاريخ مرتجع المبيعات');
    const returnQty = Math.max(1, Number(quantity) || 1);
    const returnAmount = Math.max(0, Number(refund_amount) || 0);
    const returnId = `cret-${Date.now()}`;
    const returnNumber = `RET-SLS-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    let actualRefundMethod = refund_method || 'deduct_balance';
    let targetOutletId = null;

    // Mode 2: Return against original invoice validation
    if (invoice_id) {
      const origInv = await db.sales_invoices.get(invoice_id);
      if (!origInv) {
        throw new Error('الفاتورة الأصلية المحددة غير موجودة');
      }
      targetOutletId = origInv.outlet_id;

      // Check sold quantity
      const invItems = await db.sales_invoice_items.where('invoice_id').equals(invoice_id).toArray();
      const targetItem = invItems.find(it => it.product_id === product_id) || invItems[0];
      if (targetItem) {
        const soldQty = Number(targetItem.quantity) || 0;
        // Check previously returned quantity for this invoice
        const pastReturns = await db.customer_returns.where('invoice_id').equals(invoice_id).toArray();
        const previouslyReturned = pastReturns
          .filter(r => r.product_id === product_id)
          .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

        const remainingSoldQty = soldQty - previouslyReturned;
        if (returnQty > remainingSoldQty) {
          throw new Error(
            `الكمية المرتجعة (${returnQty}) تتجاوز الكمية المباعة المتبقية في الفاتورة الأصلية (${remainingSoldQty} قطعة)`
          );
        }
      }

      // If original invoice was Cash and no explicit refund_method given, refund in cash
      if (origInv.payment_terms === 'cash' && !refund_method) {
        actualRefundMethod = 'cash_refund';
      }
    }

    await db.transaction('rw', [db.customer_returns, db.products, db.items, db.treasury_accounts, db.cash_transactions], async () => {
      // Restore stock
      const prod = await db.products.get(product_id);
      if (prod) {
        const newStock = Number(((Number(prod.current_finished_stock) || 0) + returnQty).toFixed(2));
        await db.products.update(prod.id, { current_finished_stock: newStock });
      }
      const itm = await db.items.get(product_id);
      if (itm) {
        const newStock = Number(((Number(itm.current_stock) || 0) + returnQty).toFixed(2));
        await db.items.update(itm.id, { current_stock: newStock });
      }

      await db.customer_returns.add({
        id: returnId,
        return_number: returnNumber,
        return_mode: return_mode || (invoice_id ? 'against_invoice' : 'free_return'),
        customer_id,
        invoice_id: invoice_id || null,
        product_id,
        quantity: returnQty,
        refund_amount: returnAmount,
        refund_method: actualRefundMethod,
        return_date: return_date || now.split('T')[0],
        reason: reason || 'مرتجع مبيعات',
        created_by: userId,
        created_at: now,
      });

      // If cash refund, deduct from outlet treasury
      if (actualRefundMethod === 'cash_refund' && returnAmount > 0) {
        let treasury = null;
        if (targetOutletId) {
          treasury = await db.treasury_accounts.where('outlet_id').equals(targetOutletId).first();
        }
        if (!treasury) {
          treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                     (await db.treasury_accounts.where('account_type').equals('treasury').first());
        }

        if (treasury) {
          const currentBal = Number(treasury.current_balance) || 0;
          const newBal = Number((currentBal - returnAmount).toFixed(2));
          await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

          await db.cash_transactions.add({
            id: `tx-${Date.now()}`,
            tx_number: `TXN-${Date.now().toString().slice(-4)}`,
            account_id: treasury.id,
            tx_type: 'outflow',
            category: 'sales_return',
            amount: returnAmount,
            balance_after: newBal,
            reference_type: 'customer_returns',
            reference_id: returnId,
            description: `رد نقدية لمرتجع عميل ${returnNumber} من خزينة المنفذ`,
            created_by: userId,
            created_at: now,
          });
        }
      }
    });

    await auditRepo.log(userId, 'CREATE_CUSTOMER_RETURN', 'customer_returns', returnId, null, data);
    return { success: true, returnId, returnNumber };
  }
};

export default salesRepo;
