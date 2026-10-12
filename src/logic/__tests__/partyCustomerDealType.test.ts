import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import db from '../../data/db';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { getTodayDateString } from '../../utils/formatters';

describe('Customer Credit Limit & Document-Only Deal Type (الضوابط المالية للعميل والحد الائتماني)', () => {
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

    it('validates that credit limit is optional (blank or 0 means unlimited)', () => {
      const customerFormWithoutLimit = {
        name: 'عميل بدون حد ائتماني',
        code: 'PRT-UNLIM-01',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: '' // blank = unlimited
      };

      const limitNum = Math.max(0, Number(customerFormWithoutLimit.credit_limit) || 0);
      expect(limitNum).toBe(0);

      const customerFormWithLimit = {
        name: 'عميل بحد ائتماني محدد',
        code: 'PRT-LIM-01',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: '150000'
      };

      const limitNum2 = Math.max(0, Number(customerFormWithLimit.credit_limit) || 0);
      expect(limitNum2).toBe(150000);
    });
  });

  describe('Repository Persistence & Credit Limit Storage', () => {
    it('saves a customer with 0 or blank credit limit as 0 (unlimited) and does not store customer_deal_type', async () => {
      const created = await partiesRepo.create({
        code: 'PRT-UNLIM-TEST',
        name: 'مؤسسة التجارة الحرة',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: ''
      });

      expect(created.credit_limit).toBe(0);
      expect(created.customer_deal_type).toBeUndefined();
      expect(created.payment_terms).toBeUndefined();

      // Verify in customer sync table
      const syncedCustomer = await db.customers.get(created.id);
      expect(syncedCustomer).toBeDefined();
      expect(syncedCustomer.credit_limit).toBe(0);
      expect(syncedCustomer.customer_deal_type).toBeUndefined();
    });

    it('saves a customer storing the exact positive credit limit', async () => {
      const created = await partiesRepo.create({
        code: 'PRT-CRED-TEST',
        name: 'شركة التوزيع الكبرى',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: 250000
      });

      expect(created.credit_limit).toBe(250000);

      const syncedCustomer = await db.customers.get(created.id);
      expect(syncedCustomer).toBeDefined();
      expect(syncedCustomer.credit_limit).toBe(250000);
    });

    it('updates customer credit limit successfully', async () => {
      const created = await partiesRepo.create({
        code: 'PRT-UPDATE-TEST',
        name: 'شركة النسيج المتنوع',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: 100000
      });

      expect(created.credit_limit).toBe(100000);

      const updated = await partiesRepo.update(created.id, {
        credit_limit: 300000
      });

      expect(updated.credit_limit).toBe(300000);

      const synced = await db.customers.get(created.id);
      expect(synced.credit_limit).toBe(300000);
    });

    it('for a party who is both supplier and customer, preserves credit limit on customer side', async () => {
      const bothParty = await partiesRepo.create({
        code: 'PRT-BOTH-01',
        name: 'مصنع الأقمشة والملابس المشترك',
        is_supplier: 1,
        is_customer: 1,
        credit_limit: 50000
      });

      expect(bothParty.credit_limit).toBe(50000);
      expect(bothParty.is_supplier).toBe(1);
      expect(bothParty.is_customer).toBe(1);
    });
  });

  describe('Sales Invoice Credit Limit Enforcement Rules', () => {
    it('never blocks CASH sales invoices by credit limit even if debt is large', async () => {
      const customer = await partiesRepo.create({
        code: 'PRT-CASH-INV',
        name: 'عميل مشتريات نقدية',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: 5000,
        customer_balance: 10000 // already owes 10,000
      });

      // Cash invoice of 50,000 should NOT be blocked by credit limit
      const inv = await salesRepo.createSalesInvoice({
        customer_id: customer.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'cash',
        items: [
          { product_id: 'prod-1', quantity: 100, unit_selling_price: 500, unit_cost: 300 }
        ]
      });

      expect(inv).toBeDefined();
      expect(inv.payment_terms).toBe('cash');
    });

    it('does NOT block credit sales invoices when customer has no limit (limit = 0)', async () => {
      const unlimCustomer = await partiesRepo.create({
        code: 'PRT-NOLIM-INV',
        name: 'عميل بلا سقف ائتماني',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: 0,
        customer_balance: 50000
      });

      const inv = await salesRepo.createSalesInvoice({
        customer_id: unlimCustomer.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'credit',
        paid_amount: 0,
        items: [
          { product_id: 'prod-1', quantity: 10, unit_selling_price: 1000, unit_cost: 600 }
        ]
      });

      expect(inv).toBeDefined();
      expect(inv.payment_terms).toBe('credit');
    });

    it('blocks credit sales invoices when customer balance + invoice exceeds credit limit', async () => {
      const creditCustomer = await partiesRepo.create({
        code: 'PRT-CRED-BLOCK',
        name: 'عميل مقيد بسقف ائتماني',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: 10000,
        customer_balance: 8000 // already owes 8,000
      });

      // New invoice of 3,000 would make total debt 11,000 > 10,000 limit -> MUST FAIL
      await expect(
        salesRepo.createSalesInvoice({
          customer_id: creditCustomer.id,
          invoice_date: getTodayDateString(),
          payment_terms: 'credit',
          paid_amount: 0,
          items: [
            { product_id: 'prod-1', quantity: 3, unit_selling_price: 1000, unit_cost: 600 }
          ]
        })
      ).rejects.toThrow(/الحد الائتماني/);
    });

    it('allows credit sales invoice if within limit', async () => {
      const creditCustomer = await partiesRepo.create({
        code: 'PRT-CRED-ALLOW',
        name: 'عميل ضمن السقف الائتماني',
        is_supplier: 0,
        is_customer: 1,
        credit_limit: 15000,
        customer_balance: 8000 // already owes 8,000
      });

      // New invoice of 5,000 makes total debt 13,000 <= 15,000 limit -> MUST SUCCEED
      const inv = await salesRepo.createSalesInvoice({
        customer_id: creditCustomer.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'credit',
        paid_amount: 0,
        items: [
          { product_id: 'prod-1', quantity: 5, unit_selling_price: 1000, unit_cost: 600 }
        ]
      });

      expect(inv).toBeDefined();
    });

    it('calculates credit limit against NET balance for a party who is both customer and supplier', async () => {
      // Customer owes us 20,000, but we owe them 12,000 as supplier => Net balance they owe us = 8,000.
      // Credit limit is 12,000.
      const bothParty = await partiesRepo.create({
        code: 'PRT-NET-LIMIT',
        name: 'جهة مشتركة عميل ومورد',
        is_supplier: 1,
        is_customer: 1,
        credit_limit: 12000,
        customer_balance: 20000,
        supplier_balance: 12000
      });

      // Invoice of 3,000: Net debt becomes 8,000 + 3,000 = 11,000 <= 12,000 limit -> MUST SUCCEED
      const okInv = await salesRepo.createSalesInvoice({
        customer_id: bothParty.id,
        invoice_date: getTodayDateString(),
        payment_terms: 'credit',
        paid_amount: 0,
        items: [
          { product_id: 'prod-1', quantity: 3, unit_selling_price: 1000, unit_cost: 600 }
        ]
      });
      expect(okInv).toBeDefined();

      // Invoice of 5,000: Net debt would become (current net ~11,000) + 5,000 = 16,000 > 12,000 limit -> MUST FAIL
      await expect(
        salesRepo.createSalesInvoice({
          customer_id: bothParty.id,
          invoice_date: getTodayDateString(),
          payment_terms: 'credit',
          paid_amount: 0,
          items: [
            { product_id: 'prod-1', quantity: 5, unit_selling_price: 1000, unit_cost: 600 }
          ]
        })
      ).rejects.toThrow(/الحد الائتماني/);
    });
  });
});
