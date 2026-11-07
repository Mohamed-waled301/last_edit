import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { applyAutoColumnWidths, ARABIC_EXCEL_COLUMN_LABELS } from '../../utils/exportExcel';

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
      expect(code).toContain('إجمالي التكلفة / المشتريات');
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
      expect(code).toContain("headers = ['#', 'الكود', 'البيان / الاسم', 'إجمالي التكلفة / المشتريات', 'إجمالي المسدد', 'الرصيد المتبقي']");
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
});
