import { describe, it, expect } from 'vitest';
import {
  calculateStatementSummaryCards,
  computeMovementsWithRunningBalance,
  PartyInfo,
  StatementMovement
} from '../statementSummaryCards';

describe('Statement of Account (كشف الحساب) Summary Cards & Calculation Logic', () => {
  /* -------------------------------------------------------------------
   * 1. Supplier Scenario (Image Reference)
   * Opening: 1,200.00 Credit (له)
   * Period Invoices: 0.00
   * Total Paid: 800.00
   * Expected: Card #1 = 1,200.00, Card #2 = 0.00, Card #3 = 800.00, Card #4 = 400.00
   * Subtitle: "مستحق للجهة (له)"
   * ------------------------------------------------------------------- */
  it('Verifies Supplier Scenario: 1,200 Credit opening, 0 invoices, 800 paid = 400 remaining (له)', () => {
    const party: PartyInfo = {
      id: 'sup-1',
      name: 'مورد أقمشة وخامات التميز',
      is_customer: 0,
      is_supplier: 1,
      opening_balance: 1200,
      opening_balance_type: 'credit'
    };

    const rawMovements: StatementMovement[] = [
      {
        id: 'pay-1',
        date: '2026-10-15',
        doc_number: 'PAY-1001',
        stage: 'سند صرف',
        category: 'payments',
        description: 'سداد دفعة نقدية تحت الحساب',
        debit: 0,
        credit: 800
      }
    ];

    const computed = computeMovementsWithRunningBalance(rawMovements, 1200);
    expect(computed.items.length).toBe(1);
    expect(computed.items[0].running_balance).toBe(400);

    const summaryCards = calculateStatementSummaryCards({
      party,
      openingBalance: 1200,
      openingType: 'credit',
      filteredRows: computed.items,
      allMovements: computed.items,
      txTypeFilter: 'all'
    });

    expect(summaryCards.openingBalance).toBe(1200);
    expect(summaryCards.openingNatureText).toBe('دائن (مستحق له)');
    expect(summaryCards.periodInvoices).toBe(0);
    expect(summaryCards.periodPaid).toBe(800);
    expect(summaryCards.finalBalance).toBe(400);
    expect(summaryCards.subtitle).toBe('مستحق للجهة (له)');
    expect(summaryCards.valueClass).toBe('text-emerald-400');
    expect(summaryCards.subtitleClass).toBe('text-emerald-400');

    // Bottom ledger last row comparison
    const lastRowRunningBalance = computed.items[computed.items.length - 1].running_balance;
    expect(summaryCards.finalBalance).toBe(lastRowRunningBalance);
  });

  /* -------------------------------------------------------------------
   * 2. Customer Scenario (Image Reference)
   * Opening: 900.00 Debit (عليه)
   * Period Invoices: 110.00
   * Total Paid: 900.00
   * Expected: Card #1 = 900.00, Card #2 = 110.00, Card #3 = 900.00, Card #4 = 110.00
   * Subtitle: "مستحق على العميل (لنا)"
   * ------------------------------------------------------------------- */
  it('Verifies Customer Scenario: 900 Debit opening, 110 invoices, 900 paid = 110 remaining (لنا)', () => {
    const party: PartyInfo = {
      id: 'cust-1',
      name: 'عميل محلات الأناقة الحديثة',
      is_customer: 1,
      is_supplier: 0,
      opening_balance: 900,
      opening_balance_type: 'debit'
    };

    const rawMovements: StatementMovement[] = [
      {
        id: 'inv-1',
        date: '2026-10-10',
        doc_number: 'INV-2001',
        stage: 'فاتورة مبيعات',
        category: 'sales',
        description: 'توريد ملابس تامة الصنع',
        debit: 110,
        credit: 0
      },
      {
        id: 'rec-1',
        date: '2026-10-14',
        doc_number: 'REC-3001',
        stage: 'سند تحصيل',
        category: 'receipts',
        description: 'تحصيل نقدي بالخزينة',
        debit: 0,
        credit: 900
      }
    ];

    const computed = computeMovementsWithRunningBalance(rawMovements, 900);
    expect(computed.items.length).toBe(2);
    // After inv-1: 900 + 110 = 1010
    expect(computed.items[0].running_balance).toBe(1010);
    // After rec-1: 1010 - 900 = 110
    expect(computed.items[1].running_balance).toBe(110);

    const summaryCards = calculateStatementSummaryCards({
      party,
      openingBalance: 900,
      openingType: 'debit',
      filteredRows: computed.items,
      allMovements: computed.items,
      txTypeFilter: 'all'
    });

    expect(summaryCards.openingBalance).toBe(900);
    expect(summaryCards.openingNatureText).toBe('مدين (مستحق عليه)');
    expect(summaryCards.periodInvoices).toBe(110);
    expect(summaryCards.periodPaid).toBe(900);
    expect(summaryCards.finalBalance).toBe(110);
    expect(summaryCards.subtitle).toBe('مستحق على العميل (لنا)');
    expect(summaryCards.valueClass).toBe('text-emerald-400');
    expect(summaryCards.subtitleClass).toBe('text-emerald-400');

    // Bottom ledger last row comparison
    const lastRowRunningBalance = computed.items[computed.items.length - 1].running_balance;
    expect(summaryCards.finalBalance).toBe(lastRowRunningBalance);
  });

  /* -------------------------------------------------------------------
   * 3. Zero Balance (الحساب متزن) Scenarios
   * ------------------------------------------------------------------- */
  it('Verifies zero balance styling for balanced customer and supplier accounts', () => {
    // Customer balanced
    const cust: PartyInfo = { id: 'c-0', name: 'عميل متزن', is_customer: 1, is_supplier: 0 };
    const custCards = calculateStatementSummaryCards({
      party: cust,
      openingBalance: 500,
      openingType: 'debit',
      filteredRows: [
        { debit: 0, credit: 500, running_balance: 0 }
      ]
    });
    expect(custCards.finalBalance).toBe(0);
    expect(custCards.subtitle).toBe('الحساب متزن (0.00 ج.م)');
    expect(custCards.subtitleClass).toBe('text-slate-400');

    // Supplier balanced
    const sup: PartyInfo = { id: 's-0', name: 'مورد متزن', is_customer: 0, is_supplier: 1 };
    const supCards = calculateStatementSummaryCards({
      party: sup,
      openingBalance: 1500,
      openingType: 'credit',
      filteredRows: [
        { debit: 0, credit: 1500, running_balance: 0 }
      ]
    });
    expect(supCards.finalBalance).toBe(0);
    expect(supCards.subtitle).toBe('الحساب متزن (0.00 ج.م)');
    expect(supCards.subtitleClass).toBe('text-slate-400');
  });

  /* -------------------------------------------------------------------
   * 4. Negative Balance (Overpayment / Advances) Scenarios
   * ------------------------------------------------------------------- */
  it('Verifies negative balance styling and subtitles', () => {
    // Customer overpaid (credit balance, warning / red)
    const cust: PartyInfo = { id: 'c-neg', name: 'عميل دافع زيادة', is_customer: 1, is_supplier: 0 };
    const custCards = calculateStatementSummaryCards({
      party: cust,
      openingBalance: 500,
      openingType: 'debit',
      filteredRows: [
        { debit: 0, credit: 800, running_balance: -300 }
      ]
    });
    expect(custCards.finalBalance).toBe(-300);
    expect(custCards.subtitle).toBe('رصيد دائن / دافع زيادات (له)');
    expect(custCards.valueClass).toBe('text-rose-400');
    expect(custCards.subtitleClass).toBe('text-rose-400');

    // Supplier overpaid (debit balance, advance payments)
    const sup: PartyInfo = { id: 's-neg', name: 'مورد دفعات مقدمة', is_customer: 0, is_supplier: 1 };
    const supCards = calculateStatementSummaryCards({
      party: sup,
      openingBalance: 1000,
      openingType: 'credit',
      filteredRows: [
        { debit: 0, credit: 1400, running_balance: -400 }
      ]
    });
    expect(supCards.finalBalance).toBe(-400);
    expect(supCards.subtitle).toBe('رصيد مدين / دفعات مقدمة (لنا)');
    expect(supCards.valueClass).toBe('text-amber-400');
    expect(supCards.subtitleClass).toBe('text-amber-400');
  });

  /* -------------------------------------------------------------------
   * 5. Workshop / Printer / Embroidery Stages Dynamic Filtering
   * ------------------------------------------------------------------- */
  it('Verifies Workshop stage costs and dynamic filtering updates Card #2 and Card #3', () => {
    const workshopParty: PartyInfo = {
      id: 'ws-1',
      name: 'ورشة طباعة وتطريز الأهرام',
      is_customer: 0,
      is_supplier: 1,
      opening_balance: 0,
      opening_balance_type: 'credit'
    };

    const allMovements: StatementMovement[] = [
      {
        id: 'stg-1',
        date: '2026-10-01',
        doc_number: 'قصة #101',
        stage: 'طباعة',
        category: 'manufacturing',
        description: 'تشغيل مرحلة طباعة قصة 101',
        debit: 1500,
        credit: 0
      },
      {
        id: 'stg-2',
        date: '2026-10-05',
        doc_number: 'قصة #102',
        stage: 'تطريز',
        category: 'manufacturing',
        description: 'تشغيل مرحلة تطريز قصة 102',
        debit: 800,
        credit: 0
      },
      {
        id: 'pay-ws-1',
        date: '2026-10-10',
        doc_number: 'PAY-WS-01',
        stage: 'سند صرف',
        category: 'payments',
        description: 'سداد دفعة للورشة',
        debit: 0,
        credit: 1000
      }
    ];

    const computed = computeMovementsWithRunningBalance(allMovements, 0);
    expect(computed.items[0].running_balance).toBe(1500); // 0 + 1500
    expect(computed.items[1].running_balance).toBe(2300); // 1500 + 800
    expect(computed.items[2].running_balance).toBe(1300); // 2300 - 1000

    // Filter strictly by stage "طباعة"
    const printingRows = computed.items.filter(r => r.stage?.includes('طباعة'));
    const printingCards = calculateStatementSummaryCards({
      party: workshopParty,
      openingBalance: 0,
      openingType: 'credit',
      filteredRows: printingRows,
      allMovements: computed.items,
      txTypeFilter: 'all'
    });

    expect(printingCards.periodInvoices).toBe(1500);
    expect(printingCards.periodPaid).toBe(0);
    expect(printingCards.finalBalance).toBe(1500);
    expect(printingCards.subtitle).toBe('مستحق للجهة (له)');

    // Filter strictly by payments
    const paymentRows = computed.items.filter(r => r.category === 'payments');
    const paymentCards = calculateStatementSummaryCards({
      party: workshopParty,
      openingBalance: 0,
      openingType: 'credit',
      filteredRows: paymentRows,
      allMovements: computed.items,
      txTypeFilter: 'payments'
    });

    expect(paymentCards.periodInvoices).toBe(0);
    expect(paymentCards.periodPaid).toBe(1000);
    expect(paymentCards.finalBalance).toBe(1300);
  });

  /* -------------------------------------------------------------------
   * 6. Empty movements scenario (only opening balance)
   * ------------------------------------------------------------------- */
  it('Verifies statement with only opening balance correctly reconciles with table last row', () => {
    const party: PartyInfo = {
      id: 'sup-new',
      name: 'مورد جديد رصيد افتتاحي فقط',
      is_customer: 0,
      is_supplier: 1,
      opening_balance: 3500,
      opening_balance_type: 'credit'
    };

    const cards = calculateStatementSummaryCards({
      party,
      openingBalance: 3500,
      openingType: 'credit',
      filteredRows: [],
      allMovements: [],
      txTypeFilter: 'all'
    });

    expect(cards.openingBalance).toBe(3500);
    expect(cards.periodInvoices).toBe(0);
    expect(cards.periodPaid).toBe(0);
    expect(cards.finalBalance).toBe(3500);
    expect(cards.subtitle).toBe('مستحق للجهة (له)');
  });
});
