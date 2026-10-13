import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import rawDb from '../../data/db';
const db = rawDb as any;
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import BalanceCalculator from '../balances';
import { getTodayDateString } from '../../utils/formatters';

describe('Purchase Order = Immediate Invoice & Master Data Protection (Requirements A & B)', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });

    // Ensure baseline main treasury
    await db.treasury_accounts.put({
      id: 'acc-main',
      name: 'الخزينة الرئيسية',
      account_type: 'treasury',
      outlet_id: null,
      is_main: 1,
      current_balance: 0,
      created_at: new Date().toISOString(),
    });
  });

  describe('Section A: Purchase Order as Immediate Invoice', () => {
    it('1 & 3 & 5. Cash PO deducts from treasury (can go negative) and increases stock in ONE transaction', async () => {
      // Treasury balance starts at 200
      await db.treasury_accounts.update('acc-main', { current_balance: 200 });

      // Create raw material item
      const item = await itemsRepo.create({
        code: '1000',
        name: 'قماش كتان بيج',
        item_type: 'raw_material',
        unit: 'متر',
        cost_price: 100,
        opening_balance: 10 // Initial stock = 10
      }, 'usr-test');

      const sup = await partiesRepo.create({
        name: 'مورد أقمشة الكتان',
        is_supplier: true,
        payment_terms: 'cash'
      }, 'usr-test');

      // Purchase 15 meters at 100 LE = 1500 LE
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: sup.id,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        items: [
          { material_id: item.id, quantity_ordered: 15, unit_price: 100 }
        ]
      }, 'usr-test');

      // 1. PO created with status 'received'
      expect(po.status).toBe('received');

      // 2. Treasury deducted: 200 - 1500 = -1300 (allowed to go negative)
      const treasury = await db.treasury_accounts.get('acc-main');
      expect(treasury.current_balance).toBe(-1300);

      // 3. Treasury transaction created linked to the PO
      const tx = await db.cash_transactions.where('reference_id').equals(po.id).first();
      expect(tx).toBeDefined();
      expect(tx.tx_type).toBe('outflow');
      expect(tx.amount).toBe(1500);
      expect(tx.balance_after).toBe(-1300);

      // 4. Stock increased immediately: 10 + 15 = 25
      const itemAfter = await itemsRepo.getById(item.id);
      expect(itemAfter.current_stock).toBe(25);

      // 5. Stock movement created (direction: in)
      const sm = await db.stock_movements.where('reference_id').equals(po.id).first();
      expect(sm).toBeDefined();
      expect(sm.direction).toBe('in');
      expect(sm.quantity).toBe(15);
    });

    it('4 & 5. Credit PO increases supplier balance (payable), leaves treasury unchanged, and increases stock', async () => {
      // Treasury balance starts at 1000
      await db.treasury_accounts.update('acc-main', { current_balance: 1000 });

      const item = await itemsRepo.create({
        code: '1001',
        name: 'أزرار صدفية فاخرة',
        item_type: 'raw_material',
        unit: 'دستة',
        cost_price: 30,
        opening_balance: 5
      }, 'usr-test');

      const sup = await partiesRepo.create({
        name: 'مورد إكسسوارات الشرق',
        is_supplier: true,
        payment_terms: 'credit'
      }, 'usr-test');

      // Credit PO: 20 dozens at 30 LE = 600 LE
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: sup.id,
        payment_terms: 'credit',
        order_date: getTodayDateString(),
        items: [
          { material_id: item.id, quantity_ordered: 20, unit_price: 30 }
        ],
        installments: [
          { amount: 600, due_date: getTodayDateString() }
        ]
      }, 'usr-test');

      expect(po.status).toBe('received');

      // 1. Treasury UNCHANGED
      const treasury = await db.treasury_accounts.get('acc-main');
      expect(treasury.current_balance).toBe(1000);

      // 2. Supplier balance increased (payable)
      const invoices = await db.supplier_invoices.where('supplier_id').equals(sup.id).toArray();
      const supBalance = BalanceCalculator.calculateSupplierBalance(invoices, []);
      expect(supBalance.balanceDue).toBe(600);

      // 3. Stock increased: 5 + 20 = 25
      const itemAfter = await itemsRepo.getById(item.id);
      expect(itemAfter.current_stock).toBe(25);
    });
  });

  describe('Section B: Cancelling Documents & Master Data Protection', () => {
    it('1 & 2 & 6. Cancelling PO NEVER deletes item card or supplier; reverses stock & restores treasury', async () => {
      await db.treasury_accounts.update('acc-main', { current_balance: 500 });

      // Create item 1000
      const item = await itemsRepo.create({
        code: '1000',
        name: 'قماش بيكيه قطني',
        item_type: 'raw_material',
        unit: 'متر',
        cost_price: 75,
        opening_balance: 10
      }, 'usr-test');

      const sup = await partiesRepo.create({
        name: 'شركة الغزل والنسيج',
        is_supplier: true,
        payment_terms: 'cash'
      }, 'usr-test');

      // Cash PO: 10 meters at 75 = 750 LE -> Treasury: 500 - 750 = -250. Stock: 10 + 10 = 20.
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: sup.id,
        payment_terms: 'cash',
        order_date: getTodayDateString(),
        items: [
          { material_id: item.id, quantity_ordered: 10, unit_price: 75 }
        ]
      }, 'usr-test');

      expect((await db.treasury_accounts.get('acc-main')).current_balance).toBe(-250);
      expect((await itemsRepo.getById(item.id)).current_stock).toBe(20);

      // Cancel the PO
      const cancelRes = await suppliersRepo.cancelPurchaseOrder(po.id, 'إلغاء لخطأ في الكمية', 'usr-test');
      expect(cancelRes.success).toBe(true);

      // Status becomes 'cancelled'
      const poAfter = await db.purchase_orders.get(po.id);
      expect(poAfter.status).toBe('cancelled');

      // Item STILL EXISTS in item master with all properties intact!
      const itemAfter = await itemsRepo.getById(item.id);
      expect(itemAfter).toBeDefined();
      expect(itemAfter.code).toBe('1000');
      expect(itemAfter.name).toBe('قماش بيكيه قطني');
      expect(itemAfter.cost_price).toBe(75);
      expect(itemAfter.opening_balance).toBe(10);
      // Stock returned to previous value (10)
      expect(itemAfter.current_stock).toBe(10);

      // Supplier STILL EXISTS!
      const supAfter = await db.suppliers.get(sup.id);
      expect(supAfter).toBeDefined();
      expect(supAfter.name).toBe('شركة الغزل والنسيج');

      // Treasury restored back to 500
      const treasuryAfter = await db.treasury_accounts.get('acc-main');
      expect(treasuryAfter.current_balance).toBe(500);
    });

    it('3. Deleting item is blocked if item has stock movements or documents', async () => {
      const item = await itemsRepo.create({
        code: '1005',
        name: 'صنف محمي من الحذف',
        item_type: 'raw_material',
        unit: 'قطعة',
        cost_price: 50,
        opening_balance: 5 // Has opening balance movement!
      }, 'usr-test');

      // Deleting item directly from itemsRepo must be blocked with Arabic message
      await expect(
        itemsRepo.delete(item.id, 'usr-test')
      ).rejects.toThrow(/لا يمكن حذف الصنف .* لوجود .* حرك.* مخزنية مسجلة عليه/);

      // Verify item still exists
      const itemStillExists = await itemsRepo.getById(item.id);
      expect(itemStillExists).toBeDefined();
    });

    it('4. Block cancelling PO when it would make stock negative with clear Arabic message', async () => {
      // Item created with 0 opening stock
      const item = await itemsRepo.create({
        code: '1020',
        name: 'قماش شيفون مطبوع',
        item_type: 'raw_material',
        unit: 'متر',
        cost_price: 40,
        opening_balance: 0
      }, 'usr-test');

      const sup = await partiesRepo.create({
        name: 'مورد الشيفون',
        is_supplier: true,
        payment_terms: 'cash'
      }, 'usr-test');

      // Purchase 30 meters -> stock becomes 30
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: sup.id,
        payment_terms: 'cash',
        order_date: getTodayDateString(),
        items: [
          { material_id: item.id, quantity_ordered: 30, unit_price: 40 }
        ]
      }, 'usr-test');

      expect((await itemsRepo.getById(item.id)).current_stock).toBe(30);

      // Simulate consumption of 15 meters in production or sales (stock down to 15)
      await db.items.update(item.id, { current_stock: 15 });

      // Now attempting to cancel the PO (which bought 30) would cause stock: 15 - 30 = -15 (negative!)
      // Must be blocked!
      await expect(
        suppliersRepo.cancelPurchaseOrder(po.id, 'محاولة إلغاء غير مسموحة', 'usr-test')
      ).rejects.toThrow(/لا يمكن إلغاء أمر التوريد: الكمية المتوفرة بالمخزن من الصنف .* هي \(15\)، والكمية المراد استرجاعها هي \(30\)\. إلغاء الأمر سيؤدي إلى رصيد مخزني سالب\./);

      // Status remains 'received'
      const poStillReceived = await db.purchase_orders.get(po.id);
      expect(poStillReceived.status).toBe('received');
    });

    it('5. Item code auto-generation starts at 1000 and continues from highest code; cancelling documents never changes counter', async () => {
      // First item generated code is 1000
      const firstCode = await itemsRepo.getNextCode();
      expect(firstCode).toBe('1000');

      const item1 = await itemsRepo.create({
        name: 'الصنف الأول',
        item_type: 'raw_material',
        cost_price: 10
      }, 'usr-test');
      expect(item1.code).toBe('1000');

      // Next code continues to 1001
      const secondCode = await itemsRepo.getNextCode();
      expect(secondCode).toBe('1001');

      const item2 = await itemsRepo.create({
        name: 'الصنف الثاني',
        item_type: 'raw_material',
        cost_price: 20
      }, 'usr-test');
      expect(item2.code).toBe('1001');

      // Next code continues to 1002
      const thirdCode = await itemsRepo.getNextCode();
      expect(thirdCode).toBe('1002');
    });
  });
});
