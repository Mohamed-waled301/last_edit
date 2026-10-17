/**
 * Cut Order Matrix Data Migration
 * Migrates legacy single-color cut orders with size grids to the color-by-size matrix format.
 * Guarantees zero data loss, exact piece total verification, and safe rollback on mismatch.
 */

import db from '../data/db';
import { CUT_ORDER_SIZES, MatrixRow, computeGrandTotal } from './cutOrderMatrixCalculations';

export interface MigrationVerificationReport {
  success: boolean;
  totalOrdersFound: number;
  ordersMigrated: number;
  ordersAlreadyMigrated: number;
  ordersSkipped: Array<{ id: string; reason: string }>;
  verifiedOrders: Array<{
    id: string;
    cutting_number: string;
    piecesBefore: number;
    piecesAfter: number;
    matched: boolean;
  }>;
  errorMessage?: string;
}

/**
 * Runs the cut order matrix migration on the current IndexedDB database.
 */
export async function migrateCutOrdersToMatrix(): Promise<MigrationVerificationReport> {
  const report: MigrationVerificationReport = {
    success: false,
    totalOrdersFound: 0,
    ordersMigrated: 0,
    ordersAlreadyMigrated: 0,
    ordersSkipped: [],
    verifiedOrders: []
  };

  if (!db.isOpen()) {
    await db.open();
  }

  // Ensure cutting tables exist
  if (!db.production_orders) {
    report.success = true;
    report.ordersSkipped.push({ id: 'none', reason: 'جدول أوامر القص غير مفعل في هذه النسخة' });
    return report;
  }

  const allOrders = await db.production_orders.toArray();
  report.totalOrdersFound = allOrders.length;

  if (allOrders.length === 0) {
    report.success = true;
    return report;
  }

  // Ensure default colors exist
  const existingColors = await db.item_colors.toArray();
  const colorNames = new Set(existingColors.map((c: any) => (c.name || '').trim()));

  const ordersToUpdate: Array<{ order: any; newMatrix: MatrixRow[]; piecesBefore: number; piecesAfter: number }> = [];

  for (const order of allOrders) {
    // Check if already has valid matrix
    if (Array.isArray(order.matrix) && order.matrix.length > 0) {
      report.ordersAlreadyMigrated++;
      continue;
    }

    // Determine legacy pieces total before migration
    const piecesBefore = Number(order.batch_quantity || 0);

    // Determine legacy quantities per size
    let sizesMap: Record<string, any> = {};
    const rawSizes = order.size_breakdown || order.size_quantities || order.quantity_per_size || order.sizes;
    if (rawSizes) {
      if (typeof rawSizes === 'string') {
        try {
          sizesMap = JSON.parse(rawSizes);
        } catch (e) {
          sizesMap = {};
        }
      } else if (typeof rawSizes === 'object') {
        sizesMap = rawSizes;
      }
    }

    // Determine row color: legacy order.color or 'غير محدد'
    const legacyColor = (order.color || '').trim();
    const colorName = legacyColor || 'غير محدد';

    // Auto-create color in master data if missing
    if (!colorNames.has(colorName)) {
      const newClr = {
        id: `clr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: colorName,
        hex_code: '#4A5568',
        is_active: 1
      };
      await db.item_colors.add(newClr);
      colorNames.add(colorName);
    }

    // Build the matrix quantities row
    const rowQuantities: Record<string, number> = {};
    let calculatedSum = 0;
    for (const size of CUT_ORDER_SIZES) {
      const q = Math.floor(Number(sizesMap[size]) || 0);
      rowQuantities[size] = q;
      calculatedSum += q;
    }

    // If no size distribution existed but batch_quantity > 0, put it in 'M' or first size
    if (calculatedSum === 0 && piecesBefore > 0) {
      rowQuantities['M'] = piecesBefore;
      calculatedSum = piecesBefore;
    }

    const newMatrix: MatrixRow[] = [
      {
        id: `row-migrated-${order.id}`,
        color: colorName,
        quantities: rowQuantities
      }
    ];

    const piecesAfter = computeGrandTotal(newMatrix);

    // Verify exact match
    const expected = piecesBefore > 0 ? piecesBefore : calculatedSum;
    if (piecesAfter !== expected) {
      const err = `فشل التحقق من مطابقة عدد القطع لأمر القص [${order.cutting_number || order.id}]: قبل الهجرة (${expected}) وبعد الهجرة (${piecesAfter})`;
      report.errorMessage = err;
      report.success = false;
      return report;
    }

    report.verifiedOrders.push({
      id: order.id,
      cutting_number: order.cutting_number || order.order_number || order.id,
      piecesBefore: expected,
      piecesAfter,
      matched: true
    });

    ordersToUpdate.push({
      order,
      newMatrix,
      piecesBefore: expected,
      piecesAfter
    });
  }

  // Commit updates within transaction
  await db.transaction('rw', db.production_orders, async () => {
    for (const item of ordersToUpdate) {
      await db.production_orders.update(item.order.id, {
        matrix: item.newMatrix,
        // Retain legacy fields for safety and audit
        legacy_color: item.order.color || '',
        legacy_size_quantities: item.order.size_quantities || null
      });
      report.ordersMigrated++;
    }
  });

  report.success = true;
  return report;
}
