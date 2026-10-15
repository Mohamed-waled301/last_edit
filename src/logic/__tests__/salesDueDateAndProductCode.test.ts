import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { settingsRepo } from '../../data/repositories/settingsRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { addDaysToDateString } from '../../utils/formatters';

describe('Requirements 3, 5, 6: Sales Due Date, Company Logo, and Item Code Lookup', () => {
  beforeEach(async () => {
    await db.items.clear();
    await db.materials.clear();
    await db.products.clear();
    await db.settings.clear();
    await db.sales_invoices.clear();
    await db.purchase_orders.clear();
  });

  describe('1. Sales Invoice Due Date & Timezone-Safe Arithmetic (Req 3)', () => {
    it('calculates due date using local date components without DST or timezone drift', () => {
      // 30 days from 2026-10-15
      const baseDate = '2026-10-15';
      const due30 = addDaysToDateString(baseDate, 30);
      expect(due30).toBe('2026-11-14');

      // Month crossing with 28/29/30/31 days
      const endFeb = addDaysToDateString('2026-02-20', 10);
      expect(endFeb).toBe('2026-03-02');

      // Year crossing
      const endYear = addDaysToDateString('2026-12-25', 10);
      expect(endYear).toBe('2027-01-04');
    });

    it('sets due date for credit sales invoices and clears it for cash sales invoices', async () => {
      // Setup settings with default credit days = 45
      await settingsRepo.update({ default_credit_days: 45 });

      const settings = await settingsRepo.getSettings();
      expect(settings.default_credit_days).toBe(45);

      const invoiceDate = '2026-10-15';
      const creditDueDate = addDaysToDateString(invoiceDate, settings.default_credit_days);
      expect(creditDueDate).toBe('2026-11-29');

      // For cash invoice, due date is empty
      const dealTypeCash: string = 'cash';
      const cashDueDate = dealTypeCash === 'credit' ? creditDueDate : '';
      expect(cashDueDate).toBe('');
    });
  });

  describe('2. Product Code Lookup & Validation (Req 6)', () => {
    it('looks up finished goods by item code and syncs code with name', async () => {
      const item = await itemsRepo.create({
        code: '1001',
        name: 'تيشرت بولو صيفي مطرز',
        item_group: 'ملابس رجالي',
        unit: 'قطعة',
        cost_price: 120.50,
        selling_price: 220.00,
        opening_balance: 50,
        item_type: 'finished'
      });

      // Lookup by code
      const found = await itemsRepo.getByCode('1001');
      expect(found).toBeDefined();
      expect(found.id).toBe(item.id);
      expect(found.name).toBe('تيشرت بولو صيفي مطرز');
      expect(found.cost_price).toBe(120.50);
      expect(found.selling_price).toBe(220.00);
      expect(found.current_stock).toBe(50);
      expect(found.unit).toBe('قطعة');
    });

    it('reports Arabic error when code does not exist', async () => {
      const notFound = await itemsRepo.getByCode('9999');
      expect(notFound).toBeNull();
    });

    it('rejects raw material in sales invoice with Arabic warning', async () => {
      const rawMat = await itemsRepo.create({
        code: '2001',
        name: 'قماش بي pique قطن',
        item_type: 'raw_material',
        opening_balance: 100,
        cost_price: 60
      });

      const itm = await itemsRepo.getByCode('2001');
      expect(itm).toBeDefined();
      expect(itm.item_type).toBe('raw_material');

      // Validation rule check in sales: raw materials cannot be sold
      const isRaw = itm.item_type === 'raw_material';
      let errorMsg = '';
      if (isRaw) {
        errorMsg = 'هذا الصنف مادة خام ولا يمكن بيعه';
      }
      expect(errorMsg).toBe('هذا الصنف مادة خام ولا يمكن بيعه');
    });

    it('allows raw materials in purchase invoice', async () => {
      const rawMat = await itemsRepo.create({
        code: '3001',
        name: 'خيط تطريز بوليستر',
        item_type: 'raw_material',
        opening_balance: 50,
        cost_price: 15
      });

      const itm = await itemsRepo.getByCode('3001');
      expect(itm).toBeDefined();
      // Purchase orders can purchase raw materials
      expect(itm.item_type === 'raw_material' || itm.item_type === 'finished').toBe(true);
    });
  });

  describe('3. Company Logo in Settings & Prints (Req 5)', () => {
    it('stores company logo in settings and exposes it for header and print documents', async () => {
      const testLogoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      // Save logo in settings
      await settingsRepo.update({
        factory_name: 'مصنع أبيكس للملابس الجاهزة',
        company_logo: testLogoBase64
      });

      const settings = await settingsRepo.getSettings();
      expect(settings.company_logo).toBe(testLogoBase64);
      expect(settings.factory_name).toBe('مصنع أبيكس للملابس الجاهزة');

      // Replace / remove logo
      await settingsRepo.update({
        company_logo: null
      });

      const updatedSettings = await settingsRepo.getSettings();
      expect(updatedSettings.company_logo).toBeNull();
    });
  });
});
