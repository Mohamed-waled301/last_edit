import React from 'react';
import { validateEgyptianMobile as validateEGMobile } from './phone.js';

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
  },

  discountPercent(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (isNaN(num) || num < 0 || num > 100) {
      return 'نسبة الخصم يجب أن تكون بين 0% و 100%';
    }
    return null;
  },

  discountValue(discountVal, subtotal) {
    const d = Number(discountVal) || 0;
    const sub = Number(subtotal) || 0;
    if (d < 0) return 'قيمة الخصم لا يمكن أن تكون سالبة';
    if (d > sub) return 'قيمة الخصم لا يمكن أن تتجاوز إجمالي المبلغ';
    return null;
  },

  /**
   * Egyptian mobile validation (010 / 011 / 012 / 015, 11 digits).
   * "" / "01" (untouched prefix) passes when not required.
   */
  egyptianMobile(value, options = {}) {
    return validateEGMobile(value, options);
  },

  /**
   * Line Item Completion Rule (Requirement L2)
   * Minimum: item_id, quantity > 0, price >= 0 (if hasPrice), variant_id (if item has variants)
   */
  isLineItemComplete(line = {}, { hasPrice = true, hasVariants = false } = {}) {
    if (!line) return false;
    const itemId = line.item_id || line.material_id || line.product_id;
    if (!itemId) return false;

    const qty = Number(line.quantity ?? line.quantity_ordered ?? line.quantity_required) || 0;
    if (qty <= 0) return false;

    if (hasPrice) {
      const price = Number(line.unit_price ?? line.unit_selling_price ?? line.price_before_discount);
      if (isNaN(price) || price < 0) return false;
    }

    if ((hasVariants || line.has_variants) && !line.variant_id) {
      return false;
    }

    return true;
  },

  validateLineItem(line = {}, { hasPrice = true } = {}) {
    const errors = {};
    const itemId = line.item_id || line.material_id || line.product_id;
    if (!itemId) {
      errors.item_id = 'يرجى اختيار الصنف';
      errors.item = 'يرجى اختيار الصنف';
    }

    const qty = Number(line.quantity ?? line.quantity_ordered ?? line.quantity_required) || 0;
    if (qty <= 0) errors.quantity = 'الكمية يجب أن تكون أكبر من صفر';

    if (hasPrice) {
      const price = Number(line.unit_price ?? line.unit_selling_price ?? line.price_before_discount);
      if (isNaN(price) || price < 0) {
        errors.price = 'السعر لا يمكن أن يكون سالباً';
        errors.unit_price = 'السعر لا يمكن أن يكون سالباً';
      }
    }

    if (line.has_variants && !line.variant_id) {
      errors.variant_id = 'يرجى تحديد المقاس واللون';
      errors.variant = 'يرجى تحديد المقاس واللون';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
};

export const validators = Validators;
export const isLineItemComplete = Validators.isLineItemComplete;
export const validateLineItem = Validators.validateLineItem;

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
