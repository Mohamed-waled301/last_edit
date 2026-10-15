import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../data/db';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { normalizePhoneForWhatsApp, isValidPhoneForWhatsApp } from '../../utils/phone';

describe('Supplier-Item Two-Way Linking and WhatsApp Normalization', () => {
  beforeEach(async () => {
    await db.open();
    await db.items.clear();
    await db.parties.clear();
    if (db.item_suppliers) {
      await db.item_suppliers.clear();
    }
  });

  it('correctly synchronizes two-way item-supplier links, preferred supplier, and last purchase price', async () => {
    // 1. Create a supplier
    const supplier = await partiesRepo.create({
      code: 'SUP-LINK-01',
      name: 'مورد أزرار وخيوط العالمية',
      type: 'supplier',
      phone: '01123456789'
    });

    // 2. Create an item
    const item = await itemsRepo.create({
      code: 'RAW-THREAD-01',
      name: 'خيط بوليستر عالي المتانة 40/2',
      item_type: 'raw_material',
      item_group: 'مستلزمات',
      item_department: 'حياكة',
      unit: 'بكرة',
      cost_price: 35
    });

    // 3. Link item to supplier
    await itemsRepo.setItemSuppliers(item.id, [
      {
        supplier_id: supplier.id,
        is_preferred: true,
        last_purchase_price: 32.5
      }
    ]);

    // 4. Verify link from item side
    const itemSuppliers = await itemsRepo.getItemSuppliers(item.id);
    expect(itemSuppliers.length).toBe(1);
    expect(itemSuppliers[0].supplier_id).toBe(supplier.id);
    expect(itemSuppliers[0].is_preferred).toBe(true);
    expect(itemSuppliers[0].last_purchase_price).toBe(32.5);

    // 5. Verify link from supplier side
    const supplierItems = await itemsRepo.getSupplierItems(supplier.id);
    expect(supplierItems.length).toBe(1);
    expect(supplierItems[0].item_id).toBe(item.id);
  });

  it('normalizes Egyptian phone numbers and validates WhatsApp compatibility', () => {
    // Standard Egyptian mobile number starting with 0
    expect(normalizePhoneForWhatsApp('01012345678')).toBe('201012345678');
    expect(isValidPhoneForWhatsApp('01012345678')).toBe(true);

    // Number with country code already (+20)
    expect(normalizePhoneForWhatsApp('+201012345678')).toBe('201012345678');
    expect(isValidPhoneForWhatsApp('+201012345678')).toBe(true);

    // Number with spaces and dashes
    expect(normalizePhoneForWhatsApp('011-2345-6789')).toBe('201123456789');
    expect(normalizePhoneForWhatsApp('012 3456 7890')).toBe('201234567890');

    // Invalid numbers
    expect(isValidPhoneForWhatsApp('12345')).toBe(false);
    expect(isValidPhoneForWhatsApp('')).toBe(false);
    expect(isValidPhoneForWhatsApp(null as unknown as string)).toBe(false);
  });
});
