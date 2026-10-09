/**
 * Shared Egyptian mobile phone helpers (أرقام الموبايل المصرية).
 *
 * Rules:
 * - Egyptian mobiles are 11 digits, start with "01", second prefix one of 010/011/012/015.
 * - New forms default the input value to "01" (prefix only, NOT a dummy full number).
 * - A value of "" / "0" / "01" is treated as "untouched / empty" (optional field).
 */

export const DEFAULT_PHONE_VALUE = '01';
export const EGYPT_MOBILE_LENGTH = 11;
export const EGYPT_MOBILE_PREFIXES = ['010', '011', '012', '015'];
export const EGYPT_MOBILE_REGEX = /^01[0125]\d{8}$/;

/** Keep digits only, cap at 11 chars. */
export function sanitizeEgyptianPhoneInput(value) {
  return String(value ?? '').replace(/[^0-9]/g, '').slice(0, EGYPT_MOBILE_LENGTH);
}

/** True when the field still holds only the untouched "01" prefix (or empty). */
export function isUntouchedPhoneDefault(value) {
  const digits = sanitizeEgyptianPhoneInput(value);
  return digits === '' || digits === '0' || digits === DEFAULT_PHONE_VALUE;
}

/** Strict check for a complete Egyptian mobile number. */
export function isValidEgyptianMobile(value) {
  return EGYPT_MOBILE_REGEX.test(sanitizeEgyptianPhoneInput(value));
}

/**
 * onChange handler factory for Egyptian phone inputs.
 * Keeps digits only (max 11). Never clears the "01" prefix to empty while typing:
 * deleting everything resets back to "01".
 */
export function handleEgyptianPhoneChange(event, setValue) {
  const digits = sanitizeEgyptianPhoneInput(event?.target?.value ?? '');
  const next = digits === '' ? DEFAULT_PHONE_VALUE : digits;
  if (typeof setValue === 'function') {
    setValue(next);
    return next;
  }
  return next;
}

/**
 * Normalize a phone value for persistence.
 * Untouched "01" prefix is stored as "" (no dummy numbers in the DB).
 */
export function normalizePhoneForSave(value) {
  if (isUntouchedPhoneDefault(value)) return '';
  return sanitizeEgyptianPhoneInput(value);
}

/**
 * Validate an Egyptian phone field.
 * - Optional by default: "" / "01" passes when not required.
 * - Otherwise must match 010/011/012/015 + 11 digits.
 * Returns an Arabic error message or null.
 */
export function validateEgyptianMobile(value, { required = false, label = 'رقم الهاتف' } = {}) {
  const digits = sanitizeEgyptianPhoneInput(value);
  if (digits === '' || digits === '0' || digits === DEFAULT_PHONE_VALUE) {
    return required ? `${label} مطلوب (أكمل رقم موبايل مصري يبدأ بـ 01)` : null;
  }
  if (!isValidEgyptianMobile(digits)) {
    return `${label} يجب أن يكون رقم موبايل مصري صحيح (010 أو 011 أو 012 أو 015) ومكوّن من 11 رقماً`;
  }
  return null;
}

export default {
  DEFAULT_PHONE_VALUE,
  EGYPT_MOBILE_LENGTH,
  EGYPT_MOBILE_PREFIXES,
  EGYPT_MOBILE_REGEX,
  sanitizeEgyptianPhoneInput,
  isUntouchedPhoneDefault,
  isValidEgyptianMobile,
  handleEgyptianPhoneChange,
  normalizePhoneForSave,
  validateEgyptianMobile,
};
