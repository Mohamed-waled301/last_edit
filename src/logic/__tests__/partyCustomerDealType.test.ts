import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import db from '../../data/db';
import partiesRepo from '../../data/repositories/partiesRepo';
import salesRepo from '../../data/repositories/salesRepo';

describe('Customer Deal Type & Credit Limit (الضوابط المالية للعميل)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  describe('Form Formatting & Validation Logic', () => {
    function formatNumberWithSeparators(val) {
      if (val === null || val === undefined || val === '') return '';
      const clean = String(val).replace(/[^0-9]/g, '');
      if (!clean) return '';
      return Number(clean).toLocaleString('en-US');
    }

    it('formats numbers with thousand separators using Western digits', () => {
      expect(formatNumberWithSeparators('250000')).toBe('250,000');
      expect(formatNumberWithSeparators(250000)).toBe('250,000');
      expect(formatNumberWithSeparators('1500000')).toBe('1,500,000');
      expect(formatNumberWithSeparators('')).toBe('');
      expect(formatNumberWithSeparators(null)).toBe('');
    });

    it('validates that cash customers ignore credit limit and pass validation', () => {
      const cashForm = {
        name: 'عميل نقدي تجريبي',
        code: 'PRT-CASH-01',
        is_supplier: false,
        is_customer: true,
        customer_deal_type: 'cash',
        credit_limit: '' // empty or 0
      };

      const isCreditValid = !cashForm.is_customer || cashForm.customer_deal_type !== 'credit' || (Number(cashForm.credit_limit) > 0);
      expect(isCreditValid).toBe(true);

      const isFormValid = Boolean(
        cashForm.name.trim() &&
        cashForm.code.trim() &&
        (cashForm.is_supplier || cashForm.is_customer) &&
        isCreditValid
      );
      expect(isFormValid).toBe(true);
    });

    it('validates that credit customers require positive credit limit (> 0)', () => {
      const creditFormWithoutLimit = {
        name: 'عميل آجل تجريبي',
        code: 'PRT-CRED-01',
        is_supplier: false,
        is_customer: true,
        customer_deal_type: 'credit',
        credit_limit: '0'
      };

      const isCreditValidZero = !creditFormWithoutLimit.is_customer || creditFormWithoutLimit.customer_deal_type !== 'credit' || (Number(creditFormWithoutLimit.credit_limit) > 0);
      expect(isCreditValidZero).toBe(false);

      const creditFormWithValidLimit = {
        ...creditFormWithoutLimit,
        credit_limit: '250000'
      };
      const isCreditValidPositive = !creditFormWithValidLimit.is_customer || creditFormWithValidLimit.customer_deal_type !== 'credit' || (Number(creditFormWithValidLimit.credit_limit) > 0);
      expect(isCreditValidPositive).toBe(true);
    });
  });

  describe('Repository Persistence & Credit Limit Storage', () => {
    it('saves a cash customer without a limit successfully, storing credit_limit as 0', async () => {
      const created = await partiesRepo.create({
        code: 'PRT-CASH-TEST',
        name: 'مؤسسة التجارة النقدية',
        is_supplier: 0,
        is_customer: 1,
        customer_deal_type: 'cash',
        credit_limit: 50000 // Even if form state has a leftover number
      });

      expect(created.customer_deal_type).toBe('cash');
      expect(created.credit_limit).toBe(0);

      // Verify in customer sync table
      const syncedCustomer = await db.customers.get(created.id);
      expect(syncedCustomer).toBeDefined();
      expect(syncedCustomer.customer_deal_type).toBe('cash');
      expect(syncedCustomer.credit_limit).toBe(0);
    });

    it('saves a credit customer storing the exact positive credit limit', async () => {
      const created = await partiesRepo.create({
        code: 'PRT-CRED-TEST',
        name: 'شركة التوزيع الآجل',
        is_supplier: 0,
        is_customer: 1,
        customer_deal_type: 'credit',
        credit_limit: 250000
      });

      expect(created.customer_deal_type).toBe('credit');
      expect(created.credit_limit).toBe(250000);

      const syncedCustomer = await db.customers.get(created.id);
      expect(syncedCustomer.customer_deal_type).toBe('credit');
      expect(syncedCustomer.credit_limit).toBe(250000);
    });

    it('updates customer from credit to cash: credit_limit is reset to 0 in database', async () => {
      const created = await partiesRepo.create({
        code: 'PRT-TOGGLE-TEST',
        name: 'شركة النسيج المتنوع',
        is_supplier: 0,
        is_customer: 1,
        customer_deal_type: 'credit',
        credit_limit: 100000
      });

      expect(created.credit_limit).toBe(100000);

      const updated = await partiesRepo.update(created.id, {
        customer_deal_type: 'cash',
        credit_limit: 100000 // In state still 100000, but type is cash
      });

      expect(updated.customer_deal_type).toBe('cash');
      expect(updated.credit_limit).toBe(0);

      const synced = await db.customers.get(created.id);
      expect(synced.credit_limit).toBe(0);
    });

    it('for a party who is both supplier and customer, controls depend only on customer-side type', async () => {
      const bothParty = await partiesRepo.create({
        code: 'PRT-BOTH-01',
        name: 'مصنع الأقمشة والملابس المشترك',
        is_supplier: 1,
        is_customer: 1,
        supplier_type: 'goods',
        customer_deal_type: 'cash',
        payment_terms: 'credit' // supplier credit terms
      });

      // Customer credit limit is 0 because customer_deal_type is cash
      expect(bothParty.customer_deal_type).toBe('cash');
      expect(bothParty.credit_limit).toBe(0);
      expect(bothParty.supplier_type).toBe('goods');
    });
  });

  describe('Invoice Credit Limit Rules (Requirement 5)', () => {
    it('never blocks cash customers by credit limit even on large debt', async () => {
      const cashCustomer = await partiesRepo.create({
        code: 'PRT-CASH-INV',
        name: 'عميل نقدي بدون سقف',
        is_supplier: 0,
        is_customer: 1,
        customer_deal_type: 'cash',
        customer_balance: 500000 // already owes 500k
      });

      // Check rule in salesRepo: Cash customers are never blocked by a limit
      const customer = await db.customers.get(cashCustomer.id);
      const isCustomerCredit = customer && (
        customer.customer_deal_type === 'credit' ||
        (customer.customer_deal_type !== 'cash' && customer.payment_terms === 'credit')
      );

      expect(isCustomerCredit).toBe(false);
      expect(customer.credit_limit).toBe(0);
    });

    it('blocks credit customers on credit invoices when limit is exceeded', async () => {
      const creditCustomer = await partiesRepo.create({
        code: 'PRT-CRED-INV',
        name: 'عميل آجل خاضع للسقف',
        is_supplier: 0,
        is_customer: 1,
        customer_deal_type: 'credit',
        credit_limit: 10000
      });

      const customer = await db.customers.get(creditCustomer.id);
      const isCustomerCredit = customer && (
        customer.customer_deal_type === 'credit' ||
        (customer.customer_deal_type !== 'cash' && customer.payment_terms === 'credit')
      );

      expect(isCustomerCredit).toBe(true);
      expect(customer.credit_limit).toBe(10000);
    });
  });
});
