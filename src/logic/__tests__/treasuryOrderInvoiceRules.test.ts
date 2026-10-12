import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../data/db';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import BalanceCalculator from '../balances';
import { getTodayDateString } from '../../utils/formatters';

describe('Treasury, Order Deletion, and Invoice Cancellation Rules', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });

    // Ensure baseline main treasury
    await db.treasury_accounts.put({
      id: 'acc-main',
      name: 'الخزينة الرئيسية',
      account_type: 'treasury',
      outlet_id: null,
      is_main: 1,
      current_balance: 0,
      created_at: new Date().toISOString(),
    });
  });

  it('a) Create purchase order -> treasury decreases, including when balance goes below zero', async () => {
    // Set initial treasury balance to 200
    await db.treasury_accounts.update('acc-main', { current_balance: 200 });
    const treasuryBefore = await db.treasury_accounts.get('acc-main');
    expect(treasuryBefore.current_balance).toBe(200);

    // Create supplier
    const sup = await partiesRepo.create({
      name: 'مورد أقمشة رئيسي',
      is_supplier: true,
      payment_terms: 'cash',
    }, 'usr-test');

    // Create PO for 1500 (will bring balance from 200 to -1300)
    const poData = {
      supplier_id: sup.id,
      payment_terms: 'cash',
      order_date: getTodayDateString(),
      subtotal: 1500,
      items: [
        { material_id: 'mat-raw-cotton', quantity_ordered: 15, unit_price: 100 }
      ],
    };

    const po = await suppliersRepo.createPurchaseOrder(poData, 'usr-test');
    expect(po.id).toBeDefined();

    // Check treasury after
    const treasuryAfter = await db.treasury_accounts.get('acc-main');
    console.log('[TEST A] Treasury Before:', treasuryBefore.current_balance, '-> After:', treasuryAfter.current_balance);

    expect(treasuryAfter.current_balance).toBe(-1300);

    // Verify cash transaction record was created and linked to PO
    const tx = await db.cash_transactions.where('reference_id').equals(po.id).first();
    expect(tx).toBeDefined();
    expect(tx.reference_type).toBe('purchase_orders');
    expect(tx.tx_type).toBe('outflow');
    expect(tx.amount).toBe(1500);
    expect(tx.balance_after).toBe(-1300);
  });

  it('b) Create sale -> treasury increases', async () => {
    // Initial treasury balance at 500
    await db.treasury_accounts.update('acc-main', { current_balance: 500 });
    const treasuryBefore = await db.treasury_accounts.get('acc-main');
    expect(treasuryBefore.current_balance).toBe(500);

    // Create customer
    const cust = await salesRepo.createCustomer({
      name: 'عميل نقدي مبيعات',
      phone: '01012345678',
    }, 'usr-test');

    // Create sale for 750 (cash sale)
    const saleData = {
      customer_id: cust.id,
      payment_terms: 'cash',
      invoice_date: getTodayDateString(),
      items: [
        { product_id: 'prd-shirt-01', quantity: 3, unit_selling_price: 250, unit_cost: 150 }
      ],
    };

    const sale = await salesRepo.createSalesInvoice(saleData, 'usr-test');
    expect(sale.id).toBeDefined();

    const treasuryAfter = await db.treasury_accounts.get('acc-main');
    console.log('[TEST B] Treasury Before:', treasuryBefore.current_balance, '-> After:', treasuryAfter.current_balance);

    expect(treasuryAfter.current_balance).toBe(1250);

    // Verify cash transaction record was created and linked to sales invoice
    const tx = await db.cash_transactions.where('reference_id').equals(sale.id).first();
    expect(tx).toBeDefined();
    expect(tx.reference_type).toBe('sales_invoices');
    expect(tx.tx_type).toBe('inflow');
    expect(tx.amount).toBe(750);
    expect(tx.balance_after).toBe(1250);
  });

  it('c) Create order + add new item + delete the order -> item still exists and appears in items list', async () => {
    // 1. Add new item master record during order workflow
    const itemData = {
      code: 'ITEM-TEST-888',
      name: 'صنف اختبار القماش الحريري',
      item_group: 'أقمشة',
      item_department: 'خامات أولية',
      unit: 'متر',
      cost_price: 120,
      selling_price: 180,
    };
    const itemRes = await itemsRepo.create(itemData, 'usr-test');
    const itemId = itemRes.id;
    expect(itemId).toBeDefined();

    // Verify item exists in DB before order
    const itemInDbBefore = await db.items.get(itemId);
    expect(itemInDbBefore).toBeDefined();
    expect(itemInDbBefore.name).toBe('صنف اختبار القماش الحريري');

    // 2. Create supplier and purchase order linking to this new item
    const sup = await partiesRepo.create({
      name: 'مورد تجربة الأصناف',
      is_supplier: true,
      payment_terms: 'credit',
    }, 'usr-test');

    const po = await suppliersRepo.createPurchaseOrder({
      supplier_id: sup.id,
      payment_terms: 'credit',
      order_date: getTodayDateString(),
      items: [
        { material_id: itemId, quantity_ordered: 20, unit_price: 120 }
      ]
    }, 'usr-test');

    const poItemsBefore = await db.purchase_order_items.where('po_id').equals(po.id).toArray();
    expect(poItemsBefore.length).toBe(1);

    // 3. Delete the purchase order
    await suppliersRepo.deletePurchaseOrder(po.id, 'usr-test');

    // Verify PO and order lines are deleted
    const deletedPO = await db.purchase_orders.get(po.id);
    expect(deletedPO).toBeUndefined();
    const poItemsAfter = await db.purchase_order_items.where('po_id').equals(po.id).toArray();
    expect(poItemsAfter.length).toBe(0);

    // CRITICAL: Item master record MUST STILL EXIST in DB and appear in getItems list
    const itemInDbAfter = await db.items.get(itemId);
    console.log('[TEST C] Item existence after order deletion:', Boolean(itemInDbAfter), itemInDbAfter?.name);
    expect(itemInDbAfter).toBeDefined();
    expect(itemInDbAfter.id).toBe(itemId);
    expect(itemInDbAfter.name).toBe('صنف اختبار القماش الحريري');

    const allItems = await itemsRepo.getAll();
    const foundInList = allItems.some(it => it.id === itemId);
    expect(foundInList).toBe(true);
  });

  it('d1) Cancel a CREDIT invoice -> inventory reversed, supplier balance reduced, treasury unchanged, supplier and items still exist', async () => {
    // Baseline treasury
    await db.treasury_accounts.update('acc-main', { current_balance: 1000 });

    // Create item
    const item = await itemsRepo.create({
      code: 'MAT-CR-1',
      name: 'قماش صوف إنجليزي',
      unit: 'متر',
      cost_price: 200,
    }, 'usr-test');

    // Create supplier
    const sup = await partiesRepo.create({
      name: 'مورد صوف فاخر',
      is_supplier: true,
      payment_terms: 'credit',
    }, 'usr-test');

    // Create PO with receive_now to establish receipt and credit invoice
    const po = await suppliersRepo.createPurchaseOrder({
      supplier_id: sup.id,
      payment_terms: 'credit',
      receive_now: true,
      order_date: getTodayDateString(),
      items: [
        { material_id: item.id, quantity_ordered: 10, unit_price: 200 } // 2000 total
      ],
      installments: [
        { amount: 2000, due_date: '2026-10-30' }
      ]
    }, 'usr-test');

    const inv = await db.supplier_invoices.where('po_id').equals(po.id).first();
    expect(inv).toBeDefined();
    expect(inv.status).toBe('unpaid');
    expect(inv.total_amount).toBe(2000);

    // Values before cancellation:
    const itemBeforeCancel = await db.items.get(item.id);
    const treasuryBeforeCancel = await db.treasury_accounts.get('acc-main');
    const supInvoicesBefore = await db.supplier_invoices.where('supplier_id').equals(sup.id).toArray();
    const supBalBefore = BalanceCalculator.calculateSupplierBalance(supInvoicesBefore, []);

    console.log('[TEST D1 BEFORE] Stock:', itemBeforeCancel.current_stock, '| Sup Debt:', supBalBefore.balanceDue, '| Treasury:', treasuryBeforeCancel.current_balance);
    expect(itemBeforeCancel.current_stock).toBe(10);
    expect(supBalBefore.balanceDue).toBe(2000);
    // Note: Treasury was deducted at PO creation by 2000: 1000 - 2000 = -1000
    const expectedTreasuryBefore = treasuryBeforeCancel.current_balance;

    // Execute cancellation of CREDIT invoice
    const cancelRes = await suppliersRepo.cancelSupplierInvoice(inv.id, 'إلغاء لعدم مطابقة المواصفات', 'usr-test');
    expect(cancelRes.success).toBe(true);

    // Values after cancellation:
    const itemAfterCancel = await db.items.get(item.id);
    const treasuryAfterCancel = await db.treasury_accounts.get('acc-main');
    const supInvoicesAfter = await db.supplier_invoices.where('supplier_id').equals(sup.id).toArray();
    const supBalAfter = BalanceCalculator.calculateSupplierBalance(supInvoicesAfter, []);
    const supInDb = await db.suppliers.get(sup.id);

    console.log('[TEST D1 AFTER] Stock:', itemAfterCancel.current_stock, '| Sup Debt:', supBalAfter.balanceDue, '| Treasury:', treasuryAfterCancel.current_balance);

    // 1. Inventory reversed (stock back to 0)
    expect(itemAfterCancel.current_stock).toBe(0);
    // 2. Supplier debt reduced to 0
    expect(supBalAfter.balanceDue).toBe(0);
    // 3. Treasury UNCHANGED (credit cancellation does not touch treasury)
    expect(treasuryAfterCancel.current_balance).toBe(expectedTreasuryBefore);
    // 4. Supplier and items still exist
    expect(supInDb).toBeDefined();
    expect(itemAfterCancel).toBeDefined();
    expect(itemAfterCancel.name).toBe('قماش صوف إنجليزي');
  });

  it('d2) Cancel a CASH invoice -> inventory reversed, treasury effect reversed, supplier balance unchanged, supplier and items still exist', async () => {
    // Baseline treasury
    await db.treasury_accounts.update('acc-main', { current_balance: 5000 });

    // Create item
    const item = await itemsRepo.create({
      code: 'MAT-CS-1',
      name: 'أزرار صلب مستوردة',
      unit: 'قطعة',
      cost_price: 5,
    }, 'usr-test');

    // Create supplier
    const sup = await partiesRepo.create({
      name: 'مورد إكسسوارات كاش',
      is_supplier: true,
      payment_terms: 'cash',
    }, 'usr-test');

    // Create Cash PO with full receipt (receive_now)
    const po = await suppliersRepo.createPurchaseOrder({
      supplier_id: sup.id,
      payment_terms: 'cash',
      receive_now: true,
      order_date: getTodayDateString(),
      items: [
        { material_id: item.id, quantity_ordered: 100, unit_price: 5 } // 500 LE
      ]
    }, 'usr-test');

    const inv = await db.supplier_invoices.where('po_id').equals(po.id).first();
    expect(inv).toBeDefined();
    expect(inv.status).toBe('paid');
    expect(inv.paid_amount).toBe(500);

    // Treasury was 5000 - 500 = 4500
    const treasuryBeforeCancel = await db.treasury_accounts.get('acc-main');
    expect(treasuryBeforeCancel.current_balance).toBe(4500);
    const itemBeforeCancel = await db.items.get(item.id);
    expect(itemBeforeCancel.current_stock).toBe(100);

    const supInvoicesBefore = await db.supplier_invoices.where('supplier_id').equals(sup.id).toArray();
    const supBalBefore = BalanceCalculator.calculateSupplierBalance(supInvoicesBefore, []);
    expect(supBalBefore.balanceDue).toBe(0); // Paid cash, 0 due

    console.log('[TEST D2 BEFORE] Stock:', itemBeforeCancel.current_stock, '| Treasury:', treasuryBeforeCancel.current_balance, '| Sup Debt:', supBalBefore.balanceDue);

    // Execute cancellation of CASH invoice
    const cancelRes = await suppliersRepo.cancelSupplierInvoice(inv.id, 'إلغاء واسترداد النقدية', 'usr-test');
    expect(cancelRes.success).toBe(true);

    const itemAfterCancel = await db.items.get(item.id);
    const treasuryAfterCancel = await db.treasury_accounts.get('acc-main');
    const supInvoicesAfter = await db.supplier_invoices.where('supplier_id').equals(sup.id).toArray();
    const supBalAfter = BalanceCalculator.calculateSupplierBalance(supInvoicesAfter, []);
    const supInDb = await db.suppliers.get(sup.id);

    console.log('[TEST D2 AFTER] Stock:', itemAfterCancel.current_stock, '| Treasury:', treasuryAfterCancel.current_balance, '| Sup Debt:', supBalAfter.balanceDue);

    // 1. Inventory reversed (stock back to 0)
    expect(itemAfterCancel.current_stock).toBe(0);
    // 2. Treasury effect REVERSED (+500 cash restored: 4500 + 500 = 5000)
    expect(treasuryAfterCancel.current_balance).toBe(5000);
    // 3. Supplier balance UNCHANGED (still 0)
    expect(supBalAfter.balanceDue).toBe(0);
    // 4. Supplier and item still exist
    expect(supInDb).toBeDefined();
    expect(itemAfterCancel).toBeDefined();
    expect(itemAfterCancel.name).toBe('أزرار صلب مستوردة');
  });

  it('e) Cancel the same invoice twice -> second attempt changes nothing', async () => {
    // Setup cash invoice
    await db.treasury_accounts.update('acc-main', { current_balance: 3000 });
    const item = await itemsRepo.create({
      code: 'MAT-IDEM-1',
      name: 'خيوط حياكة قطنية',
      unit: 'بكرة',
      cost_price: 20,
    }, 'usr-test');

    const sup = await partiesRepo.create({
      name: 'مورد خيوط',
      is_supplier: true,
      payment_terms: 'cash',
    }, 'usr-test');

    const po = await suppliersRepo.createPurchaseOrder({
      supplier_id: sup.id,
      payment_terms: 'cash',
      receive_now: true,
      order_date: getTodayDateString(),
      items: [
        { material_id: item.id, quantity_ordered: 10, unit_price: 20 } // 200 LE
      ]
    }, 'usr-test');

    const inv = await db.supplier_invoices.where('po_id').equals(po.id).first();

    // First cancellation
    const firstAttempt = await suppliersRepo.cancelSupplierInvoice(inv.id, 'إلغاء أول', 'usr-test');
    expect(firstAttempt.success).toBe(true);

    const stockAfterFirst = (await db.items.get(item.id)).current_stock;
    const treasuryAfterFirst = (await db.treasury_accounts.get('acc-main')).current_balance;
    const movementsCountFirst = await db.stock_movements.count();
    const transactionsCountFirst = await db.cash_transactions.count();

    console.log('[TEST E AFTER 1st] Stock:', stockAfterFirst, '| Treasury:', treasuryAfterFirst, '| Movements:', movementsCountFirst, '| Transactions:', transactionsCountFirst);

    // Second cancellation attempt on the already cancelled invoice
    const secondAttempt = await suppliersRepo.cancelSupplierInvoice(inv.id, 'إلغاء ثان مكرر', 'usr-test');
    expect(secondAttempt.alreadyCancelled).toBe(true);

    const stockAfterSecond = (await db.items.get(item.id)).current_stock;
    const treasuryAfterSecond = (await db.treasury_accounts.get('acc-main')).current_balance;
    const movementsCountSecond = await db.stock_movements.count();
    const transactionsCountSecond = await db.cash_transactions.count();

    console.log('[TEST E AFTER 2nd] Stock:', stockAfterSecond, '| Treasury:', treasuryAfterSecond, '| Movements:', movementsCountSecond, '| Transactions:', transactionsCountSecond);

    // Verify absolutely nothing changed on second attempt
    expect(stockAfterSecond).toBe(stockAfterFirst);
    expect(treasuryAfterSecond).toBe(treasuryAfterFirst);
    expect(movementsCountSecond).toBe(movementsCountFirst);
    expect(transactionsCountSecond).toBe(transactionsCountFirst);
  });

  it('f) Cancel a cash purchase order -> refunds treasury balance and creates inflow transaction', async () => {
    // Treasury starts at 1000
    await db.treasury_accounts.update('acc-main', { current_balance: 1000 });
    const sup = await partiesRepo.create({
      name: 'مورد مستلزمات سريعة',
      is_supplier: true,
      payment_terms: 'cash',
    }, 'usr-test');

    // Create cash PO of 400 -> treasury becomes 600
    const po = await suppliersRepo.createPurchaseOrder({
      supplier_id: sup.id,
      payment_terms: 'cash',
      order_date: getTodayDateString(),
      items: [
        { material_id: 'mat-thread', quantity_ordered: 20, unit_price: 20 }
      ]
    }, 'usr-test');

    const balAfterPO = (await db.treasury_accounts.get('acc-main')).current_balance;
    expect(balAfterPO).toBe(600);

    // Cancel PO
    const cancelRes = await suppliersRepo.cancelPurchaseOrder(po.id, 'إلغاء أمر الشراء النقدي', 'usr-test');
    expect(cancelRes.success).toBe(true);

    // Verify treasury was refunded to 1000
    const balAfterCancel = (await db.treasury_accounts.get('acc-main')).current_balance;
    expect(balAfterCancel).toBe(1000);

    // Verify inflow cash transaction exists
    const refundTx = await db.cash_transactions
      .where('reference_id').equals(po.id)
      .and(t => t.tx_type === 'inflow')
      .first();
    expect(refundTx).toBeDefined();
    expect(refundTx.amount).toBe(400);
    expect(refundTx.balance_after).toBe(1000);
  });

  it('g) paySupplier allows negative treasury balance and logs payment', async () => {
    // Treasury balance is 100
    await db.treasury_accounts.update('acc-main', { current_balance: 100 });
    const sup = await partiesRepo.create({
      name: 'مورد خامات آجل',
      is_supplier: true,
      payment_terms: 'credit',
      opening_balance: 1000,
      opening_balance_type: 'credit',
    }, 'usr-test');

    // Pay 500 when treasury only has 100 -> treasury should become -400
    const payRes = await suppliersRepo.paySupplier({
      supplier_id: sup.id,
      account_id: 'acc-main',
      amount: 500,
      payment_method: 'cash',
      notes: 'سداد عاجل تحت الحساب'
    }, 'usr-test');

    expect(payRes.success).toBe(true);
    const treasuryAfterPay = await db.treasury_accounts.get('acc-main');
    expect(treasuryAfterPay.current_balance).toBe(-400);

    // Verify cash outflow transaction
    const tx = await db.cash_transactions.where('account_id').equals('acc-main').reverse().first();
    expect(tx.tx_type).toBe('outflow');
    expect(tx.amount).toBe(500);
    expect(tx.balance_after).toBe(-400);
  });

  it('h) Cancel a sales invoice -> reverses item stock and treasury balance', async () => {
    // Initial treasury balance at 2000
    await db.treasury_accounts.update('acc-main', { current_balance: 2000 });

    const itemRes = await itemsRepo.create({
      name: 'قميص صيفي تجريبي',
      code: 'SHIRT-TEST-01',
      item_group: 'ملابس رجالي',
      item_department: 'قمصان',
      unit: 'قطعة',
      opening_balance: 50,
      cost_price: 100,
      selling_price: 200,
    }, 'usr-test');
    const itemId = itemRes.id;

    const cust = await salesRepo.createCustomer({
      name: 'عميل نقدي تجريبي',
      phone: '01112233445',
    }, 'usr-test');

    // Create cash sales invoice: 5 units * 200 = 1000 LE
    const sale = await salesRepo.createSalesInvoice({
      customer_id: cust.id,
      payment_terms: 'cash',
      items: [
        { product_id: itemId, quantity: 5, unit_selling_price: 200, unit_cost: 100 }
      ]
    }, 'usr-test');

    const stockAfterSale = (await db.items.get(itemId)).current_stock;
    const treasuryAfterSale = (await db.treasury_accounts.get('acc-main')).current_balance;
    expect(stockAfterSale).toBe(45);
    expect(treasuryAfterSale).toBe(3000);

    // Cancel sales invoice
    const cancelRes = await salesRepo.cancelSalesInvoice(sale.id, 'إلغاء لطلب العميل', 'usr-test');
    expect(cancelRes.success).toBe(true);

    const stockAfterCancel = (await db.items.get(itemId)).current_stock;
    const treasuryAfterCancel = (await db.treasury_accounts.get('acc-main')).current_balance;
    expect(stockAfterCancel).toBe(50);
    expect(treasuryAfterCancel).toBe(2000);

    // Verify item master record still exists
    const itemStillThere = await db.items.get(itemId);
    expect(itemStillThere).toBeDefined();
    expect(itemStillThere.name).toBe('قميص صيفي تجريبي');
  });
});
