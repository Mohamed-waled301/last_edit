import { describe, it, expect } from 'vitest';
import BalanceCalculator from '../balances';

describe('BalanceCalculator - Unit Tests', () => {
  it('calculates supplier balance taking payments and returns into account', () => {
    const invoices = [
      { total_amount: 10000, paid_amount: 4000, status: 'partially_paid' },
      { total_amount: 5000, paid_amount: 5000, status: 'paid' },
      { total_amount: 3000, paid_amount: 0, status: 'unpaid' },
      { total_amount: 2000, paid_amount: 0, status: 'cancelled' }, // Should be ignored
    ];

    const returns = [
      { total_amount: 1000, refund_status: 'deduct_balance' },
      { total_amount: 500, refund_status: 'cash_refund' }, // Does not deduct unpaid invoice balance
    ];

    const res = BalanceCalculator.calculateSupplierBalance(invoices, returns);
    // Valid Invoiced: 10000 + 5000 + 3000 = 18000
    // Total Paid: 4000 + 5000 + 0 = 9000
    // Returns Deducted: 1000
    // Balance Due: 18000 - 9000 - 1000 = 8000
    expect(res.totalInvoiced).toBe(18000);
    expect(res.totalPaid).toBe(9000);
    expect(res.totalReturns).toBe(1000);
    expect(res.balanceDue).toBe(8000);
  });

  it('calculates customer balance taking receipts and returns into account', () => {
    const invoices = [
      { total_invoice_amount: 25000, paid_amount: 10000, status: 'partially_paid' },
      { total_invoice_amount: 15000, paid_amount: 15000, status: 'paid' },
      { total_invoice_amount: 8000, paid_amount: 0, status: 'unpaid' },
    ];

    const returns = [
      { refund_amount: 3000, refund_method: 'deduct_balance' },
    ];

    const res = BalanceCalculator.calculateCustomerBalance(invoices, returns);
    // Invoiced: 25000 + 15000 + 8000 = 48000
    // Paid: 10000 + 15000 = 25000
    // Returns: 3000
    // Due: 48000 - 25000 - 3000 = 20000
    expect(res.totalInvoiced).toBe(48000);
    expect(res.totalPaid).toBe(25000);
    expect(res.totalReturns).toBe(3000);
    expect(res.balanceDue).toBe(20000);
  });

  it('calculates treasury balance from initial balance and cash transactions', () => {
    const initial = 50000;
    const txs: Array<{ tx_type: 'inflow' | 'outflow'; amount: number }> = [
      { tx_type: 'inflow', amount: 15000 },
      { tx_type: 'outflow', amount: 8000 },
      { tx_type: 'outflow', amount: 2000 },
      { tx_type: 'inflow', amount: 5000 },
    ];

    const finalBal = BalanceCalculator.calculateTreasuryBalance(initial, txs);
    // 50000 + 15000 - 8000 - 2000 + 5000 = 60000
    expect(finalBal).toBe(60000);
  });
});
