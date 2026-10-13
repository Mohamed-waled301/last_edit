/**
 * Production Order Cost Calculations (Requirement C)
 * Pure functions for calculating raw material costs, additional costs,
 * total product cost, and guarded unit cost.
 */

export interface ProductionMaterialLine {
  material_id?: string;
  quantity?: number | string;
  unit_price?: number | string;
}

export interface ProductionAdditionalCost {
  name?: string;
  amount?: number | string;
}

/**
 * Line cost = quantity * unit_price
 */
export function calculateMaterialLineCost(
  quantity: number | string | undefined | null,
  unitPrice: number | string | undefined | null
): number {
  const qty = Math.max(0, Number(quantity) || 0);
  const price = Math.max(0, Number(unitPrice) || 0);
  return Number((qty * price).toFixed(2));
}

/**
 * Total materials cost = sum of all material lines cost
 */
export function calculateTotalMaterialsCost(
  lines: ProductionMaterialLine[] | undefined | null
): number {
  if (!Array.isArray(lines)) return 0;
  const total = lines.reduce((acc, line) => {
    return acc + calculateMaterialLineCost(line.quantity, line.unit_price);
  }, 0);
  return Number(total.toFixed(2));
}

/**
 * Total additional costs = sum of all additional cost rows
 */
export function calculateTotalAdditionalCosts(
  additionalCosts: ProductionAdditionalCost[] | undefined | null
): number {
  if (!Array.isArray(additionalCosts)) return 0;
  const total = additionalCosts.reduce((acc, row) => {
    const amount = Math.max(0, Number(row?.amount) || 0);
    return acc + amount;
  }, 0);
  return Number(total.toFixed(2));
}

/**
 * Total product cost = total materials cost + additional costs
 */
export function calculateTotalProductCost(
  totalMaterialsCost: number | string | undefined | null,
  totalAdditionalCosts: number | string | undefined | null
): number {
  const materials = Math.max(0, Number(totalMaterialsCost) || 0);
  const additional = Math.max(0, Number(totalAdditionalCosts) || 0);
  return Number((materials + additional).toFixed(2));
}

/**
 * Cost per unit = total product cost / produced quantity
 * Guarded against division by zero.
 */
export function calculateUnitCost(
  totalProductCost: number | string | undefined | null,
  producedQuantity: number | string | undefined | null
): number {
  const total = Math.max(0, Number(totalProductCost) || 0);
  const qty = Number(producedQuantity) || 0;
  if (qty <= 0) return 0;
  return Number((total / qty).toFixed(2));
}

export default {
  calculateMaterialLineCost,
  calculateTotalMaterialsCost,
  calculateTotalAdditionalCosts,
  calculateTotalProductCost,
  calculateUnitCost
};
