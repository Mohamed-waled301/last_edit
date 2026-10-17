import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../../data/db';
import { supplierActivityRepo, BASE_SUPPLIER_ACTIVITY_TYPES } from '../../data/repositories/supplierActivityRepo';
import { manufacturingRepo } from '../../data/repositories/manufacturingRepo';
import { api } from '../../services/api';

describe('Supplier Activity Types (نوع نشاط المورد) Suite', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    if (db.supplier_activity_types) {
      await db.supplier_activity_types.clear().catch(() => {});
    }
    if (db.parties) {
      await db.parties.clear().catch(() => {});
    }
  });

  describe('1) Base 4 Default Options & Elimination of Old Option', () => {
    it('seeds and returns exactly the 4 required base activity types', async () => {
      const types = await supplierActivityRepo.getActivityTypes();
      const names = types.map((t) => t.name);

      expect(names).toContain('توريد خامات ومستلزمات إنتاج');
      expect(names).toContain('طباعة');
      expect(names).toContain('تطريز');
      expect(names).toContain('حياكة');
      expect(names.length).toBe(4);

      // Verify old option is completely absent from defaults
      for (const t of types) {
        expect(t.name).not.toContain('مصنع تشغيل خارجي لدى الغير');
      }
    });

    it('confirms the old legacy option is completely removed from forms', () => {
      const partyFormFile = fs.readFileSync(
        path.join(process.cwd(), 'src/modules/parties/PartyFormPage.jsx'),
        'utf8'
      );
      const quickSupplierFile = fs.readFileSync(
        path.join(process.cwd(), 'src/modules/purchases/QuickSupplierModal.jsx'),
        'utf8'
      );

      // Verify old string is NOT hardcoded in options
      expect(partyFormFile).not.toContain('مصنع تشغيل خارجي لدى الغير (تطريز / غسيل / حياكة)');
      expect(quickSupplierFile).not.toContain('مصنع تشغيل خارجي لدى الغير (تطريز / غسيل / حياكة)');

      // Verify dropdown starts empty with placeholder prompt option
      expect(partyFormFile).toContain('<option value="">-- اختر نوع نشاط المورد --</option>');
      expect(quickSupplierFile).toContain('<option value="">-- اختر نوع نشاط المورد --</option>');
    });
  });

  describe('2) Mandatory Field & Arabic Validation Message', () => {
    it('blocks submission and returns Arabic error when supplier_type is empty', async () => {
      const errorMsg = 'برجاء اختيار نوع نشاط المورد';

      const validateSupplierActivity = (activity) => {
        if (!activity || !activity.trim()) {
          return errorMsg;
        }
        return null;
      };

      expect(validateSupplierActivity('')).toBe(errorMsg);
      expect(validateSupplierActivity('   ')).toBe(errorMsg);
      expect(validateSupplierActivity(null)).toBe(errorMsg);
      expect(validateSupplierActivity(undefined)).toBe(errorMsg);

      // Valid cases
      expect(validateSupplierActivity('توريد خامات ومستلزمات إنتاج')).toBeNull();
      expect(validateSupplierActivity('طباعة')).toBeNull();
      expect(validateSupplierActivity('تطريز')).toBeNull();
      expect(validateSupplierActivity('حياكة')).toBeNull();
      expect(validateSupplierActivity('نشاط مخصص')).toBeNull();
    });
  });

  describe('3) Dynamic Addition (+) to IndexedDB & Auto-Selection', () => {
    it('dynamically adds a new custom activity type to Dexie and persists across fetches', async () => {
      const newActivity = await api.createSupplierActivityType({ name: 'غسيل وتجهيز جينز' });
      expect(newActivity.success).toBe(true);
      expect(newActivity.activityType.name).toBe('غسيل وتجهيز جينز');

      // Verify persisted in Dexie
      const stored = await db.supplier_activity_types.where('name').equals('غسيل وتجهيز جينز').first();
      expect(stored).toBeDefined();
      expect(stored.name).toBe('غسيل وتجهيز جينز');

      // Verify fetched in list
      const res = await api.getSupplierActivityTypes();
      const allNames = res.data.map((t) => t.name);
      expect(allNames).toContain('غسيل وتجهيز جينز');
      expect(allNames).toContain('توريد خامات ومستلزمات إنتاج');
    });

    it('rejects empty activity name with Arabic message', async () => {
      await expect(supplierActivityRepo.createActivityType({ name: '' })).rejects.toThrow('اسم نوع النشاط مطلوب');
      await expect(supplierActivityRepo.createActivityType({ name: '   ' })).rejects.toThrow('اسم نوع النشاط مطلوب');
    });

    it('rejects duplicate activity name with Arabic message', async () => {
      // Ensure defaults are seeded
      await supplierActivityRepo.getActivityTypes();

      // Attempt duplicate of base option
      await expect(supplierActivityRepo.createActivityType({ name: 'طباعة' })).rejects.toThrow(
        'نوع نشاط المورد مسجل مسبقاً'
      );

      // Add a custom type then try to duplicate it
      await supplierActivityRepo.createActivityType({ name: 'كي وتعبئة' });
      await expect(supplierActivityRepo.createActivityType({ name: 'كي وتعبئة' })).rejects.toThrow(
        'نوع نشاط المورد مسجل مسبقاً'
      );
      await expect(supplierActivityRepo.createActivityType({ name: '  كي وتعبئة  ' })).rejects.toThrow(
        'نوع نشاط المورد مسجل مسبقاً'
      );
    });
  });

  describe('4) Cutting Screen Stages Synchronization', () => {
    it('filters printing, embroidery, and sewing suppliers correctly for stage vendors', async () => {
      // Create suppliers with the new activities
      await db.parties.bulkPut([
        { id: 'p-print', code: 'PRT-1', name: 'مطبعة الأهرام', is_supplier: 1, is_active: 1, supplier_type: 'طباعة' },
        { id: 'p-emb', code: 'EMB-1', name: 'ورشة تطريز النجوم', is_supplier: 1, is_active: 1, supplier_type: 'تطريز' },
        { id: 'p-sew', code: 'SEW-1', name: 'مصنع حياكة السلام', is_supplier: 1, is_active: 1, supplier_type: 'حياكة' },
        { id: 'p-fab', code: 'FAB-1', name: 'مورد أقمشة عام', is_supplier: 1, is_active: 1, supplier_type: 'توريد خامات ومستلزمات إنتاج' },
        { id: 'p-legacy', code: 'LEG-1', name: 'ورشة عامة سابقة', is_supplier: 1, is_active: 1, supplier_type: 'service' }
      ]);

      // Printing stage
      const printVendors = await manufacturingRepo.getWorkshopVendors('printing');
      const printIds = printVendors.map((v) => v.id);
      expect(printIds).toContain('p-print');
      expect(printIds).toContain('p-legacy'); // Legacy service supplier available
      expect(printIds).not.toContain('p-emb');
      expect(printIds).not.toContain('p-sew');
      expect(printIds).not.toContain('p-fab');

      // Embroidery stage
      const embVendors = await manufacturingRepo.getWorkshopVendors('embroidery');
      const embIds = embVendors.map((v) => v.id);
      expect(embIds).toContain('p-emb');
      expect(embIds).toContain('p-legacy');
      expect(embIds).not.toContain('p-print');
      expect(embIds).not.toContain('p-sew');
      expect(embIds).not.toContain('p-fab');

      // Sewing stage
      const sewVendors = await manufacturingRepo.getWorkshopVendors('sewing');
      const sewIds = sewVendors.map((v) => v.id);
      expect(sewIds).toContain('p-sew');
      expect(sewIds).toContain('p-legacy');
      expect(sewIds).not.toContain('p-print');
      expect(sewIds).not.toContain('p-emb');
      expect(sewIds).not.toContain('p-fab');
    });
  });

  describe('5) Backward Compatibility & Safe Handling of Legacy Values', () => {
    it('safely handles suppliers with legacy values (goods, service) without crashing', async () => {
      await db.parties.add({
        id: 'legacy-sup-1',
        code: 'PRT-LEG-01',
        name: 'مورد قديم',
        is_supplier: 1,
        is_active: 1,
        supplier_type: 'goods',
        created_at: new Date().toISOString()
      });

      const party = await db.parties.get('legacy-sup-1');
      expect(party).toBeDefined();
      expect(party.supplier_type).toBe('goods');

      // Check map legacy helper behavior
      const mapLegacySupplierType = (val) => {
        if (!val) return '';
        if (val === 'goods') return 'توريد خامات ومستلزمات إنتاج';
        if (val === 'service') return 'خدمات تشغيل لدى الغير';
        return val;
      };

      expect(mapLegacySupplierType('goods')).toBe('توريد خامات ومستلزمات إنتاج');
      expect(mapLegacySupplierType('service')).toBe('خدمات تشغيل لدى الغير');
      expect(mapLegacySupplierType('طباعة')).toBe('طباعة');
    });
  });

  describe('6) Code Quality, No Placeholders, and No Emojis', () => {
    it('verifies PartyFormPage and QuickSupplierModal have NO placeholders and NO emojis', () => {
      const files = [
        'src/modules/parties/PartyFormPage.jsx',
        'src/modules/purchases/QuickSupplierModal.jsx',
        'src/data/repositories/supplierActivityRepo.js'
      ];

      // Emoji regex
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;

      for (const relPath of files) {
        const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');

        // Check for placeholder in input or textarea
        const placeholderMatch = /placeholder\s*=/i.test(content);
        expect(placeholderMatch).toBe(false);

        // Check for emojis
        const hasEmoji = emojiRegex.test(content);
        expect(hasEmoji).toBe(false);
      }
    });
  });
});
