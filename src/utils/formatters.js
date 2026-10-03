/**
 * Professional number and currency formatters using Western digits (0-9)
 * with Egyptian Pound symbol (ج.م) and date validation helpers.
 */

export function formatCurrency(amount, currency = 'ج.م') {
  if (amount === undefined || amount === null || isNaN(amount)) return `0 ${currency}`;
  const num = Number(amount);
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNumber(num, decimals = 2) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  const val = Number(num);
  return val.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return dateStr;
  }
}

/**
 * Returns current local date in YYYY-MM-DD format
 */
export function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether a given YYYY-MM-DD or ISO date is in the past
 */
export function isPastDate(dateStr) {
  if (!dateStr) return false;
  const today = getTodayDateString();
  const target = String(dateStr).split('T')[0];
  return target < today;
}

/**
 * Throws a user-friendly error if date is in the past.
 * Enforces the strict business rule: "It is forbidden to approve a past date at any part of the system".
 */
export function validateNotPastDate(dateStr, fieldLabel = 'التاريخ') {
  if (isPastDate(dateStr)) {
    throw new Error(`ممنوع اعتماد تاريخ في الماضي لـ (${fieldLabel})؛ يرجى اختيار تاريخ اليوم أو تاريخ قادم.`);
  }
}
