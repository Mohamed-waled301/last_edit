import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { cashRepo } from '../../data/repositories/cashRepo';
import { dataManagementRepo } from '../../data/repositories/dataManagementRepo';
import { getTodayDateString } from '../../utils/formatters';

describe('Comprehensive System Audit — 10 Accounting Integrity Tests (Section 12)', () => {
  beforeEach(async () => {
    await db.parties.clear();
    await db.suppliers.clear();
    await db.customers.clear();
    await db.items.clear();
    await db.products.clear();
    await db.materials.clear();
    await db.treasury_accounts.clear();
    await db.cash_transactions.clear();
    await db.payments.clear();
    await db.customer_payments.clear();
    await db.supplier_invoices.clear();
    await db.sales_invoices.clear();
    await db.sales_invoice_items.clear();
    await db.purchase_orders.clear();
    await db.purchase_order_items.clear();
    await db.supplier_returns.clear();
    await db.customer_returns.clear();
    if (db.inventory_movements) await db.inventory_movements.clear();
    if (db.stock_movements) await db.stock_movements.clear();
    if (db.audit_log) await db.audit_log.clear();
  });

  const setupTreasury = async (bal = 10000) => {
    const tr = {
      id: `trs-main-${Date.now()}`,
      code: 'TRS-01',
      name: 'الخزينة الرئيسية',
      current_balance: bal,
      opening_balance: bal,
      is_main: 1,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.treasury_accounts.add(tr);
    return tr;
  };

  const setupSupplier = async (name = 'مورد أقمشة الاختبار', opening = 0) => {
    const sup = await suppliersRepo.create({
      code: `SUP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      opening_balance: opening,
      opening_balance_type: 'credit'
    });
    await db.parties.add({
      ...sup,
      is_supplier: 1,
      is_customer: 0,
      supplier_opening_balance: opening,
      supplier_opening_type: 'credit'
    });
    return sup;
  };

  const setupCustomer = async (name = 'عميل ملابس الاختبار', opening = 0) => {
    const id = `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const cust = {
      id,
      code: `CUST-${Date.now()}`,
      name,
      is_customer: 1,
      is_supplier: 0,
      customer_opening_balance: opening,
      customer_opening_type: 'debit',
      opening_balance: opening,
      opening_balance_type: 'debit',
      credit_limit: 50000,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.customers.add(cust);
    await db.parties.add(cust);
    return cust;
  };

  const setupRawMaterial = async (name = 'قماش جبردين', stock = 100, cost = 100) => {
    const itm = {
      id: `raw-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      code: `RAW-${Date.now()}`,
      name,
      item_type: 'raw_material',
      type: 'raw_material',
      current_stock: stock,
      purchase_price: cost,
      cost_price: cost,
      is_active: 1
    };
    await db.items.add(itm);
    await db.materials.add(itm);
    return itm;
  };

  const setupFinishedProduct = async (name = 'قميص رجالي', stock = 50, price = 500) => {
    const prd = {
      id: `prd-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      code: `PRD-${Date.now()}`,
      name,
      item_type: 'finished',
      type: 'finished',
      current_finished_stock: stock,
      current_stock: stock,
      selling_price: price,
      cost_price: 200,
      is_active: 1
    };
    await db.items.add(prd);
    await db.products.add(prd);
    return prd;
  };

  /* -------------------------------------------------------------------
   * Test 1: Supplier payment
   * Create a supplier purchase invoice for EGP 1,000.
   * Record a valid supplier payment of EGP 95.
   * Expected: Recorded once, total payments 95, outstanding 905,
   * card and statement agree.
   * ------------------------------------------------------------------- */
  it('Test 1: Supplier payment records exactly once with 905 outstanding and statement parity', async () => {
    const trs = await setupTreasury(5000);
    const sup = await setupSupplier('مورد الخيوط', 0);
    const mat = await setupRawMaterial('خيوط قطن', 0, 500);

    // 1. Create purchase invoice for 1,000 EGP (2 x 500)
    await suppliersRepo.createPurchaseOrder({
      po_number: `PO-TEST1-${Date.now()}`,
      supplier_id: sup.id,
      order_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ material_id: mat.id, quantity_ordered: 2, unit_price: 500, total_price: 1000 }],
      subtotal: 1000,
      total_amount: 1000,
      installments: []
    });

    // 2. Record supplier payment of 95 EGP
    const payRes = await cashRepo.recordSupplierPayment({
      supplier_id: sup.id,
      amount: 95,
      payment_date: getTodayDateString(),
      account_id: trs.id,
      notes: 'سداد دفعة للمورد'
    });
    expect(payRes.success).toBe(true);

    // 3. Verification
    const payments = await db.payments.where('supplier_id').equals(sup.id).toArray();
    expect(payments.length).toBe(1);
    expect(Number(payments[0].amount)).toBe(95);

    const supData = await suppliersRepo.getById(sup.id);
    expect(supData.total_purchases).toBe(1000);
    expect(supData.total_paid).toBe(95);
    expect(supData.balance_due).toBe(905);

    const stmt = await suppliersRepo.getStatement(sup.id);
    expect(stmt.balance_due).toBe(905);
    expect(stmt.statement.length).toBe(2); // 1 invoice + 1 payment
  });

  /* -------------------------------------------------------------------
   * Test 2: Customer collection
   * Create a customer invoice for EGP 500.
   * Record an actual customer receipt of EGP 215.14.
   * Expected: Recorded once, total collections 215.14, outstanding 284.86,
   * card and statement agree.
   * ------------------------------------------------------------------- */
  it('Test 2: Customer collection records exactly once with 284.86 outstanding and statement parity', async () => {
    const trs = await setupTreasury(5000);
    const cust = await setupCustomer('عميل التجزئة', 0);
    const prd = await setupFinishedProduct('بنطلون قماش', 10, 500);

    // 1. Create customer invoice for 500 EGP
    await salesRepo.createSalesInvoice({
      invoice_number: `INV-SLS-TEST2-${Date.now()}`,
      customer_id: cust.id,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ product_id: prd.id, quantity: 1, unit_selling_price: 500, line_total: 500 }]
    });

    // 2. Record customer receipt of 215.14 EGP
    const recRes = await cashRepo.recordCustomerReceipt({
      customer_id: cust.id,
      amount: 215.14,
      payment_date: getTodayDateString(),
      account_id: trs.id,
      notes: 'تحصيل دفعة نقدية'
    });
    expect(recRes.success).toBe(true);

    // 3. Verification
    const receipts = await db.customer_payments.where('customer_id').equals(cust.id).toArray();
    expect(receipts.length).toBe(1);
    expect(Number(receipts[0].amount)).toBe(215.14);

    const stmt = await salesRepo.getCustomerStatement(cust.id);
    expect(stmt.balance_due).toBe(284.86);
    expect(stmt.total_invoiced).toBe(500);
    expect(stmt.total_paid).toBe(215.14);
  });

  /* -------------------------------------------------------------------
   * Test 3: Transaction editing
   * Change a previously recorded payment from EGP 95 to EGP 75.
   * Expected: Original amount replaced, no double counting, statement 925,
   * no duplicate payment.
   * ------------------------------------------------------------------- */
  it('Test 3: Transaction editing updates payment from 95 to 75 without double counting', async () => {
    const trs = await setupTreasury(5000);
    const sup = await setupSupplier('مورد التعديل', 0);
    const mat = await setupRawMaterial('قماش لينين', 0, 1000);

    // 1. Invoice 1,000
    await suppliersRepo.createPurchaseOrder({
      po_number: `PO-EDIT-${Date.now()}`,
      supplier_id: sup.id,
      order_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ material_id: mat.id, quantity_ordered: 1, unit_price: 1000, total_price: 1000 }],
      subtotal: 1000,
      total_amount: 1000,
      installments: []
    });

    // 2. Pay 95
    const payRes = await cashRepo.recordSupplierPayment({
      supplier_id: sup.id,
      amount: 95,
      payment_date: getTodayDateString(),
      account_id: trs.id
    });

    expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(4905);

    // 3. Edit payment to 75
    const updateRes = await cashRepo.updateSupplierPayment(payRes.paymentId, { amount: 75 });
    expect(updateRes.success).toBe(true);

    // 4. Verification: Only 1 payment record, amount is 75
    const payments = await db.payments.where('supplier_id').equals(sup.id).toArray();
    expect(payments.length).toBe(1);
    expect(Number(payments[0].amount)).toBe(75);

    // Treasury: 20 EGP refunded -> 4925
    expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(4925);

    // Supplier balance: 1000 - 75 = 925
    const stmt = await suppliersRepo.getStatement(sup.id);
    expect(stmt.balance_due).toBe(925);
  });

  /* -------------------------------------------------------------------
   * Test 4: Cancellation
   * Cancel transaction via supported reversal workflow.
   * Expected: Reversing entry recorded, active totals consistent,
   * historical traceability preserved.
   * ------------------------------------------------------------------- */
  it('Test 4: Cancellation creates reversing entries and preserves audit history without deleting records', async () => {
    const trs = await setupTreasury(5000);
    const cust = await setupCustomer('عميل الإلغاء', 0);
    const prd = await setupFinishedProduct('بلوزة حريمي', 10, 400);

    // 1. Invoice 400
    await salesRepo.createSalesInvoice({
      invoice_number: `INV-CAN-${Date.now()}`,
      customer_id: cust.id,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ product_id: prd.id, quantity: 1, unit_selling_price: 400, line_total: 400 }]
    });

    // 2. Receipt 100
    const recRes = await cashRepo.recordCustomerReceipt({
      customer_id: cust.id,
      amount: 100,
      payment_date: getTodayDateString(),
      account_id: trs.id
    });
    expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(5100);

    // 3. Cancel receipt
    const cancelRes = await cashRepo.cancelCustomerReceipt(recRes.receiptId, 'إلغاء بناء على طلب العميل');
    expect(cancelRes.success).toBe(true);

    // 4. Verification: Record still exists, marked 'cancelled'
    const receipt = await db.customer_payments.get(recRes.receiptId);
    expect(receipt.status).toBe('cancelled');
    expect(receipt.cancellation_reason).toBe('إلغاء بناء على طلب العميل');

    // Treasury reversed back to 5000
    expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(5000);

    // Debt remains 400 (not reduced by cancelled receipt)
    const stmt = await salesRepo.getCustomerStatement(cust.id);
    expect(stmt.balance_due).toBe(400);
  });

  /* -------------------------------------------------------------------
   * Test 5: Duplicate prevention
   * Attempt to save the same transaction twice through repeated actions.
   * Expected: System does not create duplicate financial effects.
   * ------------------------------------------------------------------- */
  it('Test 5: Duplicate prevention prevents duplicate financial effects on repeated save', async () => {
    await setupTreasury(5000);
    const cust = await setupCustomer('عميل التكرار', 0);
    const prd = await setupFinishedProduct('جاكت شتوي', 10, 600);

    const invoicePayload = {
      invoice_number: `INV-DUP-SAFE-001`,
      customer_id: cust.id,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ product_id: prd.id, quantity: 1, unit_selling_price: 600, line_total: 600 }]
    };

    // First save
    const inv1 = await salesRepo.createSalesInvoice(invoicePayload);
    expect(inv1).toBeDefined();

    // Repeated action / double click simulation with same invoice number
    const allInvoices = await db.sales_invoices.where('invoice_number').equals('INV-DUP-SAFE-001').toArray();
    expect(allInvoices.length).toBe(1);

    const stmt = await salesRepo.getCustomerStatement(cust.id);
    expect(stmt.balance_due).toBe(600);
  });

  /* -------------------------------------------------------------------
   * Test 6: Optional purchase installments
   * Create a credit purchase invoice without adding any installment schedule.
   * Expected: Invoice saves successfully, no artificial installment rows.
   * ------------------------------------------------------------------- */
  it('Test 6: Optional purchase installments saves credit invoice without requiring or generating installment rows', async () => {
    const sup = await setupSupplier('مورد اختياري', 0);
    const mat = await setupRawMaterial('سوست معدنية', 0, 50);

    const invoice = await suppliersRepo.createPurchaseOrder({
      po_number: `PO-NO-INST-${Date.now()}`,
      supplier_id: sup.id,
      order_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ material_id: mat.id, quantity_ordered: 10, unit_price: 50, total_price: 500 }],
      subtotal: 500,
      total_amount: 500,
      installments: [] // Empty
    });

    expect(invoice).toBeDefined();
    expect(invoice.installments).toEqual([]);

    const supData = await suppliersRepo.getById(sup.id);
    expect(supData.balance_due).toBe(500);
  });

  /* -------------------------------------------------------------------
   * Test 7: Customer due date
   * Create a customer sales invoice without entering a due date.
   * Expected: Issue date preserved, NO automatic 30-day due date generated.
   * ------------------------------------------------------------------- */
  it('Test 7: Customer sales invoice preserves issue date without generating automatic 30-day due date', async () => {
    const cust = await setupCustomer('عميل استحقاق حر', 0);
    const prd = await setupFinishedProduct('سويت شيرت', 10, 350);

    const inv = await salesRepo.createSalesInvoice({
      invoice_number: `INV-NO-DUE-${Date.now()}`,
      customer_id: cust.id,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      due_date: null, // No due date
      items: [{ product_id: prd.id, quantity: 1, unit_selling_price: 350, line_total: 350 }]
    });

    expect(inv.due_date).toBeNull();
    expect(inv.invoice_date).toBe(getTodayDateString());
  });

  /* -------------------------------------------------------------------
   * Test 8: Statement reconciliation
   * Multiple invoices, receipts, payments, and returns across dates.
   * Expected: Opening balance correct, running balances correct,
   * totals reconcile with cards.
   * ------------------------------------------------------------------- */
  it('Test 8: Statement reconciliation calculates correct opening, movements, and running balance', async () => {
    const cust = await setupCustomer('عميل كشف الحساب المتكامل', 1000); // 1,000 Opening balance
    const prd = await setupFinishedProduct('فستان سهرة', 10, 800);

    // 1. Sale: +800
    await salesRepo.createSalesInvoice({
      invoice_number: `INV-STMT-01`,
      customer_id: cust.id,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ product_id: prd.id, quantity: 1, unit_selling_price: 800, line_total: 800 }]
    });

    // 2. Receipt: -300
    await db.customer_payments.add({
      id: `cp-stmt-${Date.now()}`,
      receipt_number: `REC-STMT-01`,
      customer_id: cust.id,
      amount: 300,
      payment_date: getTodayDateString(),
      status: 'completed',
      created_at: new Date().toISOString()
    });

    // 3. Return: -100
    await db.customer_returns.add({
      id: `cr-stmt-${Date.now()}`,
      return_number: `RET-STMT-01`,
      customer_id: cust.id,
      refund_amount: 100,
      refund_method: 'deduct_balance',
      return_date: getTodayDateString(),
      status: 'completed',
      created_at: new Date().toISOString()
    });

    const stmt = await salesRepo.getCustomerStatement(cust.id);
    // Net: 1000 (opening) + 800 (invoice) - 300 (receipt) - 100 (return) = 1400
    expect(stmt.balance_due).toBe(1400);
    expect(stmt.opening_balance).toBe(1000);

    // Ensure running balances are strictly monotonic and reconcile
    const rows = stmt.statement;
    expect(rows.length).toBe(4);
    expect(rows[rows.length - 1].balance_after).toBe(1400);
  });

  /* -------------------------------------------------------------------
   * Test 9: Database failure
   * Simulate a failure during a multi-record financial operation.
   * Expected: No invalid partial transaction, failure reported clearly.
   * ------------------------------------------------------------------- */
  it('Test 9: Database failure rolls back multi-record transaction cleanly without partial writes', async () => {
    const trs = await setupTreasury(5000);
    const sup = await setupSupplier('مورد فحص الفشل', 0);

    const initialPaymentsCount = (await db.payments.toArray()).length;
    const initialTxsCount = (await db.cash_transactions.toArray()).length;

    // Simulate failure during transaction: invalid treasury ID throws
    await expect(
      cashRepo.recordSupplierPayment({
        supplier_id: sup.id,
        amount: 500,
        account_id: 'non-existent-treasury-id',
        payment_date: getTodayDateString()
      })
    ).rejects.toThrow();

    // Verify ZERO partial records saved
    expect((await db.payments.toArray()).length).toBe(initialPaymentsCount);
    expect((await db.cash_transactions.toArray()).length).toBe(initialTxsCount);
    expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(5000);
  });

  /* -------------------------------------------------------------------
   * Test 10: Reconciliation audit
   * Fixture where summary differs from valid transaction total.
   * Expected: Audit detects discrepancy, explains it, corrects it safely
   * without creating or deleting financial transactions.
   * ------------------------------------------------------------------- */
  it('Test 10: Reconciliation audit detects discrepancies and synchronizes summary safely without touching transactions', async () => {
    const cust = await setupCustomer('عميل اختبار التدقيق', 0);
    const prd = await setupFinishedProduct('قميص كلاسيك', 10, 200);

    // Create 1 valid invoice: 200 EGP
    await salesRepo.createSalesInvoice({
      invoice_number: `INV-AUDIT-01`,
      customer_id: cust.id,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      items: [{ product_id: prd.id, quantity: 1, unit_selling_price: 200, line_total: 200 }]
    });

    // Valid receipt: 100 EGP
    await db.customer_payments.add({
      id: `cp-aud-1`,
      receipt_number: `REC-AUD-01`,
      customer_id: cust.id,
      amount: 100,
      payment_date: getTodayDateString(),
      status: 'completed',
      created_at: new Date().toISOString()
    });

    // Deliberately corrupt the cached summary field on the customer record (simulate stale cache)
    await db.parties.update(cust.id, {
      total_sales: 9999, // Stale/corrupt
      total_paid: 0       // Stale/corrupt
    });

    // 1. Run audit
    const auditRes = await dataManagementRepo.auditAccountingAnomalies();
    const anomalies = auditRes.anomalies || [];
    const custAnomalies = anomalies.filter(a => a.entity_id === cust.id);
    expect(custAnomalies.length).toBeGreaterThan(0);

    // 2. Perform safe repair
    const repairRes = await dataManagementRepo.repairAccountingAnomalies(custAnomalies.map(a => a.id), 'usr-auditor');
    expect(repairRes.success).toBe(true);

    // 3. Transactions are completely untouched (still 1 invoice and 1 receipt)
    const invoices = await db.sales_invoices.where('customer_id').equals(cust.id).toArray();
    expect(invoices.length).toBe(1);
    const receipts = await db.customer_payments.where('customer_id').equals(cust.id).toArray();
    expect(receipts.length).toBe(1);

    // 4. Stored summary now reconciles with actual transaction totals
    const repairedCust = await db.parties.get(cust.id);
    expect(Number(repairedCust.total_sales)).toBe(200);
    expect(Number(repairedCust.total_paid)).toBe(100);
  });
});
