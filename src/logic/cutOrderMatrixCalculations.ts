/**
 * Cut Order Matrix Calculations & Validation
 * Handles 10 standard sizes: M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL, 7XL, 8XL
 * Supports color-by-size quantity matrix with largest remainder cost distribution.
 */

import { toPiasters, fromPiasters, distributeCostLargestRemainder } from '../utils/money';

export const CUT_ORDER_SIZES = [
  'M',
  'L',
  'XL',
  '2XL',
  '3XL',
  '4XL',
  '5XL',
  '6XL',
  '7XL',
  '8XL'
] as const;

export type CutOrderSize = typeof CUT_ORDER_SIZES[number];

export interface MatrixRow {
  id: string;
  color: string;
  quantities: Record<string, number | string>;
}

export interface MatrixCellCost {
  color: string;
  size: string;
  quantity: number;
  total_cost: number;
  unit_cost: number;
}

/**
 * Creates a new blank matrix row.
 */
export function createBlankMatrixRow(color: string = ''): MatrixRow {
  const quantities: Record<string, string> = {};
  for (const size of CUT_ORDER_SIZES) {
    quantities[size] = '';
  }
  return {
    id: `row-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    color,
    quantities
  };
}

/**
 * Computes total pieces for a single row.
 */
export function computeRowTotal(row: MatrixRow): number {
  if (!row || !row.quantities) return 0;
  let sum = 0;
  for (const size of CUT_ORDER_SIZES) {
    const val = Number(row.quantities[size]);
    if (!isNaN(val) && val > 0) {
      sum += Math.floor(val);
    }
  }
  return sum;
}

/**
 * Computes column totals (pieces per size) across all rows.
 */
export function computeColumnTotals(rows: MatrixRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const size of CUT_ORDER_SIZES) {
    totals[size] = 0;
  }
  if (!Array.isArray(rows)) return totals;

  for (const row of rows) {
    if (!row || !row.quantities) continue;
    for (const size of CUT_ORDER_SIZES) {
      const val = Number(row.quantities[size]);
      if (!isNaN(val) && val > 0) {
        totals[size] += Math.floor(val);
      }
    }
  }
  return totals;
}

/**
 * Computes grand total pieces of the whole matrix.
 */
export function computeGrandTotal(rows: MatrixRow[]): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, r) => sum + computeRowTotal(r), 0);
}

/**
 * Validates the matrix according to business rules:
 * - At least one cell > 0.
 * - Any row with quantities > 0 must have a color chosen.
 * - Duplicate colors across rows are rejected.
 * - Empty rows (no color and 0 quantities) can be skipped/cleaned.
 */
export interface MatrixValidationResult {
  valid: boolean;
  error?: string;
  duplicateColor?: string;
  duplicateRowIndex?: number;
  cleanRows: MatrixRow[];
  grandTotal: number;
}

export function validateAndCleanMatrix(rows: MatrixRow[]): MatrixValidationResult {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      valid: false,
      error: 'يرجى إدخال مصفوفة المقاسات والألوان وتحديد كمية واحدة على الأقل أكبر من الصفر',
      cleanRows: [],
      grandTotal: 0
    };
  }

  const cleanRows: MatrixRow[] = [];
  const seenColors = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const color = (r.color || '').trim();
    const rowTotal = computeRowTotal(r);

    // Empty row: ignore when saving
    if (!color && rowTotal === 0) {
      continue;
    }

    // Row has quantities but no color
    if (!color && rowTotal > 0) {
      return {
        valid: false,
        error: 'برجاء اختيار اللون لجميع صفوف الكميات المدخلة',
        cleanRows: [],
        grandTotal: 0
      };
    }

    // Duplicate color check
    if (seenColors.has(color)) {
      return {
        valid: false,
        error: 'هذا اللون مضاف بالفعل',
        duplicateColor: color,
        duplicateRowIndex: seenColors.get(color),
        cleanRows: [],
        grandTotal: 0
      };
    }

    seenColors.set(color, cleanRows.length);
    cleanRows.push({
      id: r.id || `row-${i}`,
      color,
      quantities: { ...r.quantities }
    });
  }

  const grandTotal = computeGrandTotal(cleanRows);
  if (cleanRows.length === 0 || grandTotal <= 0) {
    return {
      valid: false,
      error: 'يجب أن تحتوي مصفوفة المقاسات والألوان على كمية واحدة على الأقل أكبر من الصفر',
      cleanRows: [],
      grandTotal: 0
    };
  }

  return {
    valid: true,
    cleanRows,
    grandTotal
  };
}

/**
 * Distributes total cut cost across all matrix cells using the Largest Remainder Method.
 * Guarantees that the sum of distributed cell costs equals the total cut cost to the exact piaster.
 */
export function distributeMatrixCostLargestRemainder(
  totalCutCost: number,
  rows: MatrixRow[]
): {
  unitCostExact: number;
  unitCost4Decimals: number;
  cellCosts: MatrixCellCost[];
  sizeSummaries: Record<string, { quantity: number; total_cost: number }>;
  colorSummaries: Record<string, { quantity: number; total_cost: number }>;
} {
  const grandTotal = computeGrandTotal(rows);
  if (grandTotal <= 0 || totalCutCost <= 0) {
    return {
      unitCostExact: 0,
      unitCost4Decimals: 0,
      cellCosts: [],
      sizeSummaries: {},
      colorSummaries: {}
    };
  }

  const unitCostExact = totalCutCost / grandTotal;
  const unitCost4Decimals = Number(unitCostExact.toFixed(4));

  // Build cell weights
  const cellWeights: Record<string, number> = {};
  const cellMeta: Record<string, { color: string; size: string; quantity: number }> = {};

  for (const row of rows) {
    const color = (row.color || '').trim();
    if (!color) continue;
    for (const size of CUT_ORDER_SIZES) {
      const q = Math.floor(Number(row.quantities[size]) || 0);
      if (q > 0) {
        const key = `${color}:::${size}`;
        cellWeights[key] = q;
        cellMeta[key] = { color, size, quantity: q };
      }
    }
  }

  const distributedPiasters = distributeCostLargestRemainder(totalCutCost, cellWeights);

  const cellCosts: MatrixCellCost[] = [];
  const sizeSummaries: Record<string, { quantity: number; total_cost: number }> = {};
  const colorSummaries: Record<string, { quantity: number; total_cost: number }> = {};

  for (const [key, pVal] of Object.entries(distributedPiasters)) {
    const meta = cellMeta[key];
    if (!meta) continue;
    const costEGP = fromPiasters(pVal);
    const unitCost = Number((costEGP / meta.quantity).toFixed(4));

    cellCosts.push({
      color: meta.color,
      size: meta.size,
      quantity: meta.quantity,
      total_cost: costEGP,
      unit_cost: unitCost
    });

    // Accumulate size summary
    if (!sizeSummaries[meta.size]) {
      sizeSummaries[meta.size] = { quantity: 0, total_cost: 0 };
    }
    sizeSummaries[meta.size].quantity += meta.quantity;
    sizeSummaries[meta.size].total_cost = Number((sizeSummaries[meta.size].total_cost + costEGP).toFixed(2));

    // Accumulate color summary
    if (!colorSummaries[meta.color]) {
      colorSummaries[meta.color] = { quantity: 0, total_cost: 0 };
    }
    colorSummaries[meta.color].quantity += meta.quantity;
    colorSummaries[meta.color].total_cost = Number((colorSummaries[meta.color].total_cost + costEGP).toFixed(2));
  }

  return {
    unitCostExact,
    unitCost4Decimals,
    cellCosts,
    sizeSummaries,
    colorSummaries
  };
}
