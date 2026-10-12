import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../../data/db';
import { itemsRepo, settingsRepo, suppliersRepo, partiesRepo } from '../../data';
import { api } from '../../services/api';
import { calculateProfitMargin } from '../costCalculator';

describe('New-Record Forms, Clean Defaults, Margin, & Zero Sample Data (Requirements A, B, C)', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
  });

  describe('Requirement A: New Item Form (group, section, unit)', () => {
    it('1. Item units table supports multiple values and adding new units dynamically in the database', async () => {
      const initialUnits = await itemsRepo.getUnits();
      expect(Array.isArray(initialUnits)).toBe(true);
      expect(initialUnits.length).toBeGreaterThan(0);
      expect(initialUnits.some(u => u.name === 'قطعة')).toBe(true);

      // Add a custom unit
      const createdUnit = await itemsRepo.createUnit({ name: 'كرتونة كبيرة' }, 'usr-test');
      expect(createdUnit).toBeDefined();
      expect(createdUnit.name).toBe('كرتونة كبيرة');

      // Verify it exists in database and in getUnits()
      const inDb = await db.item_units.where('name').equals('كرتونة كبيرة').first();
      expect(inDb).toBeDefined();
      expect(inDb.name).toBe('كرتونة كبيرة');

      const updatedUnits = await itemsRepo.getUnits();
      expect(updatedUnits.some(u => u.name === 'كرتونة كبيرة')).toBe(true);
    });

    it('2. Group and section in ItemFormPage start strictly empty and unit defaults to قطعة', () => {
      const itemFormCode = fs.readFileSync(
        path.resolve(process.cwd(), 'src/modules/items/ItemFormPage.jsx'),
        'utf8'
      );

      // Must have empty group and department in initial state
      expect(itemFormCode).toMatch(/item_group:\s*''/);
      expect(itemFormCode).toMatch(/item_department:\s*''/);
      expect(itemFormCode).toMatch(/unit:\s*'قطعة'/);

      // Must have inline add "+" panels for group, section, and unit
      expect(itemFormCode).toContain('quickAddGroupOpen');
      expect(itemFormCode).toContain('quickAddSectionOpen');
      expect(itemFormCode).toContain('quickAddUnitOpen');

      // Must enforce blocking save with "أكمل البيانات المطلوبة" and show inline Arabic error
      expect(itemFormCode).toContain('أكمل البيانات المطلوبة');
      expect(itemFormCode).toContain('مجموعة الصنف مطلوبة');
      expect(itemFormCode).toContain('قسم الصنف مطلوب');
    });
  });

  describe('Requirement B: Profit Margin Defaults & Calculation', () => {
    it('3. Default profit margin setting exists in Settings with default 0', async () => {
      const settings = await settingsRepo.getSettings();
      expect(settings).toBeDefined();
      expect(settings.default_profit_margin_percent).toBe(0);

      // Updating setting persists to database
      await settingsRepo.updateSettings({ default_profit_margin_percent: 25 }, 'usr-test');
      const updated = await settingsRepo.getSettings();
      expect(updated.default_profit_margin_percent).toBe(25);
    });

    it('4. Margin formula handles division by zero when cost is 0 without NaN or Infinity', () => {
      // Test the mathematical calculation logic directly
      const { marginValue, marginPercent } = calculateProfitMargin(0, 0);

      expect(marginValue).toBe(0);
      expect(marginPercent).toBe(0);
      expect(Number.isFinite(marginPercent)).toBe(true);
      expect(isNaN(marginPercent)).toBe(false);

      // Also when selling > 0 but cost is 0
      const freeCostMargin = calculateProfitMargin(0, 100);
      expect(freeCostMargin.marginPercent).toBe(0);
      expect(Number.isFinite(freeCostMargin.marginPercent)).toBe(true);
      expect(isNaN(freeCostMargin.marginPercent)).toBe(false);
    });
  });

  describe('Requirement C: Zero Sample Data Across Live Screens', () => {
    it('5. Outsourced order form requires external factory name directly and starts with empty values', () => {
      const outsourcedCode = fs.readFileSync(
        path.resolve(process.cwd(), 'src/modules/outsourced/OutsourcedOrderFormPage.jsx'),
        'utf8'
      );

      // Initial state has empty factory name and empty numbers
      expect(outsourcedCode).toMatch(/external_factory_name:\s*''/);
      expect(outsourcedCode).toMatch(/finishing_quantity:\s*''/);
      expect(outsourcedCode).toMatch(/service_fee:\s*''/);
      expect(outsourcedCode).toMatch(/transport_cost:\s*''/);

      // Direct validation requiring external_factory_name
      expect(outsourcedCode).toContain('اسم مصنع التشغيل الخارجي مطلوب');
    });

    it('6. Scans all live screens in src/modules and verifies ZERO pre-filled sample text or sample company names', () => {
      const sampleNamesToForbid = [
        'شركة النيل للغزل',
        'مصنع النيل للغزل والنسيج',
        'مصنع النصر للغزل والنسيج',
        'محلات النجمة للملابس',
        'مصنع الفاخر للتطريز',
        'الأهرام لتصنيع وتجارة إكسسوارات',
      ];

      const forbiddenHelperPattern = /<p[^>]*>مثال:[^<]*<\/p>/;

      const scanDirectory = (dir: string) => {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDirectory(fullPath);
          } else if (entry.endsWith('.jsx') || entry.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');

            // 1. Check for sample company names in live UI modules
            for (const sample of sampleNamesToForbid) {
              if (content.includes(sample)) {
                throw new Error(
                  `Forbidden sample company name "${sample}" found in live UI file: ${fullPath}`
                );
              }
            }

            // 2. Check for "مثال: ..." helper paragraphs
            if (forbiddenHelperPattern.test(content)) {
              throw new Error(
                `Forbidden helper text "<p>مثال: ...</p>" found in live UI file: ${fullPath}`
              );
            }
          }
        }
      };

      // Scan all module files
      scanDirectory(path.resolve(process.cwd(), 'src/modules'));
    });

    it('7. Verifies forms on an empty database initialize with empty text fields (zero pre-filled sample names)', () => {
      const formsToCheck = [
        'src/modules/items/ItemFormPage.jsx',
        'src/modules/items/ItemGroupFormPage.jsx',
        'src/modules/items/ItemSectionFormPage.jsx',
        'src/modules/outsourced/OutsourcedOrderFormPage.jsx',
        'src/modules/parties/PartyFormPage.jsx',
        'src/modules/purchases/PurchaseOrderFormPage.jsx',
        'src/modules/returns/SalesReturnFormPage.jsx',
        'src/modules/sales/SalesInvoiceFormPage.jsx',
        'src/modules/treasuries/DailyClosingFormPage.jsx',
        'src/modules/treasuries/OutletTransferFormPage.jsx',
        'src/modules/inventory/StockAdjustmentFormPage.jsx',
        'src/modules/inventory/StockTransferFormPage.jsx',
        'src/modules/disbursements/CashDisbursementFormPage.jsx'
      ];

      for (const formPath of formsToCheck) {
        const content = fs.readFileSync(path.resolve(process.cwd(), formPath), 'utf8');

        // Verify name fields are not pre-filled with sample strings
        expect(content).not.toMatch(/name:\s*'[^']*[a-zA-Z\u0600-\u06FF]+[^']*'/);
        // Verify external factory name is not prefilled
        expect(content).not.toMatch(/external_factory_name:\s*'[^']*[a-zA-Z\u0600-\u06FF]+[^']*'/);
      }
    });
  });

  describe('Requirement D: Purchase Order Form Totals Order & Subtraction', () => {
    it('8. PurchaseOrderFormPage displays bottom fields in specified order and subtracts expenses', () => {
      const poFormCode = fs.readFileSync(
        path.resolve(process.cwd(), 'src/modules/purchases/PurchaseOrderFormPage.jsx'),
        'utf8'
      );

      // Verify bottom fields order
      const subtotalIdx = poFormCode.indexOf('إجمالي البنود قبل الخصم');
      const discountPctIdx = poFormCode.indexOf('نسبة الخصم (%)');
      const discountValIdx = poFormCode.indexOf('قيمة الخصم (ج.م)');
      const expensesIdx = poFormCode.indexOf('مصاريف إضافية (ج.م)');
      const netIdx = poFormCode.indexOf('الصافي النهائي:');

      expect(subtotalIdx).toBeGreaterThan(-1);
      expect(discountPctIdx).toBeGreaterThan(subtotalIdx);
      expect(discountValIdx).toBeGreaterThan(discountPctIdx);
      expect(expensesIdx).toBeGreaterThan(discountValIdx);
      expect(netIdx).toBeGreaterThan(expensesIdx);

      // Verify subtraction calculation integration
      expect(poFormCode).toContain('calculatePurchaseOrderTotals');
      expect(poFormCode).toContain('الصافي النهائي لا يمكن أن يكون أقل من صفر');
    });
  });
});
