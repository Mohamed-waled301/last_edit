import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import BalanceCalculator from '../../logic/balances';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';

export const suppliersRepo = {
  async getAll() {
    const list = await db.suppliers.toArray();
    const invoices = await db.supplier_invoices.toArray();
    const returns = await db.supplier_returns.toArray();

    return list.map(s => {
      const supInvoices = invoices.filter(i => i.supplier_id === s.id);
      const supReturns = returns.filter(r => r.supplier_id === s.id);
      const bal = BalanceCalculator.calculateSupplierBalance(supInvoices, supReturns);

      return {
        ...s,
        total_invoiced: bal.totalInvoiced,
        total_paid: bal.totalPaid,
        balance_due: bal.balanceDue,
      };
    });
  },

  async getById(id) {
    const s = await db.suppliers.get(id);
    if (!s) return null;
    const invoices = await db.supplier_invoices.where('supplier_id').equals(id).toArray();
    const returns = await db.supplier_returns.where('supplier_id').equals(id).toArray();
    const bal = BalanceCalculator.calculateSupplierBalance(invoices, returns);
    return { ...s, ...bal };
  },

  async create(data, userId = 'usr-purchasing') {
    const id = `sup-${Date.now()}`;
    const supplier = {
      id,
      name: data.name,
      phone: data.phone || '',
      address: data.address || '',
      tax_number: data.tax_number || '',
      payment_terms: data.payment_terms || 'cash',
      credit_limit: Number(data.credit_limit) || 0,
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await db.suppliers.add(supplier);
    await auditRepo.log(userId, 'CREATE_SUPPLIER', 'suppliers', id, null, supplier);
    return supplier;
  },

  async update(id, data, userId = 'usr-purchasing') {
    const current = await db.suppliers.get(id);
    if (!current) throw new Error('المورد غير موجود');

    const updated = {
      ...current,
      name: data.name ?? current.name,
      phone: data.phone ?? current.phone,
      address: data.address ?? current.address,
      tax_number: data.tax_number ?? current.tax_number,
      payment_terms: data.payment_terms ?? current.payment_terms,
      credit_limit: data.credit_limit !== undefined ? Number(data.credit_limit) : current.credit_limit,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active,
    };

    await db.suppliers.put(updated);
    await auditRepo.log(userId, 'UPDATE_SUPPLIER', 'suppliers', id, current, updated);
    return updated;
  },

  async getStatement(id) {
    const supplier = await this.getById(id);
    if (!supplier) throw new Error('المورد غير موجود');

    const invoices = await db.supplier_invoices.where('supplier_id').equals(id).toArray();
    const payments = await db.payments.where('supplier_id').equals(id).toArray();
    const returns = await db.supplier_returns.where('supplier_id').equals(id).toArray();

    const transactions = [];

    for (const inv of invoices) {
      transactions.push({
        date: inv.invoice_date,
        type: 'فاتورة توريد',
        reference: inv.invoice_number,
        description: inv.notes || 'فاتورة استلام خامات',
        debit: 0,
        credit: Number(inv.total_amount) || 0,
        raw_date: inv.created_at || inv.invoice_date,
      });
    }

    for (const pay of payments) {
      transactions.push({
        date: pay.payment_date,
        type: 'سند دفع',
        reference: pay.payment_number,
        description: pay.notes || 'سداد نقدية/شيك',
        debit: Number(pay.amount) || 0,
        credit: 0,
        raw_date: pay.created_at || pay.payment_date,
      });
    }

    for (const ret of returns) {
      transactions.push({
        date: ret.return_date,
        type: 'مرتجع خامات',
        reference: ret.return_number,
        description: ret.reason || 'رد بضاعة للمورد',
        debit: Number(ret.total_amount) || 0,
        credit: 0,
        raw_date: ret.created_at || ret.return_date,
      });
    }

    // Sort chronologically
    transactions.sort((a, b) => new Date(a.raw_date).getTime() - new Date(b.raw_date).getTime());

    let runningBalance = 0;
    const ledger = transactions.map(tx => {
      runningBalance = runningBalance + tx.credit - tx.debit;
      return {
        ...tx,
        balance_after: Number(runningBalance.toFixed(2)),
      };
    });

    return {
      supplier,
      statement: ledger,
      invoices,
      payments,
      summary: {
        total_purchases: supplier.total_purchases ?? supplier.total_invoiced ?? 0,
        total_paid: supplier.total_paid ?? 0,
        remaining_balance: supplier.outstanding_balance ?? supplier.balance_due ?? 0,
      },
      total_invoiced: supplier.total_invoiced,
      total_paid: supplier.total_paid,
      balance_due: supplier.balance_due,
    };
  },

  async getPurchaseOrders() {
    const orders = await db.purchase_orders.reverse().sortBy('created_at');
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    const items = await db.purchase_order_items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));

    return orders.map(o => {
      const orderItems = items.filter(i => i.po_id === o.id).map(i => {
        const mat = matMap.get(i.material_id);
        return {
          ...i,
          material_name: mat ? mat.name : i.material_id,
          material_unit: mat ? mat.unit : 'وحدة',
        };
      });

      return {
        ...o,
        supplier_name: supMap.get(o.supplier_id) || o.supplier_id,
        items: orderItems,
      };
    });
  },

  async createPurchaseOrder(data, userId = 'usr-purchasing') {
    if (data.order_date) validateNotPastDate(data.order_date, 'تاريخ أمر التوريد');
    if (data.expected_date) validateNotPastDate(data.expected_date, 'تاريخ التسليم المتوقع');
    const id = `po-${Date.now()}`;
    const poNumber = data.po_number || `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    let totalAmount = 0;
    const items = (data.items || []).map((item, idx) => {
      const qty = Math.max(0, Number(item.quantity_ordered) || 0);
      const price = Math.max(0, Number(item.unit_price) || 0);
      const total = Number((qty * price).toFixed(2));
      totalAmount += total;
      return {
        id: `poi-${Date.now()}-${idx}`,
        po_id: id,
        material_id: item.material_id,
        quantity_ordered: qty,
        unit_price: price,
        total_price: total,
      };
    });

    const po = {
      id,
      po_number: poNumber,
      supplier_id: data.supplier_id,
      order_date: data.order_date || now.split('T')[0],
      expected_date: data.expected_date || null,
      total_amount: Number(totalAmount.toFixed(2)),
      status: 'ordered',
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    await db.transaction('rw', [db.purchase_orders, db.purchase_order_items], async () => {
      await db.purchase_orders.add(po);
      for (const itm of items) {
        await db.purchase_order_items.add(itm);
      }
    });

    await auditRepo.log(userId, 'CREATE_PURCHASE_ORDER', 'purchase_orders', id, null, po);
    return { ...po, items };
  },

  async getGoodsReceipts() {
    const receipts = await db.goods_receipts.reverse().sortBy('created_at');
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));
    const items = await db.goods_receipt_items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));

    return receipts.map(r => {
      const grnItems = items.filter(i => i.grn_id === r.id).map(i => {
        const mat = matMap.get(i.material_id);
        return {
          ...i,
          material_name: mat ? mat.name : i.material_id,
          material_unit: mat ? mat.unit : 'وحدة',
        };
      });

      return {
        ...r,
        supplier_name: supMap.get(r.supplier_id) || r.supplier_id,
        items: grnItems,
      };
    });
  },

  async createGoodsReceipt(data, userId = 'usr-storekeeper') {
    if (data.receipt_date) validateNotPastDate(data.receipt_date, 'تاريخ إذن استلام البضاعة');
    const id = `grn-${Date.now()}`;
    const grnNumber = data.grn_number || `GRN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const grn = {
      id,
      grn_number: grnNumber,
      po_id: data.po_id || null,
      supplier_id: data.supplier_id,
      receipt_date: data.receipt_date || now.split('T')[0],
      receiver_name: data.receiver_name || '',
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    // Atomic transaction for GRN, items, weighted average cost update, and stock movement
    await db.transaction('rw', [db.goods_receipts, db.goods_receipt_items, db.materials, db.stock_movements, db.purchase_orders], async () => {
      await db.goods_receipts.add(grn);

      for (let idx = 0; idx < (data.items || []).length; idx++) {
        const item = data.items[idx];
        const qtyReceived = Math.max(0, Number(item.quantity_received) || 0);
        const unitCost = Math.max(0, Number(item.unit_cost) || 0);
        const totalCost = Number((qtyReceived * unitCost).toFixed(2));

        await db.goods_receipt_items.add({
          id: `gri-${Date.now()}-${idx}`,
          grn_id: id,
          material_id: item.material_id,
          quantity_received: qtyReceived,
          unit_cost: unitCost,
          total_cost: totalCost,
        });

        // Update material stock & weighted average cost
        const mat = await db.materials.get(item.material_id);
        if (mat) {
          const oldStock = Number(mat.current_stock) || 0;
          const oldAvgCost = Number(mat.average_cost) || 0;
          const newAvgCost = CostCalculator.calculateWeightedAverageCost(oldStock, oldAvgCost, qtyReceived, unitCost);
          const newStock = Number((oldStock + qtyReceived).toFixed(3));

          await db.materials.update(mat.id, {
            current_stock: newStock,
            average_cost: newAvgCost,
          });

          // Record stock movement
          await db.stock_movements.add({
            id: `sm-${Date.now()}-${idx}`,
            material_id: mat.id,
            movement_type: 'purchase_in',
            reference_type: 'GRN',
            reference_id: id,
            quantity_change: qtyReceived,
            unit_cost: unitCost,
            new_balance: newStock,
            notes: `وارد مشتريات إذن استلام ${grnNumber}`,
            created_by: userId,
            created_at: now,
          });
        }
      }

      // If linked to PO, update PO status
      if (data.po_id) {
        await db.purchase_orders.update(data.po_id, { status: 'received' });
      }
    });

    await auditRepo.log(userId, 'CREATE_GOODS_RECEIPT', 'goods_receipt_notes', id, null, grn);
    return grn;
  },

  async getSupplierInvoices() {
    const invoices = await db.supplier_invoices.reverse().sortBy('created_at');
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    return invoices.map(i => ({
      ...i,
      supplier_name: supMap.get(i.supplier_id) || i.supplier_id,
      remaining_amount: Math.max(0, Number(((Number(i.total_amount) || 0) - (Number(i.paid_amount) || 0)).toFixed(2))),
    }));
  },

  async createSupplierInvoice(data, userId = 'usr-accountant') {
    if (data.invoice_date) validateNotPastDate(data.invoice_date, 'تاريخ فاتورة المورد');
    if (data.due_date) validateNotPastDate(data.due_date, 'تاريخ استحقاق الفاتورة');
    const id = `sinv-${Date.now()}`;
    const invoiceNumber = data.invoice_number || `INV-SUP-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const subtotal = Math.max(0, Number(data.subtotal) || 0);
    const taxAmount = Math.max(0, Number(data.tax_amount) || 0);
    const totalAmount = Math.max(0, Number(data.total_amount) || (subtotal + taxAmount));
    const paidAmount = Math.max(0, Number(data.paid_amount) || 0);

    let status = 'unpaid';
    if (paidAmount >= totalAmount && totalAmount > 0) {
      status = 'paid';
    } else if (paidAmount > 0) {
      status = 'partially_paid';
    }

    const invoice = {
      id,
      invoice_number: invoiceNumber,
      supplier_id: data.supplier_id,
      grn_id: data.grn_id || null,
      po_id: data.po_id || null,
      invoice_date: data.invoice_date || now.split('T')[0],
      due_date: data.due_date || null,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      status,
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    await db.supplier_invoices.add(invoice);
    await auditRepo.log(userId, 'CREATE_SUPPLIER_INVOICE', 'supplier_invoices', id, null, invoice);
    return invoice;
  },

  async paySupplier(data, userId = 'usr-accountant') {
    const { supplier_id, invoice_id, account_id, amount, payment_date, payment_method, notes } = data;
    if (payment_date) validateNotPastDate(payment_date, 'تاريخ سند الصرف للمورد');
    const payAmount = Math.max(0, Number(amount) || 0);
    if (payAmount <= 0) throw new Error('مبلغ السداد يجب أن يكون أكبر من صفر');

    const paymentId = `spay-${Date.now()}`;
    const paymentNumber = `PAY-SUP-${Date.now().toString().slice(-4)}`;
    const txId = `tx-${Date.now()}`;
    const txNumber = `TXN-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.payments, db.supplier_invoices, db.treasury_accounts, db.cash_transactions], async () => {
      const account = await db.treasury_accounts.get(account_id);
      if (!account) throw new Error('الحساب المالي أو الخزينة غير موجودة');

      const currentAccBal = Number(account.current_balance) || 0;
      if (currentAccBal < payAmount) {
        throw new Error(`رصيد الخزينة (${currentAccBal} ج.م) لا يكفي لسداد مبلغ (${payAmount} ج.م)`);
      }

      const newAccBal = Number((currentAccBal - payAmount).toFixed(2));
      await db.treasury_accounts.update(account_id, { current_balance: newAccBal });

      // Record payment
      await db.payments.add({
        id: paymentId,
        payment_number: paymentNumber,
        supplier_id,
        invoice_id: invoice_id || null,
        account_id,
        amount: payAmount,
        payment_date: payment_date || now.split('T')[0],
        payment_method: payment_method || 'cash',
        notes: notes || '',
        created_by: userId,
        created_at: now,
      });

      // Record cash transaction outflow
      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id,
        tx_type: 'outflow',
        category: 'supplier_payment',
        amount: payAmount,
        balance_after: newAccBal,
        reference_type: 'supplier_invoices',
        reference_id: invoice_id || null,
        description: `سداد دفعة للمورد: ${notes || paymentNumber}`,
        created_by: userId,
        created_at: now,
      });

      // If linked to an invoice, update paid_amount and status
      if (invoice_id) {
        const inv = await db.supplier_invoices.get(invoice_id);
        if (inv) {
          const oldPaid = Number(inv.paid_amount) || 0;
          const newPaid = Number((oldPaid + payAmount).toFixed(2));
          const totalAmt = Number(inv.total_amount) || 0;
          let newStatus = 'partially_paid';
          if (newPaid >= totalAmt) newStatus = 'paid';

          await db.supplier_invoices.update(invoice_id, {
            paid_amount: newPaid,
            status: newStatus,
          });
        }
      }
    });

    await auditRepo.log(userId, 'PAY_SUPPLIER', 'payments', paymentId, null, data);
    return { success: true, paymentId, paymentNumber };
  },

  async createSupplierReturn(data, userId = 'usr-storekeeper') {
    const { supplier_id, material_id, quantity, unit_cost, total_amount, refund_status, return_date, reason } = data;
    if (return_date) validateNotPastDate(return_date, 'تاريخ مرتجع المورد');
    const returnQty = Math.max(0, Number(quantity) || 0);
    const returnUnitCost = Math.max(0, Number(unit_cost) || 0);
    const returnTotal = Number((returnQty * returnUnitCost).toFixed(2));
    const returnId = `sret-${Date.now()}`;
    const returnNumber = `RET-SUP-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.supplier_returns, db.materials, db.stock_movements, db.treasury_accounts, db.cash_transactions], async () => {
      const mat = await db.materials.get(material_id);
      if (!mat) throw new Error('الخامة غير موجودة بالمخزن');

      const oldStock = Number(mat.current_stock) || 0;
      if (oldStock < returnQty) {
        throw new Error(`الرصيد المتاح بالمخزن (${oldStock}) أقل من الكمية المراد ردها (${returnQty})`);
      }

      const newStock = Number((oldStock - returnQty).toFixed(3));
      await db.materials.update(material_id, { current_stock: newStock });

      await db.supplier_returns.add({
        id: returnId,
        return_number: returnNumber,
        supplier_id,
        material_id,
        quantity: returnQty,
        unit_cost: returnUnitCost,
        total_amount: returnTotal,
        refund_status: refund_status || 'deduct_balance',
        return_date: return_date || now.split('T')[0],
        reason: reason || 'مرتجع خامات للمورد',
        created_by: userId,
        created_at: now,
      });

      await db.stock_movements.add({
        id: `sm-${Date.now()}`,
        material_id,
        movement_type: 'supplier_return_out',
        reference_type: 'SUPPLIER_RETURN',
        reference_id: returnId,
        quantity_change: -returnQty,
        unit_cost: returnUnitCost,
        new_balance: newStock,
        notes: `مرتجع للمورد إذن ${returnNumber}`,
        created_by: userId,
        created_at: now,
      });

      // If cash refund, deposit back to primary treasury
      if (refund_status === 'cash_refund') {
        const primaryAcc = (await db.treasury_accounts.where('account_type').equals('treasury').first()) || (await db.treasury_accounts.toCollection().first());
        if (primaryAcc) {
          const newAccBal = Number(((Number(primaryAcc.current_balance) || 0) + returnTotal).toFixed(2));
          await db.treasury_accounts.update(primaryAcc.id, { current_balance: newAccBal });
          await db.cash_transactions.add({
            id: `tx-${Date.now()}`,
            tx_number: `TXN-${Date.now().toString().slice(-4)}`,
            account_id: primaryAcc.id,
            tx_type: 'inflow',
            category: 'other',
            amount: returnTotal,
            balance_after: newAccBal,
            reference_type: 'supplier_returns',
            reference_id: returnId,
            description: `استرداد نقدي لمرتجع مورد ${returnNumber}`,
            created_by: userId,
            created_at: now,
          });
        }
      }
    });

    await auditRepo.log(userId, 'CREATE_SUPPLIER_RETURN', 'supplier_returns', returnId, null, data);
    return { success: true, returnId, returnNumber };
  }
};

export default suppliersRepo;
