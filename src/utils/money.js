/**
 * Apex Apparel ERP - Exact Money & Piaster Math Engine
 * 1 Egyptian Pound (ج.م) = 100 Piasters (قرش)
 * Eliminates floating point drift across typing, saving, loading, and display.
 */

/**
 * Normalizes Eastern Arabic-Indic numerals (٠-٩) and decimal separators (٫, ،)
 * to Western numerals (0-9) and standard dot (.).
 */
export function normalizeDigits(input) {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str
    .replace(/[٠۰]/g, '0')
    .replace(/[١۱]/g, '1')
    .replace(/[٢۲]/g, '2')
    .replace(/[٣۳]/g, '3')
    .replace(/[٤۴]/g, '4')
    .replace(/[٥۵]/g, '5')
    .replace(/[٦۶]/g, '6')
    .replace(/[٧۷]/g, '7')
    .replace(/[٨۸]/g, '8')
    .replace(/[٩۹]/g, '9')
    .replace(/[٫،]/g, '.');
}

/**
 * Normalizes a raw user input string for monetary or decimal values.
 * Allows digits, at most one dot, and an optional leading minus sign if allowNegative is true.
 */
export function sanitizeDecimalInput(input, allowNegative = false) {
  const normalized = normalizeDigits(input).trim();
  if (!normalized) return '';

  let isNegative = false;
  let text = normalized;

  if (allowNegative && text.startsWith('-')) {
    isNegative = true;
    text = text.slice(1);
  }

  // Remove any character except digits and dots
  text = text.replace(/[^0-9.]/g, '');

  // Keep only the first dot
  const parts = text.split('.');
  if (parts.length > 2) {
    text = parts[0] + '.' + parts.slice(1).join('');
  }

  return (isNegative ? '-' : '') + text;
}

/**
 * Convert any monetary value (number or string in EGP) into integer piasters.
 * Avoids floating point multiplication inaccuracy by string-based parsing and round-half-up.
 * Examples:
 *   '0.1' -> 10
 *   '0.2' -> 20
 *   '1234.56' -> 123456
 *   '10500.75' -> 1050075
 *   '1000000.99' -> 100000099
 */
export function toPiasters(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 0;
    // Format to 4 decimals first to avoid float binary quirks like 1.0000000000000002
    val = val.toFixed(4);
  }

  const cleaned = sanitizeDecimalInput(val, true);
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;

  const isNeg = cleaned.startsWith('-');
  const unsigned = isNeg ? cleaned.slice(1) : cleaned;

  const [wholeStr = '0', fracStr = ''] = unsigned.split('.');
  const whole = parseInt(wholeStr || '0', 10);
  if (isNaN(whole)) return 0;

  // Take up to 3 fractional digits for half-up rounding to 2 digits
  const paddedFrac = (fracStr + '000').slice(0, 3);
  const centsTwoDigits = parseInt(paddedFrac.slice(0, 2), 10);
  const thirdDigit = parseInt(paddedFrac[2], 10);

  let piasters = whole * 100 + centsTwoDigits;
  if (thirdDigit >= 5) {
    piasters += 1;
  }

  return isNeg ? -piasters : piasters;
}

/**
 * Convert integer piasters back to EGP float/number.
 */
export function fromPiasters(piasters) {
  const p = Math.round(Number(piasters) || 0);
  return Number((p / 100).toFixed(2));
}

/**
 * Round half-up to specified decimals (default 2).
 */
export function roundHalfUp(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return 0;
  const n = Number(num);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const rounded = Number(Math.round(Number(abs + 'e' + decimals)) + 'e-' + decimals);
  return sign * rounded;
}

/**
 * Format money in EGP with thousands separator and two decimal places.
 * @param {number|string|null|undefined} amount
 * @param {string|boolean} [currency='ج.م']
 * @returns {string}
 */
export function formatMoney(amount, currency = 'ج.م') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return currency ? `0.00 ${currency}`.trim() : '0.00';
  }
  const piasters = toPiasters(amount);
  const isNeg = piasters < 0;
  const absPiasters = Math.abs(piasters);
  const whole = Math.floor(absPiasters / 100);
  const cents = String(absPiasters % 100).padStart(2, '0');
  const formattedWhole = whole.toLocaleString('en-US');
  const numStr = `${formattedWhole}.${cents}`;
  const res = currency ? `${numStr} ${currency}`.trim() : numStr;
  return isNeg ? `-${res}` : res;
}

/**
 * Format number with thousands separator and specified decimals.
 */
export function formatExactNumber(amount, decimals = 2) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0.00';
  const num = Number(amount);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Sum multiple amounts exactly in piasters and return EGP number.
 */
export function sumExact(...amounts) {
  let totalPiasters = 0;
  for (const amt of amounts) {
    totalPiasters += toPiasters(amt);
  }
  return fromPiasters(totalPiasters);
}

/**
 * Subtract b from a exactly in piasters and return EGP number.
 */
export function subtractExact(a, b) {
  return fromPiasters(toPiasters(a) - toPiasters(b));
}

/**
 * Multiply an amount by a factor (e.g. quantity or percentage) and round half-up.
 */
export function multiplyExact(amount, factor) {
  const piasters = toPiasters(amount);
  const numFactor = Number(factor) || 0;
  const resultPiasters = Math.round(piasters * numFactor);
  return fromPiasters(resultPiasters);
}

/**
 * Compute available credit: credit_limit - current_balance in integer piasters.
 * If creditLimit is <= 0 (unlimited), returns unlimited indicator.
 */
export function computeAvailableCredit(creditLimit, currentBalance) {
  const limitPiasters = toPiasters(creditLimit);
  if (limitPiasters <= 0) {
    return {
      hasLimit: false,
      isUnlimited: true,
      availablePiasters: null,
      availableEGP: Infinity,
      isExceeded: false,
      exceededPiasters: 0,
      exceededEGP: 0,
      excessEGP: 0
    };
  }

  const balancePiasters = toPiasters(currentBalance);
  const diffPiasters = limitPiasters - balancePiasters;
  const isExceeded = diffPiasters < 0;
  const exceededPiasters = isExceeded ? Math.abs(diffPiasters) : 0;
  const exceededEGP = fromPiasters(exceededPiasters);
  const availablePiasters = Math.max(0, diffPiasters);
  const availableEGP = fromPiasters(availablePiasters);

  return {
    hasLimit: true,
    isUnlimited: false,
    availablePiasters,
    availableEGP,
    isExceeded,
    exceededPiasters,
    exceededEGP,
    excessEGP: exceededEGP
  };
}

/**
 * Distribute total cost (in piasters) across items/sizes using the Largest Remainder Method
 * (Hare-Niemeyer / Hamilton method).
 * Guarantees that the sum of distributed costs reconciles EXACTLY to total cost to the piaster.
 *
 * @param {number|string} totalAmount - Total cost in EGP or piasters
 * @param {Array<{ key?: string, count?: number, [key: string]: any }> | Record<string, number>} items - Array of items or size map
 * @returns {any}
 */
export function distributeCostLargestRemainder(totalAmount, items) {
  const isObjectMap = !Array.isArray(items) && typeof items === 'object' && items !== null;
  const totalPiasters = toPiasters(totalAmount);

  let itemList = [];
  if (isObjectMap) {
    itemList = Object.entries(items).map(([key, count]) => ({
      key,
      count: Number(count) || 0
    }));
  } else if (Array.isArray(items)) {
    itemList = items.map(it => {
      if (typeof it === 'number') {
        return { count: it };
      }
      return {
        ...it,
        count: Number(it.count ?? it.quantity ?? it.qty ?? 0)
      };
    });
  } else {
    return isObjectMap ? {} : [];
  }

  const totalPieces = itemList.reduce((sum, it) => sum + (it.count || 0), 0);

  if (totalPieces <= 0 || totalPiasters === 0) {
    if (isObjectMap) {
      const res = {};
      for (const it of itemList) res[it.key] = 0;
      return res;
    }
    return itemList.map(it => ({ ...it, piasters: 0, totalCost: 0, unitCost: 0 }));
  }

  // Exact fractional share of piasters per item
  const shares = itemList.map((it, idx) => {
    const count = it.count || 0;
    if (count <= 0) {
      return { idx, item: it, basePiasters: 0, remainder: 0 };
    }
    const exactPiasters = (totalPiasters * count) / totalPieces;
    const basePiasters = Math.floor(exactPiasters);
    const remainder = exactPiasters - basePiasters;
    return { idx, item: it, basePiasters, remainder };
  });

  const sumBase = shares.reduce((s, sh) => s + sh.basePiasters, 0);
  let piastersLeft = totalPiasters - sumBase;

  // Sort by remainder descending to give 1 extra piaster to the highest fractions
  const sortedIndices = [...shares]
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < piastersLeft && i < sortedIndices.length; i++) {
    const targetIdx = sortedIndices[i].idx;
    shares[targetIdx].basePiasters += 1;
  }

  if (isObjectMap) {
    const resultObj = {};
    for (const sh of shares) {
      resultObj[sh.item.key] = sh.basePiasters;
    }
    return resultObj;
  }

  return shares.map(sh => {
    const costEGP = fromPiasters(sh.basePiasters);
    const count = sh.item.count || 0;
    const unitCost = count > 0 ? Number((costEGP / count).toFixed(4)) : 0;
    return {
      ...sh.item,
      piasters: sh.basePiasters,
      totalCost: costEGP,
      unitCost
    };
  });
}
