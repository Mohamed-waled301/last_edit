import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import BalanceCalculator, {
  resolveOpeningBalance,
  resolveOpeningType,
  normalizeOpeningBalance,
  normalizeAccountNature,
  DEFAULT_SUPPLIER_OPENING_TYPE,
} from '../../logic/balances';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';
import { calculatePurchaseOrderTotals } from '../../logic/purchaseOrderCalculations';

export const suppliersRepo = {
  async getAll() {
    const list = await db.suppliers.toArray();
    const invoices = await db.supplier_invoices.toArray();
    const returns = await db.supplier_returns.toArray();

    return list.map(s => {
      const supInvoices = invoices.filter(i => i.supplier_id === s.id);
      const supReturns = returns.filter(r => r.supplier_id === s.id);
      const opening = resolveOpeningBalance(s, 'supplier');
      const bal = BalanceCalculator.calculateSupplierBalance(supInvoices, supReturns, opening);

      return {
        ...s,
        opening_balance: opening,
        opening_balance_type: resolveOpeningType(s, 'supplier'),
        total_invoiced: bal.totalInvoiced,
        total_paid: bal.totalPaid,
        balance_due: bal.balanceDue,
        outstanding_balance: bal.balanceDue,
        current_balance: bal.balanceDue,
      };
    });
  },

  async getById(id) {
    const s = await db.suppliers.get(id);
    if (!s) return null;
    const invoices = await db.supplier_invoices.where('supplier_id').equals(id).toArray();
    const returns = await db.supplier_returns.where('supplier_id').equals(id).toArray();
    const opening = resolveOpeningBalance(s, 'supplier');
    const bal = BalanceCalculator.calculateSupplierBalance(invoices, returns, opening);
    return {
      ...s,
      opening_balance: opening,
      opening_balance_type: resolveOpeningType(s, 'supplier'),
      ...bal,
      balance_due: bal.balanceDue,
      outstanding_balance: bal.balanceDue,
      current_balance: bal.balanceDue,
    };
  },

  async create(data, userId = 'usr-purchasing') {
    const id = data.id || `sup-${Date.now()}`;
    const opening = normalizeOpeningBalance(data.opening_balance ?? data.supplier_opening_balance ?? 0);
    const supplier = {
      id,
      name: data.name,
      phone: data.phone || '',
      address: data.address || '',
      tax_number: data.tax_number || '',
      supplier_type: data.supplier_type || '',
      supplied_all_items: data.supplied_all_items !== undefined ? Boolean(data.supplied_all_items) : true,
      supplied_group_ids: Array.isArray(data.supplied_group_ids) ? data.supplied_group_ids : [],
      supplied_section_ids: Array.isArray(data.supplied_section_ids) ? data.supplied_section_ids : [],
      supplied_item_ids: Array.isArray(data.supplied_item_ids) ? data.supplied_item_ids : [],
      opening_balance: opening,
      opening_balance_type: normalizeAccountNature(
        data.opening_balance_type ?? data.supplier_opening_type,
        DEFAULT_SUPPLIER_OPENING_TYPE
      ),
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
      supplier_type: data.supplier_type ?? current.supplier_type,
      supplied_all_items: data.supplied_all_items !== undefined ? Boolean(data.supplied_all_items) : (current.supplied_all_items !== false),
      supplied_group_ids: data.supplied_group_ids !== undefined ? data.supplied_group_ids : (current.supplied_group_ids || []),
      supplied_section_ids: data.supplied_section_ids !== undefined ? data.supplied_section_ids : (current.supplied_section_ids || []),
      supplied_item_ids: data.supplied_item_ids !== undefined ? data.supplied_item_ids : (current.supplied_item_ids || []),
      opening_balance: data.opening_balance !== undefined || data.supplier_opening_balance !== undefined
        ? normalizeOpeningBalance(data.opening_balance ?? data.supplier_opening_balance)
        : normalizeOpeningBalance(current.opening_balance ?? 0),
      opening_balance_type: normalizeAccountNature(
        data.opening_balance_type ?? data.supplier_opening_type ?? current.opening_balance_type,
        DEFAULT_SUPPLIER_OPENING_TYPE
      ),
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

    const opening = normalizeOpeningBalance(supplier.opening_balance);
    const openingType = supplier.opening_balance_type || DEFAULT_SUPPLIER_OPENING_TYPE;
    const transactions = [];

    if (opening > 0) {
      transactions.push({
        date: supplier.created_at ? String(supplier.created_at).split('T')[0] : '',
        type: 'رصيد أول المدة',
        reference: 'OPENING',
        description: `رصيد افتتاحي (${openingType === 'credit' ? 'دائن' : 'مدين'})`,
        debit: 0,
        credit: opening,
        raw_date: '0000-00-00T00:00:00.000Z',
        is_opening: true,
      });
    }

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
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
    }

    for (const pay of payments) {
      transactions.push({
        date: pay.payment_date,
        type: pay.payment_method === 'offset' ? 'تسوية مقاصة' : 'سند صرف',
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

    transactions.sort((a, b) => new Date(a.raw_date).getTime() - new Date(b.raw_date).getTime());

    const activeInvoices = invoices.filter(i => i.status !== 'cancelled');
    const activePayments = payments.filter(p => p.status !== 'cancelled');
    const activeReturns = returns.filter(r => r.status !== 'cancelled');

    const totalPurchases = activeInvoices.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
    const totalPaid = activePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const totalReturns = activeReturns.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    const initialBal = openingType === 'debit' ? -opening : opening;
    const finalBalance = Number((initialBal + totalPurchases - totalPaid - totalReturns).toFixed(2));

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
      movements: ledger,
      opening_balance: opening,
      opening_balance_type: openingType,
      invoices,
      payments,
      summary: {
        opening_balance: opening,
        opening_balance_type: openingType,
        total_purchases: totalPurchases,
        total_paid: totalPaid,
        total_returns: totalReturns,
        remaining_balance: Math.max(0, finalBalance),
        balance_due: Math.max(0, finalBalance),
      },
      total_invoiced: totalPurchases,
      total_paid: totalPaid,
      balance_due: Math.max(0, finalBalance),
    };
  },

  async getPurchaseOrders() {
    const orders = await db.purchase_orders.reverse().sortBy('created_at');
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    const items = await db.purchase_order_items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));
    const itemMasterList = await db.items.toArray();
    const itemMap = new Map(itemMasterList.map(i => [i.id, i]));

    return orders.map(o => {
      const orderItems = items.filter(i => i.po_id === o.id).map(i => {
        const itm = itemMap.get(i.material_id) || matMap.get(i.material_id);
        return {
          ...i,
          material_name: itm ? itm.name : i.material_id,
          material_code: itm ? itm.code : '',
          material_unit: itm ? itm.unit : 'قطعة',
        };
      });

      return {
        ...o,
        supplier_name: supMap.get(o.supplier_id) || o.supplier_id,
        items: orderItems,
      };
    });
  },

  async getPurchaseOrder(id) {
    const order = await db.purchase_orders.get(id);
    if (!order) return null;
    const supplier = await db.suppliers.get(order.supplier_id);
    const party = await db.parties.get(order.supplier_id);
    const orderItems = await db.purchase_order_items.where('po_id').equals(id).toArray();
    const itemMasterList = await db.items.toArray();
    const itemMap = new Map(itemMasterList.map(i => [i.id, i]));

    const populatedItems = orderItems.map(i => {
      const itm = itemMap.get(i.material_id);
      return {
        ...i,
        material_name: itm ? itm.name : i.material_id,
        material_code: itm ? itm.code : '',
        material_unit: itm ? itm.unit : 'قطعة',
      };
    });

    return {
      ...order,
      supplier_name: supplier?.name || party?.name || order.supplier_id,
      party,
      items: populatedItems
    };
  },

  /**
   * Create Purchase Order
   * Status defaults to 'ordered'. Stock and supplier balances DO NOT CHANGE unless receive_now is true.
   */
  async createPurchaseOrder(data, userId = 'usr-purchasing') {
    if (data.order_date) validateNotPastDate(data.order_date, 'تاريخ أمر التوريد');
    const id = data.id || `po-${Date.now()}`;
    const poNumber = data.po_number || `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const paymentTerms = data.payment_terms || 'cash';
    const expectedDate = data.expected_date || today; // Defaults to today's date

    let subtotal = 0;
    const items = (data.items || []).map((item, idx) => {
      const qty = Math.max(0, Number(item.quantity_ordered) || 0);
      const price = Math.max(0, Number(item.unit_price) || 0);
      const total = Number((qty * price).toFixed(2));
      subtotal += total;
      return {
        id: `poi-${Date.now()}-${idx}`,
        po_id: id,
        material_id: item.material_id,
        quantity_ordered: qty,
        unit_price: price,
        total_price: total,
      };
    });

    const totals = calculatePurchaseOrderTotals({
      subtotal,
      discount_percent: data.discount_percent,
      discount_value: data.discount_value !== undefined ? data.discount_value : data.discount_amount,
      additional_expenses: data.additional_expenses
    });

    if (!totals.isValid) {
      throw new Error(totals.errorMessage || 'الصافي النهائي لا يمكن أن يكون أقل من صفر');
    }

    const discountPercent = totals.discountPercent;
    const discountValue = totals.discountValue;
    const additionalExpenses = totals.additionalExpenses;
    const grandTotal = totals.finalNet;

    // Installments validation for credit orders
    let installments = [];
    if (paymentTerms === 'credit') {
      const rawInst = Array.isArray(data.installments) && data.installments.length > 0
        ? data.installments
        : [
            {
              id: `inst-${Date.now()}-0`,
              due_date: data.due_date || today,
              amount: grandTotal,
              notes: 'الدفعة الإجمالية'
            }
          ];

      const sumInst = Number(rawInst.reduce((s, it) => s + (Number(it.amount) || 0), 0).toFixed(2));
      if (Math.abs(sumInst - grandTotal) > 0.01) {
        throw new Error(
          `إجمالي مبالغ الأقساط (${sumInst} ج.م) يجب أن يساوي تماماً إجمالي أمر التوريد الصافي (${grandTotal} ج.م). الفارق المتبقي: ${(grandTotal - sumInst).toFixed(2)} ج.م`
        );
      }

      installments = rawInst.map((inst, idx) => ({
        id: inst.id || `inst-${Date.now()}-${idx}`,
        po_id: id,
        supplier_id: data.supplier_id,
        due_date: inst.due_date || today,
        amount: Number(inst.amount) || 0,
        paid_amount: 0,
        status: 'unpaid',
        notes: inst.notes || ''
      }));
    }

    const orderDate = data.order_date || today;

    const po = {
      id,
      po_number: poNumber,
      supplier_id: data.supplier_id,
      payment_terms: paymentTerms,
      installments,
      due_date: installments.length > 0 ? installments[0].due_date : (data.due_date || null),
      order_date: orderDate,
      expected_date: orderDate, // Order date and receipt date are the same (immediate purchase invoice)
      subtotal: Number(subtotal.toFixed(2)),
      discount_percent: discountPercent,
      discount_value: discountValue,
      additional_expenses: additionalExpenses,
      total_amount: grandTotal,
      grand_total: grandTotal,
      status: 'received', // Always immediate received invoice
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    // Save in one Dexie transaction (all or nothing)
    await db.transaction('rw', [
      db.purchase_orders,
      db.purchase_order_items,
      db.materials,
      db.items,
      db.goods_receipts,
      db.goods_receipt_items,
      db.stock_movements,
      db.supplier_invoices,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      await db.purchase_orders.add(po);
      for (const itm of items) {
        await db.purchase_order_items.add(itm);

        // Update item master cost price
        if (itm.unit_price > 0) {
          const mat = await db.materials.get(itm.material_id);
          if (mat) {
            await db.materials.update(mat.id, {
              last_purchase_price: itm.unit_price,
              cost_price: itm.unit_price,
            });
          }
          const itemMaster = await db.items.get(itm.material_id);
          if (itemMaster) {
            await db.items.update(itemMaster.id, {
              last_purchase_price: itm.unit_price,
              cost_price: itm.unit_price,
            });
          }
        }
      }

      // Cash purchase: deduct final net total from selected treasury (balance allowed to go negative)
      if (paymentTerms === 'cash') {
        let treasury = (data.account_id ? await db.treasury_accounts.get(data.account_id) : null) ||
                       (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                       (await db.treasury_accounts.where('account_type').equals('treasury').first()) ||
                       (await db.treasury_accounts.toCollection().first());
        if (!treasury) {
          treasury = {
            id: 'acc-main',
            name: 'الخزينة الرئيسية',
            account_type: 'treasury',
            outlet_id: null,
            is_main: 1,
            current_balance: 0,
            created_at: now
          };
          await db.treasury_accounts.put(treasury);
        }

        const currentBal = Number(treasury.current_balance) || 0;
        const newBal = Number((currentBal - grandTotal).toFixed(2));
        // Balance is allowed to go negative: update treasury balance unconditionally
        await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

        // Log treasury transaction linked to the purchase order
        await db.cash_transactions.add({
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tx_number: `TXN-${Date.now().toString().slice(-4)}`,
          account_id: treasury.id,
          tx_type: 'outflow',
          category: 'purchase_orders',
          amount: grandTotal,
          balance_after: newBal,
          reference_type: 'purchase_orders',
          reference_id: id,
          description: `صرف فاتورة شراء ${poNumber} للمورد`,
          created_by: userId,
          created_at: now
        });
      }

      // Immediate Goods Receipt & Stock Increase in the same transaction
      const grnId = `grn-${Date.now()}`;
      const grnNumber = `GRN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const grn = {
        id: grnId,
        grn_number: grnNumber,
        po_id: id,
        supplier_id: data.supplier_id,
        receipt_date: po.order_date,
        receiver_name: 'استلام فوري مع فاتورة الشراء',
        notes: po.notes || 'استلام فوري تلقائي عند اعتماد فاتورة الشراء',
        created_by: userId,
        created_at: now
      };
      await db.goods_receipts.add(grn);

      for (let idx = 0; idx < items.length; idx++) {
        const line = items[idx];
        await db.goods_receipt_items.add({
          id: `gri-${Date.now()}-${idx}`,
          grn_id: grnId,
          material_id: line.material_id,
          quantity_received: line.quantity_ordered,
          unit_cost: line.unit_price,
          total_cost: line.total_price
        });

        // Stock movement row (direction: 'in')
        await db.stock_movements.add({
          id: `sm-${Date.now()}-${idx}`,
          item_id: line.material_id,
          material_id: line.material_id,
          location_id: data.location_id || 'loc-main',
          movement_type: 'purchase_receipt',
          direction: 'in',
          quantity: line.quantity_ordered,
          quantity_change: line.quantity_ordered,
          unit_cost: line.unit_price,
          document_id: grnId,
          reference_type: 'PURCHASE_RECEIPT',
          reference_id: id,
          date: po.order_date,
          movement_date: po.order_date,
          notes: `وارد مشتريات إذن استلام ${grnNumber} (فاتورة شراء ${poNumber})`,
          created_by: userId,
          created_at: now
        });

        // Update cached item & material stock
        const itm = await db.items.get(line.material_id);
        if (itm) {
          const newStock = Number(((Number(itm.current_stock) || 0) + line.quantity_ordered).toFixed(3));
          await db.items.update(itm.id, { current_stock: newStock });
        } else {
          await db.items.put({
            id: line.material_id,
            code: line.material_id,
            name: line.material_id,
            item_type: 'raw_material',
            unit: 'وحدة',
            cost_price: line.unit_price,
            current_stock: line.quantity_ordered,
            created_at: now
          });
        }
        const mat = await db.materials.get(line.material_id);
        if (mat) {
          const newStock = Number(((Number(mat.current_stock) || 0) + line.quantity_ordered).toFixed(3));
          await db.materials.update(mat.id, { current_stock: newStock });
        } else {
          await db.materials.put({
            id: line.material_id,
            code: line.material_id,
            name: line.material_id,
            unit: 'وحدة',
            cost_price: line.unit_price,
            current_stock: line.quantity_ordered,
            created_at: now
          });
        }
      }

      // Create supplier invoice: paid for cash, unpaid for credit (adds to supplier payable)
      const sinvId = `sinv-${Date.now()}`;
      const sinvNumber = `INV-SUP-${poNumber.replace(/^PO-/, '')}`;
      await db.supplier_invoices.add({
        id: sinvId,
        invoice_number: sinvNumber,
        supplier_id: data.supplier_id,
        grn_id: grnId,
        po_id: id,
        invoice_date: po.order_date,
        due_date: po.due_date,
        payment_terms: paymentTerms,
        installments: po.installments,
        subtotal: po.subtotal,
        tax_amount: 0,
        total_amount: po.total_amount,
        paid_amount: paymentTerms === 'cash' ? po.total_amount : 0,
        status: paymentTerms === 'cash' ? 'paid' : 'unpaid',
        notes: `فاتورة استلام أمر الشراء ${poNumber}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'CREATE_PURCHASE_ORDER', 'purchase_orders', id, null, po);
    return { ...po, items };
  },

  /**
   * Deleting an order must NOT delete its items.
   * Removes only the purchase order and its line links (purchase_order_items).
   * Items master records in items & materials tables remain 100% intact.
   */
  async deletePurchaseOrder(poId, userId = 'usr-purchasing') {
    const po = await db.purchase_orders.get(poId);
    if (!po) throw new Error('أمر التوريد غير موجود');

    await db.transaction('rw', [
      db.purchase_orders,
      db.purchase_order_items,
      db.goods_receipts,
      db.goods_receipt_items,
      db.supplier_invoices
    ], async () => {
      // 1. Delete order item lines ONLY (NEVER touch db.items or db.materials)
      await db.purchase_order_items.where('po_id').equals(poId).delete();

      // 2. Clean up any unposted GRN links if present
      const grns = await db.goods_receipts.where('po_id').equals(poId).toArray();
      for (const grn of grns) {
        await db.goods_receipt_items.where('grn_id').equals(grn.id).delete();
      }
      await db.goods_receipts.where('po_id').equals(poId).delete();

      // 3. Clean up linked supplier invoices if present
      await db.supplier_invoices.where('po_id').equals(poId).delete();

      // 4. Delete the purchase order itself
      await db.purchase_orders.delete(poId);
    });

    await auditRepo.log(userId, 'DELETE_PURCHASE_ORDER', 'purchase_orders', poId, po, null);
    return { success: true };
  },

  /**
   * Cancelling a supplier invoice:
   * - Reverses inventory quantities from stock (reverse stock effect).
   * - If CREDIT: removes debt from supplier's balance (treasury untouched).
   * - If CASH: reverses effect on treasury (supplier balance untouched).
   * - Must NOT delete the supplier, and must NOT delete/rename items.
   * - Idempotent: already cancelled invoice changes nothing.
   * - Uses a single database transaction.
   */
  async cancelSupplierInvoice(invoiceId, reason = '', userId = 'usr-accountant') {
    const inv = await db.supplier_invoices.get(invoiceId);
    if (!inv) throw new Error('فاتورة المورد غير موجودة');

    // Prevent double cancellation (second attempt changes nothing)
    if (inv.status === 'cancelled') {
      return { success: true, message: 'الفاتورة ملغاة بالفعل', alreadyCancelled: true };
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    await db.transaction('rw', [
      db.supplier_invoices,
      db.purchase_orders,
      db.purchase_order_items,
      db.goods_receipts,
      db.goods_receipt_items,
      db.stock_movements,
      db.items,
      db.materials,
      db.treasury_accounts,
      db.cash_transactions,
      db.suppliers,
      db.parties
    ], async () => {
      // 1. Gather line items to reverse inventory
      const itemsToReverse = [];
      if (inv.grn_id) {
        const griList = await db.goods_receipt_items.where('grn_id').equals(inv.grn_id).toArray();
        for (const gri of griList) {
          itemsToReverse.push({
            material_id: gri.material_id,
            quantity: Number(gri.quantity_received || gri.received_quantity || 0),
            unit_cost: Number(gri.unit_cost || 0)
          });
        }
      } else if (inv.po_id) {
        const poiList = await db.purchase_order_items.where('po_id').equals(inv.po_id).toArray();
        for (const poi of poiList) {
          itemsToReverse.push({
            material_id: poi.material_id,
            quantity: Number(poi.quantity_ordered || poi.quantity || 0),
            unit_cost: Number(poi.unit_price || poi.unit_cost || 0)
          });
        }
      }

      // Pre-check stock: Block cancelling when it would make stock negative
      for (const line of itemsToReverse) {
        if (line.quantity > 0 && line.material_id) {
          const itm = await db.items.get(line.material_id);
          const mat = await db.materials.get(line.material_id);
          const currentStock = Number(itm?.current_stock ?? mat?.current_stock) || 0;
          const itemName = itm?.name || mat?.name || line.material_id;
          if (currentStock < line.quantity) {
            throw new Error(
              `لا يمكن إلغاء فاتورة المورد: الكمية المتوفرة بالمخزن من الصنف (${itemName}) هي (${currentStock})، والكمية المراد استرجاعها هي (${line.quantity}). إلغاء الفاتورة سيؤدي إلى رصيد مخزني سالب.`
            );
          }
        }
      }

      // If items found, reverse stock (direction: 'out')
      for (let idx = 0; idx < itemsToReverse.length; idx++) {
        const line = itemsToReverse[idx];
        const qty = line.quantity;
        if (qty > 0 && line.material_id) {
          // Reversing stock movement
          await db.stock_movements.add({
            id: `sm-sinv-rev-${Date.now()}-${idx}`,
            item_id: line.material_id,
            material_id: line.material_id,
            location_id: 'loc-main',
            movement_type: 'reversal',
            direction: 'out',
            quantity: qty,
            quantity_change: -qty,
            unit_cost: line.unit_cost,
            document_id: invoiceId,
            reference_type: 'SUPPLIER_INVOICE_CANCELLED',
            reference_id: invoiceId,
            date: today,
            movement_date: today,
            notes: `حركة عكسية لإلغاء فاتورة المورد ${inv.invoice_number}: ${reason || 'إلغاء الفاتورة'}`,
            created_by: userId,
            created_at: now
          });

          // Decrement cached stock in items and materials (NEVER delete or rename items)
          const itm = await db.items.get(line.material_id);
          if (itm) {
            const newStock = Number(((Number(itm.current_stock) || 0) - qty).toFixed(3));
            await db.items.update(itm.id, { current_stock: newStock });
          }
          const mat = await db.materials.get(line.material_id);
          if (mat) {
            const newStock = Number(((Number(mat.current_stock) || 0) - qty).toFixed(3));
            await db.materials.update(mat.id, { current_stock: newStock });
          }
        }
      }

      // 2. Reverse debt according to invoice payment type
      const isCredit = inv.payment_terms === 'credit' ||
                       (!inv.payment_terms && (Number(inv.paid_amount) || 0) === 0 && Boolean(inv.due_date));
      const isCash = inv.payment_terms === 'cash' ||
                     (!isCredit && (Number(inv.paid_amount) || 0) > 0);

      if (isCredit) {
        // CREDIT (آجل): remove debt from SUPPLIER balance (setting status to 'cancelled' excludes it from supplier payable)
        // Do NOT touch the treasury.
      } else if (isCash) {
        // CASH (نقدي): reverse its effect on the TREASURY. Do NOT touch supplier balance.
        const refundAmount = Number(inv.paid_amount || inv.total_amount) || 0;
        if (refundAmount > 0) {
          const treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                           (await db.treasury_accounts.where('account_type').equals('treasury').first()) ||
                           (await db.treasury_accounts.toCollection().first());
          if (treasury) {
            const currentBal = Number(treasury.current_balance) || 0;
            const newBal = Number((currentBal + refundAmount).toFixed(2));
            await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

            await db.cash_transactions.add({
              id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              tx_number: `TXN-${Date.now().toString().slice(-4)}`,
              account_id: treasury.id,
              tx_type: 'inflow',
              category: 'supplier_invoice_cancellation',
              amount: refundAmount,
              balance_after: newBal,
              reference_type: 'supplier_invoices',
              reference_id: invoiceId,
              description: `استرداد نقدي لإلغاء فاتورة المورد النقدية ${inv.invoice_number}`,
              created_by: userId,
              created_at: now
            });
          }
        }
      }

      // 3. Update invoice status to 'cancelled'
      await db.supplier_invoices.update(invoiceId, {
        status: 'cancelled',
        cancellation_reason: reason || 'إلغاء الفاتورة',
        cancelled_at: now,
        cancelled_by: userId
      });
    });

    await auditRepo.log(userId, 'CANCEL_SUPPLIER_INVOICE', 'supplier_invoices', invoiceId, inv, {
      status: 'cancelled',
      reason
    });

    return { success: true, message: 'تم إلغاء فاتورة المورد بنجاح' };
  },

  /**
   * One-click "استلام كامل" (Full Goods Receipt) action on a purchase order.
   * Creates goods receipt, stock movements, and supplier invoice inside ONE Dexie transaction.
   */
  async receivePurchaseOrderFull(poId, userId = 'usr-storekeeper') {
    const po = await db.purchase_orders.get(poId);
    if (!po) throw new Error('أمر التوريد غير موجود');
    if (po.status === 'received') throw new Error('تم استلام أمر التوريد بالكامل مسبقاً');
    if (po.status === 'cancelled') throw new Error('لا يمكن استلام أمر توريد ملغي');

    const poItems = await db.purchase_order_items.where('po_id').equals(poId).toArray();
    if (poItems.length === 0) throw new Error('أمر التوريد لا يحتوي على بنود للاستلام');

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const grnId = `grn-${Date.now()}`;
    const grnNumber = `GRN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

    await db.transaction('rw', [
      db.purchase_orders,
      db.goods_receipts,
      db.goods_receipt_items,
      db.stock_movements,
      db.items,
      db.materials,
      db.supplier_invoices
    ], async () => {
      // 1. Create Goods Receipt
      const grn = {
        id: grnId,
        grn_number: grnNumber,
        po_id: poId,
        supplier_id: po.supplier_id,
        receipt_date: today,
        receiver_name: 'أمين المستودع (استلام كامل بنقرة واحدة)',
        notes: `استلام كامل لأمر الشراء ${po.po_number}`,
        created_by: userId,
        created_at: now
      };
      await db.goods_receipts.add(grn);

      // 2. Create Receipt Items and Stock Movements
      for (let idx = 0; idx < poItems.length; idx++) {
        const item = poItems[idx];
        const qty = Number(item.quantity_ordered) || 0;
        const unitCost = Number(item.unit_price) || 0;

        await db.goods_receipt_items.add({
          id: `gri-${Date.now()}-${idx}`,
          grn_id: grnId,
          material_id: item.material_id,
          quantity_received: qty,
          unit_cost: unitCost,
          total_cost: Number((qty * unitCost).toFixed(2))
        });

        // Stock movement: direction 'in'
        await db.stock_movements.add({
          id: `sm-${Date.now()}-${idx}`,
          item_id: item.material_id,
          material_id: item.material_id,
          location_id: 'loc-main',
          movement_type: 'purchase_receipt',
          direction: 'in',
          quantity: qty,
          quantity_change: qty,
          unit_cost: unitCost,
          document_id: grnId,
          reference_type: 'PURCHASE_RECEIPT',
          reference_id: poId,
          date: today,
          movement_date: today,
          notes: `وارد استلام كامل لأمر الشراء ${po.po_number}`,
          created_by: userId,
          created_at: now
        });

        // Update items table cached stock
        const itm = await db.items.get(item.material_id);
        if (itm) {
          const newStock = Number(((Number(itm.current_stock) || 0) + qty).toFixed(3));
          await db.items.update(itm.id, { current_stock: newStock });
        }
        const mat = await db.materials.get(item.material_id);
        if (mat) {
          const newStock = Number(((Number(mat.current_stock) || 0) + qty).toFixed(3));
          await db.materials.update(mat.id, { current_stock: newStock });
        }
      }

      // 3. Create Supplier Invoice so supplier balance updates
      const sinvId = `sinv-${Date.now()}`;
      const sinvNumber = `INV-SUP-${po.po_number.replace(/^PO-/, '')}`;
      await db.supplier_invoices.add({
        id: sinvId,
        invoice_number: sinvNumber,
        supplier_id: po.supplier_id,
        grn_id: grnId,
        po_id: poId,
        invoice_date: today,
        due_date: po.due_date,
        installments: po.installments || [],
        subtotal: po.subtotal,
        tax_amount: 0,
        total_amount: po.total_amount,
        paid_amount: po.payment_terms === 'cash' ? po.total_amount : 0,
        status: po.payment_terms === 'cash' ? 'paid' : 'unpaid',
        notes: `فاتورة استلام كامل لأمر التوريد ${po.po_number}`,
        created_by: userId,
        created_at: now
      });

      // 4. Update PO status to 'received'
      await db.purchase_orders.update(poId, { status: 'received' });
    });

    await auditRepo.log(userId, 'FULL_RECEIPT_PURCHASE_ORDER', 'purchase_orders', poId, po, {
      status: 'received',
      grnNumber
    });

    return { success: true, grnNumber };
  },

  /**
   * Cancel a Purchase Order:
   * If previously received, creates reversing stock movements and reverses supplier invoices.
   */
  async cancelPurchaseOrder(poId, reason = '', userId = 'usr-purchasing') {
    const po = await db.purchase_orders.get(poId);
    if (!po) throw new Error('أمر التوريد غير موجود');
    if (po.status === 'cancelled') throw new Error('أمر التوريد ملغي بالفعل');

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    await db.transaction('rw', [
      db.purchase_orders,
      db.goods_receipts,
      db.goods_receipt_items,
      db.stock_movements,
      db.items,
      db.materials,
      db.supplier_invoices,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      // If purchase order was cash, refund the amount back to the treasury
      if (po.payment_terms === 'cash') {
        const refundAmt = Number(po.grand_total || po.total_amount) || 0;
        if (refundAmt > 0) {
          const treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                           (await db.treasury_accounts.where('account_type').equals('treasury').first()) ||
                           (await db.treasury_accounts.toCollection().first());
          if (treasury) {
            const currentBal = Number(treasury.current_balance) || 0;
            const newBal = Number((currentBal + refundAmt).toFixed(2));
            await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

            await db.cash_transactions.add({
              id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              tx_number: `TXN-${Date.now().toString().slice(-4)}`,
              account_id: treasury.id,
              tx_type: 'inflow',
              category: 'purchase_orders',
              amount: refundAmt,
              balance_after: newBal,
              reference_type: 'purchase_orders',
              reference_id: poId,
              description: `استرداد نقدي لإلغاء أمر الشراء ${po.po_number}`,
              created_by: userId,
              created_at: now
            });
          }
        }
      }

      // If was received, reverse stock movements
      if (po.status === 'received' || po.status === 'partially_received') {
        const grns = await db.goods_receipts.where('po_id').equals(poId).toArray();

        // 1. Pre-check stock: Block cancelling when it would make stock negative!
        for (const grn of grns) {
          const grnItems = await db.goods_receipt_items.where('grn_id').equals(grn.id).toArray();
          for (const itm of grnItems) {
            const qty = Number(itm.quantity_received) || 0;
              const itemMaster = await db.items.get(itm.material_id);
              const matRecord = await db.materials.get(itm.material_id);
              const currentStock = Number(itemMaster?.current_stock ?? matRecord?.current_stock) || 0;
              const itemName = itemMaster?.name || matRecord?.name || itm.material_id;
              if (currentStock < qty) {
                throw new Error(
                  `لا يمكن إلغاء أمر التوريد: الكمية المتوفرة بالمخزن من الصنف (${itemName}) هي (${currentStock})، والكمية المراد استرجاعها هي (${qty}). إلغاء الأمر سيؤدي إلى رصيد مخزني سالب.`
                );
              }
          }
        }

        // 2. Perform reversals
        for (const grn of grns) {
          const grnItems = await db.goods_receipt_items.where('grn_id').equals(grn.id).toArray();
          for (let idx = 0; idx < grnItems.length; idx++) {
            const itm = grnItems[idx];
            const qty = Number(itm.quantity_received) || 0;

            // Reversing movement (out)
            await db.stock_movements.add({
              id: `sm-rev-${Date.now()}-${idx}`,
              item_id: itm.material_id,
              material_id: itm.material_id,
              location_id: 'loc-main',
              movement_type: 'reversal',
              direction: 'out',
              quantity: qty,
              quantity_change: -qty,
              unit_cost: Number(itm.unit_cost) || 0,
              document_id: poId,
              reference_type: 'PURCHASE_ORDER_CANCELLED',
              reference_id: poId,
              date: today,
              movement_date: today,
              notes: `حركة عكسية لإلغاء أمر الشراء المستلم ${po.po_number}: ${reason}`,
              created_by: userId,
              created_at: now
            });

            // Restore cached stock
            const itemMaster = await db.items.get(itm.material_id);
            if (itemMaster) {
              const newStock = Math.max(0, Number(((Number(itemMaster.current_stock) || 0) - qty).toFixed(3)));
              await db.items.update(itemMaster.id, { current_stock: newStock });
            }
            const mat = await db.materials.get(itm.material_id);
            if (mat) {
              const newStock = Math.max(0, Number(((Number(mat.current_stock) || 0) - qty).toFixed(3)));
              await db.materials.update(mat.id, { current_stock: newStock });
            }
          }
        }

        // Cancel associated supplier invoices
        const sinvs = await db.supplier_invoices.where('po_id').equals(poId).toArray();
        for (const sinv of sinvs) {
          await db.supplier_invoices.update(sinv.id, { status: 'cancelled' });
        }
      }

      await db.purchase_orders.update(poId, { status: 'cancelled', cancellation_reason: reason });
    });

    await auditRepo.log(userId, 'CANCEL_PURCHASE_ORDER', 'purchase_orders', poId, po, {
      status: 'cancelled',
      reason
    });

    return { success: true };
  },

  async getGoodsReceipts() {
    const receipts = await db.goods_receipts.reverse().sortBy('created_at');
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));
    const items = await db.goods_receipt_items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));
    const itemMasterList = await db.items.toArray();
    const itemMap = new Map(itemMasterList.map(i => [i.id, i]));

    return receipts.map(r => {
      const grnItems = items.filter(i => i.grn_id === r.id).map(i => {
        const itm = itemMap.get(i.material_id) || matMap.get(i.material_id);
        return {
          ...i,
          material_name: itm ? itm.name : i.material_id,
          material_code: itm ? itm.code : '',
          material_unit: itm ? itm.unit : 'قطعة',
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
    const id = data.id || `grn-${Date.now()}`;
    const grnNumber = data.grn_number || `GRN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const receiptDate = data.receipt_date || now.split('T')[0];

    const grn = {
      id,
      grn_number: grnNumber,
      po_id: data.po_id || null,
      supplier_id: data.supplier_id,
      receipt_date: receiptDate,
      receiver_name: data.receiver_name || '',
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    let totalReceiptAmount = 0;

    await db.transaction('rw', [
      db.goods_receipts,
      db.goods_receipt_items,
      db.materials,
      db.items,
      db.stock_movements,
      db.purchase_orders,
      db.supplier_invoices
    ], async () => {
      await db.goods_receipts.add(grn);

      for (let idx = 0; idx < (data.items || []).length; idx++) {
        const item = data.items[idx];
        const qtyReceived = Math.max(0, Number(item.quantity_received) || 0);
        const unitCost = Math.max(0, Number(item.unit_cost) || 0);
        const totalCost = Number((qtyReceived * unitCost).toFixed(2));
        totalReceiptAmount += totalCost;

        await db.goods_receipt_items.add({
          id: `gri-${Date.now()}-${idx}`,
          grn_id: id,
          material_id: item.material_id,
          quantity_received: qtyReceived,
          unit_cost: unitCost,
          total_cost: totalCost,
        });

        // Stock movement: direction 'in'
        await db.stock_movements.add({
          id: `sm-${Date.now()}-${idx}`,
          item_id: item.material_id,
          material_id: item.material_id,
          location_id: data.location_id || 'loc-main',
          movement_type: 'purchase_receipt',
          direction: 'in',
          quantity: qtyReceived,
          quantity_change: qtyReceived,
          unit_cost: unitCost,
          document_id: id,
          reference_type: 'GRN',
          reference_id: id,
          date: receiptDate,
          movement_date: receiptDate,
          notes: `وارد مشتريات إذن استلام ${grnNumber}`,
          created_by: userId,
          created_at: now,
        });

        // Update items table stock
        const itm = await db.items.get(item.material_id);
        if (itm) {
          const newStock = Number(((Number(itm.current_stock) || 0) + qtyReceived).toFixed(3));
          await db.items.update(itm.id, { current_stock: newStock });
        }
        // Update materials table stock & weighted average cost
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
        }
      }

      // If linked to PO, update PO status (partial or full)
      if (data.po_id) {
        const po = await db.purchase_orders.get(data.po_id);
        if (po) {
          // Check if all items received
          const allPoItems = await db.purchase_order_items.where('po_id').equals(data.po_id).toArray();
          const allReceipts = await db.goods_receipts.where('po_id').equals(data.po_id).toArray();
          const allReceiptIds = allReceipts.map(r => r.id);
          const allReceiptItems = await db.goods_receipt_items.filter(i => allReceiptIds.includes(i.grn_id)).toArray();

          let allCompleted = true;
          for (const poi of allPoItems) {
            const receivedTotal = allReceiptItems
              .filter(ri => ri.material_id === poi.material_id)
              .reduce((s, ri) => s + (Number(ri.quantity_received) || 0), 0);
            if (receivedTotal < Number(poi.quantity_ordered)) {
              allCompleted = false;
              break;
            }
          }

          const newStatus = allCompleted ? 'received' : 'partially_received';
          await db.purchase_orders.update(data.po_id, { status: newStatus });

          // Update/create supplier invoice so supplier balance reflects the receipt
          const existingInv = await db.supplier_invoices.where('grn_id').equals(id).first();
          if (!existingInv) {
            await db.supplier_invoices.add({
              id: `sinv-${Date.now()}`,
              invoice_number: `INV-GRN-${grnNumber.replace(/^GRN-/, '')}`,
              supplier_id: data.supplier_id,
              grn_id: id,
              po_id: data.po_id,
              invoice_date: receiptDate,
              due_date: po.due_date,
              installments: po.installments || [],
              subtotal: totalReceiptAmount,
              tax_amount: 0,
              total_amount: totalReceiptAmount,
              paid_amount: po.payment_terms === 'cash' ? totalReceiptAmount : 0,
              status: po.payment_terms === 'cash' ? 'paid' : 'unpaid',
              notes: `فاتورة استلام بضاعة إذن ${grnNumber}`,
              created_by: userId,
              created_at: now
            });
          }
        }
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

  /**
   * Get all due installments across all supplier invoices and credit purchase orders
   */
  async getDueInstallments() {
    const orders = await db.purchase_orders.filter(o => o.payment_terms === 'credit' && o.status !== 'cancelled').toArray();
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    const dueList = [];
    const today = new Date().toISOString().split('T')[0];

    for (const o of orders) {
      const installments = Array.isArray(o.installments) ? o.installments : [];
      for (const inst of installments) {
        const remaining = Math.max(0, (Number(inst.amount) || 0) - (Number(inst.paid_amount) || 0));
        if (remaining > 0) {
          const isOverdue = inst.due_date < today;
          const diffDays = Math.ceil((new Date(today).getTime() - new Date(inst.due_date).getTime()) / (1000 * 60 * 60 * 24));

          dueList.push({
            id: inst.id,
            po_id: o.id,
            po_number: o.po_number,
            supplier_id: o.supplier_id,
            supplier_name: supMap.get(o.supplier_id) || o.supplier_id,
            due_date: inst.due_date,
            amount: Number(inst.amount) || 0,
            paid_amount: Number(inst.paid_amount) || 0,
            remaining_amount: remaining,
            is_overdue: isOverdue,
            overdue_days: isOverdue ? diffDays : 0,
            notes: inst.notes || ''
          });
        }
      }
    }

    dueList.sort((a, b) => a.due_date.localeCompare(b.due_date));
    return dueList;
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
    const { supplier_id, invoice_id, installment_id, account_id, amount, payment_date, payment_method, notes } = data;
    if (payment_date) validateNotPastDate(payment_date, 'تاريخ سند الصرف للمورد');
    const payAmount = Math.max(0, Number(amount) || 0);
    if (payAmount <= 0) throw new Error('مبلغ السداد يجب أن يكون أكبر من صفر');

    const paymentId = `spay-${Date.now()}`;
    const paymentNumber = `PAY-SUP-${Date.now().toString().slice(-4)}`;
    const txId = `tx-${Date.now()}`;
    const txNumber = `TXN-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [
      db.payments,
      db.supplier_invoices,
      db.purchase_orders,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      const account = await db.treasury_accounts.get(account_id);
      if (!account) throw new Error('الحساب المالي أو الخزينة غير موجودة');

      const currentAccBal = Number(account.current_balance) || 0;
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

      // If linked to an installment inside a PO, update the installment
      if (installment_id) {
        const pos = await db.purchase_orders.toArray();
        for (const po of pos) {
          const insts = po.installments || [];
          const targetIndex = insts.findIndex(i => i.id === installment_id);
          if (targetIndex !== -1) {
            insts[targetIndex].paid_amount = Number(((Number(insts[targetIndex].paid_amount) || 0) + payAmount).toFixed(2));
            if (insts[targetIndex].paid_amount >= insts[targetIndex].amount) {
              insts[targetIndex].status = 'paid';
            } else {
              insts[targetIndex].status = 'partially_paid';
            }
            await db.purchase_orders.update(po.id, { installments: insts });
            break;
          }
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
    const returnDate = return_date || now.split('T')[0];

    await db.transaction('rw', [
      db.supplier_returns,
      db.materials,
      db.items,
      db.stock_movements,
      db.treasury_accounts,
      db.cash_transactions
    ], async () => {
      const itm = await db.items.get(material_id);
      const mat = await db.materials.get(material_id);

      const oldStock = itm ? Number(itm.current_stock) || 0 : (mat ? Number(mat.current_stock) || 0 : 0);
      if (oldStock < returnQty) {
        throw new Error(`الرصيد المتاح بالمخزن (${oldStock}) أقل من الكمية المراد ردها للمورد (${returnQty})`);
      }

      const newStock = Number((oldStock - returnQty).toFixed(3));
      if (itm) {
        await db.items.update(material_id, { current_stock: newStock });
      }
      if (mat) {
        await db.materials.update(material_id, { current_stock: newStock });
      }

      await db.supplier_returns.add({
        id: returnId,
        return_number: returnNumber,
        supplier_id,
        material_id,
        quantity: returnQty,
        unit_cost: returnUnitCost,
        total_amount: returnTotal,
        refund_status: refund_status || 'deduct_balance',
        return_date: returnDate,
        reason: reason || 'مرتجع خامات للمورد',
        created_by: userId,
        created_at: now,
      });

      // Stock movement: direction 'out'
      await db.stock_movements.add({
        id: `sm-${Date.now()}`,
        item_id: material_id,
        material_id,
        location_id: 'loc-main',
        movement_type: 'purchase_return',
        direction: 'out',
        quantity: returnQty,
        quantity_change: -returnQty,
        unit_cost: returnUnitCost,
        new_balance: newStock,
        document_id: returnId,
        reference_type: 'SUPPLIER_RETURN',
        reference_id: returnId,
        date: returnDate,
        movement_date: returnDate,
        notes: `مرتجع للمورد إذن ${returnNumber}`,
        created_by: userId,
        created_at: now,
      });

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
