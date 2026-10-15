import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { cashRepo } from '../../data/repositories/cashRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { treasuriesRepo } from '../../data/repositories/treasuriesRepo';
import { manufacturingRepo } from '../../data/repositories/manufacturingRepo';
import { auditRepo } from '../../data/repositories/auditRepo';
import { isFeatureEnabled } from '../../editions/editionConfig';

describe.skipIf(!isFeatureEnabled('cutting'))('Requirements 2 & 4: Cash Screens, Shared Supplier Payments, and Cut Order Overhaul', () => {
  beforeEach(async () => {
    await db.parties.clear();
    await db.treasury_accounts.clear();
    await db.cash_transactions.clear();
    await db.payments.clear();
    await db.customer_payments.clear();
    await db.items.clear();
    await db.materials.clear();
    await db.products.clear();
    await db.production_orders.clear();
    await db.production_material_usage.clear();
    await db.stock_movements.clear();
    if (db.audit_log) await db.audit_log.clear();
  });

  const createTreasury = async (data: any = {}) => {
    const trs = {
      id: data.id || `trs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      code: data.code || 'TRS-01',
      name: data.name || 'الخزينة الرئيسية',
      current_balance: data.current_balance ?? 0,
      opening_balance: data.opening_balance ?? data.current_balance ?? 0,
      is_main: data.is_main ?? 1,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.treasury_accounts.add(trs);
    return trs;
  };

  describe('1. Cash Screens: Supplier Payments (مدفوعات مورد)', () => {
    it('reduces supplier balance and treasury in ONE transaction; allows negative treasury', async () => {
      // 1. Setup treasury with initial balance 500 EGP
      const trs = await createTreasury({
        code: 'TRS-01',
        name: 'الخزينة الرئيسية',
        current_balance: 500,
        is_main: 1
      });

      // 2. Setup supplier with debt 2000 EGP
      const sup = await partiesRepo.create({
        code: 'SUP-01',
        name: 'مورد الأقمشة الحديثة',
        is_supplier: 1,
        is_customer: 0,
        supplier_opening_balance: 2000,
        opening_balance: 2000
      });

      expect(sup.supplier_balance).toBe(2000);

      // 3. Issue payment of 800 EGP (exceeds treasury 500, so treasury will go negative -300)
      const payRes = await cashRepo.recordSupplierPayment({
        supplier_id: sup.id,
        account_id: trs.id,
        amount: 800,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'نقداً',
        notes: 'سداد دفعة نقدية'
      }, 'usr-accountant');

      expect(payRes.success).toBe(true);
      expect(payRes.paymentNumber).toMatch(/^PAY-SUP-/);

      // 4. Verify treasury is reduced by 800 (goes negative to -300, never blocked)
      const trsAfter = await db.treasury_accounts.get(trs.id);
      expect(trsAfter.current_balance).toBe(-300);

      // 5. Verify supplier balance is reduced from 2000 to 1200
      const supAfter = await partiesRepo.getById(sup.id);
      expect(supAfter.supplier_balance).toBe(1200);

      // 6. Verify cash transaction logged
      const txs = await db.cash_transactions.toArray();
      expect(txs).toHaveLength(1);
      expect(txs[0].tx_type).toBe('outflow');
      expect(txs[0].amount).toBe(800);
      expect(txs[0].balance_after).toBe(-300);
    });

    it('rejects payment if amount is zero, negative, or exceeds supplier balance', async () => {
      const sup = await partiesRepo.create({
        code: 'SUP-02',
        name: 'مورد خيوط',
        is_supplier: 1,
        opening_balance: 1000
      });

      // Zero amount
      await expect(
        cashRepo.recordSupplierPayment({ supplier_id: sup.id, amount: 0 })
      ).rejects.toThrow(/مبلغ .* يجب أن يكون رقماً أكبر من صفر/);

      // Negative amount
      await expect(
        cashRepo.recordSupplierPayment({ supplier_id: sup.id, amount: -50 })
      ).rejects.toThrow(/مبلغ .* يجب أن يكون رقماً أكبر من صفر/);

      // Exceeds balance (1500 > 1000)
      await expect(
        cashRepo.recordSupplierPayment({ supplier_id: sup.id, amount: 1500 })
      ).rejects.toThrow(/لا يمكن أن يتجاوز رصيد المديونية المستحق/);
    });

    it('cancels supplier payment via reversing entries (never deleted)', async () => {
      const trs = await createTreasury({
        code: 'TRS-01',
        name: 'الخزينة الرئيسية',
        current_balance: 1000,
        is_main: 1
      });

      const sup = await partiesRepo.create({
        code: 'SUP-03',
        name: 'مورد أزرار',
        is_supplier: 1,
        opening_balance: 500
      });

      const payRes = await cashRepo.recordSupplierPayment({
        supplier_id: sup.id,
        account_id: trs.id,
        amount: 300,
        payment_date: new Date().toISOString().split('T')[0]
      });

      // Balances after payment
      expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(700);
      expect((await partiesRepo.getById(sup.id)).supplier_balance).toBe(200);

      // Cancel payment
      const cancelRes = await cashRepo.cancelSupplierPayment(payRes.paymentId, 'خطأ في قيد السداد');
      expect(cancelRes.success).toBe(true);

      // Verify payment marked as cancelled, not deleted from DB
      const payRecord = await db.payments.get(payRes.paymentId);
      expect(payRecord).toBeDefined();
      expect(payRecord.status).toBe('cancelled');
      expect(payRecord.cancellation_reason).toBe('خطأ في قيد السداد');

      // Verify treasury and supplier balance restored
      expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(1000);
      expect((await partiesRepo.getById(sup.id)).supplier_balance).toBe(500);

      // Verify reversal cash transaction logged
      const revTx = await db.cash_transactions.where('reference_type').equals('PAYMENT_REVERSAL').first();
      expect(revTx).toBeDefined();
      expect(revTx.tx_type).toBe('inflow');
      expect(revTx.amount).toBe(300);
    });
  });

  describe('2. Cash Screens: Customer Receipts (استلام نقدية)', () => {
    it('increases treasury and reduces customer debt in ONE transaction', async () => {
      const trs = await createTreasury({
        code: 'TRS-01',
        name: 'الخزينة الرئيسية',
        current_balance: 2000,
        is_main: 1
      });

      const cust = await partiesRepo.create({
        code: 'CUST-01',
        name: 'تاجر جملة القاهرة',
        is_customer: 1,
        customer_opening_balance: 5000,
        opening_balance: 5000
      });

      const recRes = await cashRepo.recordCustomerReceipt({
        customer_id: cust.id,
        account_id: trs.id,
        amount: 1500,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'نقداً',
        notes: 'دفعة حساب'
      });

      expect(recRes.success).toBe(true);
      expect(recRes.receiptNumber).toMatch(/^REC-CUST-/);

      // Treasury increased
      expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(3500);

      // Customer debt reduced
      expect((await partiesRepo.getById(cust.id)).customer_balance).toBe(3500);
    });

    it('cancels customer receipt via reversing entries (never deleted)', async () => {
      const trs = await createTreasury({
        code: 'TRS-01',
        name: 'الخزينة الرئيسية',
        current_balance: 1000,
        is_main: 1
      });

      const cust = await partiesRepo.create({
        code: 'CUST-02',
        name: 'تاجر الإسكندرية',
        is_customer: 1,
        opening_balance: 2000
      });

      const recRes = await cashRepo.recordCustomerReceipt({
        customer_id: cust.id,
        account_id: trs.id,
        amount: 800,
        payment_date: new Date().toISOString().split('T')[0]
      });

      expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(1800);
      expect((await partiesRepo.getById(cust.id)).customer_balance).toBe(1200);

      // Cancel receipt
      const cancelRes = await cashRepo.cancelCustomerReceipt(recRes.receiptId, 'إلغاء سند استلام عميل');
      expect(cancelRes.success).toBe(true);

      const recRecord = await db.customer_payments.get(recRes.receiptId);
      expect(recRecord.status).toBe('cancelled');

      // Balances reversed
      expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(1000);
      expect((await partiesRepo.getById(cust.id)).customer_balance).toBe(2000);
    });
  });

  describe('3. Cut Order ("أمر القص") Overhaul', () => {
    it('enforces manual, required, and unique cutting number', async () => {
      // Empty cutting number throws Arabic error
      await expect(
        manufacturingRepo.checkCuttingNumberUnique('')
      ).rejects.toThrow('رقم القصة مطلوب ويجب إدخاله يدوياً');

      // Create order with manual number
      await db.production_orders.add({
        id: 'po-1',
        cutting_number: 'CUT-101',
        order_number: 'CUT-101',
        status: 'issued'
      });

      // Duplicate cutting number throws Arabic error
      await expect(
        manufacturingRepo.checkCuttingNumberUnique('CUT-101')
      ).rejects.toThrow('رقم القصة مسجل مسبقاً، يرجى إدخال رقم فريد');

      // Different unique number succeeds
      const isUnique = await manufacturingRepo.checkCuttingNumberUnique('CUT-102');
      expect(isUnique).toBe(true);
    });

    it('issues cut order, allows edits at any time, and creates stock DIFFERENCE movements only', async () => {
      // 1. Setup raw material with stock 100
      const fabric = await itemsRepo.create({
        code: 'FAB-01',
        name: 'قماش قطن مصري',
        item_type: 'raw_material',
        opening_balance: 100,
        cost_price: 50
      });

      // 2. Setup finished product with stock 0
      const polo = await itemsRepo.create({
        code: 'POLO-01',
        name: 'بولو صيفي كلاسيك',
        item_type: 'finished',
        opening_balance: 0
      });

      // 3. Create and issue cut order for 20 pieces (consumes 40 meters)
      const order = await manufacturingRepo.createProductionOrder({
        cutting_number: 'CUT-POLO-2026',
        cutting_name: 'قصة بولو صيفي',
        product_id: polo.id,
        batch_quantity: 20,
        status: 'issued',
        materials: [
          { material_id: fabric.id, quantity: 40, unit_price: 50 }
        ],
        additional_costs: [
          { name: 'أجور قص', amount: 200 }
        ]
      }, 'usr-cutter');

      expect(order.status).toBe('issued');
      // Stock checks: fabric 100 - 40 = 60, polo 0 + 20 = 20
      expect((await itemsRepo.getById(fabric.id)).current_stock).toBe(60);
      expect((await itemsRepo.getById(polo.id)).current_stock).toBe(20);

      // Verify stock movements count: 1 out for fabric, 1 in for polo
      const initialMovements = await db.stock_movements.where('reference_id').equals(order.id).toArray();
      expect(initialMovements).toHaveLength(2);

      // 4. Edit order later: increase pieces from 20 to 25, fabric from 40 to 48 meters (delta: +8 meters fabric, +5 polo)
      const updatedOrder = await manufacturingRepo.updateProductionOrder(order.id, {
        batch_quantity: 25,
        materials: [
          { material_id: fabric.id, quantity: 48, unit_price: 50 }
        ]
      }, 'usr-cutter');

      expect(updatedOrder.batch_quantity).toBe(25);

      // Verify only difference movements were added (never re-issuing the full 48)
      // Stock: fabric was 60, should now be 60 - 8 = 52
      // Product: polo was 20, should now be 20 + 5 = 25
      expect((await itemsRepo.getById(fabric.id)).current_stock).toBe(52);
      expect((await itemsRepo.getById(polo.id)).current_stock).toBe(25);

      const allMovements = await db.stock_movements.where('reference_id').equals(order.id).toArray();
      expect(allMovements).toHaveLength(4); // 2 initial + 2 delta

      const deltaOut = allMovements.find((m: any) => m.movement_type === 'production_out' && m.quantity === 8);
      expect(deltaOut).toBeDefined();

      const deltaIn = allMovements.find((m: any) => m.movement_type === 'production_in' && m.quantity === 5);
      expect(deltaIn).toBeDefined();

      // 5. Verify audit log recorded old and new values
      const logs = (await auditRepo.getAll()).filter((l: any) => l.entity_id === order.id);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('locks order when closed; requires written reason to edit closed order', async () => {
      const prod = await itemsRepo.create({
        code: 'PROD-LOCK',
        name: 'منتج اختبار الإقفال',
        item_type: 'finished'
      });
      const rawMat = await itemsRepo.create({
        code: 'MAT-LOCK',
        name: 'خامة قفل',
        item_type: 'raw_material',
        opening_balance: 50,
        cost_price: 10
      });

      const order = await manufacturingRepo.createProductionOrder({
        cutting_number: 'CUT-LOCK-01',
        product_id: prod.id,
        status: 'issued',
        batch_quantity: 10,
        materials: [{ material_id: rawMat.id, quantity: 10, unit_price: 10 }]
      });

      // Close order
      await manufacturingRepo.closeProductionOrder(order.id, 'انتهاء دورة التشغيل بالكامل');
      const closed = await db.production_orders.get(order.id);
      expect(closed.status).toBe('closed');
      expect(closed.closed_reason).toBe('انتهاء دورة التشغيل بالكامل');

      // Attempting to edit without written reason throws Arabic error
      await expect(
        manufacturingRepo.updateProductionOrder(order.id, {
          batch_quantity: 12,
          materials: [{ material_id: rawMat.id, quantity: 12, unit_price: 10 }]
        })
      ).rejects.toThrow('أمر القص مقفل، يرجى كتابة سبب التعديل للمتابعة');

      // Editing with written reason succeeds
      const edited = await manufacturingRepo.updateProductionOrder(order.id, {
        batch_quantity: 12,
        materials: [{ material_id: rawMat.id, quantity: 12, unit_price: 10 }],
        edit_reason: 'إضافة قطعتين عينة للعميل بعد الإقفال'
      });

      expect(edited.batch_quantity).toBe(12);
      expect(edited.last_edit_closed_reason).toBe('إضافة قطعتين عينة للعميل بعد الإقفال');
    });

    it('manages 3 stages (الطباعة, التطريز, الحياكة) and records stage payments via shared supplier payment ledger', async () => {
      // 1. Setup treasury
      const trs = await createTreasury({
        code: 'TRS-01',
        name: 'الخزينة الرئيسية',
        current_balance: 10000,
        is_main: 1
      });

      // 2. Setup 3 service vendors (suppliers of type service)
      const printShop = await partiesRepo.create({
        code: 'VND-PRT',
        name: 'مطبعة النيل الحديثة',
        is_supplier: 1,
        supplier_type: 'service',
        service_stage: 'printing',
        opening_balance: 1500,
        supplier_opening_balance: 1500
      });

      const embroideryShop = await partiesRepo.create({
        code: 'VND-EMB',
        name: 'ورشة الهدى للتطريز',
        is_supplier: 1,
        supplier_type: 'service',
        service_stage: 'embroidery',
        opening_balance: 0
      });

      const sewingShop = await partiesRepo.create({
        code: 'VND-SEW',
        name: 'ورشة السلام للحياكة',
        is_supplier: 1,
        supplier_type: 'service',
        service_stage: 'sewing',
        opening_balance: 0
      });

      // 3. Setup product and create cut order with all 3 stages
      const item = await itemsRepo.create({
        code: 'SHIRT-01',
        name: 'قميص صيفي',
        item_type: 'finished'
      });
      const fabric = await itemsRepo.create({
        code: 'FAB-02',
        name: 'قماش كتان',
        item_type: 'raw_material',
        opening_balance: 200,
        cost_price: 30
      });

      const order = await manufacturingRepo.createProductionOrder({
        cutting_number: 'CUT-3STAGES-01',
        product_id: item.id,
        batch_quantity: 100,
        materials: [{ material_id: fabric.id, quantity: 100, unit_price: 30 }],
        stages: {
          printing: {
            vendor_id: printShop.id,
            vendor_name: printShop.name,
            pricing_type: 'per_piece',
            price_per_piece: 15 // 100 * 15 = 1500
          },
          embroidery: {
            vendor_id: embroideryShop.id,
            vendor_name: embroideryShop.name,
            pricing_type: 'batches',
            batches: [
              { date: '2026-10-15', pieces: 60, unit_price: 20 }, // 1200
              { date: '2026-10-16', pieces: 40, unit_price: 20 }  // 800 -> total 2000
            ]
          },
          sewing: {
            vendor_id: sewingShop.id,
            vendor_name: sewingShop.name,
            pricing_type: 'fixed',
            fixed_total: 2500 // 2500
          }
        }
      });

      // 4. Retrieve enriched order and verify stage summaries
      const fetched = await manufacturingRepo.getById(order.id);
      expect(fetched.stages.printing.total_cost).toBe(1500);
      expect(fetched.stages.printing.paid).toBe(0);
      expect(fetched.stages.printing.remaining).toBe(1500);

      expect(fetched.stages.embroidery.total_cost).toBe(2000);
      expect(fetched.stages.sewing.total_cost).toBe(2500);

      // Total stages cost: 1500 + 2000 + 2500 = 6000 EGP
      expect(fetched.total_stages_cost).toBe(6000);

      // 5. Record stage payment of 600 EGP to printing stage via addStagePayment
      // First update printShop balance to acknowledge stage debt
      await db.parties.update(printShop.id, { supplier_balance: 1500 });

      const payStageRes = await manufacturingRepo.addStagePayment(order.id, 'printing', {
        amount: 600,
        account_id: trs.id,
        payment_method: 'نقداً',
        notes: 'عربون مرحلة الطباعة'
      });

      expect(payStageRes.success).toBe(true);

      // 6. Verify shared supplier payment ledger was updated:
      // Treasury reduced: 10000 - 600 = 9400
      expect((await db.treasury_accounts.get(trs.id)).current_balance).toBe(9400);

      // Print shop vendor balance reduced: 1500 - 600 = 900
      expect((await partiesRepo.getById(printShop.id)).supplier_balance).toBe(900);

      // Order enriched stage: paid = 600, remaining = 900
      const orderAfterPay = await manufacturingRepo.getById(order.id);
      expect(orderAfterPay.stages.printing.paid).toBe(600);
      expect(orderAfterPay.stages.printing.remaining).toBe(900);
    });
  });
});
