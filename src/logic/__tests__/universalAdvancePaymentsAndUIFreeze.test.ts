import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { cashRepo } from '../../data/repositories/cashRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { manufacturingRepo } from '../../data/repositories/manufacturingRepo';
import { calculateStatementSummaryCards, computeMovementsWithRunningBalance } from '../statementSummaryCards';
import navigationGuard from '../../utils/navigationGuard';

describe('Universal Advance Payments & Credit/Debit Support (الدفعات المقدمة والأرصدة الصفرية)', () => {
  beforeEach(async () => {
    await db.payments.clear();
    await db.customer_payments.clear();
    await db.cash_transactions.clear();
    await db.treasury_accounts.clear();
    await db.parties.clear();
    await db.production_orders.clear();

    // Create main treasury
    await db.treasury_accounts.add({
      id: 'trs-main',
      code: 'TRS-01',
      name: 'الخزينة الرئيسية',
      current_balance: 50000,
      opening_balance: 50000,
      is_main: 1,
      is_active: 1,
      created_at: new Date().toISOString()
    });
  });

  it('allows recording cash payment to a new supplier with 0.00 balance (دفعة مقدمة لمورد جديد)', async () => {
    const party = await partiesRepo.create({
      code: 'SUP-NEW-01',
      name: 'مورد أقمشة جديد',
      is_supplier: 1,
      is_customer: 0,
      opening_balance: 0,
      supplier_opening_balance: 0
    });

    const res = await cashRepo.recordSupplierPayment({
      supplier_id: party.id,
      amount: 5000,
      payment_method: 'نقداً',
      notes: 'عربون حجز خامات قطنية'
    });

    expect(res.success).toBe(true);
    expect(res.isAdvance).toBe(true);
    expect(res.amount).toBe(5000);

    // Verify treasury decreased by 5000
    const trs = await db.treasury_accounts.get('trs-main');
    expect(trs.current_balance).toBe(45000);

    // Verify payment record in db
    const payRecord = await db.payments.get(res.id);
    expect(payRecord).toBeDefined();
    expect(payRecord.is_advance).toBe(1);
    expect(payRecord.amount).toBe(5000);
  });

  it('allows recording cash receipt from a new customer with 0.00 balance (دفعة مقدمة وعربون من عميل جديد)', async () => {
    const cust = await partiesRepo.create({
      code: 'CUST-NEW-01',
      name: 'عميل جملة جديد',
      is_customer: 1,
      is_supplier: 0,
      opening_balance: 0,
      customer_opening_balance: 0
    });

    const res = await cashRepo.recordCustomerReceipt({
      customer_id: cust.id,
      amount: 12000,
      payment_method: 'نقداً',
      notes: 'عربون حجز تشغيلة قمصان صيفي'
    });

    expect(res.success).toBe(true);
    expect(res.isAdvance).toBe(true);
    expect(res.amount).toBe(12000);

    // Verify treasury increased by 12000
    const trs = await db.treasury_accounts.get('trs-main');
    expect(trs.current_balance).toBe(62000);

    // Verify receipt record in db
    const recRecord = await db.customer_payments.get(res.id);
    expect(recRecord).toBeDefined();
    expect(recRecord.is_advance).toBe(1);
    expect(recRecord.amount).toBe(12000);
  });

  it('allows payment to contractor / workshop with zero balance or exceeding balance (دفعة مقدمة للورش والمطابع)', async () => {
    const workshop = await partiesRepo.create({
      code: 'WKS-PRN-01',
      name: 'مطبعة الألوان السريعة',
      is_supplier: 1,
      supplier_type: 'service',
      service_stage: 'printing',
      opening_balance: 0
    });

    const res = await cashRepo.recordSupplierPayment({
      supplier_id: workshop.id,
      amount: 3500,
      payment_method: 'تحويل بنكي',
      notes: 'دفعة مقدمة تحت الحساب لتجهيز شابلونات الطباعة'
    });

    expect(res.success).toBe(true);
    expect(res.isAdvance).toBe(true);
    expect(res.amount).toBe(3500);

    const payRecord = await db.payments.get(res.id);
    expect(payRecord.supplier_id).toBe(workshop.id);
    expect(payRecord.is_advance).toBe(1);
  });

  it('correctly calculates statement running balance and summary cards for advance payments', () => {
    // Supplier with 0 opening balance who received 4000 advance payment
    const supplierParty = {
      id: 'sup-1',
      name: 'مورد غزل',
      is_supplier: 1,
      is_customer: 0,
      opening_balance: 0,
      opening_balance_type: 'credit' as const
    };

    const movements = [
      {
        id: 'mov-1',
        date: '2026-11-01',
        doc_number: 'PAY-001',
        description: 'دفعة مقدمة تحت الحساب',
        debit: 0,
        credit: 4000
      }
    ];

    const computed = computeMovementsWithRunningBalance(movements, 0);
    expect(computed.closing_balance).toBe(-4000);
    expect(computed.items[0].running_balance).toBe(-4000);

    const cards = calculateStatementSummaryCards({
      party: supplierParty,
      openingBalance: 0,
      openingType: 'credit',
      filteredRows: computed.items,
      allMovements: computed.items,
      txTypeFilter: 'all'
    });

    expect(cards.finalBalance).toBe(-4000);
    expect(cards.subtitle).toBe('رصيد مدين / دفعات مقدمة (لنا)');
    expect(cards.subtitleClass).toBe('text-amber-400');
    expect(cards.valueClass).toBe('text-amber-400');

    // Customer with 0 opening balance who deposited 6000 advance payment
    const customerParty = {
      id: 'cust-1',
      name: 'عميل محلات النور',
      is_customer: 1,
      is_supplier: 0,
      opening_balance: 0,
      opening_balance_type: 'debit' as const
    };

    const custMovements = [
      {
        id: 'mov-2',
        date: '2026-11-01',
        doc_number: 'REC-001',
        description: 'عربون تحت الحساب',
        debit: 0,
        credit: 6000
      }
    ];

    const custComputed = computeMovementsWithRunningBalance(custMovements, 0);
    expect(custComputed.closing_balance).toBe(-6000);
    expect(custComputed.items[0].running_balance).toBe(-6000);

    const custCards = calculateStatementSummaryCards({
      party: customerParty,
      openingBalance: 0,
      openingType: 'debit',
      filteredRows: custComputed.items,
      allMovements: custComputed.items,
      txTypeFilter: 'all'
    });

    expect(custCards.finalBalance).toBe(-6000);
    expect(custCards.subtitle).toBe('رصيد دائن / دفعات مقدمة (له)');
    expect(custCards.subtitleClass).toBe('text-rose-400');
    expect(custCards.valueClass).toBe('text-rose-400');
  });

  it('verifies navigation guard registration and clean unregister without memory leaks', () => {
    let isDirty = true;
    const unregister = navigationGuard.register(() => isDirty);

    expect(navigationGuard.hasUnsavedChanges()).toBe(true);

    isDirty = false;
    expect(navigationGuard.hasUnsavedChanges()).toBe(false);

    unregister();
    expect(navigationGuard.hasUnsavedChanges()).toBe(false);
  });
});
