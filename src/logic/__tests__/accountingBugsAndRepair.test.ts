import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { api } from '../../services/api';
import { cashRepo } from '../../data/repositories/cashRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { treasuriesRepo } from '../../data/repositories/treasuriesRepo';
import { dataManagementRepo } from '../../data/repositories/dataManagementRepo';
import { formatDate } from '../../utils/formatters';

describe('Accounting Bugs Fixes & Audit/Repair Tool', () => {
  beforeEach(async () => {
    await db.parties.clear();
    await db.suppliers.clear();
    await db.customers.clear();
    await db.treasury_accounts.clear();
    await db.cash_transactions.clear();
    await db.payments.clear();
    await db.customer_payments.clear();
    await db.supplier_invoices.clear();
    await db.sales_invoices.clear();
    if (db.audit_log) await db.audit_log.clear();
  });

  const setupTreasury = async (initialBalance = 100000) => {
    const trs = {
      id: `trs-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      code: 'TRS-MAIN',
      name: 'الخزينة الرئيسية',
      current_balance: initialBalance,
      opening_balance: initialBalance,
      is_main: 1,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.treasury_accounts.add(trs);
    return trs;
  };

  describe('Bug 1: Supplier & Customer Opening Balance Isolation', () => {
    it('saving a supplier opening balance of 212,438.00 creates NO fake payment or cash disbursement', async () => {
      // Create supplier with opening balance of 212,438.00 credit (owed to supplier)
      const sup = await partiesRepo.create({
        code: 'SUP-OPENING',
        name: 'مورد الأقمشة المستوردة',
        is_supplier: 1,
        is_customer: 0,
        supplier_opening_balance: 212438,
        supplier_opening_balance_type: 'credit',
        opening_balance: 212438,
        opening_balance_type: 'credit'
      });

      // 1. Verify db.payments is EMPTY
      const paymentsCount = await db.payments.count();
      expect(paymentsCount).toBe(0);

      // 2. Verify db.cash_transactions is EMPTY
      const cashTxCount = await db.cash_transactions.count();
      expect(cashTxCount).toBe(0);

      // 3. Verify supplier statement via suppliersRepo
      const stmt = await suppliersRepo.getStatement(sup.id);
      expect(stmt.opening_balance).toBe(212438);
      expect(stmt.summary.total_paid).toBe(0); // MUST NOT BE 212438!
      expect(stmt.summary.total_purchases).toBe(0);
      expect(stmt.summary.remaining_balance).toBe(212438);

      // 4. Movements in statement must only contain the single OPENING entry
      expect(stmt.movements.length).toBe(1);
      expect(stmt.movements[0].is_opening).toBe(true);
      expect(stmt.movements[0].type).toBe('رصيد أول المدة');
      expect(stmt.movements[0].credit).toBe(212438); // credit = owed to supplier
    });

    it('updating supplier opening balance updates the balance without generating payments', async () => {
      const sup = await partiesRepo.create({
        code: 'SUP-UPDATE',
        name: 'مورد خيوط',
        is_supplier: 1,
        is_customer: 0,
        supplier_opening_balance: 50000,
        supplier_opening_balance_type: 'credit'
      });

      // Update opening balance to 75,000
      await partiesRepo.update(sup.id, {
        supplier_opening_balance: 75000,
        supplier_opening_balance_type: 'credit'
      });

      const updatedSup = await partiesRepo.getById(sup.id);
      expect(Number(updatedSup.supplier_opening_balance || updatedSup.opening_balance)).toBe(75000);

      const paymentsCount = await db.payments.count();
      expect(paymentsCount).toBe(0);

      const stmt = await suppliersRepo.getStatement(sup.id);
      expect(stmt.opening_balance).toBe(75000);
      expect(stmt.summary.total_paid).toBe(0);
      expect(stmt.summary.remaining_balance).toBe(75000);
    });

    it('customer opening balance creates no fake receipts or disbursements', async () => {
      const cust = await partiesRepo.create({
        code: 'CUST-OPENING',
        name: 'عميل جملة التحرير',
        is_supplier: 0,
        is_customer: 1,
        customer_opening_balance: 80000,
        customer_opening_balance_type: 'debit',
        opening_balance: 80000,
        opening_balance_type: 'debit'
      });

      const customerPaymentsCount = await db.customer_payments.count();
      expect(customerPaymentsCount).toBe(0);

      const stmt = await salesRepo.getCustomerStatement(cust.id);
      expect(stmt.opening_balance).toBe(80000);
      expect(stmt.summary.total_collected).toBe(0);
      expect(stmt.summary.remaining_balance).toBe(80000);
    });
  });

  describe('Bug 2: Single Supplier Payment & Cash Disbursement Double Count Prevention', () => {
    it('supplier payment reduces treasury exactly once and is not double counted in cash screen', async () => {
      const trs = await setupTreasury(50000);
      const sup = await partiesRepo.create({
        code: 'SUP-PAY-TEST',
        name: 'مورد أزرار وسوست',
        is_supplier: 1,
        is_customer: 0,
        supplier_opening_balance: 10000,
        supplier_opening_balance_type: 'credit'
      });

      // Record a single payment of 3,000
      const paymentRes = await cashRepo.recordSupplierPayment({
        supplier_id: sup.id,
        supplier_name: sup.name,
        amount: 3000,
        treasury_id: trs.id,
        payment_method: 'cash',
        notes: 'دفعة نقدية تحت الحساب',
        created_by: 'test-admin'
      });

      expect(paymentRes).toBeDefined();

      // 1. Verify treasury balance was deducted by exactly 3,000 (50,000 -> 47,000)
      const updatedTrs = await db.treasury_accounts.get(trs.id);
      expect(updatedTrs.current_balance).toBe(47000);

      // 2. Verify db.payments has exactly 1 record
      const payments = await db.payments.toArray();
      expect(payments.length).toBe(1);
      expect(payments[0].amount).toBe(3000);

      // 3. Verify cash_transactions has the corresponding outflow with category 'supplier_payment'
      const cashTxs = await db.cash_transactions.toArray();
      expect(cashTxs.length).toBe(1);
      expect(cashTxs[0].category).toBe('supplier_payment');
      expect(cashTxs[0].reference_type).toBe('SUPPLIER_PAYMENT');

      // 4. Verify cash screen disbursements list filtering logic:
      // The cash transactions list must exclude supplier payments from operating expenses
      const expenseTxs = cashTxs.filter(t => 
        (t.category === 'operating_expense' || t.reference_type === 'EXPENSE_DISBURSEMENT') &&
        t.category !== 'supplier_payment' &&
        t.reference_type !== 'SUPPLIER_PAYMENT' &&
        t.category !== 'customer_payment' &&
        t.reference_type !== 'CUSTOMER_RECEIPT'
      );
      expect(expenseTxs.length).toBe(0); // Not counted as operating expense!

      // Total disbursed in unified cash screen:
      // Expense items (0) + Supplier payments (3,000) = exactly 3,000, NEVER 6,000!
      const totalDisbursed = expenseTxs.reduce((s, x) => s + (x.amount || 0), 0) + 
                             payments.reduce((s, p) => s + (p.amount || 0), 0);
      expect(totalDisbursed).toBe(3000);

      // 5. Verify supplier balance is 10,000 - 3,000 = 7,000
      const stmt = await suppliersRepo.getStatement(sup.id);
      expect(stmt.summary.total_paid).toBe(3000);
      expect(stmt.summary.remaining_balance).toBe(7000);
    });

    it('customer receipt increases treasury once and is not double counted', async () => {
      const trs = await setupTreasury(20000);
      const cust = await partiesRepo.create({
        code: 'CUST-REC-TEST',
        name: 'عميل محلات النور',
        is_supplier: 0,
        is_customer: 1,
        customer_opening_balance: 15000,
        customer_opening_balance_type: 'debit'
      });

      await cashRepo.recordCustomerReceipt({
        customer_id: cust.id,
        customer_name: cust.name,
        amount: 1500,
        treasury_id: trs.id,
        payment_method: 'cash',
        notes: 'دفعة سداد فاتورة',
        created_by: 'test-admin'
      });

      const updatedTrs = await db.treasury_accounts.get(trs.id);
      expect(updatedTrs.current_balance).toBe(21500); // 20,000 + 1,500

      const custPayments = await db.customer_payments.toArray();
      expect(custPayments.length).toBe(1);
      expect(custPayments[0].amount).toBe(1500);

      const stmt = await salesRepo.getCustomerStatement(cust.id);
      expect(stmt.summary.total_collected).toBe(1500);
      expect(stmt.summary.remaining_balance).toBe(13500); // 15,000 - 1,500
    });
  });

  describe('Accounting Audit & Safe Repair Tool ("فحص وتدقيق الحسابات")', () => {
    it('detects seeded anomalies and repairs them safely with pre-repair backup', async () => {
      const trs = await setupTreasury(50000);

      // Create supplier with 212,438 opening balance
      const sup = await partiesRepo.create({
        code: 'SUP-ANOMALY',
        name: 'مورد أقمشة شتوية',
        is_supplier: 1,
        is_customer: 0,
        supplier_opening_balance: 212438,
        supplier_opening_balance_type: 'credit',
        current_balance: 0 // Corrupted by fake payment
      });

      // Seed Anomaly 1: Fake opening payment row
      const fakePayment = {
        id: 'PAY-FAKE-OPENING-01',
        payment_number: 'PAY-00999',
        supplier_id: sup.id,
        supplier_name: sup.name,
        amount: 212438,
        treasury_id: trs.id,
        payment_method: 'cash',
        notes: 'رصيد افتتاحي (دائن)',
        status: 'active',
        created_at: new Date().toISOString()
      };
      await db.payments.add(fakePayment);

      // Seed Anomaly 2: Duplicate treasury transaction for the same payment
      const dupTx = {
        id: 'TXN-DUP-01',
        tx_number: 'TXN-PAY-7767-816',
        tx_type: 'outflow',
        category: 'operating_expense', // Misclassified as operating expense
        amount: 3000,
        treasury_id: trs.id,
        reference_type: 'EXPENSE_DISBURSEMENT',
        notes: 'سداد دفعة مورد مكرر',
        status: 'active',
        created_at: new Date().toISOString()
      };
      await db.cash_transactions.add(dupTx);

      // Seed Real Payment (must NOT be touched by repair)
      const realPayment = {
        id: 'PAY-REAL-01',
        payment_number: 'PAY-REAL-100',
        supplier_id: sup.id,
        supplier_name: sup.name,
        amount: 5000,
        treasury_id: trs.id,
        payment_method: 'cash',
        notes: 'سداد حقيقي عن فاتورة توريد',
        status: 'active',
        created_at: new Date().toISOString()
      };
      await db.payments.add(realPayment);

      // 1. Run audit
      const auditResult = await dataManagementRepo.auditAccountingAnomalies();
      expect(auditResult.anomalies.length).toBeGreaterThan(0);

      const fakeOpeningAnomaly = auditResult.anomalies.find(a => a.id === `anom-pay-${fakePayment.id}`);
      expect(fakeOpeningAnomaly).toBeDefined();
      expect(fakeOpeningAnomaly?.amount).toBe(212438);

      const anomalyIdsToRepair = auditResult.anomalies.map(a => a.id);

      // 2. Run safe repair
      const repairResult = await dataManagementRepo.repairAccountingAnomalies(anomalyIdsToRepair, 'ceo-user');
      expect(repairResult.success).toBe(true);
      expect(repairResult.repairedCount).toBeGreaterThan(0);

      // 3. Verify automatic pre-repair backup was taken
      expect(repairResult.backup).toBeDefined();
      expect(repairResult.backup.tablesCount).toBeGreaterThan(0);
      expect(repairResult.backup.timestamp).toBeDefined();

      // 4. Verify fake payment was cancelled with audit reason, NOT silently deleted
      const checkedFakePayment = await db.payments.get(fakePayment.id);
      expect(checkedFakePayment?.status).toBe('cancelled');
      expect(checkedFakePayment?.cancellation_reason).toContain('إلغاء آلي بواسطة أداة فحص وتصحيح الحسابات');

      // 5. Verify real payment remains completely active and untouched
      const checkedRealPayment = await db.payments.get(realPayment.id);
      expect(checkedRealPayment?.status).toBe('active');
      expect(checkedRealPayment?.amount).toBe(5000);

      // 6. Verify supplier balance is correctly recomputed: 212,438 - 5,000 real payment = 207,438
      const recalculatedSup = await partiesRepo.getById(sup.id);
      expect(Number(recalculatedSup.current_balance)).toBe(207438);
    });
  });

  describe('Date formatting consistency', () => {
    it('formats ISO dates to dd/mm/yyyy for Arabic RTL clarity', () => {
      expect(formatDate('2026-10-18')).toBe('18/10/2026');
      expect(formatDate('2026-01-05')).toBe('05/01/2026');
      expect(formatDate('2026-12-31')).toBe('31/12/2026');
    });
  });
});
