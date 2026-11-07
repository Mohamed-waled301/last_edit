import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { applyAutoColumnWidths, ARABIC_EXCEL_COLUMN_LABELS } from '../../utils/exportExcel';
import { computeSupplierDebts, computeCustomerReceivables } from '../dashboardMetrics';

describe('Report Table Alignment, Large Numbers & Export Synchronization Suite (حل جذري لترحيلة الجدول وعدم محاذاة الأعمدة)', () => {
  const reportsModulePath = path.resolve(__dirname, '../../modules/ReportsModule.jsx');
  const printPreviewPath = path.resolve(__dirname, '../../modules/print/PrintPreviewPage.jsx');
  const exportExcelPath = path.resolve(__dirname, '../../utils/exportExcel.js');

  describe('1. Screen Reports Table Alignment (ReportsModule.jsx)', () => {
    it('enforces table-layout: fixed, width: 100%, and border-collapse on report view tables', () => {
      const code = fs.readFileSync(reportsModulePath, 'utf8');
      expect(code).toContain('table-fixed');
      expect(code).toContain("tableLayout: 'fixed !important'");
      expect(code).toContain("width: '100% !important'");
      expect(code).toContain("borderCollapse: 'collapse !important'");
    });

    it('defines exact percentage-based colgroup (5%, 10%, 30%, 18%, 18%, 19% = 100%) for balances reports', () => {
      const code = fs.readFileSync(reportsModulePath, 'utf8');
      expect(code).toContain("key === 'customer-statements'");
      expect(code).toContain("key === 'supplier-statements'");
      expect(code).toContain("<col style={{ width: '5%' }} />");
      expect(code).toContain("<col style={{ width: '10%' }} />");
      expect(code).toContain("<col style={{ width: '30%' }} />");
      expect(code).toContain("<col style={{ width: '18%' }} />");
      expect(code).toContain("<col style={{ width: '19%' }} />");
    });

    it('aligns 6 column headers 1:1 for customer and supplier balances reports', () => {
      const code = fs.readFileSync(reportsModulePath, 'utf8');
      // Customer statements headers
      expect(code).toContain('إجمالي المبيعات');
      expect(code).toContain('إجمالي المسدد');
      expect(code).toContain('الرصيد المتبقي');

      // Supplier statements headers
      expect(code).toContain('إجمالي المشتريات');
    });

    it('enforces footer summary row (tfoot) with colSpan={3} and financial sums aligned underneath parent columns', () => {
      const code = fs.readFileSync(reportsModulePath, 'utf8');
      expect(code).toContain('renderTableFooter');
      expect(code).toContain('<tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">');
      expect(code).toContain('colSpan={3}');
      expect(code).toContain('الإجمالي الكلي للمطابقات:');
    });

    it('wraps financial numbers and currency suffix in inline-flex whitespace-nowrap wrappers dir="ltr"', () => {
      const code = fs.readFileSync(reportsModulePath, 'utf8');
      expect(code).toContain('inline-flex items-center gap-1 font-mono font-bold');
      expect(code).toContain('dir="ltr"');
      expect(code).toContain('whitespace-nowrap');
    });

    it('exports clean 6-column reports to Excel with exact column headers and summary totals', () => {
      const code = fs.readFileSync(reportsModulePath, 'utf8');
      expect(code).toContain("headers = ['#', 'الكود', 'البيان / الاسم', 'إجمالي المبيعات', 'إجمالي المسدد', 'الرصيد المتبقي']");
      expect(code).toContain("headers = ['#', 'الكود', 'البيان / الاسم', 'إجمالي المشتريات', 'إجمالي المسدد', 'الرصيد المتبقي']");
      expect(code).toContain("rows.push(['الإجمالي الكلي للمطابقات', '', '', sumSales, sumPaid, sumBal])");
    });
  });

  describe('2. Print & PDF Preview Table Alignment (PrintPreviewPage.jsx)', () => {
    it('enforces table-layout: fixed, width: 100%, and border-collapse inside printable sheet and @media print', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');
      expect(code).toContain("tableLayout: 'fixed !important'");
      expect(code).toContain("width: '100% !important'");
      expect(code).toContain("borderCollapse: 'collapse !important'");
      expect(code).toContain('table-layout: fixed !important');
      expect(code).toContain('overflow: hidden !important');
      expect(code).toContain('box-sizing: border-box !important');
    });

    it('defines exact percentage-based colgroup matching 5%, 10%, 30%, 18%, 18%, 19% = 100%', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');
      expect(code).toContain("isBalancesReport");
      expect(code).toContain("return '10%'");
      expect(code).toContain("return '30%'");
      expect(code).toContain("return '18%'");
      expect(code).toContain("return '19%'");
      expect(code).toContain("<col style={{ width: '5%' }} />");
    });

    it('ensures summary footer (tfoot) uses colSpan={3} for description and places totals directly under sales, paid, and balance', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');
      expect(code).toContain('colSpan={3}');
      expect(code).toContain('الإجمالي الكلي للمطابقات:');
      expect(code).toContain('sumSales');
      expect(code).toContain('sumPaid');
      expect(code).toContain('sumBalance');
    });

    it('wraps all financial numbers in fixed inline-flex wrappers dir="ltr" to prevent 6+ digit shift and clipping', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');
      expect(code).toContain('inline-flex items-center gap-1 font-mono font-bold whitespace-nowrap text-left');
      expect(code).toContain('dir="ltr"');
    });

    it('guarantees text columns truncate cleanly and have title tooltips on hover', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');
      expect(code).toContain('truncate');
      expect(code).toContain('title={textStr}');
      expect(code).toContain('title={codeStr}');
    });
  });

  describe('3. Excel Column Auto-Sizing & Synchronization (exportExcel.js)', () => {
    it('assigns exact column widths for 6-column reports (#: 8, Code: 15, Name: 35, Financial cols: 22 each)', () => {
      const aoa = [
        ['#', 'الكود', 'البيان / الاسم', 'إجمالي المبيعات', 'إجمالي المسدد', 'الرصيد المتبقي'],
        [1, 'CUST-001', 'شركة الأمل للتجارة والتوكيلات العامة', 267670.00, 150000.00, 117670.00],
        [2, 'CUST-002', 'مؤسسة النور لتجارة الملابس الجاهزة', 886230.50, 400000.00, 486230.50],
        ['الإجمالي الكلي للمطابقات', '', '', 1153900.50, 550000.00, 603900.50]
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      applyAutoColumnWidths(ws);

      expect(ws['!cols']).toBeDefined();
      expect(ws['!cols']?.length).toBe(6);
      expect(ws['!cols']?.[0].wch).toBe(8);   // #
      expect(ws['!cols']?.[1].wch).toBe(15);  // الكود
      expect(ws['!cols']?.[2].wch).toBe(35);  // البيان / الاسم
      expect(ws['!cols']?.[3].wch).toBe(22);  // إجمالي المبيعات (>= 18)
      expect(ws['!cols']?.[4].wch).toBe(22);  // إجمالي المسدد (>= 18)
      expect(ws['!cols']?.[5].wch).toBe(22);  // الرصيد المتبقي (>= 18)
    });

    it('guarantees general worksheets enforce col.width >= 18 for data and accommodate 6+ digits', () => {
      const aoa = [
        ['رقم الإذن', 'المورد', 'إجمالي القيمة'],
        ['GRN-99881', 'مصنع النسيج الحديث', 750000.00]
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      applyAutoColumnWidths(ws);

      expect(ws['!cols']).toBeDefined();
      ws['!cols']?.forEach((col) => {
        expect(col.wch).toBeGreaterThanOrEqual(18);
      });
    });

    it('translates database keys to 100% Arabic labels and removes technical IDs', () => {
      expect(ARABIC_EXCEL_COLUMN_LABELS.code).toBe('الكود');
      expect(ARABIC_EXCEL_COLUMN_LABELS.name).toBe('البيان / الاسم');
      expect(ARABIC_EXCEL_COLUMN_LABELS.total_sales).toBe('إجمالي المبيعات');
      expect(ARABIC_EXCEL_COLUMN_LABELS.total_purchases).toBe('إجمالي المشتريات / التكلفة');
      expect(ARABIC_EXCEL_COLUMN_LABELS.total_paid).toBe('إجمالي المسدد');
      expect(ARABIC_EXCEL_COLUMN_LABELS.balance_due).toBe('الرصيد المتبقي');
    });
  });

  describe('4. Total Purchases / Dealings Accounting Integrity (ضبط إجمالي التعاملات والمشتريات)', () => {
    it('accurately balances Total Dealings = Credit Opening + Invoices + Cut Order Stage Costs', () => {
      // Test party 1: Opening balance 2000 credit (له), 800 paid, 0 invoices
      const parties = [
        { id: 'pty-1001', code: 'PRT-1001', name: 'code', is_supplier: 1, opening_balance: 2000, opening_balance_type: 'credit', is_active: 1 },
        { id: 'pty-1002', code: 'PRT-981', name: 'عمر', is_supplier: 1, opening_balance: 620, opening_balance_type: 'credit', is_active: 1 },
        { id: 'pty-1003', code: 'WRK-9107', name: 'احمد', is_supplier: 1, opening_balance: 0, opening_balance_type: 'credit', is_active: 1 },
        { id: 'pty-1004', code: 'PRT-1005', name: 'اسلام', is_supplier: 1, opening_balance: 50, opening_balance_type: 'credit', is_active: 1 }
      ];

      const invoices = [
        { id: 'inv-1', supplier_id: 'pty-1002', payment_terms: 'credit', total_amount: 80, status: 'unpaid' },
        { id: 'inv-2', supplier_id: 'pty-1003', payment_terms: 'credit', total_amount: 185, status: 'unpaid' },
      ];

      const cutOrders = [
        {
          id: 'co-1',
          order_number: 'CUT-01',
          status: 'in_progress',
          stages: {
            printing: { vendor_id: 'pty-1004', total_cost: 50 }
          }
        }
      ];

      const payments = [
        { id: 'pay-1', supplier_id: 'pty-1001', amount: 800, status: 'issued' },
        { id: 'pay-2', supplier_id: 'pty-1002', amount: 650, status: 'issued' },
        { id: 'pay-3', supplier_id: 'pty-1003', amount: 200, status: 'issued' },
        { id: 'pay-4', supplier_id: 'pty-1004', amount: 50, status: 'issued' }
      ];

      const res = computeSupplierDebts(parties, [], invoices, [], payments, [], cutOrders, []);
      const p1 = res.suppliersBreakdown.find(p => p.id === 'pty-1001')!;
      const p2 = res.suppliersBreakdown.find(p => p.id === 'pty-1002')!;
      const p3 = res.suppliersBreakdown.find(p => p.id === 'pty-1003')!;
      const p4 = res.suppliersBreakdown.find(p => p.id === 'pty-1004')!;

      // Party 1: Dealings 2000, Paid 800, Remaining 1200 (Equation: 2000 - 800 = 1200)
      expect(p1.total_purchases).toBe(2000);
      expect(p1.total_paid).toBe(800);
      expect(p1.balance_due).toBe(1200);

      // Party 2: Dealings 700 (620 opening + 80 invoice), Paid 650, Remaining 50 (Equation: 700 - 650 = 50)
      expect(p2.total_purchases).toBe(700);
      expect(p2.total_paid).toBe(650);
      expect(p2.balance_due).toBe(50);

      // Party 3: Dealings 185, Paid 200 (Advance), Remaining 0
      expect(p3.total_purchases).toBe(185);
      expect(p3.total_paid).toBe(200);
      expect(p3.balance_due).toBe(0);

      // Party 4: Dealings 100 (50 opening + 50 stage), Paid 50, Remaining 50 (Equation: 100 - 50 = 50)
      expect(p4.total_purchases).toBe(100);
      expect(p4.total_paid).toBe(50);
      expect(p4.balance_due).toBe(50);
    });

    it('PrintPreviewPage uses computeSupplierDebts and does not clip Arabic column headers', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');
      expect(code).toContain("computeSupplierDebts(parties, rawSuppliers, safeSupInvoices, purchaseOrders, safePayments, returns, cutOrders, settlements)");
      expect(code).toContain("computeCustomerReceivables(parties, rawCustomers, safeInvoices, safeCustPayments, returns, settlements)");
      expect(code).toContain("leading-snug break-words");
    });
  });
});

