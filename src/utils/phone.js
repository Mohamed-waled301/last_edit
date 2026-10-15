/**
 * Shared Egyptian mobile phone helpers for code systems ERP.
 *
 * Rules:
 * - Digits only, starts with 01, exactly 11 digits (no more, no less): /^01\d{9}$/
 * - Converts Arabic-Indic numerals (٠-٩) to Western (0-9).
 * - Strips spaces, dashes, parentheses, '+', and blocks any non-digit character as typed.
 * - Error message: "رقم الهاتف يجب أن يبدأ بـ 01 ويتكون من 11 رقماً".
 * - Untouched "01" default is treated as empty for optional fields.
 * - For WhatsApp, valid 01xxxxxxxxx becomes 201xxxxxxxxx (e.g. 01012345678 -> 201012345678).
 */

export const DEFAULT_PHONE_VALUE = '01';
export const EGYPT_MOBILE_LENGTH = 11;
export const PHONE_ERROR_MESSAGE = 'رقم الهاتف يجب أن يبدأ بـ 01 ويتكون من 11 رقماً';

// Starts with 01, followed by exactly 9 digits (total 11 digits)
export const EGYPT_MOBILE_REGEX = /^01\d{9}$/;

/**
 * Extract raw digits, converting Arabic-Indic numerals and normalizing international prefix.
 */
export function getRawPhoneDigits(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Convert Arabic-Indic digits (٠-٩)
  str = str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  // Strip spaces, dashes, '+', and all other non-numeric characters
  str = str.replace(/[^0-9]/g, '');
  // Normalize international prefixes (00201... or 201...) to 01...
  if (str.startsWith('00201') && str.length >= 13) {
    str = str.slice(4);
  } else if (str.startsWith('201') && str.length >= 12) {
    str = '0' + str.slice(2);
  }
  return str;
}

/**
 * Convert Arabic-Indic digits to Western digits, strip all non-digits, cap at 11 digits for input typing.
 */
export function sanitizeEgyptianPhoneInput(value) {
  const raw = getRawPhoneDigits(value);
  return raw.slice(0, EGYPT_MOBILE_LENGTH);
}

/** True when the field still holds only the untouched "01" prefix (or empty). */
export function isUntouchedPhoneDefault(value) {
  const digits = sanitizeEgyptianPhoneInput(value);
  return digits === '' || digits === '0' || digits === DEFAULT_PHONE_VALUE;
}

/** Strict check for a valid Egyptian mobile number: starts with 01 and exactly 11 digits (no more, no less). */
export function isValidEgyptianMobile(value) {
  const raw = getRawPhoneDigits(value);
  return raw.length === EGYPT_MOBILE_LENGTH && raw.startsWith('01');
}

/**
 * onChange handler factory for Egyptian phone inputs.
 * Sanitizes digits, converts Arabic-Indic numerals, maintains 11-digit cap.
 */
export function handleEgyptianPhoneChange(event, setValue) {
  const raw = event?.target?.value ?? String(event ?? '');
  const digits = sanitizeEgyptianPhoneInput(raw);
  const next = digits === '' ? DEFAULT_PHONE_VALUE : digits;
  if (typeof setValue === 'function') {
    setValue(next);
  }
  return next;
}

/**
 * Normalize a phone value for persistence.
 * Untouched "01" prefix is stored as "" (no dummy numbers in the DB).
 * Existing stored numbers are preserved as-is.
 */
export function normalizePhoneForSave(value) {
  if (isUntouchedPhoneDefault(value)) return '';
  return sanitizeEgyptianPhoneInput(value);
}

/**
 * Validate an Egyptian phone field.
 * - If empty / untouched and not required -> null (passes).
 * - If required and empty / untouched -> "رقم الهاتف مطلوب".
 * - If filled and does not start with 01 or not 11 digits -> PHONE_ERROR_MESSAGE.
 * Returns Arabic error string or null.
 */
export function validateEgyptianMobile(value, { required = false, label = 'رقم الهاتف' } = {}) {
  const digits = sanitizeEgyptianPhoneInput(value);
  if (digits === '' || digits === '0' || digits === DEFAULT_PHONE_VALUE) {
    return required ? `${label} مطلوب` : null;
  }
  if (!isValidEgyptianMobile(digits)) {
    return PHONE_ERROR_MESSAGE;
  }
  return null;
}

/**
 * Shared validator function for general use.
 */
export function validatePhone(value, isRequired = false) {
  return validateEgyptianMobile(value, { required: isRequired });
}

/**
 * Normalize number for WhatsApp link:
 * - Valid Egyptian mobile (starts with 01, 11 digits) becomes 201xxxxxxxxx for wa.me.
 * Returns clean digits string or null if invalid.
 */
export function normalizePhoneForWhatsApp(phone) {
  if (!phone) return null;
  const digits = sanitizeEgyptianPhoneInput(phone);
  if (isValidEgyptianMobile(digits)) {
    // 01xxxxxxxxx -> 201xxxxxxxxx
    return '2' + digits;
  }
  return null;
}

/** Check if phone is valid for launching WhatsApp */
export function isValidPhoneForWhatsApp(phone) {
  return Boolean(normalizePhoneForWhatsApp(phone));
}

/**
 * Open WhatsApp chat with contact:
 * Supports optional prefilled message.
 * In Electron, routes via IPC shell.openExternal (restricted to wa.me links).
 * In Browser, opens new window.
 */
export function openWhatsAppChat(phone, message = '') {
  const normalized = normalizePhoneForWhatsApp(phone);
  if (!normalized) {
    alert(PHONE_ERROR_MESSAGE);
    return false;
  }

  let url = `https://wa.me/${normalized}`;
  if (message && typeof message === 'string' && message.trim()) {
    url += `?text=${encodeURIComponent(message.trim())}`;
  }

  if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(url);
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}

export default {
  DEFAULT_PHONE_VALUE,
  EGYPT_MOBILE_LENGTH,
  PHONE_ERROR_MESSAGE,
  EGYPT_MOBILE_REGEX,
  sanitizeEgyptianPhoneInput,
  isUntouchedPhoneDefault,
  isValidEgyptianMobile,
  handleEgyptianPhoneChange,
  normalizePhoneForSave,
  validateEgyptianMobile,
  validatePhone,
  normalizePhoneForWhatsApp,
  isValidPhoneForWhatsApp,
  openWhatsAppChat,
};
