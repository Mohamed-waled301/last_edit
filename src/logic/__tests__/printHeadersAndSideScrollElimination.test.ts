import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Print Preview 100% Arabic Headers, Zero Side-Scroll, and Zero Text Overlap', () => {
  const printPreviewPath = path.resolve(__dirname, '../../modules/print/PrintPreviewPage.jsx');
  const invoiceTemplatesPath = path.resolve(__dirname, '../../modules/print/invoicePrintTemplates.js');
  const packageJsonPath = path.resolve(__dirname, '../../../package.json');

  it('verifies package.json version is bumped to 1.1.7', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(pkg.version).toBe('1.1.7');
  });

  describe('Bug 1: 100% Arabic Localization of Print/PDF Table Headers (ZERO English)', () => {
    it('contains exact Arabic translations for required database column keys', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      // Check required mappings
      expect(code).toContain("supplier_type: 'نوع المورد / النشاط'");
      expect(code).toContain("phone: 'رقم الهاتف'");
      expect(code).toContain("address: 'العنوان'");
      expect(code).toContain("tax_number: 'الرقم الضريبي'");
      expect(code).toContain("total_purchases: 'إجمالي المشتريات / التعاملات'");
      expect(code).toContain("total_paid: 'إجمالي المسدد'");
      expect(code).toContain("code: 'الكود'");
      expect(code).toContain("name: 'البيان / الاسم'");
      expect(code).toContain("balance_due: 'الرصيد المتبقي'");
      expect(code).toContain("total_sales: 'إجمالي المبيعات'");
      expect(code).toContain("credit_limit: 'الحد الائتماني'");
      expect(code).toContain("subtotal: 'المجموع قبل الخصم'");
      expect(code).toContain("discount_value: 'قيمة الخصم'");
      expect(code).toContain("grn_number: 'رقم إذن الاستلام'");
      expect(code).toContain("receipt_date: 'تاريخ الاستلام'");
      expect(code).toContain("receiver_name: 'المستلم'");
    });

    it('contains getArabicColumnTitle fail-safe resolver preventing English keys fallback', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain('const getArabicColumnTitle = (key) =>');
      expect(code).not.toContain('{columnLabels[k] || k}');
      expect(code).toContain('{getArabicColumnTitle(k)}');
    });

    it('filters out raw technical database IDs from printed report columns', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain('const ignoredKeys = new Set([');
      expect(code).toContain("'party_id'");
      expect(code).toContain("'supplier_id'");
      expect(code).toContain("'customer_id'");
      expect(code).toContain("'outlet_id'");
      expect(code).toContain("'item_id'");
    });

    it('defines REPORT_SCHEMAS to prevent column duplication and calculation field dumps', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain('const REPORT_SCHEMAS = {');
      expect(code).toContain("'supplier-statements':");
      expect(code).toContain("'purchase-orders':");
      expect(code).toContain("'goods-receipts':");
    });
  });

  describe('Bug 2: Elimination of Horizontal Side-Scroll & Zero Text Overlap', () => {
    it('verifies no overflow-x-auto exists inside any printable document preview container', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      // None of the printable sheet tables should be wrapped in overflow-x-auto
      expect(code).not.toContain('<div className="overflow-x-auto">');
      expect(code).toContain('<div className="w-full max-w-full overflow-hidden">');
    });

    it('enforces table-fixed and max-width 100% on report and document tables', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain('table-fixed');
      expect(code).toContain('border-collapse table-fixed');
      expect(code).toContain("style={{ maxWidth: '100%', overflowX: 'hidden' }}");
    });

    it('verifies dynamic column sizing and single-line auto-fit font containment for dense tables', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain('const isUltraDense = colCount >= 9;');
      expect(code).toContain('const isDense = colCount >= 6 && !isUltraDense;');
      expect(code).toContain('cell-autofit font-semibold');
      expect(code).toContain('getAutoFitStyle');
    });

    it('enforces table-layout fixed across invoicePrintTemplates.js tables', () => {
      const code = fs.readFileSync(invoiceTemplatesPath, 'utf8');

      expect(code).toContain('table-layout: fixed');
    });

    it('supports correct A4 Landscape (297mm) and Portrait (210mm) max-widths', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain("orientation === 'landscape' ? '297mm !important' : '210mm !important'");
      expect(code).toContain("orientation === 'landscape' ? 'w-[1123px] max-w-[1123px]' : 'w-[794px] max-w-[794px]'");
    });

    it('contains colgroup and cell overflow containment to eliminate text overlap', () => {
      const code = fs.readFileSync(printPreviewPath, 'utf8');

      expect(code).toContain('<colgroup>');
      expect(code).toContain('.printable-sheet th,');
      expect(code).toContain('overflow: hidden !important;');
    });
  });
});
