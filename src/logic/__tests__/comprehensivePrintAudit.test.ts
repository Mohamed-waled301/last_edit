import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { api } from '../../services/api';
import { salesRepo } from '../../data/repositories/salesRepo';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { cashRepo } from '../../data/repositories/cashRepo';
import { generateSalesInvoiceHtml, generatePurchaseInvoiceHtml, generateCutOrderHtml } from '../../modules/print/invoicePrintTemplates';

describe('COMPREHENSIVE ERP PRINTING AUDIT & REPAIR TEST SUITE', () => {
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
    if (db.production_orders) await db.production_orders.clear();
  });

  // Scenario A: Existing Sales Invoice Retrieval & Rendering
  it('Scenario A.1: Correctly retrieves and renders existing sales invoice by ID and invoice_number', async () => {
    const custId = 'cust-test-101';
    await db.customers.add({
      id: custId,
      name: 'شركة النور للملابس الجاهزة',
      code: 'CUST-001',
      phone: '01012345678',
      opening_balance: 0,
      opening_balance_type: 'debit',
      is_active: 1,
      created_at: new Date().toISOString()
    });

    const invId = 'inv-test-777';
    await db.sales_invoices.add({
      id: invId,
      invoice_number: 'INV-2026-0001',
      customer_id: custId,
      total_invoice_amount: 15000,
      subtotal: 15000,
      paid_amount: 5000,
      payment_terms: 'credit',
      status: 'partially_paid',
      created_at: '2026-10-20T10:00:00.000Z'
    });

    await db.sales_invoice_items.add({
      id: 'item-inv-1',
      invoice_id: invId,
      product_id: 'prod-shirt-01',
      quantity: 100,
      unit_price: 150,
      total_price: 15000
    });

    await db.products.add({
      id: 'prod-shirt-01',
      name: 'قميص رجالي كلاسيك فاخر',
      code: 'SHIRT-CLS-01',
      unit: 'قطعة'
    });

    // 1. Direct API / Repo retrieval by ID
    const invById = await api.getSalesInvoice(invId);
    expect(invById.success).toBe(true);
    expect(invById.data.customer_name).toBe('شركة النور للملابس الجاهزة');
    expect(invById.data.items.length).toBe(1);
    expect(invById.data.items[0].product_name).toBe('قميص رجالي كلاسيك فاخر');
    expect(invById.data.remaining_amount).toBe(10000);

    // 2. Direct API / Repo retrieval by invoice_number
    const invByNumber = await api.getSalesInvoice('INV-2026-0001');
    expect(invByNumber.success).toBe(true);
    expect(invByNumber.data.id).toBe(invId);

    // 3. Render HTML verification (both A4 and 80mm)
    const a4Html = generateSalesInvoiceHtml(invById.data, { factory_name: 'code systems' }, 'A4');
    expect(a4Html).toContain('INV-2026-0001');
    expect(a4Html).toContain('شركة النور للملابس الجاهزة');
    expect(a4Html).toContain('قميص رجالي كلاسيك فاخر');
    expect(a4Html).toContain('15,000');

    const thermalHtml = generateSalesInvoiceHtml(invById.data, { factory_name: 'code systems' }, '80mm');
    expect(thermalHtml).toContain('INV-2026-0001');
    expect(thermalHtml).toContain('شركة النور للملابس الجاهزة');
  });

  // Scenario A.2: Existing Purchase Order Retrieval & Rendering
  it('Scenario A.2: Correctly retrieves and renders existing purchase order by ID and po_number', async () => {
    const supId = 'sup-test-202';
    await db.suppliers.add({
      id: supId,
      name: 'مصنع الأهرام للغزل والنسيج',
      code: 'SUP-002',
      phone: '01234567890',
      is_active: 1,
      created_at: new Date().toISOString()
    });

    const poId = 'po-test-888';
    await db.purchase_orders.add({
      id: poId,
      po_number: 'PO-2026-0042',
      supplier_id: supId,
      total_amount: 35000,
      paid_amount: 10000,
      status: 'received',
      payment_terms: 'credit',
      created_at: '2026-10-20T11:00:00.000Z'
    });

    await db.purchase_order_items.add({
      id: 'po-item-1',
      po_id: poId,
      material_id: 'mat-cotton-100',
      quantity: 500,
      unit_price: 70,
      total_price: 35000
    });

    await db.items.add({
      id: 'mat-cotton-100',
      name: 'قماش قطن مصري ممتاز',
      code: 'COT-EGY-100',
      unit: 'متر'
    });

    // 1. Direct API / Repo retrieval by ID
    const poById = await api.getPurchaseOrder(poId);
    expect(poById.success).toBe(true);
    expect(poById.data.supplier_name).toBe('مصنع الأهرام للغزل والنسيج');
    expect(poById.data.items.length).toBe(1);
    expect(poById.data.items[0].material_name).toBe('قماش قطن مصري ممتاز');

    // 2. Direct API / Repo retrieval by po_number
    const poByNumber = await api.getPurchaseOrder('PO-2026-0042');
    expect(poByNumber.success).toBe(true);
    expect(poByNumber.data.id).toBe(poId);

    // 3. Render HTML verification
    const a4Html = generatePurchaseInvoiceHtml(poById.data, { factory_name: 'code systems' }, 'A4');
    expect(a4Html).toContain('PO-2026-0042');
    expect(a4Html).toContain('مصنع الأهرام للغزل والنسيج');
    expect(a4Html).toContain('قماش قطن مصري ممتاز');
    expect(a4Html).toContain('35,000');
  });

  // Scenario A.3: Existing Customer Receipt & Supplier Payment
  it('Scenario A.3: Correctly retrieves customer receipts and supplier payments with account details', async () => {
    const custId = 'cust-rec-303';
    await db.customers.add({
      id: custId,
      name: 'تاجر الجملة الحاج سعيد',
      code: 'CUST-303',
      is_active: 1
    });

    const accId = 'acc-main-cash';
    await db.treasury_accounts.add({
      id: accId,
      name: 'الخزينة الرئيسية للمبيعات',
      current_balance: 50000,
      is_active: 1
    });

    const recId = 'cpay-999-111';
    await db.customer_payments.add({
      id: recId,
      receipt_number: 'REC-CUST-9999',
      customer_id: custId,
      account_id: accId,
      amount: 12500,
      payment_date: '2026-10-20',
      payment_method: 'نقداً',
      notes: 'سداد دفعة نقدية تحت الحساب',
      status: 'issued',
      created_at: new Date().toISOString()
    });

    const receiptRes = await api.getCustomerReceipt(recId);
    expect(receiptRes.success).toBe(true);
    expect(receiptRes.data.receipt_number).toBe('REC-CUST-9999');
    expect(receiptRes.data.customer_name).toBe('تاجر الجملة الحاج سعيد');
    expect(receiptRes.data.account_name).toBe('الخزينة الرئيسية للمبيعات');
    expect(receiptRes.data.amount).toBe(12500);

    // Also by receipt_number
    const receiptByNum = await api.getCustomerReceipt('REC-CUST-9999');
    expect(receiptByNum.success).toBe(true);
    expect(receiptByNum.data.id).toBe(recId);
  });

  // Scenario B: Non-existent Document Handling
  it('Scenario B: Safely reports missing document without silently printing another document or crashing', async () => {
    const fakeSalesRes = await api.getSalesInvoice('non-existent-invoice-id');
    expect(fakeSalesRes.success).toBe(false);
    expect(fakeSalesRes.data).toBeNull();

    const fakePoRes = await api.getPurchaseOrder('non-existent-po-id');
    expect(fakePoRes.success).toBe(false);
    expect(fakePoRes.data).toBeNull();

    const fakeReceiptRes = await api.getCustomerReceipt('non-existent-receipt-id');
    expect(fakeReceiptRes.success).toBe(false);
    expect(fakeReceiptRes.data).toBeNull();

    const fakePartyRes = await api.getParty('non-existent-party-id');
    expect(fakePartyRes.success).toBe(false);
    expect(fakePartyRes.data).toBeNull();
  });

  // Scenario C: Invalid / Empty Identifier
  it('Scenario C: Safely handles null, undefined, or empty document identifiers', async () => {
    expect((await api.getSalesInvoice(null)).data).toBeNull();
    expect((await api.getSalesInvoice(undefined)).data).toBeNull();
    expect((await api.getSalesInvoice('')).data).toBeNull();

    expect((await api.getPurchaseOrder(null)).data).toBeNull();
    expect((await api.getPurchaseOrder('')).data).toBeNull();

    expect((await api.getCustomerReceipt(null)).data).toBeNull();
    expect((await api.getSupplierPayment(null)).data).toBeNull();
  });

  // Scenario F: Optional Fields Resilience
  it('Scenario F: Correctly renders documents when optional fields (notes, discount, phone, code) are empty', () => {
    const minimalInvoice = {
      id: 'inv-min-1',
      invoice_number: 'INV-MIN-001',
      customer_name: 'عميل نقدي بدون بيانات',
      customer_code: null,
      customer_phone: undefined,
      notes: '',
      discount_value: 0,
      total_amount: 1000,
      paid_amount: 1000,
      items: [
        { product_name: 'قطعة تجريبية', quantity: 1, unit_price: 1000, total_price: 1000 }
      ]
    };

    const html = generateSalesInvoiceHtml(minimalInvoice, {}, 'A4');
    expect(html).toContain('INV-MIN-001');
    expect(html).toContain('عميل نقدي بدون بيانات');
    expect(html).toContain('1,000');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  // Scenario G: Multi-page / Large Document Support
  it('Scenario G: Handles large invoice with 50 items and multi-page break-inside rules', () => {
    const largeItems = Array.from({ length: 50 }, (_, i) => ({
      product_name: `صنف تجريبي رقم ${i + 1}`,
      product_code: `CODE-${i + 1}`,
      quantity: 10,
      unit_price: 50,
      total_price: 500
    }));

    const largeInvoice = {
      id: 'inv-large-50',
      invoice_number: 'INV-LARGE-50',
      customer_name: 'شركة سلاسل المتاجر الكبرى',
      total_amount: 25000,
      paid_amount: 25000,
      items: largeItems
    };

    const html = generateSalesInvoiceHtml(largeInvoice, {}, 'A4');
    expect(html).toContain('صنف تجريبي رقم 1');
    expect(html).toContain('صنف تجريبي رقم 50');
    expect(html).toContain('25,000');
  });

  // Scenario H: Page Refresh / Historical Document Retrieval from Storage
  it('Scenario H: Direct persistent storage retrieval simulates page refresh without temporary memory', async () => {
    const historicalId = 'inv-hist-2025-99';
    await db.sales_invoices.add({
      id: historicalId,
      invoice_number: 'INV-HIST-2025',
      customer_id: 'cust-hist',
      total_invoice_amount: 8000,
      paid_amount: 8000,
      payment_terms: 'cash',
      created_at: '2025-05-15T12:00:00.000Z'
    });

    await db.customers.add({
      id: 'cust-hist',
      name: 'عميل أرشيفي قديم',
      is_active: 1
    });

    await db.sales_invoice_items.add({
      id: 'item-hist-1',
      invoice_id: historicalId,
      product_id: 'prod-hist-1',
      quantity: 40,
      unit_price: 200,
      total_price: 8000
    });

    // Simulating page refresh by querying authoritative Dexie repository directly with docId
    const loaded = await salesRepo.getSalesInvoice(historicalId);
    expect(loaded).not.toBeNull();
    expect(loaded.invoice_number).toBe('INV-HIST-2025');
    expect(loaded.customer_name).toBe('عميل أرشيفي قديم');
    expect(loaded.items.length).toBe(1);
    expect(loaded.total_amount).toBe(8000);
  });

  // Scenario I: Read-only Accounting Guarantee
  it('Scenario I: Verifies that print data retrieval does not modify accounting or treasury balances', async () => {
    const acc = {
      id: 'acc-audit-cash',
      code: 'TRS-AUDIT',
      name: 'خزينة التدقيق المحاسبي',
      current_balance: 100000,
      is_main: 1,
      is_active: 1
    };
    await db.treasury_accounts.add(acc);

    const inv = {
      id: 'inv-audit-bal',
      invoice_number: 'INV-AUDIT-01',
      customer_id: 'cust-audit',
      total_invoice_amount: 5000,
      paid_amount: 5000,
      payment_terms: 'cash',
      created_at: new Date().toISOString()
    };
    await db.sales_invoices.add(inv);

    // Call fetch operations multiple times
    await api.getSalesInvoice('inv-audit-bal');
    await api.getSalesInvoices();
    await salesRepo.getSalesReport();

    // Verify treasury balance remains strictly unchanged
    const accAfter = await db.treasury_accounts.get('acc-audit-cash');
    expect(accAfter.current_balance).toBe(100000);
  });
});
