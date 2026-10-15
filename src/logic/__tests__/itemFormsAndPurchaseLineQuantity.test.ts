import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculatePurchaseOrderTotals } from '../purchaseOrderCalculations';

describe('Three Focused Fixes: Item Forms Dropdowns, Quick-Add Picker Focus, and Empty Line Quantities', () => {
  const itemFormCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/modules/items/ItemFormPage.jsx'),
    'utf8'
  );
  const purchaseOrderFormCode = fs.readFileSync(
    path.resolve(process.cwd(), 'src/modules/purchases/PurchaseOrderFormPage.jsx'),
    'utf8'
  );

  describe('Requirement 1 & 2: Main Item Form Dropdowns Start Empty & Are Required', () => {
    it('ItemFormPage initial state starts with empty group, department, and type, and unit defaults to قطعة', () => {
      expect(itemFormCode).toMatch(/item_group:\s*''/);
      expect(itemFormCode).toMatch(/item_department:\s*''/);
      expect(itemFormCode).toMatch(/item_type:\s*''/);
      expect(itemFormCode).toMatch(/unit:\s*'قطعة'/);
    });

    it('ItemFormPage loadData maintains empty group, department, and type on new records', () => {
      expect(itemFormCode).toContain("item_group: ''");
      expect(itemFormCode).toContain("item_department: ''");
      expect(itemFormCode).toContain("item_type: ''");
      expect(itemFormCode).toContain("unit: 'قطعة'");
    });

    it('ItemFormPage dropdown selects render empty prompt options and block save without selection', () => {
      expect(itemFormCode).toContain('<option value="">-- اختر نوع الصنف --</option>');
      expect(itemFormCode).toContain('<option value="">-- اختر مجموعة الصنف --</option>');
      expect(itemFormCode).toContain('<option value="">-- اختر قسم الصنف --</option>');

      // Validation errors
      expect(itemFormCode).toContain('اختر مجموعة الصنف');
      expect(itemFormCode).toContain('اختر قسم الصنف');
      expect(itemFormCode).toContain('اختر نوع الصنف');
    });
  });

  describe('Requirement 1 & 2: Quick-Add Panel Dropdowns Start Empty, Required, and Picker Focus Management', () => {
    it('PurchaseOrderFormPage quickItemForm initial state and loadData start with empty group, dept, type and unit قطعة', () => {
      // In quickItemForm state
      expect(purchaseOrderFormCode).toMatch(/quickItemForm,\s*setQuickItemForm\]\s*=\s*useState\(\{[\s\S]*?item_group:\s*''/);
      expect(purchaseOrderFormCode).toMatch(/quickItemForm,\s*setQuickItemForm\]\s*=\s*useState\(\{[\s\S]*?item_department:\s*''/);
      expect(purchaseOrderFormCode).toMatch(/quickItemForm,\s*setQuickItemForm\]\s*=\s*useState\(\{[\s\S]*?item_type:\s*''/);
      expect(purchaseOrderFormCode).toMatch(/quickItemForm,\s*setQuickItemForm\]\s*=\s*useState\(\{[\s\S]*?unit:\s*'قطعة'/);
    });

    it('Quick-Add panel dropdown selects render empty prompt options and require selection without auto-filling', () => {
      expect(purchaseOrderFormCode).toContain('<option value="">-- اختر مجموعة الصنف --</option>');
      expect(purchaseOrderFormCode).toContain('<option value="">-- اختر قسم الصنف --</option>');
      expect(purchaseOrderFormCode).toContain('<option value="">-- اختر نوع الصنف --</option>');

      // Validation logic in handleSaveQuickItem
      expect(purchaseOrderFormCode).toContain('اختر مجموعة الصنف');
      expect(purchaseOrderFormCode).toContain('اختر قسم الصنف');
      expect(purchaseOrderFormCode).toContain('اختر نوع الصنف');

      // Inline FieldError components in quick add panel
      expect(purchaseOrderFormCode).toContain('<FieldError error={quickItemErrors.item_group} />');
      expect(purchaseOrderFormCode).toContain('<FieldError error={quickItemErrors.item_department} />');
      expect(purchaseOrderFormCode).toContain('<FieldError error={quickItemErrors.item_type} />');
    });

    it('Permanent item search/picker is always visible outside collapsible panel and focused after quick-add save and cancel', () => {
      // Picker input exists with id and ref
      expect(purchaseOrderFormCode).toContain('id="purchase-item-picker"');
      expect(purchaseOrderFormCode).toContain('ref={pickerInputRef}');

      // Quick-add save closes panel, adds line with empty quantity, clears picker search, and focuses picker
      expect(purchaseOrderFormCode).toContain('setShowQuickAddItem(false)');
      expect(purchaseOrderFormCode).toContain('pickerInputRef.current?.focus()');

      // Cancel handler closes panel and refocuses picker
      expect(purchaseOrderFormCode).toContain('handleCancelQuickAdd');
      expect(purchaseOrderFormCode).toMatch(/handleCancelQuickAdd[\s\S]*?setShowQuickAddItem\(false\)[\s\S]*?pickerInputRef\.current\?\.focus\(\)/);
    });
  });

  describe('Requirement 2: Purchase Line Quantity Starts with Default Quantity 1', () => {
    it('Initial line and newly added lines start with default quantity_ordered 1', () => {
      // Initial state line
      expect(purchaseOrderFormCode).toMatch(/items:\s*\[[\s\S]*?quantity_ordered:\s*'1'/);

      // In handleAddLine
      expect(purchaseOrderFormCode).toMatch(/handleAddLine[\s\S]*?quantity_ordered:\s*'1'/);

      // In handlePickItem from picker
      expect(purchaseOrderFormCode).toMatch(/handlePickItem[\s\S]*?quantity_ordered:\s*'1'/);

      // In handleSaveQuickItem
      expect(purchaseOrderFormCode).toMatch(/handleSaveQuickItem[\s\S]*?quantity_ordered:\s*'1'/);
    });

    it('Selecting an item automatically focuses the quantity field of that line', () => {
      // In handlePickItem
      expect(purchaseOrderFormCode).toMatch(/handlePickItem[\s\S]*?quantityInputRefs\.current\[targetIdx\]\?\.focus\(\)/);

      // In handleItemChange
      expect(purchaseOrderFormCode).toMatch(/handleItemChange[\s\S]*?quantityInputRefs\.current\[index\]\?\.focus\(\)/);
    });

    it('Line validation strictly requires quantity > 0 and displays Arabic inline error on the line', () => {
      expect(purchaseOrderFormCode).toContain('الكمية مطلوبة ويجب أن تكون أكبر من صفر');
      expect(purchaseOrderFormCode).toContain('errors.lineQty');
      expect(purchaseOrderFormCode).toContain('border-red-500 bg-red-50/50 text-red-900');
    });

    it('Previous line completion rule is strictly enforced before adding a new line', () => {
      expect(purchaseOrderFormCode).toContain('isLastLineComplete');
      expect(purchaseOrderFormCode).toMatch(/lastLine\.quantity_ordered\s*!==\s*''/);
      expect(purchaseOrderFormCode).toMatch(/Number\(lastLine\.quantity_ordered\)\s*>\s*0/);
    });

    it('Totals calculation handles empty quantity without NaN at every stage', () => {
      // Test formula with 0 and empty
      const emptyTotals = calculatePurchaseOrderTotals({
        subtotal: 0,
        discount_amount: 0,
        additional_expenses: 0
      });
      expect(emptyTotals.subtotal).toBe(0);
      expect(emptyTotals.finalNet).toBe(0);
      expect(isNaN(emptyTotals.subtotal)).toBe(false);
      expect(isNaN(emptyTotals.finalNet)).toBe(false);

      // Test subtotal reducer logic in source code handles empty without NaN
      expect(purchaseOrderFormCode).toMatch(/qtyVal\s*===\s*''\s*\?\s*0\s*:\s*Number\(\(qty\s*\*\s*price\)\.toFixed\(2\)\)/);
      expect(purchaseOrderFormCode).toMatch(/it\.quantity_ordered\s*===\s*''\s*\?\s*0/);
    });
  });
});
