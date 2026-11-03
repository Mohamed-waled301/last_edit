import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../data/db';
import { getEntityCurrentBalance, getAllEntitiesCurrentBalances } from '../../services/balanceService';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { salesRepo } from '../../data/repositories/salesRepo';
import { cashRepo } from '../../data/repositories/cashRepo';
import { calculateStatementSummaryCards } from '../statementSummaryCards';
import { computeSupplierDebts, computeCustomerReceivables } from '../dashboardMetrics';
import { getTodayDateString } from '../../utils/formatters';

describe('Centralized Balance Engine & Universal Advance Payments Suite', () => {
  beforeEach(async () => {
    // Clean all relevant tables before each test
    await db.parties.clear();
    await db.suppliers.clear();
    await db.customers.clear();
    await db.supplier_invoices.clear();
    await db.payments.clear();
    await db.supplier_returns.clear();
    await db.sales_invoices.clear();
    await db.customer_payments.clear();
    await db.customer_returns.clear();
    await db.production_orders.clear();
    await db.purchase_orders.clear();
    await db.cash_transactions.clear();
    await db.treasury_accounts.clear();

    // Seed default treasury account
    await db.treasury_accounts.put({
      id: 'box-main',
      name: 'الخزينة الرئيسية',
      current_balance: 100000,
      balance: 100000,
      is_main: 1,
      is_active: 1
    });
  });

  // =========================================================================
  // 1. Supplier Scenario: "حمادة أبو اليزيد" (Exact balance matching & no double counting)
  // =========================================================================
  it('calculates the exact balance for supplier "حمادة أبو اليزيد" across engine, repo, and statement cards', async () => {
    const supplierId = 'sup-hamada-abu-el-yazeed';
    const supplierName = 'حمادة أبو اليزيد';

    // 1. Create supplier with 5,000 ج.م opening balance (credit / مستحق له)
    await db.suppliers.put({
      id: supplierId,
      name: supplierName,
      code: 'SUP-001',
      phone: '01012345678',
      opening_balance: 5000,
      opening_balance_type: 'credit',
      is_supplier: 1,
      is_customer: 0
    });

    await db.parties.put({
      id: supplierId,
      name: supplierName,
      code: 'SUP-001',
      phone: '01012345678',
      opening_balance: 5000,
      opening_balance_type: 'credit',
      supplier_opening_balance: 5000,
      supplier_opening_type: 'credit',
      is_supplier: 1,
      is_customer: 0
    });

    // Verify initial balance
    const initialBal = await getEntityCurrentBalance(supplierId);
    expect(initialBal.currentBalance).toBe(5000);
    expect(initialBal.supplierBalance).toBe(5000);

    // 2. Add cutting order with workshop stages assigned to "حمادة أبو اليزيد" (cost 3,500 ج.م)
    const cutOrderId = 'cut-ord-101';
    await db.production_orders.put({
      id: cutOrderId,
      order_number: 'CUT-101',
      cutting_number: '101',
      stages: {
        printing: {
          vendor_id: supplierId,
          total_cost: 3500,
          stage_cost: 3500,
          status: 'completed'
        }
      }
    });

    // Cutting order stage generates a supplier invoice
    const stageInvId = `sinv-cut-${cutOrderId}-printing`;
    await db.supplier_invoices.put({
      id: stageInvId,
      invoice_number: 'INV-CUT-101-printing',
      supplier_id: supplierId,
      reference_type: 'CUTTING_ORDER',
      cut_order_id: cutOrderId,
      stage_key: 'printing',
      total_amount: 3500,
      paid_amount: 0,
      payment_terms: 'credit',
      status: 'unpaid',
      invoice_date: '2026-11-01'
    });

    // 3. Issue a cash payment voucher (سند صرف) for 2,000 ج.م
    await cashRepo.recordSupplierPayment({
      supplier_id: supplierId,
      account_id: 'box-main',
      amount: 2000,
      payment_date: getTodayDateString(),
      payment_method: 'نقدية (كاش)',
      notes: 'دفعة نقدية تحت الحساب'
    }, 'usr-admin');

    // Theoretical true balance: 5,000 + 3,500 - 2,000 = 6,500 ج.م
    const expectedBalance = 6500;

    // A. Verify Central Balance Engine
    const centralBal = await getEntityCurrentBalance(supplierId);
    expect(centralBal.currentBalance).toBe(expectedBalance);
    expect(centralBal.supplierBalance).toBe(expectedBalance);
    expect(centralBal.supplierInvoiced).toBe(3500);
    expect(centralBal.supplierPaid).toBe(2000);
    expect(centralBal.supplierOpening).toBe(5000);

    // B. Verify Suppliers Repository (getAll and getById)
    const supplierFromRepo = await suppliersRepo.getById(supplierId);
    expect(supplierFromRepo.supplier_balance).toBe(expectedBalance);
    expect(supplierFromRepo.balance_due).toBe(expectedBalance);

    const allSuppliers = await suppliersRepo.getAll();
    const hamadaFromList = allSuppliers.find(s => s.id === supplierId);
    expect(hamadaFromList).toBeDefined();
    expect(hamadaFromList.supplier_balance).toBe(expectedBalance);

    // C. Verify Supplier Statement
    const statementRes = await suppliersRepo.getStatement(supplierId);
    expect(statementRes.summary.remaining_balance).toBe(expectedBalance);

    // D. Verify Statement Summary Cards (as mapped by VendorStatementPage)
    const statementRows = statementRes.statement
      .filter(m => !m.is_opening)
      .map(m => ({
        debit: m.credit > 0 ? m.credit : 0,
        credit: m.debit > 0 ? m.debit : 0,
        running_balance: m.balance_after
      }));

    const cards = calculateStatementSummaryCards({
      party: supplierFromRepo,
      openingBalance: statementRes.opening_balance,
      openingType: statementRes.opening_balance_type,
      filteredRows: statementRows,
      allMovements: statementRows,
      txTypeFilter: 'all'
    });

    expect(cards.openingBalance).toBe(5000);
    expect(cards.periodInvoices).toBe(3500);
    expect(cards.periodPaid).toBe(2000);
    expect(cards.finalBalance).toBe(expectedBalance);
    expect(cards.subtitle).toBe('مستحق للجهة (له)');

    // E. Verify Dashboard Metrics does NOT double count stage invoices & production orders
    const dashboardDebts = computeSupplierDebts(
      await db.parties.toArray(),
      await db.suppliers.toArray(),
      await db.supplier_invoices.toArray(),
      [],
      await db.payments.toArray(),
      [],
      await db.production_orders.toArray()
    );
    expect(dashboardDebts.total).toBe(expectedBalance);
  });

  // =========================================================================
  // 2. Universal Advance Payments & Zero-Balance Support (الدفعات المقدمة للأرصدة الصفرية)
  // =========================================================================
  it('allows issuing an advance cash payment to a new supplier with 0.00 balance', async () => {
    const zeroSupId = 'sup-zero-balance';

    await db.suppliers.put({
      id: zeroSupId,
      name: 'مورد جديد رصيد صفر',
      opening_balance: 0,
      opening_balance_type: 'credit',
      is_supplier: 1,
      is_customer: 0
    });

    await db.parties.put({
      id: zeroSupId,
      name: 'مورد جديد رصيد صفر',
      opening_balance: 0,
      opening_balance_type: 'credit',
      is_supplier: 1,
      is_customer: 0
    });

    // Check initial zero balance
    const initBal = await getEntityCurrentBalance(zeroSupId);
    expect(initBal.currentBalance).toBe(0);

    // Issue advance cash payment voucher of 1,200 ج.م
    const payRes = await cashRepo.recordSupplierPayment({
      supplier_id: zeroSupId,
      account_id: 'box-main',
      amount: 1200,
      payment_date: getTodayDateString(),
      payment_method: 'نقدية (كاش)',
      notes: 'دفعة مقدمة تحت الحساب'
    }, 'usr-admin');

    expect(payRes.success).toBe(true);
    expect(payRes.paymentId || payRes.id).toBeDefined();

    // True balance is -1,200 ج.م (we paid in advance, so supplier owes us / رصيد مدين)
    const afterBal = await getEntityCurrentBalance(zeroSupId);
    expect(afterBal.currentBalance).toBe(-1200);
    expect(afterBal.supplierBalance).toBe(-1200);
    expect(afterBal.isAdvance).toBe(true);

    // Summary cards reflect advance status cleanly
    const cards = calculateStatementSummaryCards({
      party: { is_supplier: 1, is_customer: 0 },
      openingBalance: 0,
      openingType: 'credit',
      filteredRows: [
        { debit: 0, credit: 1200, running_balance: -1200 }
      ],
      txTypeFilter: 'all'
    });

    expect(cards.finalBalance).toBe(-1200);
    expect(cards.subtitle).toBe('رصيد مدين / دفعات مقدمة (لنا)');
  });

  it('allows issuing a cash receipt voucher to a new customer with 0.00 balance', async () => {
    const zeroCustId = 'cust-zero-balance';

    await db.customers.put({
      id: zeroCustId,
      name: 'عميل جديد رصيد صفر',
      opening_balance: 0,
      opening_balance_type: 'debit',
      is_customer: 1,
      is_supplier: 0
    });

    await db.parties.put({
      id: zeroCustId,
      name: 'عميل جديد رصيد صفر',
      opening_balance: 0,
      opening_balance_type: 'debit',
      is_customer: 1,
      is_supplier: 0
    });

    // Issue customer receipt voucher (سند قبض) of 800 ج.م
    const recRes = await cashRepo.recordCustomerReceipt({
      customer_id: zeroCustId,
      account_id: 'box-main',
      amount: 800,
      receipt_date: getTodayDateString(),
      receipt_method: 'نقدية (كاش)',
      notes: 'عربون حجز بضاعة'
    }, 'usr-admin');

    expect(recRes.success).toBe(true);

    // True customer balance is -800 ج.م (advance credit / رصيد دائن أمانة طرفنا)
    const afterBal = await getEntityCurrentBalance(zeroCustId);
    expect(afterBal.currentBalance).toBe(-800);
    expect(afterBal.customerBalance).toBe(-800);
    expect(afterBal.isAdvance).toBe(true);

    // Statement cards reflect customer deposit cleanly
    const cards = calculateStatementSummaryCards({
      party: { is_customer: 1, is_supplier: 0 },
      openingBalance: 0,
      openingType: 'debit',
      filteredRows: [
        { debit: 0, credit: 800, running_balance: -800 }
      ],
      txTypeFilter: 'all'
    });

    expect(cards.finalBalance).toBe(-800);
    expect(cards.subtitle).toBe('رصيد دائن / دفعات مقدمة (له)');
  });

  // =========================================================================
  // 3. Cash vs Credit Invoices (Zero Phantom Debt)
  // =========================================================================
  it('does NOT accumulate unpaid debt on cash purchase invoices', async () => {
    const supplierId = 'sup-cash-purchases';

    await db.suppliers.put({
      id: supplierId,
      name: 'مورد نقدي',
      opening_balance: 0,
      opening_balance_type: 'credit',
      is_supplier: 1,
      is_customer: 0
    });

    // Record cash purchase invoice
    await db.supplier_invoices.put({
      id: 'sinv-cash-1',
      invoice_number: 'INV-PUR-CASH-1',
      supplier_id: supplierId,
      total_amount: 4500,
      paid_amount: 4500,
      payment_terms: 'cash',
      status: 'paid',
      invoice_date: '2026-11-03'
    });

    // Authoritative balance MUST be 0.00
    const bal = await getEntityCurrentBalance(supplierId);
    expect(bal.currentBalance).toBe(0);
    expect(bal.supplierBalance).toBe(0);

    // Statement of account balance due MUST also be 0.00
    const stmt = await suppliersRepo.getStatement(supplierId);
    expect(stmt.summary.remaining_balance).toBe(0);
  });

  it('does NOT accumulate unpaid debt on cash sales invoices', async () => {
    const customerId = 'cust-cash-sales';

    await db.customers.put({
      id: customerId,
      name: 'عميل نقدي',
      opening_balance: 0,
      opening_balance_type: 'debit',
      is_customer: 1,
      is_supplier: 0
    });

    // Record cash sales invoice
    await db.sales_invoices.put({
      id: 'inv-sls-cash-1',
      invoice_number: 'INV-SLS-CASH-1',
      customer_id: customerId,
      total_amount: 3200,
      total_invoice_amount: 3200,
      paid_amount: 3200,
      payment_terms: 'cash',
      status: 'paid',
      invoice_date: '2026-11-03'
    });

    // Authoritative balance MUST be 0.00
    const bal = await getEntityCurrentBalance(customerId);
    expect(bal.currentBalance).toBe(0);
    expect(bal.customerBalance).toBe(0);

    // Statement of account balance due MUST also be 0.00
    const stmt = await salesRepo.getCustomerStatement(customerId);
    expect(stmt.summary.remaining_balance).toBe(0);
  });
});
