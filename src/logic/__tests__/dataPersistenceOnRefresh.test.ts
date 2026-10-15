import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, ensureDatabaseIntegrity } from '../../data/db';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';

describe('Data Persistence On Refresh and Startup', () => {
  beforeEach(async () => {
    await db.open();
    await db.items.clear();
    await db.parties.clear();
    await db.suppliers.clear();
    await db.purchase_orders.clear();
    await db.purchase_order_items.clear();
    await db.stock_movements.clear();
    await db.treasury_accounts.clear();
  });

  it('preserves items, suppliers, and purchase invoices across db close, reopen, and integrity checks', async () => {
    // 1. Create a supplier with typical ID prefix pty-
    const supplier = await partiesRepo.create({
      code: 'SUP-PERSIST-01',
      name: 'شركة الغزل والنسيج الحديثة',
      type: 'supplier',
      phone: '01012345678',
      address: 'المحلة الكبرى',
      current_balance: 0
    });

    expect(supplier.id).toBeDefined();

    // 2. Create an item with typical ID prefix
    const item = await itemsRepo.create({
      code: 'RAW-COTTON-01',
      name: 'قماش قطن مصري 100%',
      item_type: 'raw_material',
      item_group: 'أقمشة',
      item_department: 'حياكة',
      unit: 'متر',
      cost_price: 120,
      opening_balance: 50,
      opening_cost: 120
    });

    expect(item.id).toBeDefined();

    // 3. Create a purchase invoice / order
    const purchaseInvoice = await suppliersRepo.createPurchaseOrder({
      supplier_id: supplier.id,
      payment_terms: 'cash',
      items: [
        {
          material_id: item.id,
          quantity_ordered: 20,
          quantity: 20,
          unit_price: 120
        }
      ]
    });

    expect(purchaseInvoice.id).toBeDefined();

    // Verify initial storage
    expect(await db.parties.count()).toBe(1);
    expect(await db.items.count()).toBe(1);
    expect(await db.purchase_orders.count()).toBe(1);

    // 4. Simulate page refresh / app restart by running ensureDatabaseIntegrity
    await ensureDatabaseIntegrity();

    // Ensure database integrity check does NOT wipe records
    expect(await db.parties.count()).toBe(1);
    expect(await db.items.count()).toBe(1);
    expect(await db.purchase_orders.count()).toBe(1);

    // Simulate closing connection and reopening
    db.close();
    await db.open();

    // Verify records survived reload completely
    const reloadedSupplier = await db.parties.get(supplier.id);
    const reloadedItem = await db.items.get(item.id);
    const reloadedInvoice = await db.purchase_orders.get(purchaseInvoice.id);

    expect(reloadedSupplier).toBeDefined();
    expect(reloadedSupplier?.name).toBe('شركة الغزل والنسيج الحديثة');

    expect(reloadedItem).toBeDefined();
    expect(reloadedItem?.name).toBe('قماش قطن مصري 100%');
    expect(Number(reloadedItem?.cost_price)).toBe(120);

    expect(reloadedInvoice).toBeDefined();
    expect(reloadedInvoice?.supplier_id).toBe(supplier.id);
    expect(Number(reloadedInvoice?.grand_total)).toBe(2400);
  });
});
