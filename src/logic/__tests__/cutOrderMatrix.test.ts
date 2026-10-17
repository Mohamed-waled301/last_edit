import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CUT_ORDER_SIZES,
  createBlankMatrixRow,
  computeRowTotal,
  computeColumnTotals,
  computeGrandTotal,
  validateAndCleanMatrix,
  distributeMatrixCostLargestRemainder
} from '../cutOrderMatrixCalculations';
import { migrateCutOrdersToMatrix } from '../cutOrderMatrixMigration';
import db from '../../data/db';
import { itemsRepo } from '../../data/repositories/itemsRepo';

describe('Cut Order Matrix Overhaul & Size-Color Calculations', () => {
  beforeEach(async () => {
    try {
      if (db.isOpen()) {
        if (db.production_orders) await db.production_orders.clear();
        if (db.item_sizes) await db.item_sizes.clear();
        if (db.item_colors) await db.item_colors.clear();
      }
    } catch {}
  });

  describe('1. Size Ordering & Master Data', () => {
    it('defines exactly 10 standard sizes in correct garment order from M to 8XL', () => {
      const expectedSizes = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
      expect(CUT_ORDER_SIZES).toEqual(expectedSizes);
      expect(CUT_ORDER_SIZES.length).toBe(10);
      expect(CUT_ORDER_SIZES[8]).toBe('7XL');
      expect(CUT_ORDER_SIZES[9]).toBe('8XL');
    });

    it('itemsRepo.getSizes() includes 7XL and 8XL without duplicates and in ascending order', async () => {
      const sizes = await itemsRepo.getSizes();
      expect(sizes.length).toBeGreaterThanOrEqual(10);
      
      const codes = sizes.map(s => s.code);
      expect(codes).toContain('7XL');
      expect(codes).toContain('8XL');

      // Check no duplicates
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);

      // Check 7XL comes before 8XL
      const idx7XL = codes.indexOf('7XL');
      const idx8XL = codes.indexOf('8XL');
      expect(idx7XL).toBeLessThan(idx8XL);
    });

    it('itemsRepo.getColors() auto-seeds standard Egyptian garment colors', async () => {
      const colors = await itemsRepo.getColors();
      expect(colors.length).toBeGreaterThanOrEqual(8);
      const names = colors.map(c => c.name);
      expect(names).toContain('أسود');
      expect(names).toContain('أبيض');
      expect(names).toContain('أحمر');
      expect(names).toContain('كحلي');
    });
  });

  describe('2. Matrix Totals & Multi-Color Piece Accumulation', () => {
    it('accurately calculates row totals and col totals across multiple colors (e.g. Red and Black)', () => {
      // Requirement: Size M has 2 Red + 2 Black = 4 total M
      const matrix = [
        {
          id: 'row-1',
          color: 'أحمر',
          quantities: { M: 2, L: 5, XL: 3, '7XL': 1, '8XL': 0 }
        },
        {
          id: 'row-2',
          color: 'أسود',
          quantities: { M: 2, L: 4, XL: 6, '7XL': 0, '8XL': 3 }
        }
      ];

      // Row totals
      const row1Total = computeRowTotal(matrix[0]);
      const row2Total = computeRowTotal(matrix[1]);
      expect(row1Total).toBe(2 + 5 + 3 + 1); // 11
      expect(row2Total).toBe(2 + 4 + 6 + 3); // 15

      // Column totals
      const colTotals = computeColumnTotals(matrix);
      expect(colTotals['M']).toBe(4); // 2 red + 2 black
      expect(colTotals['L']).toBe(9); // 5 + 4
      expect(colTotals['XL']).toBe(9); // 3 + 6
      expect(colTotals['7XL']).toBe(1);
      expect(colTotals['8XL']).toBe(3);
      expect(colTotals['2XL']).toBe(0);

      // Grand total
      const grandTotal = computeGrandTotal(matrix);
      expect(grandTotal).toBe(26);
      expect(grandTotal).toBe(row1Total + row2Total);
    });

    it('createBlankMatrixRow creates clean row with empty string quantities for all 10 sizes', () => {
      const blank = createBlankMatrixRow();
      expect(blank.color).toBe('');
      expect(Object.keys(blank.quantities).length).toBe(10);
      CUT_ORDER_SIZES.forEach(sz => {
        expect(blank.quantities[sz]).toBe('');
      });
    });
  });

  describe('3. Validation & Business Constraints', () => {
    it('blocks duplicate colors with descriptive Arabic error message', () => {
      const matrix = [
        { id: '1', color: 'أحمر', quantities: { M: 5 } },
        { id: '2', color: 'أحمر', quantities: { L: 10 } }
      ];

      const res = validateAndCleanMatrix(matrix);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('هذا اللون مضاف بالفعل');
    });

    it('requires color selection when a row contains quantities', () => {
      const matrix = [
        { id: '1', color: '', quantities: { M: 5 } }
      ];

      const res = validateAndCleanMatrix(matrix);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('برجاء اختيار اللون');
    });

    it('ignores completely empty rows and requires at least one quantity > 0 overall', () => {
      const allEmpty = [
        createBlankMatrixRow(),
        createBlankMatrixRow()
      ];
      const emptyRes = validateAndCleanMatrix(allEmpty);
      expect(emptyRes.valid).toBe(false);
      expect(emptyRes.error).toContain('كمية واحدة على الأقل');

      // One valid row and one empty row should succeed cleanly
      const mixed = [
        { id: '1', color: 'كحلي', quantities: { '3XL': 12, '7XL': 4 } },
        createBlankMatrixRow()
      ];
      const mixedRes = validateAndCleanMatrix(mixed);
      expect(mixedRes.valid).toBe(true);
      expect(mixedRes.cleanRows.length).toBe(1);
      expect(mixedRes.cleanRows[0].color).toBe('كحلي');
      expect(mixedRes.cleanRows[0].quantities['3XL']).toBe(12);
      expect(mixedRes.cleanRows[0].quantities['7XL']).toBe(4);
      expect(mixedRes.grandTotal).toBe(16);
    });
  });

  describe('4. Cost Distribution to Exact Piaster (Largest Remainder Method)', () => {
    it('distributes cost across cells reconciling to exact piaster without fraction loss', () => {
      const matrix = [
        { id: '1', color: 'أحمر', quantities: { M: 1, L: 1 } },
        { id: '2', color: 'أخضر', quantities: { XL: 1 } }
      ];
      // Total pieces = 3
      // Total cost = 100.00 EGP (10000 piasters)
      // 10000 / 3 = 3333.3333...
      // Expected breakdown: two cells get 33.33, one cell gets 33.34, total = 100.00
      const totalCost = 100.0;
      const result = distributeMatrixCostLargestRemainder(totalCost, matrix);

      expect(result.cellCosts.length).toBe(3);
      const sumTotalCost = Number(result.cellCosts.reduce((sum, c) => sum + c.total_cost, 0).toFixed(2));
      expect(sumTotalCost).toBe(100.0);

      // Check each cell total cost is either 33.33 or 33.34
      const costs = result.cellCosts.map(c => c.total_cost).sort();
      expect(costs).toEqual([33.33, 33.33, 33.34]);
    });

    it('handles single piece accurately', () => {
      const matrix = [
        { id: '1', color: 'أبيض', quantities: { '8XL': 1 } }
      ];
      const totalCost = 150.75;
      const result = distributeMatrixCostLargestRemainder(totalCost, matrix);
      expect(result.cellCosts.length).toBe(1);
      expect(result.cellCosts[0].total_cost).toBe(150.75);
      expect(result.cellCosts[0].unit_cost).toBe(150.75);
    });
  });

  describe('5. Data Migration & Verification', () => {
    it('safely migrates legacy single-color cut orders in db to matrix format while preserving exact piece counts', async () => {
      const legacyOrders = [
        {
          id: 'ord-1',
          cutting_number: 'CUT-001',
          cutting_name: 'تيشرت صيفي',
          color: 'رمادي',
          batch_quantity: 50,
          size_breakdown: { M: 20, L: 20, XL: 10 }
        },
        {
          id: 'ord-2',
          cutting_number: 'CUT-002',
          cutting_name: 'سويت شيرت',
          color: 'زيتي',
          batch_quantity: 30,
          size_breakdown: { '2XL': 15, '7XL': 15 }
        }
      ];

      await db.production_orders.bulkPut(legacyOrders);

      const report = await migrateCutOrdersToMatrix();
      expect(report.success).toBe(true);
      expect(report.totalOrdersFound).toBe(2);
      expect(report.ordersMigrated).toBe(2);

      const updatedOrders = await db.production_orders.toArray();
      const o1 = updatedOrders.find(o => o.id === 'ord-1');
      expect(Array.isArray(o1.matrix)).toBe(true);
      expect(o1.matrix.length).toBe(1);
      expect(o1.matrix[0].color).toBe('رمادي');
      expect(Number(o1.matrix[0].quantities.M)).toBe(20);
      expect(Number(o1.matrix[0].quantities.L)).toBe(20);
      expect(Number(o1.matrix[0].quantities.XL)).toBe(10);
      expect(computeGrandTotal(o1.matrix)).toBe(50);

      const o2 = updatedOrders.find(o => o.id === 'ord-2');
      expect(Array.isArray(o2.matrix)).toBe(true);
      expect(o2.matrix[0].color).toBe('زيتي');
      expect(Number(o2.matrix[0].quantities['2XL'])).toBe(15);
      expect(Number(o2.matrix[0].quantities['7XL'])).toBe(15);
      expect(computeGrandTotal(o2.matrix)).toBe(30);
    });
  });

  describe('6. Manufacturing Repository Stock & Variant Integration', () => {
    it('creates cut order with variant receipt and prevents negative stock on edit', async () => {
      const { manufacturingRepo } = await import('../../data/repositories/manufacturingRepo');

      // 1. Setup raw material & product with variants
      const rawMaterial = {
        id: 'mat-cotton-1',
        name: 'قماش قطن سنجل',
        code: 'FAB-001',
        unit: 'متر',
        cost_price: 100,
        current_stock: 500,
        type: 'raw'
      };
      await db.items.put(rawMaterial);
      await db.materials.put(rawMaterial);

      const targetProduct = {
        id: 'prod-shirt-1',
        name: 'تيشرت صيفي كلاسيك',
        code: 'TSH-001',
        cost_price: 200,
        selling_price: 350,
        current_stock: 0,
        has_variants: 1,
        variants: []
      };
      await db.items.put(targetProduct);
      await db.products.put(targetProduct);

      // 2. Create cut order with 2 colors and sizes including 7XL & 8XL
      const orderData = {
        cutting_number: 'CUT-TEST-100',
        product_id: 'prod-shirt-1',
        materials: [
          { material_id: 'mat-cotton-1', quantity: 50, unit_price: 100 }
        ],
        stages: {
          printing: { pricing_type: 'fixed', fixed_total: 500, vendor_name: 'مطبعة الأهرام' }
        },
        matrix: [
          { id: 'r1', color: 'أحمر', quantities: { M: 10, '7XL': 5 } },
          { id: 'r2', color: 'أسود', quantities: { L: 10, '8XL': 5 } }
        ]
      };

      const created = await manufacturingRepo.createProductionOrder(orderData);
      expect(created.batch_quantity).toBe(30);
      expect(created.matrix.length).toBe(2);

      // Verify product variants were auto-created and received stock
      const prodAfter = await db.items.get('prod-shirt-1');
      expect(prodAfter.variants.length).toBe(4);
      expect(prodAfter.current_stock).toBe(30);

      const red7XL = prodAfter.variants.find(v => v.color === 'أحمر' && v.size === '7XL');
      expect(red7XL).toBeDefined();
      expect(red7XL.current_stock).toBe(5);

      // 3. Simulate sale/consumption of 4 pieces of red 7XL (leaving only 1 piece in stock)
      red7XL.current_stock = 1;
      await db.items.update('prod-shirt-1', { variants: prodAfter.variants });

      // 4. Try to edit order reducing red 7XL from 5 to 2 (diff = -3, but current stock is only 1)
      const editDataBlocked = {
        matrix: [
          { id: 'r1', color: 'أحمر', quantities: { M: 10, '7XL': 2 } }, // wants to reduce by 3 pieces
          { id: 'r2', color: 'أسود', quantities: { L: 10, '8XL': 5 } }
        ]
      };

      await expect(manufacturingRepo.updateProductionOrder(created.id, editDataBlocked))
        .rejects
        .toThrow(/لا يمكن تخفيض كمية المقاس/);

      // 5. Valid edit: reducing red 7XL from 5 to 4 (diff = -1, matches available stock 1)
      const editDataValid = {
        matrix: [
          { id: 'r1', color: 'أحمر', quantities: { M: 10, '7XL': 4 } }, // reduces by 1 piece
          { id: 'r2', color: 'أسود', quantities: { L: 10, '8XL': 5 } }
        ]
      };

      const updated = await manufacturingRepo.updateProductionOrder(created.id, editDataValid);
      expect(updated.batch_quantity).toBe(29);
    });
  });
});
