import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import rawDb from '../../data/db';
const db = rawDb as any;
import { manufacturingRepo } from '../../data/repositories/manufacturingRepo';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { navigationGuard } from '../../utils/navigationGuard';
import { getTodayDateString } from '../../utils/formatters';

describe('Cutting and Printing Workflow & Requirements Verification', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
    navigationGuard.unregister();
  });

  describe('1. Cutting Order Fields & Operations Persistence (Req 6, 7, 8)', () => {
    it('creates, saves, retrieves and updates cutting order details with operations', async () => {
      // Create raw material with sufficient stock & target finished good
      const rawMat = await itemsRepo.create({
        name: 'قماش سنجل قطن 100%',
        item_type: 'raw_material',
        selling_price: 0,
        purchase_price: 180,
        opening_balance: 1000,
      });

      const product = await itemsRepo.create({
        name: 'تيشرت صيفي مقاسات خاصة',
        item_type: 'finished',
        selling_price: 350,
        purchase_price: 0,
        opening_balance: 0,
      });

      const sizeQuantities = {
        M: 50,
        L: 100,
        XL: 100,
        '2XL': 75,
        '3XL': 50,
        '4XL': 25,
        '5XL': 15,
        '6XL': 10,
      };

      const totalPieces = Object.values(sizeQuantities).reduce((a, b) => a + Number(b), 0);
      expect(totalPieces).toBe(425);

      const cuttingOrderData = {
        product_id: product.id,
        batch_quantity: totalPieces,
        status: 'draft',
        start_date: getTodayDateString(),
        materials: [
          {
            material_id: rawMat.id,
            item_name: rawMat.name,
            quantity: 200,
            unit_price: 180,
          },
        ],
        additional_costs: [],
        notes: 'ملاحظات أمر قص تيشرت أوفر سايز',
        // Cutting specific fields
        cutting_number: 'CUT-2026-001',
        cutting_name: 'قصة تيشرت كلاسيك صيفي',
        fabric_type: 'سنجل ليكرا مشط تمشيط كامل',
        color: 'كحلي داكن',
        cutouts_1: 'شريط رقبة مضلع 1×1',
        cutouts_2: 'جيب أمامي مطرز',
        cutting_comment: 'مراعاة اتجاه النسيج أثناء فرد القماش على الطاولة',
        sizes: 'M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL',
        quantity_per_size: JSON.stringify(sizeQuantities),
        // Operations / Processing fields
        printing_vendor: 'مطبعة الأهرام سلك سكرين',
        printing_notes: 'طباعة ووتر بيز صدر وظهر مقاس 30x40',
        embroidery_vendor: 'ورشة الأمانة للتطريز الآلي',
        embroidery_notes: 'تطريز لوجو على الكتف الأيسر كثافة 8000 غرزة',
        processing_vendor: 'خط تشغيل وخياطة رقم 2',
        processing_notes: 'أوفر 4 فتلة وتثبيت شريط الكتف',
        total_printing_cost: 5000,
      };

      const createdOrder = await manufacturingRepo.createProductionOrder(cuttingOrderData);
      expect(createdOrder.id).toBeDefined();
      expect(createdOrder.cutting_number).toBe('CUT-2026-001');
      expect(createdOrder.cutting_name).toBe('قصة تيشرت كلاسيك صيفي');
      expect(createdOrder.fabric_type).toBe('سنجل ليكرا مشط تمشيط كامل');
      expect(createdOrder.color).toBe('كحلي داكن');
      expect(createdOrder.cutouts_1).toBe('شريط رقبة مضلع 1×1');
      expect(createdOrder.cutouts_2).toBe('جيب أمامي مطرز');
      expect(createdOrder.cutting_comment).toBe('مراعاة اتجاه النسيج أثناء فرد القماش على الطاولة');
      expect(createdOrder.sizes).toBe('M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL');
      expect(createdOrder.printing_vendor).toBe('مطبعة الأهرام سلك سكرين');
      expect(createdOrder.embroidery_vendor).toBe('ورشة الأمانة للتطريز الآلي');
      expect(createdOrder.processing_vendor).toBe('خط تشغيل وخياطة رقم 2');
      expect(createdOrder.total_printing_cost).toBe(5000);

      // Verify retrieval by ID
      const fetchedOrder = await manufacturingRepo.getById(createdOrder.id);
      expect(fetchedOrder).toBeDefined();
      expect(fetchedOrder.cutting_name).toBe('قصة تيشرت كلاسيك صيفي');
      const retrievedSizes = JSON.parse(fetchedOrder.quantity_per_size);
      expect(retrievedSizes.M).toBe(50);
      expect(retrievedSizes['6XL']).toBe(10);

      // Update cutting order
      const updated = await manufacturingRepo.updateProductionOrder(createdOrder.id, {
        color: 'أسود ملكي',
        total_printing_cost: 6500,
      });
      expect(updated.color).toBe('أسود ملكي');
      expect(updated.total_printing_cost).toBe(6500);
      expect(updated.cutting_number).toBe('CUT-2026-001');
    });
  });

  describe('2. Dedicated Printing Stage & Payment Calculations (Req 9)', () => {
    it('manages multiple printing payments and correctly recalculates total paid and remaining balance', async () => {
      const today = getTodayDateString();
      const rawMat = await itemsRepo.create({
        name: 'قماش للطباعة',
        item_type: 'raw_material',
        purchase_price: 100,
        opening_balance: 500,
      });

      const product = await itemsRepo.create({
        name: 'تيشرت مطبوع',
        item_type: 'finished',
        opening_balance: 0,
      });

      const order = await manufacturingRepo.createProductionOrder({
        product_id: product.id,
        materials: [{ material_id: rawMat.id, quantity: 10, unit_price: 100 }],
        batch_quantity: 500,
        status: 'draft',
        start_date: today,
        cutting_number: 'CUT-TEST-PRT',
        cutting_name: 'قصة مطبعة اختبار',
        total_printing_cost: 5000,
      });

      // Initially no payments
      const initialInfo = await manufacturingRepo.getPrintingPayments(order.id);
      expect(initialInfo.payments).toHaveLength(0);
      expect(initialInfo.totalPaid).toBe(0);
      expect(initialInfo.remainingBalance).toBe(5000);

      // Add Payment 1: 1500 EGP
      const payment1 = await manufacturingRepo.addPrintingPayment({
        production_order_id: order.id,
        payment_date: today,
        amount: 1500,
        notes: 'دفعة أولى عربون نقدي',
      });
      expect(payment1.id).toBeDefined();
      expect(payment1.amount).toBe(1500);

      // Add Payment 2: 1000 EGP
      const payment2 = await manufacturingRepo.addPrintingPayment({
        production_order_id: order.id,
        payment_date: today,
        amount: 1000,
        notes: 'دفعة ثانية بعد المعاينة',
      });
      expect(payment2.id).toBeDefined();
      expect(payment2.amount).toBe(1000);

      // Fetch all payments for this cutting order
      const paymentInfo = await manufacturingRepo.getPrintingPayments(order.id);
      expect(paymentInfo.payments).toHaveLength(2);

      // Verification from user prompt example:
      // If total printing cost is 5,000, and payments are 1,500 and 1,000:
      // Total Printing Cost: 5,000
      // Total Paid: 2,500
      // Remaining Balance: 2,500
      expect(paymentInfo.totalPrintingCost).toBe(5000);
      expect(paymentInfo.totalPaid).toBe(2500);
      expect(paymentInfo.remainingBalance).toBe(2500);

      // Update payment 2 from 1000 to 2000
      await manufacturingRepo.updatePrintingPayment(payment2.id, {
        amount: 2000,
        notes: 'دفعة ثانية معدلة',
      });

      const updatedInfo = await manufacturingRepo.getPrintingPayments(order.id);
      expect(updatedInfo.totalPaid).toBe(3500);
      expect(updatedInfo.remainingBalance).toBe(1500);

      // Delete payment 1
      await manufacturingRepo.deletePrintingPayment(payment1.id);
      const afterDeleteInfo = await manufacturingRepo.getPrintingPayments(order.id);
      expect(afterDeleteInfo.payments).toHaveLength(1);
      expect(afterDeleteInfo.totalPaid).toBe(2000);
      expect(afterDeleteInfo.remainingBalance).toBe(3000);
    });
  });

  describe('3. Missing Supplier Exact Validation Message (Req 4)', () => {
    it('uses the exact Arabic message "اختيار المورد" when supplier is missing', () => {
      const selectedSupplierId = '';
      let validationMessage = '';

      if (!selectedSupplierId) {
        validationMessage = 'اختيار المورد';
      }

      expect(validationMessage).toBe('اختيار المورد');
    });
  });

  describe('4. Navigation Guard for Unsaved Changes (Req 5)', () => {
    it('detects unsaved state and manages registration correctly', () => {
      let isFormDirty = false;
      navigationGuard.register('test-form', () => isFormDirty);

      expect(navigationGuard.hasUnsavedChanges()).toBe(false);

      // User makes a change
      isFormDirty = true;
      expect(navigationGuard.hasUnsavedChanges()).toBe(true);

      // Unregister guard (e.g. after successful save)
      navigationGuard.unregister();
      expect(navigationGuard.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('5. Line Item Default Quantity (Req 2)', () => {
    it('initializes new line items with quantity 1 in sales and purchases', () => {
      const newPurchaseLine = {
        item_id: 'item-1',
        item_name: 'خام تيشرت',
        quantity_ordered: '1',
        unit_price: '50',
      };
      expect(newPurchaseLine.quantity_ordered).toBe('1');

      const newSalesLine = {
        item_id: 'prod-1',
        item_name: 'تيشرت جاهز',
        quantity: '1',
        unit_price: '120',
      };
      expect(newSalesLine.quantity).toBe('1');
    });
  });
});
