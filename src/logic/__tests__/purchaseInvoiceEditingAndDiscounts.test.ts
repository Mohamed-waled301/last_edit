import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import rawDb from '../../data/db';
const db = rawDb as any;
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import BalanceCalculator from '../balances';
import { calculatePurchaseOrderTotals } from '../purchaseOrderCalculations';
import { getTodayDateString } from '../../utils/formatters';

describe('Purchase Invoice Editing & Optional Discount Fields Suite (تعديل فواتير المشتريات والخصم)', () => {
  let supplierId = '';
  let item1Id = '';
  let item2Id = '';

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
      current_balance: 5000,
      created_at: new Date().toISOString(),
    });

    // Create supplier
    const sup = await partiesRepo.create({
      name: 'شركة النسيج الحديث',
      is_supplier: true,
      payment_terms: 'credit'
    }, 'usr-test');
    supplierId = sup.id;

    // Create raw material items
    const itm1 = await itemsRepo.create({
      code: '1001',
      name: 'قماش جبردين تركي',
      item_type: 'raw_material',
      unit: 'متر',
      cost_price: 100,
      opening_balance: 20
    }, 'usr-test');
    item1Id = itm1.id;

    const itm2 = await itemsRepo.create({
      code: '1002',
      name: 'خيط حياكة بوليستر',
      item_type: 'raw_material',
      unit: 'بكرة',
      cost_price: 25,
      opening_balance: 50
    }, 'usr-test');
    item2Id = itm2.id;
  });

  describe('1. Optional Discount Fields & Net Formula', () => {
    it('creates a purchase invoice with discount fields completely empty or zero (strictly optional)', async () => {
      const totalsEmpty = calculatePurchaseOrderTotals({
        subtotal: 2000,
        discount_amount: '',
        discount_percent: '',
        additional_expenses: 0
      });

      expect(totalsEmpty.isValid).toBe(true);
      expect(totalsEmpty.discountValue).toBe(0);
      expect(totalsEmpty.discountPercent).toBe(0);
      expect(totalsEmpty.finalNet).toBe(2000);

      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        subtotal: 2000,
        discount_amount: '',
        discount_percent: '',
        additional_expenses: 0,
        items: [
          { material_id: item1Id, quantity_ordered: 20, unit_price: 100 }
        ]
      }, 'usr-test');

      expect(po.id).toBeDefined();
      expect(po.total_amount).toBe(2000);
      expect(po.discount_value).toBe(0);
      expect(po.discount_percent).toBe(0);

      // Verify stock increased by 20 (20 + 20 = 40)
      const itmAfter = await itemsRepo.getById(item1Id);
      expect(itmAfter.current_stock).toBe(40);

      // Verify treasury deducted by 2000 (5000 - 2000 = 3000)
      const treasury = await db.treasury_accounts.get('acc-main');
      expect(treasury.current_balance).toBe(3000);
    });

    it('calculates custom discount percentage, discount amount, and extra expenses in net total', async () => {
      // Subtotal = 3000, discount = 10% (300), expenses = 150 -> Net = (3000 - 300) + 150 = 2850
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'credit',
        order_date: getTodayDateString(),
        subtotal: 3000,
        discount_percent: 10,
        additional_expenses: 150,
        items: [
          { material_id: item1Id, quantity_ordered: 30, unit_price: 100 }
        ],
        installments: [
          { amount: 2850, due_date: getTodayDateString() }
        ]
      }, 'usr-test');

      expect(po.total_amount).toBe(2850);
      expect(po.discount_value).toBe(300);
      expect(po.discount_percent).toBe(10);
      expect(po.additional_expenses).toBe(150);

      // Verify supplier payable is 2850
      const invoices = await db.supplier_invoices.where('supplier_id').equals(supplierId).toArray();
      const bal = BalanceCalculator.calculateSupplierBalance(invoices, []);
      expect(bal.balanceDue).toBe(2850);
    });
  });

  describe('2. Editing Saved Purchase Invoices (Deltas, Stock, Accounts, & Audit Log)', () => {
    it('editing a purchase invoice updates stock and supplier balance correctly according to delta changes', async () => {
      // 1. Initial Credit PO: 10 meters of item1 (10 * 100 = 1000)
      const initialPO = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'credit',
        order_date: getTodayDateString(),
        subtotal: 1000,
        items: [
          { material_id: item1Id, quantity_ordered: 10, unit_price: 100 }
        ]
      }, 'usr-test');

      expect((await itemsRepo.getById(item1Id)).current_stock).toBe(30); // 20 initial + 10
      let invoices = await db.supplier_invoices.where('supplier_id').equals(supplierId).toArray();
      expect(BalanceCalculator.calculateSupplierBalance(invoices, []).balanceDue).toBe(1000);

      // 2. Edit PO: Increase item1 from 10 to 15, add 4 units of item2 (4 * 25 = 100), add 5% discount (80), expenses 30
      // Subtotal = (15 * 100) + (4 * 25) = 1500 + 100 = 1600.
      // Discount = 5% of 1600 = 80. Expenses = 30.
      // Net = (1600 - 80) + 30 = 1550.
      const updatedPO = await suppliersRepo.updatePurchaseOrder(initialPO.id, {
        supplier_id: supplierId,
        payment_terms: 'credit',
        order_date: getTodayDateString(),
        discount_percent: 5,
        additional_expenses: 30,
        items: [
          { material_id: item1Id, quantity_ordered: 15, unit_price: 100 },
          { material_id: item2Id, quantity_ordered: 4, unit_price: 25 }
        ]
      }, 'usr-test');

      expect(updatedPO.total_amount).toBe(1550);
      expect(updatedPO.subtotal).toBe(1600);
      expect(updatedPO.discount_value).toBe(80);
      expect(updatedPO.additional_expenses).toBe(30);

      // Verify stock deltas:
      // item1: started at 20, first PO +10 = 30, edit delta +5 => 35
      expect((await itemsRepo.getById(item1Id)).current_stock).toBe(35);
      // item2: started at 50, edit added 4 => 54
      expect((await itemsRepo.getById(item2Id)).current_stock).toBe(54);

      // Verify supplier balance updated to 1550
      invoices = await db.supplier_invoices.where('supplier_id').equals(supplierId).toArray();
      expect(BalanceCalculator.calculateSupplierBalance(invoices, []).balanceDue).toBe(1550);

      // Verify audit log has UPDATE_PURCHASE_ORDER
      const auditLogs = await db.audit_log.where('action').equals('UPDATE_PURCHASE_ORDER').toArray();
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs[0].entity_id).toBe(initialPO.id);
    });

    it('editing a cash invoice correctly reconciles treasury balance and cash transactions', async () => {
      // Treasury balance starts at 5000
      // 1. Initial Cash PO of 1000 LE -> Treasury becomes 4000
      const initialPO = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        subtotal: 1000,
        items: [
          { material_id: item1Id, quantity_ordered: 10, unit_price: 100 }
        ]
      }, 'usr-test');

      expect((await db.treasury_accounts.get('acc-main')).current_balance).toBe(4000);

      // 2. Edit PO: reduce quantity from 10 to 6 (6 * 100 = 600 LE)
      // Difference = 600 - 1000 = -400 (400 should be refunded to treasury)
      // Treasury should become 4000 + 400 = 4400
      await suppliersRepo.updatePurchaseOrder(initialPO.id, {
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        items: [
          { material_id: item1Id, quantity_ordered: 6, unit_price: 100 }
        ]
      }, 'usr-test');

      expect((await db.treasury_accounts.get('acc-main')).current_balance).toBe(4400);

      // Stock should be reduced by 4 (initial 20 + 6 = 26)
      expect((await itemsRepo.getById(item1Id)).current_stock).toBe(26);

      // Verify cash transaction logged the refund
      const txList = await db.cash_transactions.where('reference_id').equals(initialPO.id).toArray();
      expect(txList.length).toBe(2);
      expect(txList[1].tx_type).toBe('inflow');
      expect(txList[1].amount).toBe(400);
      expect(txList[1].balance_after).toBe(4400);
    });

    it('editing prevents reducing quantity below available stock (negative stock safety guard)', async () => {
      // 1. Create PO with 10 units of item1 (initial stock 20 + 10 = 30)
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'credit',
        order_date: getTodayDateString(),
        items: [
          { material_id: item1Id, quantity_ordered: 10, unit_price: 100 }
        ]
      }, 'usr-test');

      expect((await itemsRepo.getById(item1Id)).current_stock).toBe(30);

      // 2. Simulate consumption/sales leaving only 2 units in stock
      await db.stock_movements.put({
        id: `sm-sale-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        item_id: item1Id,
        material_id: item1Id,
        location_id: 'loc-main',
        movement_type: 'sales_delivery',
        direction: 'out',
        quantity: 28,
        quantity_change: -28,
        unit_cost: 100,
        date: getTodayDateString(),
        created_at: new Date().toISOString()
      });
      await db.items.update(item1Id, { current_stock: 2 });
      await db.materials.update(item1Id, { current_stock: 2 });

      expect((await itemsRepo.getById(item1Id)).current_stock).toBe(2);

      // 3. Attempt to edit PO reducing quantity from 10 to 5 (wants to deduct 5, but stock is only 2)
      await expect(
        suppliersRepo.updatePurchaseOrder(po.id, {
          supplier_id: supplierId,
          payment_terms: 'credit',
          order_date: getTodayDateString(),
          items: [
            { material_id: item1Id, quantity_ordered: 5, unit_price: 100 }
          ]
        }, 'usr-test')
      ).rejects.toThrow(/رصيد مخزني سالب/);

      // Stock remains unchanged at 2
      expect((await itemsRepo.getById(item1Id)).current_stock).toBe(2);
    });

    it('switching an invoice from cash to credit refunds the treasury and increases supplier payable', async () => {
      // 1. Initial cash PO: 1200 LE -> Treasury: 5000 - 1200 = 3800
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        subtotal: 1200,
        items: [
          { material_id: item1Id, quantity_ordered: 12, unit_price: 100 }
        ]
      }, 'usr-test');

      expect((await db.treasury_accounts.get('acc-main')).current_balance).toBe(3800);

      // 2. Edit: change payment terms to credit
      await suppliersRepo.updatePurchaseOrder(po.id, {
        supplier_id: supplierId,
        payment_terms: 'credit',
        order_date: getTodayDateString(),
        subtotal: 1200,
        items: [
          { material_id: item1Id, quantity_ordered: 12, unit_price: 100 }
        ]
      }, 'usr-test');

      // Treasury refunded to 5000
      expect((await db.treasury_accounts.get('acc-main')).current_balance).toBe(5000);

      // Supplier balance now shows 1200 payable
      const invoices = await db.supplier_invoices.where('supplier_id').equals(supplierId).toArray();
      expect(BalanceCalculator.calculateSupplierBalance(invoices, []).balanceDue).toBe(1200);
    });

    it('editing an invoice allows saving with its historical/past date without error', async () => {
      // 1. Create invoice today
      const po = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        subtotal: 500,
        items: [
          { material_id: item1Id, quantity_ordered: 5, unit_price: 100 }
        ]
      }, 'usr-test');

      // 2. Simulate invoice created in the past (e.g. 2026-01-15)
      const pastDate = '2026-01-15';
      await db.purchase_orders.update(po.id, { order_date: pastDate, expected_date: pastDate });

      // 3. Edit invoice keeping its past date or updating items on that past date
      const updated = await suppliersRepo.updatePurchaseOrder(po.id, {
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: pastDate,
        subtotal: 700,
        items: [
          { material_id: item1Id, quantity_ordered: 7, unit_price: 100 }
        ]
      }, 'usr-test');

      expect(updated.order_date).toBe(pastDate);
      expect(updated.total_amount).toBe(700);

      // Verify that creating a NEW purchase order with past date is still rejected
      await expect(
        suppliersRepo.createPurchaseOrder({
          supplier_id: supplierId,
          payment_terms: 'cash',
          account_id: 'acc-main',
          order_date: '2025-01-01',
          items: [{ material_id: item1Id, quantity_ordered: 1, unit_price: 100 }]
        }, 'usr-test')
      ).rejects.toThrow(/ممنوع اعتماد تاريخ في الماضي/);
    });
  });

  describe('3. Purchase Invoice Printout Discount Visibility in Items Table', () => {
    it('displays the applied discount in the items table under "الخصم" column and updates line total', async () => {
      const { generatePurchaseInvoiceHtml } = await import('../../modules/print/invoicePrintTemplates');

      // 1. Invoice WITH discount: 1 item at 100 LE with 10% discount (10 LE)
      const poWithDiscount = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        subtotal: 100,
        discount_percent: 10,
        items: [
          { material_id: item1Id, quantity_ordered: 1, unit_price: 100 }
        ]
      }, 'usr-test');

      const fullPO = await suppliersRepo.getPurchaseOrder(poWithDiscount.id);
      const htmlWithDiscount = generatePurchaseInvoiceHtml(fullPO, {}, 'A4');

      // Must display the discount value in the items table row (not '-')
      expect(htmlWithDiscount).toContain('10.00 ج.م');
      // Must display net total 90.00 ج.م
      expect(htmlWithDiscount).toContain('90.00 ج.م');
      // Must display discount in the totals section
      expect(htmlWithDiscount).toContain('الخصم التجاري (10%):');
      expect(htmlWithDiscount).toContain('-10.00 ج.م');

      // 2. Invoice WITHOUT discount: 1 item at 100 LE with 0 discount
      const poNoDiscount = await suppliersRepo.createPurchaseOrder({
        supplier_id: supplierId,
        payment_terms: 'cash',
        account_id: 'acc-main',
        order_date: getTodayDateString(),
        subtotal: 100,
        items: [
          { material_id: item1Id, quantity_ordered: 1, unit_price: 100 }
        ]
      }, 'usr-test');

      const fullPONoDisc = await suppliersRepo.getPurchaseOrder(poNoDiscount.id);
      const htmlNoDiscount = generatePurchaseInvoiceHtml(fullPONoDisc, {}, 'A4');

      // In the items table row under discount column, displays '-' when no discount
      expect(htmlNoDiscount).toContain('<td style="padding: 6px 8px; text-align: center;" class="font-mono">-</td>');
      // Net line total is 100.00 ج.م
      expect(htmlNoDiscount).toContain('100.00 ج.م');
      expect(htmlNoDiscount).not.toContain('الخصم التجاري:');
    });
  });
});
