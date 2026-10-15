/**
 * Professional number and currency formatters using Western digits (0-9)
 * with Egyptian Pound symbol (ج.م) and date validation helpers.
 */

export function formatCurrency(amount, currency = 'ج.م') {
  if (amount === undefined || amount === null || isNaN(amount)) return `0.00 ${currency}`;
  const num = Number(amount);
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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
 * Timezone and Daylight Saving safe date arithmetic using local date components.
 * Given a YYYY-MM-DD string and number of days to add, returns new YYYY-MM-DD string.
 */
export function addDaysToDateString(dateStr, days = 0) {
  if (!dateStr) return '';
  try {
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length < 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // 0-indexed month
    const d = parseInt(parts[2], 10);
    const date = new Date(y, m, d + Number(days || 0));
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    const newD = String(date.getDate()).padStart(2, '0');
    return `${newY}-${newM}-${newD}`;
  } catch {
    return dateStr;
  }
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

