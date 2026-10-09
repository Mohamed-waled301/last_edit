import { describe, it, expect } from 'vitest';
import BalanceCalculator, {
  resolveOpeningBalance,
  resolveOpeningType,
  normalizeOpeningBalance,
  DEFAULT_SUPPLIER_OPENING_TYPE,
  DEFAULT_CUSTOMER_OPENING_TYPE,
} from '../balances';
import {
  DEFAULT_PHONE_VALUE,
  isValidEgyptianMobile,
  isUntouchedPhoneDefault,
  normalizePhoneForSave,
  validateEgyptianMobile,
  sanitizeEgyptianPhoneInput,
} from '../../utils/phone';

describe('Egyptian phone defaults & validation', () => {
  it('defaults new phone inputs to the "01" prefix (no dummy numbers)', () => {
    expect(DEFAULT_PHONE_VALUE).toBe('01');
  });

  it('accepts valid Egyptian mobiles (010/011/012/015, 11 digits)', () => {
    expect(isValidEgyptianMobile('01012345678')).toBe(true);
    expect(isValidEgyptianMobile('01112345678')).toBe(true);
    expect(isValidEgyptianMobile('01212345678')).toBe(true);
    expect(isValidEgyptianMobile('01512345678')).toBe(true);
  });

  it('rejects non-Egyptian or incomplete numbers', () => {
    expect(isValidEgyptianMobile('01312345678')).toBe(false); // 013 not mobile
    expect(isValidEgyptianMobile('0101234567')).toBe(false); // 10 digits
    expect(isValidEgyptianMobile('02123456789')).toBe(false); // landline
    expect(isValidEgyptianMobile('01')).toBe(false);
  });

  it('treats the untouched "01" prefix as empty (optional field)', () => {
    expect(isUntouchedPhoneDefault('')).toBe(true);
    expect(isUntouchedPhoneDefault('01')).toBe(true);
    expect(isUntouchedPhoneDefault('01012345678')).toBe(false);
    expect(validateEgyptianMobile('01', { required: false })).toBeNull();
    expect(validateEgyptianMobile('0101234567', { required: false })).not.toBeNull();
  });

  it('never persists the bare "01" prefix as a dummy number', () => {
    expect(normalizePhoneForSave('01')).toBe('');
    expect(normalizePhoneForSave('')).toBe('');
    expect(normalizePhoneForSave('01012345678')).toBe('01012345678');
  });

  it('sanitizes input to digits only, capped at 11 chars', () => {
    expect(sanitizeEgyptianPhoneInput('01a23-456 78999')).toBe('01234567899');
  });
});

describe('Opening balance (رصيد أول المدة) ledger logic', () => {
  it('supplier: Current = Opening + Credit Purchases - Cash Out', () => {
    const res = BalanceCalculator.calculateSupplierBalance(
      [{ total_amount: 10000, paid_amount: 4000, status: 'partially_paid' }],
      [],
      5000
    );
    expect(res.balanceDue).toBe(11000);
  });

  it('customer: Current = Opening + Credit Sales - Cash In', () => {
    const res = BalanceCalculator.calculateCustomerBalance(
      [{ total_invoice_amount: 20000, paid_amount: 5000, status: 'partially_paid' }],
      [],
      3000
    );
    expect(res.balanceDue).toBe(18000);
  });

  it('defaults opening to 0 for legacy records (graceful fallback)', () => {
    expect(normalizeOpeningBalance(undefined)).toBe(0);
    expect(resolveOpeningBalance({}, 'supplier')).toBe(0);
    expect(resolveOpeningBalance({}, 'customer')).toBe(0);
    expect(resolveOpeningBalance(null, 'supplier')).toBe(0);
    const noOpening = BalanceCalculator.calculateSupplierBalance(
      [{ total_amount: 10000, paid_amount: 4000, status: 'partially_paid' }],
      []
    );
    expect(noOpening.balanceDue).toBe(6000);
  });

  it('resolves legacy stored snapshots as opening balances', () => {
    expect(resolveOpeningBalance({ supplier_balance: 700 }, 'supplier')).toBe(700);
    expect(resolveOpeningBalance({ customer_balance: 900 }, 'customer')).toBe(900);
    expect(
      resolveOpeningBalance({ supplier_opening_balance: 500, supplier_balance: 700 }, 'supplier')
    ).toBe(500);
  });

  it('uses role defaults for account nature (suppliers credit, customers debit)', () => {
    expect(DEFAULT_SUPPLIER_OPENING_TYPE).toBe('credit');
    expect(DEFAULT_CUSTOMER_OPENING_TYPE).toBe('debit');
    expect(resolveOpeningType({}, 'supplier')).toBe('credit');
    expect(resolveOpeningType({}, 'customer')).toBe('debit');
  });

  it('unified balance adds each side opening exactly once', () => {
    const bal = BalanceCalculator.calculateUnifiedPartyBalance(
      [{ total_amount: 10000, paid_amount: 2000, status: 'partially_paid' }],
      [],
      [{ total_invoice_amount: 15000, paid_amount: 5000, status: 'partially_paid' }],
      [],
      1000, // supplier opening
      2000 // customer opening
    );
    expect(bal.supplierBalance).toBe(9000);
    expect(bal.customerBalance).toBe(12000);
    expect(bal.netBalance).toBe(3000);
  });
});
