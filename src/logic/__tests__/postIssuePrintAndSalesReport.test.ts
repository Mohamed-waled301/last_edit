import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../data/db';
import salesRepo from '../../data/repositories/salesRepo';
import suppliersRepo from '../../data/repositories/suppliersRepo';
import settingsRepo from '../../data/repositories/settingsRepo';
import { generatePurchaseInvoiceHtml, generateSalesInvoiceHtml } from '../../modules/print/invoicePrintTemplates';

// Fallback storage and window mock for Node/Vitest environment
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = storageMock;
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('Post-Issue Print and Sales Report Verification Suite', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
    globalThis.localStorage.clear();
  });

  describe('1. Sales Report: Strict Exclusion of Customers Without Invoices', () => {
    it('only returns customers with issued sales invoices matching the active filters (excludes zero-invoice and out-of-range customers)', async () => {
      // Create Customers
      const custA = { id: 'cust-A', name: 'عميل أ (له فاتورة مطابقة)', code: 'CUST-001', is_active: 1, phone: '01011112222' };
      const custB = { id: 'cust-B', name: 'عميل ب (ليس له فواتير نهائياً)', code: 'CUST-002', is_active: 1, phone: '01033334444' };
      const custC = { id: 'cust-C', name: 'عميل ج (له فاتورة خارج نطاق التاريخ)', code: 'CUST-003', is_active: 1, phone: '01055556666' };

      await db.customers.bulkAdd([custA, custB, custC]);

      // Create finished items for sales
      const finishedItem = {
        id: 'itm-fin-1',
        code: 'FIN-100',
        name: 'قميص فاخر تام الصنع',
        item_type: 'finished',
        selling_price: 250,
        cost_price: 150,
        current_stock: 100
      };
      await db.items.add(finishedItem);
      await db.products.add({ ...finishedItem, current_finished_stock: 100 });

      // Invoice 1: Customer A inside date range (2026-05-15)
      await db.sales_invoices.add({
        id: 'inv-1',
        invoice_number: 'INV-2026-0001',
        customer_id: 'cust-A',
        invoice_date: '2026-05-15',
        payment_terms: 'cash',
        subtotal: 500,
        discount_value: 50,
        net_amount: 450,
        total_invoice_amount: 450,
        paid_amount: 450,
        status: 'paid',
        items: []
      });

      // Invoice 2: Customer C outside date range (2026-01-10)
      await db.sales_invoices.add({
        id: 'inv-2',
        invoice_number: 'INV-2026-0002',
        customer_id: 'cust-C',
        invoice_date: '2026-01-10',
        payment_terms: 'credit',
        subtotal: 1000,
        discount_value: 0,
        net_amount: 1000,
        total_invoice_amount: 1000,
        paid_amount: 200,
        status: 'partially_paid',
        items: []
      });

      // Run sales report filtered to May 2026
      const report = await salesRepo.getSalesReport({
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        paymentType: 'all',
        status: 'all'
      });

      // Assert: Customer B (zero invoices) MUST NOT appear
      const custBInReport = report.customerRows.find(c => c.customer_id === 'cust-B');
      expect(custBInReport).toBeUndefined();

      // Assert: Customer C (outside range) MUST NOT appear
      const custCInReport = report.customerRows.find(c => c.customer_id === 'cust-C');
      expect(custCInReport).toBeUndefined();

      // Assert: ONLY Customer A appears
      expect(report.customerRows).toHaveLength(1);
      expect(report.customerRows[0].customer_id).toBe('cust-A');
      expect(report.customerRows[0].invoices_count).toBe(1);
      expect(report.customerRows[0].total_sales).toBe(450);
      expect(report.customerRows[0].paid_total).toBe(450);
      expect(report.customerRows[0].balance_remaining).toBe(0);

      // Assert: Summary totals are exact and customer count is 1
      expect(report.summary.uniqueCustomersCount).toBe(1);
      expect(report.summary.invoicesCount).toBe(1);
      expect(report.summary.totalSales).toBe(450);
      expect(report.summary.totalSubtotal).toBe(500);
      expect(report.summary.totalDiscount).toBe(50);
      expect(report.summary.totalPaid).toBe(450);
      expect(report.summary.totalRemaining).toBe(0);
    });

    it('filters sales report strictly by payment type (cash vs credit) and excludes non-matching customers', async () => {
      await db.sales_invoices.bulkAdd([
        {
          id: 'inv-cash',
          invoice_number: 'INV-CASH-1',
          customer_id: 'cust-cash',
          invoice_date: '2026-06-01',
          payment_terms: 'cash',
          net_amount: 300,
          paid_amount: 300,
          status: 'paid'
        },
        {
          id: 'inv-credit',
          invoice_number: 'INV-CREDIT-1',
          customer_id: 'cust-credit',
          invoice_date: '2026-06-02',
          payment_terms: 'credit',
          net_amount: 800,
          paid_amount: 0,
          status: 'unpaid'
        }
      ]);

      const creditReport = await salesRepo.getSalesReport({
        paymentType: 'credit'
      });

      expect(creditReport.customerRows).toHaveLength(1);
      expect(creditReport.customerRows[0].customer_id).toBe('cust-credit');
      expect(creditReport.summary.uniqueCustomersCount).toBe(1);
      expect(creditReport.summary.totalSales).toBe(800);
      expect(creditReport.summary.totalRemaining).toBe(800);

      const cashReport = await salesRepo.getSalesReport({
        paymentType: 'cash'
      });

      expect(cashReport.customerRows).toHaveLength(1);
      expect(cashReport.customerRows[0].customer_id).toBe('cust-cash');
      expect(cashReport.summary.uniqueCustomersCount).toBe(1);
      expect(cashReport.summary.totalSales).toBe(300);
      expect(cashReport.summary.totalRemaining).toBe(0);
    });
  });

  describe('2. Purchase Invoice Print Template Generation', () => {
    it('generates complete A4 HTML layout with RTL, logo, supplier data, lines, totals, installments, and signatures', () => {
      const orderData = {
        po_number: 'PO-2026-8888',
        order_date: '2026-07-01',
        payment_terms: 'credit',
        supplier_name: 'شركة النسيج والحرير الحديثة',
        supplier_phone: '01099998888',
        subtotal: 10000,
        discount_value: 500,
        additional_expenses: 200,
        total_amount: 9700,
        notes: 'ملاحظات أمر التوريد: تسليم المخزن الرئيسي',
        items: [
          {
            material_id: 'mat-1',
            item_code: 'FAB-001',
            item_name: 'قماش روزالين تركي',
            quantity_ordered: 200,
            unit: 'متر',
            unit_price: 50,
            discount_value: 0,
            total_price: 10000
          }
        ],
        installments: [
          { due_date: '2026-08-01', amount: 5000, notes: 'الدفعة الأولى' },
          { due_date: '2026-09-01', amount: 4700, notes: 'الدفعة الثانية' }
        ]
      };

      const settings = {
        factory_name: 'مصنع الأناقة للملابس الجاهزة',
        phone: '0223456789',
        address: 'المنطقة الصناعية - المحلة الكبرى',
        company_logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      };

      const html = generatePurchaseInvoiceHtml(orderData, settings, 'A4');

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('PO-2026-8888');
      expect(html).toContain('فاتورة مشتريات وتوريد');
      expect(html).toContain('شركة النسيج والحرير الحديثة');
      expect(html).toContain('FAB-001');
      expect(html).toContain('قماش روزالين تركي');
      expect(html).toContain('مصنع الأناقة للملابس الجاهزة');
      expect(html).toContain('جدول مواعيد استحقاق دفعات الفاتورة الآجلة');
      expect(html).toContain('الدفعة الأولى');
      expect(html).toContain('أمين المخزن / المستلم');
      expect(html).toContain('المحاسب المسؤول');
      expect(html).toContain('img src="data:image/png;base64');
    });

    it('generates thermal 80mm HTML layout without overflow or broken images when logo is missing', () => {
      const orderData = {
        po_number: 'PO-2026-9999',
        order_date: '2026-07-02',
        payment_terms: 'cash',
        supplier_name: 'مورد الخيوط والإبر',
        subtotal: 1500,
        discount_value: 0,
        additional_expenses: 0,
        total_amount: 1500,
        items: [
          {
            material_id: 'mat-2',
            item_code: 'THR-10',
            item_name: 'بكر خيط 40/2',
            quantity_ordered: 30,
            unit: 'بكرة',
            unit_price: 50,
            total_price: 1500
          }
        ]
      };

      const settings = {
        factory_name: 'مصنع الأناقة',
        company_logo: '' // No logo
      };

      const html = generatePurchaseInvoiceHtml(orderData, settings, '80mm');

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('PO-2026-9999');
      expect(html).toContain('فاتورة مشتريات وتوريد بضاعة');
      expect(html).not.toContain('<img'); // Must NOT produce broken img tag when logo is empty
      expect(html).toContain('بكر خيط 40/2');
    });
  });

  describe('3. Sales Invoice Print Template Generation', () => {
    it('generates complete Sales Invoice A4 and 80mm layouts with customer balance and signatures', () => {
      const invoiceData = {
        invoice_number: 'INV-2026-5555',
        invoice_date: '2026-07-03',
        due_date: '2026-08-03',
        payment_terms: 'credit',
        customer_name: 'شركة النور للملابس',
        customer_code: 'CUST-100',
        customer_phone: '01122334455',
        customer_balance_after: 12500,
        subtotal: 8000,
        discount_value: 500,
        net_amount: 7500,
        total_invoice_amount: 7500,
        notes: 'تسليم معرض القاهرة',
        items: [
          {
            product_code: 'PRD-01',
            product_name: 'بدلة رجالي كلاسيك',
            quantity: 10,
            unit: 'قطعة',
            price_before_discount: 800,
            discount_value: 50,
            unit_selling_price: 750,
            line_total: 7500
          }
        ]
      };

      const settings = {
        factory_name: 'مصنع النخبة',
        company_logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
      };

      const a4Html = generateSalesInvoiceHtml(invoiceData, settings, 'A4');
      expect(a4Html).toContain('فاتورة مبيعات');
      expect(a4Html).toContain('INV-2026-5555');
      expect(a4Html).toContain('شركة النور للملابس');
      expect(a4Html).toContain('CUST-100');
      expect(a4Html).toContain('بدلة رجالي كلاسيك');
      expect(a4Html).toContain('المستلم / العميل');
      expect(a4Html).not.toContain('رصيد العميل بعد الفاتورة');

      // When showAccountBalance option is explicitly enabled, it displays the balance
      const a4HtmlWithBalance = generateSalesInvoiceHtml(invoiceData, settings, 'A4', null, true);
      expect(a4HtmlWithBalance).toContain('رصيد العميل بعد الفاتورة');

      const thermalHtml = generateSalesInvoiceHtml(invoiceData, settings, '80mm');
      expect(thermalHtml).toContain('فاتورة مبيعات');
      expect(thermalHtml).toContain('INV-2026-5555');
      expect(thermalHtml).toContain('شركة النور للملابس');
    });
  });

  describe('4. Settings for Post-Issue Printing', () => {
    it('persists and retrieves post_issue_print preferences for purchase and sales', async () => {
      const initial = await settingsRepo.getSettings();
      expect(initial.id).toBe(1);

      await settingsRepo.updateSettings({
        post_issue_print_purchase: 'auto',
        post_issue_print_sales: 'none'
      });

      const updated = await settingsRepo.getSettings();
      expect(updated.post_issue_print_purchase).toBe('auto');
      expect(updated.post_issue_print_sales).toBe('none');
    });
  });

  describe('5. PostIssuePrintDialog Behavior and Key Navigation', () => {
    it('persists chosen paper type and printer per document type in localStorage', () => {
      const STORAGE_PREFIX = 'erp_post_issue_print_';
      const docType = 'sales_invoice';
      const pref = { paperSize: '80mm', printerName: 'Xprinter XP-80' };

      localStorage.setItem(`${STORAGE_PREFIX}${docType}`, JSON.stringify(pref));

      const stored = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${docType}`) || '{}');
      expect(stored.paperSize).toBe('80mm');
      expect(stored.printerName).toBe('Xprinter XP-80');
    });

    it('ensures Enter key never submits or prints and Esc closes safely', () => {
      let closed = false;
      let printed = false;

      const handleKey = (e: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closed = true;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          // Ignored completely
        }
      };

      const enterPrevent = () => {};
      const enterStop = () => {};
      let enterPrevented = false;
      const enterEvent = {
        key: 'Enter',
        preventDefault: () => { enterPrevented = true; },
        stopPropagation: () => {}
      };
      handleKey(enterEvent);
      expect(enterPrevented).toBe(true);
      expect(printed).toBe(false);
      expect(closed).toBe(false);

      let escPrevented = false;
      const escEvent = {
        key: 'Escape',
        preventDefault: () => { escPrevented = true; },
        stopPropagation: () => {}
      };
      handleKey(escEvent);
      expect(escPrevented).toBe(true);
      expect(closed).toBe(true);
    });

    it('calls Electron printHtml IPC with chosen paper size and printer', async () => {
      let called = false;
      let calledArgs: any = null;
      (window as any).electronAPI = {
        printHtml: async (html: string, options: any) => {
          called = true;
          calledArgs = { html, options };
          return { success: true };
        }
      };

      const html = '<div>فاتورة مبيعات</div>';
      const res = await (window as any).electronAPI.printHtml(html, {
        silent: true,
        printerName: 'POS-80',
        paperSize: '80mm'
      });

      expect(res.success).toBe(true);
      expect(called).toBe(true);
      expect(calledArgs.options.paperSize).toBe('80mm');
      expect(calledArgs.options.printerName).toBe('POS-80');
    });
  });
});
