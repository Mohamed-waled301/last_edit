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
    expect(res.totalInvoiced).toBe(48000);
    expect(res.totalPaid).toBe(25000);
    expect(res.totalReturns).toBe(3000);
    expect(res.balanceDue).toBe(20000);
  });

  it('calculates unified party net balance and offset capacity', () => {
    const supInvoices = [{ total_amount: 12000, paid_amount: 2000, status: 'partially_paid' }]; // Due: 10,000
    const supReturns: any[] = [];
    const custInvoices = [{ total_invoice_amount: 18000, paid_amount: 4000, status: 'partially_paid' }]; // Due: 14,000
    const custReturns: any[] = [];

    const partyBal = BalanceCalculator.calculateUnifiedPartyBalance(supInvoices, supReturns, custInvoices, custReturns);
    expect(partyBal.supplierBalance).toBe(10000);
    expect(partyBal.customerBalance).toBe(14000);
    expect(partyBal.netBalance).toBe(4000); // Customer owes us 4,000 net
    expect(partyBal.maxOffsetAmount).toBe(10000); // Can offset up to 10,000
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
    expect(finalBal).toBe(60000);
  });
});
