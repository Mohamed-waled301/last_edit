import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import rawDb from '../../data/db';
const db = rawDb as any;
import { manufacturingRepo } from '../../data/repositories/manufacturingRepo';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import {
  calculateMaterialLineCost,
  calculateTotalMaterialsCost,
  calculateTotalAdditionalCosts,
  calculateTotalProductCost,
  calculateUnitCost
} from '../productionOrderCalculations';
import { getTodayDateString } from '../../utils/formatters';

describe('Production Order Cost Formulas, Stock Effect, and Constraints (Requirement C)', () => {
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

  describe('C1-C5: Pure Cost Calculation Formulas', () => {
    it('1. Line cost = quantity * price', () => {
      expect(calculateMaterialLineCost(8, 25.5)).toBe(204);
      expect(calculateMaterialLineCost(10, 15)).toBe(150);
      expect(calculateMaterialLineCost(12, 10.25)).toBe(123);
      expect(calculateMaterialLineCost(0, 50)).toBe(0);
      expect(calculateMaterialLineCost(-5, 50)).toBe(0);
    });

    it('2. Total materials cost = sum of all lines', () => {
      const lines = [
        { quantity: 8, unit_price: 25.5 }, // 204
        { quantity: 10, unit_price: 15 },   // 150
        { quantity: 12, unit_price: 10.25 } // 123
      ];
      // 204 + 150 + 123 = 477
      expect(calculateTotalMaterialsCost(lines)).toBe(477);
      expect(calculateTotalMaterialsCost([])).toBe(0);
    });

    it('3. Additional costs = sum of rows (labor, electricity, other)', () => {
      const additional = [
        { name: 'أجور عمالة', amount: 350 },
        { name: 'كهرباء ومرافق', amount: 85.5 },
        { name: 'استهلاك آلات وتغليف', amount: 64.5 }
      ];
      // 350 + 85.5 + 64.5 = 500
      expect(calculateTotalAdditionalCosts(additional)).toBe(500);
      expect(calculateTotalAdditionalCosts([])).toBe(0);
    });

    it('4. Total product cost = total materials cost + additional costs', () => {
      const materialsCost = 477;
      const additionalCosts = 500;
      expect(calculateTotalProductCost(materialsCost, additionalCosts)).toBe(977);
    });

    it('5. Cost per unit = total product cost / produced quantity (guarded against division by zero)', () => {
      const totalCost = 977;
      // 50 units -> 977 / 50 = 19.54
      expect(calculateUnitCost(totalCost, 50)).toBe(19.54);

      // Division by zero guard
      expect(calculateUnitCost(totalCost, 0)).toBe(0);
      expect(calculateUnitCost(totalCost, -10)).toBe(0);
      expect(calculateUnitCost(0, 50)).toBe(0);
    });
  });

  describe('C6-C7: Stock Issuance, Finished Product Receipt, and Stock Shortage Block', () => {
    it('Saving order issues raw materials and receives finished product in ONE transaction', async () => {
      // 1. Create Raw Materials in items master with initial stock
      const rawFabric = await itemsRepo.create({
        code: '1000',
        name: 'قماش ميلتون أسود',
        item_type: 'raw_material',
        unit: 'متر',
        cost_price: 50,
        opening_balance: 100 // Stock = 100
      }, 'usr-test');

      const rawThread = await itemsRepo.create({
        code: '1001',
        name: 'خيط بوليستر أسود',
        item_type: 'raw_material',
        unit: 'بكرة',
        cost_price: 20,
        opening_balance: 50 // Stock = 50
      }, 'usr-test');

      // 2. Create Finished Product card in items master (opening stock = 0)
      const hoodie = await itemsRepo.create({
        code: '1002',
        name: 'هودي رجالي شتوي كود 1002',
        item_type: 'finished',
        unit: 'قطعة',
        cost_price: 0,
        opening_balance: 0 // Stock = 0
      }, 'usr-test');

      expect(rawFabric.current_stock).toBe(100);
      expect(rawThread.current_stock).toBe(50);
      expect(hoodie.current_stock).toBe(0);

      // 3. Create Production Order for 20 hoodies
      // Consumes 30 meters of fabric (at custom order price 48) and 10 spools of thread (at 20)
      // Additional costs: 600 LE
      const order = await manufacturingRepo.createProductionOrder({
        product_id: hoodie.id,
        batch_quantity: 20,
        start_date: getTodayDateString(),
        materials: [
          { material_id: rawFabric.id, quantity: 30, unit_price: 48 },
          { material_id: rawThread.id, quantity: 10, unit_price: 20 }
        ],
        additional_costs: [
          { name: 'أجور قص وخياطة', amount: 400 },
          { name: 'كهرباء ومرافق', amount: 200 }
        ],
        notes: 'تشغيل دفعة هودي رجالي'
      }, 'usr-test');

      expect(order).toBeDefined();
      expect(order.status).toBe('completed');
      // Materials cost: 30*48 (1440) + 10*20 (200) = 1640
      expect(order.total_material_cost).toBe(1640);
      // Additional costs: 400 + 200 = 600
      expect(order.total_additional_cost).toBe(600);
      // Total product cost: 1640 + 600 = 2240
      expect(order.total_product_cost).toBe(2240);
      // Unit cost: 2240 / 20 = 112
      expect(order.unit_cost).toBe(112);

      // 4. Verify Stock Balances in items master
      const fabricAfter = await itemsRepo.getById(rawFabric.id);
      const threadAfter = await itemsRepo.getById(rawThread.id);
      const hoodieAfter = await itemsRepo.getById(hoodie.id);

      // Raw materials issued:
      expect(fabricAfter.current_stock).toBe(70); // 100 - 30 = 70
      expect(threadAfter.current_stock).toBe(40); // 50 - 10 = 40

      // Finished goods received:
      expect(hoodieAfter.current_stock).toBe(20); // 0 + 20 = 20

      // 5. Verify Edits in production order do NOT change item master cost price (Requirement C2)
      // Original cost price was 50, order used 48
      expect(fabricAfter.cost_price).toBe(50);

      // 6. Verify Stock Movements logged in DB
      const movements = await db.stock_movements.where('reference_id').equals(order.id).toArray();
      expect(movements.length).toBe(3); // 2 out, 1 in

      const fabricOut = movements.find((m: any) => m.item_id === rawFabric.id);
      expect(fabricOut.movement_type).toBe('production_out');
      expect(fabricOut.direction).toBe('out');
      expect(fabricOut.quantity).toBe(30);

      const hoodieIn = movements.find((m: any) => m.item_id === hoodie.id);
      expect(hoodieIn.movement_type).toBe('production_in');
      expect(hoodieIn.direction).toBe('in');
      expect(hoodieIn.quantity).toBe(20);
    });

    it('Blocks saving if raw material quantity exceeds available stock with clear Arabic message', async () => {
      // Create Raw Material with stock = 15
      const mat = await itemsRepo.create({
        code: '1010',
        name: 'قماش جبردين كحلي',
        item_type: 'raw_material',
        unit: 'متر',
        cost_price: 80,
        opening_balance: 15
      }, 'usr-test');

      const prod = await itemsRepo.create({
        code: '1011',
        name: 'بنطلون كارجو',
        item_type: 'finished',
        unit: 'قطعة'
      }, 'usr-test');

      // Attempt to order 25 meters when only 15 are in stock
      await expect(
        manufacturingRepo.createProductionOrder({
          product_id: prod.id,
          batch_quantity: 10,
          materials: [
            { material_id: mat.id, quantity: 25, unit_price: 80 }
          ]
        }, 'usr-test')
      ).rejects.toThrow(/الكمية المتاحة من الخامة .* بالمخزن هي \(15\)، بينما المطلوب للتشغيل \(25\)/);

      // Verify stock was NOT touched (atomic transaction)
      const matAfter = await itemsRepo.getById(mat.id);
      expect(matAfter.current_stock).toBe(15);
      const prodAfter = await itemsRepo.getById(prod.id);
      expect(prodAfter.current_stock).toBe(0);
    });
  });
});
