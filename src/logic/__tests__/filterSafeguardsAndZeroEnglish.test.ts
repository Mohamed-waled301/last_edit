import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  computeMovementsWithRunningBalance,
  calculateStatementSummaryCards
} from '../statementSummaryCards';
import { generateCutOrderHtml } from '../../modules/print/invoicePrintTemplates';

describe('Filter Safeguards and Zero English Letters in UI & Printing Commands', () => {
  describe('1. Defend against "Cannot read properties of undefined (reading \'filter\')"', () => {
    it('safely handles computeMovementsWithRunningBalance when rawMovements is null or undefined', () => {
      // @ts-expect-error testing invalid runtime arguments
      const resNull = computeMovementsWithRunningBalance(null, 500);
      expect(resNull.items).toEqual([]);
      expect(resNull.closing_balance).toBe(500);

      // @ts-expect-error testing undefined runtime arguments
      const resUndef = computeMovementsWithRunningBalance(undefined, 0);
      expect(resUndef.items).toEqual([]);
      expect(resUndef.closing_balance).toBe(0);
    });

    it('safely handles calculateStatementSummaryCards with missing or undefined rows', () => {
      const res = calculateStatementSummaryCards({
        party: { name: 'ورشة السلام', is_supplier: 1 },
        openingBalance: 1000,
        openingType: 'credit',
        filteredRows: undefined,
        allMovements: undefined
      });

      expect(res.openingBalance).toBe(1000);
      expect(res.finalBalance).toBe(1000);
      expect(res.periodInvoices).toBe(0);
      expect(res.periodPaid).toBe(0);
    });

    it('verifies VendorStatementPage.jsx guards all filter calls against undefined', () => {
      const filePath = path.resolve(__dirname, '../../modules/parties/VendorStatementPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Check computedMovements.items guard
      expect(content).toContain('const items = Array.isArray(computedMovements?.items) ? computedMovements.items : [];');
      expect(content).toContain('return items.filter(');

      // Check statementMovements guard
      expect(content).toContain('const safeStmtMovements = Array.isArray(statementMovements) ? statementMovements : [];');
    });

    it('verifies PrintPreviewPage.jsx guards all data array filter calls', () => {
      const filePath = path.resolve(__dirname, '../../modules/print/PrintPreviewPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('(Array.isArray(salesInvoices) ? salesInvoices : []).filter');
      expect(content).toContain('(Array.isArray(custPayments) ? custPayments : []).filter');
      expect(content).toContain('(Array.isArray(parties) ? parties : []).filter');
      expect(content).toContain('(Array.isArray(supInvoices) ? supInvoices : []).filter');
      expect(content).toContain('(Array.isArray(payments) ? payments : []).filter');
      expect(content).toContain('(Array.isArray(items) ? items : []).filter');
    });

    it('verifies ReportsModule.jsx guards reportData.filter', () => {
      const filePath = path.resolve(__dirname, '../../modules/ReportsModule.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('const safeList = Array.isArray(reportData) ? reportData : [];');
      expect(content).toContain('return safeList.filter(');
    });
  });

  describe('2. Verify zero English letters in printing commands and system UI', () => {
    it('verifies PrintPreviewPage.jsx printing commands and options are 100% Arabic without English words', () => {
      const filePath = path.resolve(__dirname, '../../modules/print/PrintPreviewPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Paper sizes options must not have English words
      expect(content).not.toContain('(ورق قياسي كامل 210 × 297 مم) A4');
      expect(content).not.toContain('A4 (ورق قياسي');
      expect(content).not.toContain('A5 (نصف صفحة');
      expect(content).not.toContain('80 مم Thermal');
      expect(content).not.toContain('Thermal</option>');

      // Orientation buttons must not have English words
      expect(content).not.toContain('رأسي (Portrait)');
      expect(content).not.toContain('أفقي (Landscape)');

      // Action buttons must not have PDF/Excel
      expect(content).not.toContain('حفظ كملف PDF');
      expect(content).not.toContain('جاري تصدير PDF...');
      expect(content).toContain('حفظ كملف إلكتروني');
      expect(content).toContain('جاري تصدير الملف...');

      // System branding stamp
      expect(content).not.toContain('نظام code systems ERP');
      expect(content).toContain('نظام كود سيستمز المتكامل');
    });

    it('verifies Cut Order generated HTML contains zero English in headers, stamps, and section titles', () => {
      const mockOrder = {
        id: 99,
        cutting_number: 'CUT-TEST-2026',
        product_name: 'عباية كاجوال فاخرة',
        product_code: 'ABY-2026',
        fabric_type: 'حرير كريب ممتاز',
        color: 'أسود ملكي',
        supplier_name: 'مورد الأقمشة الراقية',
        total_quantity: 400,
        status: 'in_progress',
        created_at: '2026-10-20',
        matrix: [
          { color: 'أسود ملكي', quantities: { M: 100, L: 150, XL: 150 } }
        ]
      };

      const html = generateCutOrderHtml(mockOrder, { factory_name: 'مصنع الأقمشة' }, 'a4');

      expect(html).not.toContain('(Cut Order)');
      expect(html).not.toContain('(Matrix Breakdown)');
      expect(html).not.toContain('(M إلى 8XL)');
      expect(html).not.toContain('code systems ERP');
      expect(html).toContain('أمر تشغيل وتفصيل وقص ملابس');
      expect(html).toContain('جدول توزيع المقاسات والكميات التفصيلي للقصة');
      expect(html).toContain('10 مقاسات قياسية تفصيلية');
      expect(html).toContain('كود سيستمز المتكامل');
    });

    it('verifies VendorStatementPage.jsx uses Arabic for Excel export', () => {
      const filePath = path.resolve(__dirname, '../../modules/parties/VendorStatementPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).not.toContain('<span>تصدير Excel</span>');
      expect(content).toContain('<span>تصدير إكسيل</span>');
    });
  });
});
