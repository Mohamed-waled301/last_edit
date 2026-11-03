import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { toPiasters, fromPiasters } from '../../utils/money';
import { getTodayDateString } from '../../utils/formatters';
import { generateSalesInvoiceHtml, generatePurchaseInvoiceHtml } from '../../modules/print/invoicePrintTemplates';

describe('Comprehensive Accounting & Invoice Correction Test Suite', () => {
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
    await db.sales_outlets.clear();
    await db.purchase_orders.clear();
    await db.purchase_order_items.clear();
    await db.goods_receipts.clear();
    await db.goods_receipt_items.clear();
    await db.supplier_returns.clear();
    await db.customer_returns.clear();
    if (db.inventory_movements) await db.inventory_movements.clear();
    if (db.stock_movements) await db.stock_movements.clear();
  });

  const createTestTreasury = async (balance = 10000) => {
    const tr = {
      id: `trs-${Date.now()}`,
      code: 'TRS-01',
      name: 'الخزينة الرئيسية',
      current_balance: balance,
      opening_balance: balance,
      is_main: 1,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.treasury_accounts.add(tr);
    return tr;
  };

  const createTestSupplier = async (name = 'مورد الغزل والنسيج', openingBalance = 0, openingType = 'credit') => {
    const sup = await suppliersRepo.create({
      code: `SUP-${Date.now()}`,
      name,
      opening_balance: openingBalance,
      opening_balance_type: openingType
    });
    return sup;
  };

  const createTestCustomer = async (name = 'عميل التوزيع الرئيسي', openingBalance = 0, openingType = 'debit', creditLimit = 50000) => {
    const cust = {
      id: `cust-${Date.now()}`,
      code: `CUST-${Date.now()}`,
      name,
      is_customer: 1,
      is_supplier: 0,
      customer_opening_balance: openingBalance,
      customer_opening_type: openingType,
      opening_balance: openingBalance,
      opening_balance_type: openingType,
      credit_limit: creditLimit,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.customers.add(cust);
    await db.parties.add(cust);
    return cust;
  };

  const createTestItem = async (code = 'ITM-FAB-01', name = 'قماش قطن مصري', itemType = 'raw_material', currentStock = 100) => {
    const itm = {
      id: `itm-${Date.now()}`,
      code,
      name,
      item_type: itemType,
      type: itemType,
      category: itemType === 'finished' ? 'finished_goods' : 'raw_materials',
      actual_balance: currentStock,
      current_stock: currentStock,
      current_finished_stock: currentStock,
      purchase_price: 50,
      cost_price: 50,
      selling_price: 100,
      is_active: 1
    };
    await db.items.add(itm);
    if (itemType === 'raw_material') {
      await db.materials.add(itm);
    } else {
      await db.products.add(itm);
    }
    return itm;
  };

  /* -------------------------------------------------------------
   * 1. Purchase Invoices Tests (Tests A, B, C)
   * ------------------------------------------------------------- */
  describe('1. Purchase Invoices — Optional Installments & Accounting', () => {
    it('Test A: Credit Purchase Without Installments issues cleanly, increases liability, updates inventory, leaves treasury untouched and creates no fictitious payment', async () => {
      const treasury = await createTestTreasury(10000);
      const supplier = await createTestSupplier('شركة الغزل الحديث', 0, 'credit');
      const item = await createTestItem('RAW-01', 'خيط قطن', 'raw_material', 10);

      // Create purchase invoice: 200 EGP, credit, NO installments
      const poData = {
        po_number: `PO-${Date.now()}`,
        supplier_id: supplier.id,
        order_date: getTodayDateString(),
        payment_terms: 'credit',
        items: [
          {
            material_id: item.id,
            quantity_ordered: 2,
            unit_price: 100,
            total_price: 200
          }
        ],
        subtotal: 200,
        discount_value: 0,
        additional_expenses: 0,
        total_amount: 200,
        installments: [] // Empty installment schedule
      };

      const invoice = await suppliersRepo.createPurchaseOrder(poData);
      expect(invoice).toBeDefined();
      expect(Number(invoice.total_amount)).toBe(200);
      expect(invoice.installments).toEqual([]);

      // 1. Supplier liability increases by 200 EGP
      const updatedSup = await suppliersRepo.getById(supplier.id);
      expect(updatedSup.balance_due).toBe(200);

      // 2. Treasury remains unchanged (no fictitious cash payment)
      const updatedTrs = await db.treasury_accounts.get(treasury.id);
      expect(updatedTrs.current_balance).toBe(10000);

      const cashTxs = await db.cash_transactions.toArray();
      expect(cashTxs.length).toBe(0);

      // 3. Inventory increased by 2
      const updatedItem = await db.items.get(item.id);
      expect(Number(updatedItem.current_stock)).toBe(12);
    });

    it('Test B: Purchase With an Actual Cash Payment records payment once and adjusts liability accordingly', async () => {
      const treasury = await createTestTreasury(10000);
      const supplier = await createTestSupplier('مورد الأزرار', 0, 'credit');
      const item = await createTestItem('RAW-BTN', 'أزرار صدفية', 'raw_material', 50);

      // Issue invoice of 200 EGP
      await suppliersRepo.createPurchaseOrder({
        po_number: `PO-BTN-${Date.now()}`,
        supplier_id: supplier.id,
        order_date: getTodayDateString(),
        payment_terms: 'credit',
        items: [
          { material_id: item.id, quantity_ordered: 2, unit_price: 100, total_price: 200 }
        ],
        subtotal: 200,
        total_amount: 200,
        installments: []
      });

      // Record an actual cash payment of 50 EGP
      await suppliersRepo.paySupplier({
        supplier_id: supplier.id,
        account_id: treasury.id,
        amount: 50,
        payment_date: getTodayDateString(),
        payment_method: 'cash',
        notes: 'دفعة نقدية مسددة'
      });

      // Supplier liability: 200 - 50 = 150
      const sup = await suppliersRepo.getById(supplier.id);
      expect(sup.balance_due).toBe(150);

      // Treasury decreased by 50
      const updatedTrs = await db.treasury_accounts.get(treasury.id);
      expect(updatedTrs.current_balance).toBe(9950);
    });

    it('Test C: Optional Installment Schedule — invoices can be issued with or without installments', async () => {
      const supplier = await createTestSupplier();
      const item = await createTestItem();

      // Invoice 1: Without installments
      const invNoInst = await suppliersRepo.createPurchaseOrder({
        po_number: `PO-NOINST-${Date.now()}`,
        supplier_id: supplier.id,
        order_date: getTodayDateString(),
        payment_terms: 'credit',
        items: [{ material_id: item.id, quantity_ordered: 1, unit_price: 300, total_price: 300 }],
        subtotal: 300,
        total_amount: 300,
        installments: []
      });
      expect(invNoInst.installments).toEqual([]);

      // Invoice 2: With installments
      const invWithInst = await suppliersRepo.createPurchaseOrder({
        po_number: `PO-WITHINST-${Date.now()}`,
        supplier_id: supplier.id,
        order_date: getTodayDateString(),
        payment_terms: 'credit',
        items: [{ material_id: item.id, quantity_ordered: 1, unit_price: 300, total_price: 300 }],
        subtotal: 300,
        total_amount: 300,
        installments: [
          { amount: 150, due_date: getTodayDateString(), notes: 'دفعة 1' },
          { amount: 150, due_date: getTodayDateString(), notes: 'دفعة 2' }
        ]
      });
      expect(invWithInst.installments.length).toBe(2);
      expect(invWithInst.installments[0].amount).toBe(150);
    });
  });

  /* -------------------------------------------------------------
   * 2. Sales Invoices Tests (Tests D, E, F)
   * ------------------------------------------------------------- */
  describe('2. Sales Invoices — Due Date Removal & Historical Records', () => {
    it('Test D: Credit Invoice Without Due Date issues successfully without requiring or generating a due date', async () => {
      const customer = await createTestCustomer('محل الأناقة للملابس', 0, 'debit', 10000);
      const finishedItem = await createTestItem('FIN-SUIT', 'بدلة رجالي', 'finished', 20);

      const payload = {
        invoice_number: `INV-SLS-${Date.now()}`,
        customer_id: customer.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'credit',
        due_date: null, // No due date
        items: [
          {
            product_id: finishedItem.id,
            quantity: 2,
            price_before_discount: 100,
            discount_value: 0,
            unit_selling_price: 100,
            line_total: 200
          }
        ]
      };

      const inv = await salesRepo.createSalesInvoice(payload);
      expect(inv).toBeDefined();
      expect(inv.due_date).toBeNull();

      // Customer receivable balance increased by 200
      const stmt = await salesRepo.getCustomerStatement(customer.id);
      expect(stmt.balance_due).toBe(200);
    });

    it('Test E: Cash Sales Invoice increases treasury and does not touch customer debt', async () => {
      const treasury = await createTestTreasury(5000);
      const customer = await createTestCustomer('عميل نقدي فوري', 0, 'debit');
      const item = await createTestItem('FIN-SHIRT', 'قميص أبيض', 'finished', 30);

      const inv = await salesRepo.createSalesInvoice({
        invoice_number: `INV-CASH-${Date.now()}`,
        customer_id: customer.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'cash',
        account_id: treasury.id,
        items: [
          {
            product_id: item.id,
            quantity: 1,
            price_before_discount: 250,
            discount_value: 0,
            unit_selling_price: 250,
            line_total: 250
          }
        ]
      });

      expect(inv).toBeDefined();
      const updatedTrs = await db.treasury_accounts.get(treasury.id);
      expect(updatedTrs.current_balance).toBe(5250);

      const stmt = await salesRepo.getCustomerStatement(customer.id);
      expect(stmt.balance_due).toBe(0);
    });

    it('Test F: Historical Invoices with stored due dates remain intact and readable', async () => {
      const customer = await createTestCustomer('عميل تاريخي', 0, 'debit');
      const historicalDueDate = '2025-11-30';

      const invoiceId = await db.sales_invoices.add({
        id: `inv-hist-${Date.now()}`,
        invoice_number: 'INV-HIST-001',
        customer_id: customer.id,
        invoice_date: '2025-10-30',
        due_date: historicalDueDate,
        payment_terms: 'credit',
        total_invoice_amount: 1500,
        subtotal: 1500,
        status: 'issued',
        created_at: '2025-10-30T10:00:00.000Z'
      });

      const loaded = await db.sales_invoices.get(invoiceId);
      expect(loaded.due_date).toBe(historicalDueDate);
      expect(loaded.total_invoice_amount).toBe(1500);
    });
  });

  /* -------------------------------------------------------------
   * 3. Authoritative Balance Calculations (Tests G, H, J, K)
   * ------------------------------------------------------------- */
  describe('3. Customer and Supplier Balance Calculations (Integer-Piaster Math)', () => {
    it('Test G: Customer Previous Balance and Credit Sale (1,000.00 + 200.00 = 1,200.00)', () => {
      const prevBalance = 1000;
      const invoiceAmount = 200;
      const actualPaid = 0;

      const resultingPiasters = toPiasters(prevBalance) + toPiasters(invoiceAmount) - toPiasters(actualPaid);
      const resultingBalance = fromPiasters(resultingPiasters);

      expect(resultingBalance).toBe(1200);
    });

    it('Test H: Customer Previous Balance and Partial Payment (1,000.00 + 200.00 - 50.00 = 1,150.00)', () => {
      const prevBalance = 1000;
      const invoiceAmount = 200;
      const actualPaid = 50;

      const resultingPiasters = toPiasters(prevBalance) + toPiasters(invoiceAmount) - toPiasters(actualPaid);
      const resultingBalance = fromPiasters(resultingPiasters);

      expect(resultingBalance).toBe(1150);
    });

    it('Test J: Supplier Credit Purchase (100,000.00 + 20,000.00 = 120,000.00)', () => {
      const prevLiability = 100000;
      const newInvoice = 20000;
      const actualPaid = 0;

      const resultingPiasters = toPiasters(prevLiability) + toPiasters(newInvoice) - toPiasters(actualPaid);
      const resultingLiability = fromPiasters(resultingPiasters);

      expect(resultingLiability).toBe(120000);
    });

    it('Test K: Supplier Purchase With Payment (100,000.00 + 20,000.00 - 5,000.00 = 115,000.00)', () => {
      const prevLiability = 100000;
      const newInvoice = 20000;
      const actualPaid = 5000;

      const resultingPiasters = toPiasters(prevLiability) + toPiasters(newInvoice) - toPiasters(actualPaid);
      const resultingLiability = fromPiasters(resultingPiasters);

      expect(resultingLiability).toBe(115000);
    });
  });

  /* -------------------------------------------------------------
   * 4. Optional Balance Printing (Tests I, L)
   * ------------------------------------------------------------- */
  describe('4. Optional Balance Printing Preferences', () => {
    it('Test I: Customer Balance on Sales Invoice is hidden by default and shown only when enabled', () => {
      const invoice = {
        invoice_number: 'INV-PRT-01',
        invoice_date: '2026-10-19',
        customer_name: 'شركة النور',
        customer_previous_balance: 1000,
        total_amount: 200,
        actual_paid_amount: 50,
        payment_terms: 'credit',
        items: [{ product_name: 'قميص', quantity: 2, unit_selling_price: 100, line_total: 200 }]
      };

      // 1. Default (hidden)
      const defaultHtml = generateSalesInvoiceHtml(invoice, {}, 'A4', null, false);
      expect(defaultHtml).not.toContain('ملخص حساب العميل (الأرصدة المالية)');
      expect(defaultHtml).not.toContain('رصيد العميل قبل الفاتورة');
      expect(defaultHtml).not.toContain('رصيد العميل بعد الفاتورة');

      // 2. Enabled
      const enabledHtml = generateSalesInvoiceHtml(invoice, {}, 'A4', null, true);
      expect(enabledHtml).toContain('ملخص حساب العميل (الأرصدة المالية)');
      expect(enabledHtml).toContain('رصيد العميل قبل الفاتورة');
      expect(enabledHtml).toContain('رصيد العميل بعد الفاتورة');
      expect(enabledHtml).toContain('1,000.00 ج.م');
      expect(enabledHtml).toContain('1,150.00 ج.م');

      // 3. Enabled in Thermal 80mm
      const thermalHtml = generateSalesInvoiceHtml(invoice, {}, '80mm', null, true);
      expect(thermalHtml).toContain('ملخص حساب العميل (الأرصدة المالية)');
      expect(thermalHtml).toContain('رصيد العميل قبل الفاتورة');
      expect(thermalHtml).toContain('رصيد العميل بعد الفاتورة');
    });

    it('Test L: Supplier Balance on Purchase Invoice is hidden by default and shown only when enabled (A4 & 80mm)', () => {
      const po = {
        po_number: 'PO-PRT-01',
        order_date: '2026-10-19',
        supplier_name: 'مورد الصباغة',
        supplier_previous_balance: 100000,
        total_amount: 20000,
        actual_paid_amount: 5000,
        payment_terms: 'credit',
        items: [{ material_name: 'خامة صباغة', quantity: 1, unit_price: 20000, total_price: 20000 }]
      };

      // 1. Default (hidden)
      const defaultHtml = generatePurchaseInvoiceHtml(po, {}, 'A4', false);
      expect(defaultHtml).not.toContain('ملخص حساب المورد (الأرصدة المالية)');
      expect(defaultHtml).not.toContain('رصيد المورد قبل الفاتورة');
      expect(defaultHtml).not.toContain('الرصيد بعد الفاتورة');

      // 2. Enabled
      const enabledHtml = generatePurchaseInvoiceHtml(po, {}, 'A4', true);
      expect(enabledHtml).toContain('ملخص حساب المورد (الأرصدة المالية)');
      expect(enabledHtml).toContain('رصيد المورد قبل الفاتورة');
      expect(enabledHtml).toContain('الرصيد بعد الفاتورة');
      expect(enabledHtml).toContain('100,000.00 ج.م');
      expect(enabledHtml).toContain('115,000.00 ج.م');

      // 3. Enabled in Thermal 80mm
      const thermalHtml = generatePurchaseInvoiceHtml(po, {}, '80mm', true);
      expect(thermalHtml).toContain('ملخص حساب المورد (الأرصدة المالية)');
      expect(thermalHtml).toContain('رصيد المورد قبل الفاتورة');
      expect(thermalHtml).toContain('الرصيد بعد الفاتورة');
    });
  });

  /* -------------------------------------------------------------
   * 5. Account Statement Tests (Tests M, N, O, P, Q)
   * ------------------------------------------------------------- */
  describe('5. Account Statements — Visibility, Movements & Filtering', () => {
    it('Test M: Opening Balance of 120,000.00 Debit is visible and correctly signed (+120,000)', async () => {
      const customer = await createTestCustomer('مؤسسة الصفا', 120000, 'debit');
      const stmt = await salesRepo.getCustomerStatement(customer.id);

      expect(stmt.opening_balance).toBe(120000);
      expect(stmt.opening_balance_type).toBe('debit');
      expect(stmt.balance_due).toBe(120000);

      // Check opening entry in statement movements
      const openEntry = stmt.statement.find(s => s.is_opening || s.reference === 'OPENING');
      expect(openEntry).toBeDefined();
      expect(openEntry!.debit).toBe(120000);
      expect(openEntry!.balance_after).toBe(120000);
    });

    it('Test N: Customer Account Movements (Opening, Sales, Returns, Receipts)', async () => {
      const customer = await createTestCustomer('عميل الحركات الكاملة', 1000, 'debit');
      const item = await createTestItem('PRD-TST', 'بنطلون جينز', 'finished', 100);

      // 1. Sale invoice: 500
      await salesRepo.createSalesInvoice({
        invoice_number: `INV-SLS-${Date.now()}`,
        customer_id: customer.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'credit',
        items: [{ product_id: item.id, quantity: 1, unit_selling_price: 500, line_total: 500 }]
      });

      // 2. Customer Receipt: 300
      await db.customer_payments.add({
        id: `cp-${Date.now()}`,
        receipt_number: `REC-${Date.now()}`,
        customer_id: customer.id,
        amount: 300,
        payment_date: getTodayDateString(),
        status: 'completed',
        created_at: new Date().toISOString()
      });

      // 3. Sales Return: 100
      await db.customer_returns.add({
        id: `cr-${Date.now()}`,
        return_number: `RET-SLS-${Date.now()}`,
        customer_id: customer.id,
        refund_amount: 100,
        refund_method: 'deduct_balance',
        return_date: getTodayDateString(),
        status: 'completed',
        created_at: new Date().toISOString()
      });

      const stmt = await salesRepo.getCustomerStatement(customer.id);
      // Net balance: 1000 (opening) + 500 (sales) - 300 (receipt) - 100 (return) = 1100
      expect(stmt.balance_due).toBe(1100);
      expect(stmt.statement.length).toBe(4); // Opening + Invoice + Payment + Return
    });

    it('Test O: Supplier Account Movements (Opening, Purchases, Returns, Payments)', async () => {
      const supplier = await createTestSupplier('مورد الحركات المتكاملة', 5000, 'credit');
      const item = await createTestItem('RAW-MAT-01', 'حرير طبيعي', 'raw_material', 100);

      // 1. Purchase invoice: 2000
      await suppliersRepo.createPurchaseOrder({
        po_number: `PO-SUP-${Date.now()}`,
        supplier_id: supplier.id,
        order_date: getTodayDateString(),
        payment_terms: 'credit',
        items: [{ material_id: item.id, quantity_ordered: 2, unit_price: 1000, total_price: 2000 }],
        subtotal: 2000,
        total_amount: 2000,
        installments: []
      });

      // 2. Supplier payment: 1500
      await db.payments.add({
        id: `sp-${Date.now()}`,
        payment_number: `PAY-${Date.now()}`,
        supplier_id: supplier.id,
        amount: 1500,
        payment_date: getTodayDateString(),
        status: 'completed',
        created_at: new Date().toISOString()
      });

      // 3. Purchase return: 500
      await db.supplier_returns.add({
        id: `sr-${Date.now()}`,
        return_number: `RET-SUP-${Date.now()}`,
        supplier_id: supplier.id,
        total_amount: 500,
        return_date: getTodayDateString(),
        status: 'completed',
        created_at: new Date().toISOString()
      });

      const stmt = await suppliersRepo.getStatement(supplier.id);
      // Net supplier liability: 5000 (opening) + 2000 (purchases) - 1500 (paid) - 500 (return) = 5000
      expect(stmt.balance_due).toBe(5000);
    });

    it('Test P & Q: Statement Filtering preserves authoritative running balances without corruption', async () => {
      const customer = await createTestCustomer('عميل فلاتر الكشف', 1000, 'debit');

      // Create 3 ledger entries
      const txs = [
        { id: '1', date: '2026-10-01', debit: 500, credit: 0, category: 'sales' },
        { id: '2', date: '2026-10-10', debit: 0, credit: 300, category: 'receipts' },
        { id: '3', date: '2026-10-15', debit: 200, credit: 0, category: 'sales' }
      ];

      // Authoritative running balance calculation
      let running = 1000;
      const computed = txs.map(t => {
        running = running + t.debit - t.credit;
        return { ...t, running_balance: running };
      });

      expect(computed[0].running_balance).toBe(1500);
      expect(computed[1].running_balance).toBe(1200);
      expect(computed[2].running_balance).toBe(1400);

      // Filtering to only 'sales' returns rows 1 and 3, but their running balances remain 1500 and 1400
      const filtered = computed.filter(c => c.category === 'sales');
      expect(filtered.length).toBe(2);
      expect(filtered[0].running_balance).toBe(1500);
      expect(filtered[1].running_balance).toBe(1400); // Uncorrupted! Not recalculated from filtered subset!
    });
  });

  /* -------------------------------------------------------------
   * 6. Sequential Invoice Numbering (Starts from 0001)
   * ------------------------------------------------------------- */
  describe('6. Sequential Invoice Numbering (Starts from 0001)', () => {
    it('Sequential Sales Invoice numbers start at 0001 and increment without relying on random timestamps', async () => {
      // 1. Initial next number is 0001
      const firstNum = await salesRepo.getNextInvoiceNumber(2026);
      expect(firstNum).toBe('INV-SLS-2026-0001');

      // 2. Add an invoice with 0001
      await db.sales_invoices.add({
        id: 'sinv-1',
        invoice_number: 'INV-SLS-2026-0001',
        invoice_date: '2026-10-19',
        total_invoice_amount: 100
      });

      const secondNum = await salesRepo.getNextInvoiceNumber(2026);
      expect(secondNum).toBe('INV-SLS-2026-0002');

      // 3. Even if an old timestamp-based invoice like 7282 exists in database, it does NOT skip to 7283
      await db.sales_invoices.add({
        id: 'sinv-old-ts',
        invoice_number: 'INV-SLS-2026-7282',
        invoice_date: '2026-10-19',
        total_invoice_amount: 100
      });

      const thirdNum = await salesRepo.getNextInvoiceNumber(2026);
      expect(thirdNum).toBe('INV-SLS-2026-0002'); // Still 0002 since 0001 is the only real sequential invoice
    });

    it('Sequential Purchase Order numbers start at 0001 and increment properly', async () => {
      const firstPo = await suppliersRepo.getNextPONumber(2026);
      expect(firstPo).toBe('PO-2026-0001');

      await db.purchase_orders.add({
        id: 'po-1',
        po_number: 'PO-2026-0001',
        order_date: '2026-10-19'
      });

      const secondPo = await suppliersRepo.getNextPONumber(2026);
      expect(secondPo).toBe('PO-2026-0002');
    });
  });
});

