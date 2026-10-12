import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { calculatePurchaseOrderTotals } from '../purchaseOrderCalculations';
import { db } from '../../data/db';
import { suppliersRepo, partiesRepo } from '../../data';

describe('Purchase Order Formula & Validations (Requirement D)', () => {
  describe('Pure Calculation: calculatePurchaseOrderTotals', () => {
    it('1. Subtracts discount value and additional expenses: subtotal - discount - expenses', () => {
      const result = calculatePurchaseOrderTotals({
        subtotal: 1000,
        discount_amount: 150,
        additional_expenses: 50,
      });

      expect(result.subtotal).toBe(1000);
      expect(result.discountValue).toBe(150);
      expect(result.additionalExpenses).toBe(50);
      expect(result.rawNet).toBe(800);
      expect(result.finalNet).toBe(800);
      expect(result.isValid).toBe(true);
      expect(result.errorMessage).toBe('');
    });

    it('2. Calculates discount by percentage and subtracts additional expenses correctly', () => {
      const result = calculatePurchaseOrderTotals({
        subtotal: 5000,
        discount_percent: 10, // 10% of 5000 = 500
        additional_expenses: 300,
      });

      expect(result.subtotal).toBe(5000);
      expect(result.discountPercent).toBe(10);
      expect(result.discountValue).toBe(500);
      expect(result.additionalExpenses).toBe(300);
      // 5000 - 500 - 300 = 4200
      expect(result.rawNet).toBe(4200);
      expect(result.finalNet).toBe(4200);
      expect(result.isValid).toBe(true);
    });

    it('3. Respects direct discount value over percentage if provided', () => {
      const result = calculatePurchaseOrderTotals({
        subtotal: 2000,
        discount_percent: 10,
        discount_amount: 250, // direct value
        additional_expenses: 100,
      });

      expect(result.discountValue).toBe(250);
      expect(result.additionalExpenses).toBe(100);
      // 2000 - 250 - 100 = 1650
      expect(result.finalNet).toBe(1650);
      expect(result.isValid).toBe(true);
    });

    it('4. Handles expenses larger than remaining amount (negative net blocked)', () => {
      const result = calculatePurchaseOrderTotals({
        subtotal: 1000,
        discount_amount: 200, // remaining 800
        additional_expenses: 950, // expenses > 800
      });

      expect(result.rawNet).toBe(-150);
      expect(result.finalNet).toBe(0); // clamped to 0
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('الصافي النهائي لا يمكن أن يكون أقل من صفر');
    });

    it('5. Handles additional expenses directly exceeding subtotal when discount is 0', () => {
      const result = calculatePurchaseOrderTotals({
        subtotal: 400,
        discount_amount: 0,
        additional_expenses: 650,
      });

      expect(result.rawNet).toBe(-250);
      expect(result.finalNet).toBe(0);
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toBe('الصافي النهائي لا يمكن أن يكون أقل من صفر');
    });

    it('6. Handles string inputs and zero edge-cases cleanly', () => {
      const result = calculatePurchaseOrderTotals({
        subtotal: '1200.50' as any,
        discount_amount: '100.25' as any,
        additional_expenses: '50.25' as any,
      });

      expect(result.subtotal).toBe(1200.5);
      expect(result.discountValue).toBe(100.25);
      expect(result.additionalExpenses).toBe(50.25);
      expect(result.rawNet).toBe(1050);
      expect(result.finalNet).toBe(1050);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Integration: suppliersRepo.createPurchaseOrder', () => {
    let supplierId = '';

    beforeEach(async () => {
      if (!db.isOpen()) {
        await db.open();
      }
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
      });

      const partyRes = await partiesRepo.create({
        name: 'مورد اختبار الخامات',
        is_supplier: true,
        is_customer: false,
        payment_terms: 'credit',
      }, 'usr-test');
      supplierId = partyRes.id;
    });

    it('7. Enforces formula when saving PO: grandTotal = subtotal - discount - expenses', async () => {
      const poData = {
        supplier_id: supplierId,
        payment_terms: 'credit',
        receive_now: true,
        order_date: '2026-10-12',
        subtotal: 10000,
        discount_percent: 5,
        discount_amount: 500,
        additional_expenses: 300,
        items: [
          { material_id: 'mat-test', quantity_ordered: 100, unit_price: 100 }
        ],
        installments: [
          { amount: 5000, due_date: '2026-10-20' },
          { amount: 4200, due_date: '2026-10-30' },
        ]
      };

      const res = await suppliersRepo.createPurchaseOrder(poData, 'usr-test');
      expect(res.id).toBeDefined();

      const savedPO = await db.purchase_orders.get(res.id);
      expect(savedPO).toBeDefined();
      expect(savedPO.subtotal).toBe(10000);
      expect(savedPO.discount_value).toBe(500);
      expect(savedPO.additional_expenses).toBe(300);
      // 10000 - 500 - 300 = 9200
      expect(savedPO.total_amount).toBe(9200);
      expect(savedPO.grand_total).toBe(9200);

      // Verify supplier invoice matches
      const invoice = await db.supplier_invoices.where('po_id').equals(res.id).first();
      expect(invoice).toBeDefined();
      expect(invoice.total_amount).toBe(9200);
    });

    it('8. Blocks saving purchase order when final net < 0 with clear Arabic error', async () => {
      const poData = {
        supplier_id: supplierId,
        payment_terms: 'cash',
        order_date: '2026-10-12',
        subtotal: 2000,
        discount_amount: 500, // remaining 1500
        additional_expenses: 1800, // expenses > remaining!
        items: [
          { material_id: 'mat-test', quantity_ordered: 20, unit_price: 100 }
        ]
      };

      await expect(
        suppliersRepo.createPurchaseOrder(poData, 'usr-test')
      ).rejects.toThrow('الصافي النهائي لا يمكن أن يكون أقل من صفر');
    });

    it('9. Rejects installments that do not sum to the corrected final net', async () => {
      const poData = {
        supplier_id: supplierId,
        payment_terms: 'credit',
        order_date: '2026-10-12',
        subtotal: 5000,
        discount_amount: 200,
        additional_expenses: 300, // net = 4500
        items: [
          { material_id: 'mat-test', quantity_ordered: 50, unit_price: 100 }
        ],
        installments: [
          // sum = 5000 (wrong, sums to subtotal instead of final net 4500)
          { amount: 3000, due_date: '2026-10-20' },
          { amount: 2000, due_date: '2026-10-30' },
        ]
      };

      await expect(
        suppliersRepo.createPurchaseOrder(poData, 'usr-test')
      ).rejects.toThrow(/إجمالي مبالغ الأقساط/);
    });
  });
});
