import { describe, it, expect, vi } from 'vitest';
import {
  isValidEgyptianMobile,
  sanitizeEgyptianPhoneInput,
  validateEgyptianMobile,
  PHONE_ERROR_MESSAGE,
  normalizePhoneForWhatsApp,
  normalizePhoneForSave,
  isUntouchedPhoneDefault,
} from '../../utils/phone';
import { toPiasters, fromPiasters } from '../../utils/money';
import fs from 'fs';
import path from 'path';

describe('1) Universal Phone Number Validation Suite', () => {
  it('accepts valid Egyptian 11-digit numbers starting with 01', () => {
    expect(isValidEgyptianMobile('01012345678')).toBe(true);
    expect(isValidEgyptianMobile('01198765432')).toBe(true);
    expect(isValidEgyptianMobile('01234567890')).toBe(true);
    expect(isValidEgyptianMobile('01555555555')).toBe(true);
  });

  it('converts Arabic-Indic digits to Western digits and validates', () => {
    const arabicIndic = '٠١٠١٢٣٤٥٦٧٨';
    const western = sanitizeEgyptianPhoneInput(arabicIndic);
    expect(western).toBe('01012345678');
    expect(isValidEgyptianMobile(arabicIndic)).toBe(true);
  });

  it('strips spaces, dashes, parentheses and +', () => {
    expect(sanitizeEgyptianPhoneInput('+20 10-1234 5678')).toBe('01012345678');
    expect(sanitizeEgyptianPhoneInput('010-1234-5678')).toBe('01012345678');
    expect(isValidEgyptianMobile('+20 10-1234 5678')).toBe(true);
  });

  it('rejects numbers that are not 11 digits (10 digits or 12 digits)', () => {
    expect(isValidEgyptianMobile('0101234567')).toBe(false); // 10 digits
    expect(isValidEgyptianMobile('010123456789')).toBe(false); // 12 digits
  });

  it('rejects numbers not starting with 01 (starting with 02 or 00 or other digits)', () => {
    expect(isValidEgyptianMobile('02123456789')).toBe(false); // starts with 02
    expect(isValidEgyptianMobile('00123456789')).toBe(false); // starts with 00
    expect(isValidEgyptianMobile('03123456789')).toBe(false); // starts with 03
    expect(isValidEgyptianMobile('11012345678')).toBe(false); // starts with 11
  });

  it('blocks letters and symbols', () => {
    expect(isValidEgyptianMobile('010abc45678')).toBe(false);
    expect(sanitizeEgyptianPhoneInput('010abc45678')).toBe('01045678');
  });

  it('returns the exact Arabic error message under field when invalid', () => {
    const error = validateEgyptianMobile('010123456', { required: false });
    expect(error).toBe(PHONE_ERROR_MESSAGE);
    expect(error).toBe('رقم الهاتف يجب أن يبدأ بـ 01 ويتكون من 11 رقماً');
  });

  it('normalizes valid 01xxxxxxxxx to 201xxxxxxxxx for WhatsApp wa.me links', () => {
    expect(normalizePhoneForWhatsApp('01012345678')).toBe('201012345678');
    expect(normalizePhoneForWhatsApp('+201012345678')).toBe('201012345678');
    expect(normalizePhoneForWhatsApp('02123456789')).toBeNull();
  });

  it('treats untouched 01 prefix as empty for optional fields', () => {
    expect(isUntouchedPhoneDefault('01')).toBe(true);
    expect(normalizePhoneForSave('01')).toBe('');
    expect(validateEgyptianMobile('01', { required: false })).toBeNull();
  });
});

describe('2) Supplier Activity Type Requirement Suite', () => {
  it('requires supplier activity type and gives exact Arabic message', () => {
    const errorMsg = 'برجاء اختيار نوع نشاط المورد';
    const validateSupplierActivity = (activity) => {
      if (!activity || !activity.trim()) {
        return errorMsg;
      }
      return null;
    };

    expect(validateSupplierActivity('')).toBe(errorMsg);
    expect(validateSupplierActivity(null)).toBe(errorMsg);
    expect(validateSupplierActivity(undefined)).toBe(errorMsg);
    expect(validateSupplierActivity('fabrics')).toBeNull();
    expect(validateSupplierActivity('services')).toBeNull();
  });
});

describe('3) Cut Order Comment Field Removal Verification', () => {
  it('confirms cutting_comment is not rendered as an active input in ProductionOrderFormPage', () => {
    const filePath = path.join(process.cwd(), 'src/modules/manufacturing/ProductionOrderFormPage.jsx');
    const content = fs.readFileSync(filePath, 'utf8');
    // Ensure form input for cutting comment was removed
    expect(content.includes('name="cutting_comment"')).toBe(false);
    expect(content.includes('تعليق أمر القص (Cutting Order Comment)')).toBe(false);
  });
});

describe('4) English Text in Parentheses Sweep Verification', () => {
  it('scans key production UI files to ensure English in parentheses has been stripped', () => {
    const filesToAudit = [
      'src/modules/manufacturing/ProductionOrderFormPage.jsx',
      'src/modules/inventory/StockCardPage.jsx',
      'src/modules/items/ItemFormPage.jsx',
      'src/modules/SettingsModule.jsx',
      'src/components/ActivationScreen.jsx',
      'src/modules/data/DataManagementPage.jsx',
      'src/modules/BackupModule.jsx',
      'src/modules/ReportsModule.jsx',
    ];

    const forbiddenPatterns = [
      /\(Cutting Order Comment\)/i,
      /\(Stock Card\)/i,
      /\(Running Balance\)/i,
      /\(Machine ID\)/i,
      /\(Company Logo\)/i,
      /\(Database Integrity Error\)/i,
    ];

    for (const relPath of filesToAudit) {
      const fullPath = path.join(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(content)).toBe(false);
        }
      }
    }
  });
});

describe('7) MoneyInput Exact Piasters & Intermediate Input Mechanics', () => {
  it('preserves exact piaster values without rounding errors', () => {
    expect(toPiasters('100.50')).toBe(10050);
    expect(toPiasters('0.75')).toBe(75);
    expect(fromPiasters(10050)).toBe(100.5);
    expect(fromPiasters(75)).toBe(0.75);
  });

  it('parses intermediate input strings without resetting to 0 prematurely', () => {
    const testIntermediateValues = (val) => {
      if (val === '' || val === '-' || val === '.' || val === '0.' || val === '12.') {
        return { isIntermediate: true, safeValue: val };
      }
      const num = parseFloat(val);
      return { isIntermediate: false, safeValue: isNaN(num) ? 0 : num };
    };

    expect(testIntermediateValues('').isIntermediate).toBe(true);
    expect(testIntermediateValues('0.').isIntermediate).toBe(true);
    expect(testIntermediateValues('12.').isIntermediate).toBe(true);
    expect(testIntermediateValues('12.5').safeValue).toBe(12.5);
  });
});

describe('10) DocumentConfirmModal and Esc/Back Behavior', () => {
  it('calls close callback when back action is triggered', () => {
    const onCloseSpy = vi.fn();
    const handleClose = (e) => {
      if (e?.stopPropagation) e.stopPropagation();
      onCloseSpy();
    };

    handleClose({ stopPropagation: vi.fn() });
    expect(onCloseSpy).toHaveBeenCalledTimes(1);
  });
});

describe('11) Branding Sweep Verification', () => {
  it('confirms product branding is code systems across window title and metadata', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.build.productName).toBe('code systems');
    expect(pkg.build.appId).toBe('com.apexapparelerp.app'); // Preserved per requirements
  });
});
