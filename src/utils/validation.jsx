import React from 'react';

/**
 * Form Validation Utility with Arabic Error Messages
 * Supports required fields, positive numbers, non-negative numbers, unique codes, and date validations.
 */

export const Validators = {
  required(value, fieldLabel = 'هذا الحقل') {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return `${fieldLabel} مطلوب ولا يمكن تركه فارغاً`;
    }
    return null;
  },

  positiveNumber(value, fieldLabel = 'القيمة') {
    if (value === null || value === undefined || value === '') {
      return `${fieldLabel} مطلوبة`;
    }
    const num = Number(value);
    if (isNaN(num) || num <= 0) {
      return `${fieldLabel} يجب أن تكون رقماً أكبر من صفر`;
    }
    return null;
  },

  nonNegativeNumber(value, fieldLabel = 'القيمة') {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      return `${fieldLabel} لا يمكن أن تكون سالبة`;
    }
    return null;
  },

  minQuantity(value, minQty = 1, fieldLabel = 'الكمية') {
    const num = Number(value) || 0;
    if (num < minQty) {
      return `${fieldLabel} أقل من الحد الأدنى المسموح به (${minQty})`;
    }
    return null;
  },

  uniqueCode(code, existingCodes = [], currentId = null, currentItemCode = null) {
    if (!code || !code.trim()) return 'الكود مطلوب';
    const trimmed = code.trim().toLowerCase();
    const isDuplicate = existingCodes.some(item => {
      if (typeof item === 'string') {
        return item.toLowerCase() === trimmed && item.toLowerCase() !== (currentItemCode || '').toLowerCase();
      }
      if (item && item.code) {
        if (currentId && item.id === currentId) return false;
        return item.code.toLowerCase() === trimmed;
      }
      return false;
    });

    if (isDuplicate) {
      return 'هذا الكود مسجل بالفعل في النظام، يرجى اختيار كود آخر غير مكرر';
    }
    return null;
  }
};

export const validators = Validators;

/**
 * Helper component for inline Arabic error text
 */
export function FieldError({ error }) {
  if (!error) return null;
  return (
    <span className="block text-xs font-semibold text-red-600 mt-1 animate-fadeIn">
      {error}
    </span>
  );
}

export default Validators;
