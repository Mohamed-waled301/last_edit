/**
 * Apex Apparel ERP - Purchase Order Totals & Net Calculation Engine
 * Required Formula: Final net = items subtotal - discount value - additional expenses.
 * (Expenses are subtracted from the subtotal along with discounts).
 * Final net MUST NEVER go below 0.
 */

export interface PurchaseOrderTotalsInput {
  subtotal: number | string;
  discountPercent?: number | string;
  discountValue?: number | string;
  additionalExpenses?: number | string;
  discount_percent?: number | string;
  discount_value?: number | string;
  discount_amount?: number | string;
  additional_expenses?: number | string;
}

export interface PurchaseOrderTotalsOutput {
  subtotal: number;
  discountPercent: number;
  discountValue: number;
  additionalExpenses: number;
  rawNet: number;
  finalNet: number;
  isValid: boolean;
  errorMessage: string | null;
}

/**
 * Calculates purchase order totals and final net.
 * - Handles discount by percentage or discount by value
 * - Subtracts additional expenses from items subtotal
 * - Ensures final net never goes below 0
 */
export function calculatePurchaseOrderTotals(input: PurchaseOrderTotalsInput): PurchaseOrderTotalsOutput {
  const subtotal = Math.max(0, Number(input.subtotal) || 0);

  const rawExpenses = input.additionalExpenses ?? input.additional_expenses;
  const additionalExpenses = Math.max(0, Number(rawExpenses) || 0);

  const rawDiscountVal = input.discountValue ?? input.discount_value ?? input.discount_amount;
  const rawDiscountPct = input.discountPercent ?? input.discount_percent;

  let discountPercent = 0;
  let discountValue = 0;

  if (rawDiscountVal !== undefined && rawDiscountVal !== null && rawDiscountVal !== '') {
    discountValue = Math.max(0, Number(rawDiscountVal) || 0);
    discountPercent = subtotal > 0 ? Number(((discountValue / subtotal) * 100).toFixed(2)) : 0;
  } else if (rawDiscountPct !== undefined && rawDiscountPct !== null && rawDiscountPct !== '') {
    discountPercent = Math.max(0, Number(rawDiscountPct) || 0);
    discountValue = Number(((subtotal * discountPercent) / 100).toFixed(2));
  }

  // Required Formula: Final net = (items subtotal - discount value) + additional expenses.
  const discountedSubtotal = subtotal - discountValue;
  const rawNet = Number((discountedSubtotal + additionalExpenses).toFixed(2));
  const isValid = rawNet >= 0 && discountedSubtotal >= 0;
  const finalNet = Math.max(0, rawNet);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discountPercent,
    discountValue,
    additionalExpenses,
    rawNet,
    finalNet,
    isValid,
    errorMessage: isValid ? '' : 'الصافي النهائي لا يمكن أن يكون أقل من صفر أو الخصم أكبر من الإجمالي'
  };
}

