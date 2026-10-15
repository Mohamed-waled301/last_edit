import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  toPiasters, 
  fromPiasters, 
  normalizeDigits, 
  formatMoney, 
  roundHalfUp, 
  computeAvailableCredit, 
  distributeCostLargestRemainder 
} from '../../utils/money';
import { runMoneyPrecisionMigration, rollbackMigration } from '../moneyMigration';
import { db } from '../../data/db';
import { partiesRepo } from '../../data/repositories/partiesRepo';

describe('Requirement 1: Full Money Precision & Drift Elimination Audit', () => {
  beforeEach(async () => {
    await db.parties.clear();
    await db.treasury_accounts.clear();
    await db.items.clear();
  });

  describe('1. Exact Value Storage and Piasters Conversion', () => {
    it('converts exact decimal amounts to piasters without float drift', () => {
      const testCases = [
        { input: '0.1', piasters: 10, formatted: '0.10' },
        { input: '0.2', piasters: 20, formatted: '0.20' },
        { input: 0.1, piasters: 10, formatted: '0.10' },
        { input: 0.2, piasters: 20, formatted: '0.20' },
        { input: '1234.56', piasters: 123456, formatted: '1,234.56' },
        { input: '10500.75', piasters: 1050075, formatted: '10,500.75' },
        { input: '1000000.99', piasters: 100000099, formatted: '1,000,000.99' },
      ];

      for (const tc of testCases) {
        const p = toPiasters(tc.input);
        expect(p).toBe(tc.piasters);
        const back = fromPiasters(p);
        expect(back).toBe(Number(tc.input));
        expect(formatMoney(back, false)).toBe(tc.formatted);
      }
    });

    it('performs exact addition like 0.1 + 0.2 === 0.3 without 0.30000000000000004 drift', () => {
      const p1 = toPiasters('0.1');
      const p2 = toPiasters('0.2');
      const sumPiasters = p1 + p2;
      expect(sumPiasters).toBe(30);

      const sumEGP = fromPiasters(sumPiasters);
      expect(sumEGP).toBe(0.3);
      expect(formatMoney(sumEGP, false)).toBe('0.30');
    });

    it('normalizes Eastern Arabic-Indic digits to Western digits cleanly', () => {
      const arabicInput = '١٢٣٤.٥٦';
      const normalized = normalizeDigits(arabicInput);
      expect(normalized).toBe('1234.56');
      expect(toPiasters(normalized)).toBe(123456);

      const mixedInput = '١٠٥٠٠.٧٥';
      expect(toPiasters(normalizeDigits(mixedInput))).toBe(1050075);
    });

    it('implements round-half-up strictly at defined endpoints', () => {
      expect(roundHalfUp(1.005, 2)).toBe(1.01);
      expect(roundHalfUp(1.004, 2)).toBe(1.00);
      expect(roundHalfUp(1.0051, 2)).toBe(1.01);
      expect(roundHalfUp(2.5, 0)).toBe(3);
    });
  });

  describe('2. Credit Limit & Available Credit in Integer Piasters', () => {
    it('calculates available credit exact to the piaster (limit minus balance)', () => {
      const res = computeAvailableCredit(10000, 4500.25);
      expect(res.availablePiasters).toBe(549975);
      expect(res.availableEGP).toBe(5499.75);
      expect(res.isExceeded).toBe(false);
      expect(res.exceededEGP).toBe(0);
    });

    it('handles unlimited credit when limit is 0', () => {
      const res = computeAvailableCredit(0, 150000.75);
      expect(res.isUnlimited).toBe(true);
      expect(res.availableEGP).toBe(Infinity);
      expect(res.isExceeded).toBe(false);
    });

    it('detects credit limit exceeded by exactly 1 piaster', () => {
      const res = computeAvailableCredit(5000, 5000.01);
      expect(res.isExceeded).toBe(true);
      expect(res.availablePiasters).toBe(0);
      expect(res.availableEGP).toBe(0);
      expect(res.exceededPiasters).toBe(1);
      expect(res.exceededEGP).toBe(0.01);
    });
  });

  describe('3. Largest Remainder Method (Hare-Niemeyer / Hamilton distribution)', () => {
    it('distributes costs that do not divide evenly without losing single piasters', () => {
      // 100 EGP across 3 sizes (1 piece each)
      // Standard division: 100 / 3 = 33.333333333...
      // Largest Remainder Method: 33.34 + 33.33 + 33.33 = 100.00 exact!
      const sizes = { S: 1, M: 1, L: 1 };
      const distributed = distributeCostLargestRemainder(100, sizes);

      const piastersSum = Object.values(distributed).reduce((sum, p) => sum + p, 0);
      expect(piastersSum).toBe(10000); // 100.00 EGP exact in piasters

      const egpValues = Object.values(distributed).map(p => fromPiasters(p));
      const egpSum = egpValues.reduce((sum, val) => sum + val, 0);
      expect(egpSum).toBe(100);

      // Verify individual allocated amounts
      expect(distributed.S).toBe(3334); // First gets remainder piaster
      expect(distributed.M).toBe(3333);
      expect(distributed.L).toBe(3333);
    });

    it('distributes fractional amounts across uneven piece weights reconciling to the piaster', () => {
      // 250.75 EGP across 4 sizes with 10, 20, 15, 5 pieces (total 50 pieces)
      const sizes = { S: 10, M: 20, L: 15, XL: 5 };
      const totalCost = 250.75;
      const distributed = distributeCostLargestRemainder(totalCost, sizes);

      const piastersSum = Object.values(distributed).reduce((sum, p) => sum + p, 0);
      expect(piastersSum).toBe(25075); // 250.75 EGP = 25075 piasters

      const totalEGP = fromPiasters(piastersSum);
      expect(totalEGP).toBe(250.75);
    });

    it('works with array of items with quantities', () => {
      const items = [
        { key: 'item-1', count: 1 },
        { key: 'item-2', count: 2 }
      ];
      const result = distributeCostLargestRemainder(10, items);
      expect(result).toHaveLength(2);
      const totalPiasters = result.reduce((s, it) => s + it.piasters, 0);
      expect(totalPiasters).toBe(1000); // 10.00 EGP = 1000 piasters
      expect(result[0].totalCost + result[1].totalCost).toBe(10);
    });
  });

  describe('4. End-to-End Persistence Without Drift', () => {
    it('saves and reloads customer and supplier opening balances exactly as typed', async () => {
      // Customer with 10500.75
      const cust = await partiesRepo.create({
        code: 'CUST-EXACT-1',
        name: 'عميل دقة الحسابات الأول',
        is_customer: 1,
        is_supplier: 0,
        opening_balance: '10500.75',
        credit_limit: '50000.00'
      });

      // Supplier with 1234.56
      const sup = await partiesRepo.create({
        code: 'SUP-EXACT-1',
        name: 'مورد دقة الحسابات الأول',
        is_customer: 0,
        is_supplier: 1,
        opening_balance: '1234.56'
      });

      // Reload directly from DB
      const reloadedCust = await partiesRepo.getById(cust.id);
      expect(reloadedCust.opening_balance).toBe(10500.75);
      expect(reloadedCust.customer_balance).toBe(10500.75);
      expect(reloadedCust.available_credit).toBe(39499.25); // 50000 - 10500.75 exact

      const reloadedSup = await partiesRepo.getById(sup.id);
      expect(reloadedSup.opening_balance).toBe(1234.56);
      expect(reloadedSup.supplier_balance).toBe(1234.56);
    });
  });

  describe('5. Data Migration Engine with Verification and Safety Backup', () => {
    it('creates automatic backup, migrates legacy floating numbers, and reports zero difference', async () => {
      // Seed parties with legacy floats
      await db.parties.add({
        id: 'p-legacy-1',
        code: 'C-001',
        name: 'عميل قديم',
        is_customer: 1,
        is_supplier: 0,
        customer_balance: 1000.1,
        opening_balance: 1000.1000000000001,
        credit_limit: 5000.0,
        is_active: 1
      });
      await db.parties.add({
        id: 'p-legacy-2',
        code: 'S-001',
        name: 'مورد قديم',
        is_customer: 0,
        is_supplier: 1,
        supplier_balance: 2500.2,
        opening_balance: 2500.2000000000003,
        is_active: 1
      });

      // Run migration
      const report = await runMoneyPrecisionMigration();
      expect(report.status).toBe('success');
      expect(report.differences).toHaveLength(0);
      expect(report.customers.countBefore).toBe(1);
      expect(report.suppliers.countBefore).toBe(1);

      // Verify balances were converted cleanly to rounded exact decimals
      const migratedCust = await db.parties.get('p-legacy-1');
      expect(migratedCust.opening_balance).toBe(1000.1);
      expect(migratedCust.credit_limit).toBe(5000);

      const migratedSup = await db.parties.get('p-legacy-2');
      expect(migratedSup.opening_balance).toBe(2500.2);
    });
  });
});
