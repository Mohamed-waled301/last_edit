/**
 * Workshop ERP - Pure Balance & Accounting Engine (محرك احتساب الأرصدة والحسابات)
 * Computes customer, supplier, and treasury balances accurately.
 */

export interface InvoiceRecord {
  total_amount?: number;
  total_invoice_amount?: number;
  paid_amount?: number;
  status?: string;
}

export interface ReturnRecord {
  total_amount?: number;
  refund_amount?: number;
  refund_status?: string;
  refund_method?: string;
}

export interface BalanceSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalReturns: number;
  balanceDue: number;
}

export class BalanceCalculator {
  /**
   * 1. Calculate Supplier Balance (حساب رصيد المورد المستحق)
   * Balance = (Sum of Valid Invoices) - (Sum of Paid Amounts) - (Sum of Balance Deducted Returns)
   */
  static calculateSupplierBalance(
    invoices: InvoiceRecord[] = [],
    returns: ReturnRecord[] = []
  ): BalanceSummary {
    let totalInvoiced = 0;
    let totalPaid = 0;

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        const invTotal = Number(inv.total_amount) || 0;
        const paid = Number(inv.paid_amount) || 0;
        totalInvoiced += invTotal;
        totalPaid += paid;
      }
    }

    let totalReturns = 0;
    for (const ret of returns) {
      if (ret.refund_status === 'deduct_balance') {
        totalReturns += Number(ret.total_amount) || 0;
      }
    }

    const balanceDue = Math.max(0, Number((totalInvoiced - totalPaid - totalReturns).toFixed(2)));

    return {
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalReturns: Number(totalReturns.toFixed(2)),
      balanceDue
    };
  }

  /**
   * 2. Calculate Customer Balance (حساب رصيد العميل المستحق - فلوس لينا بره)
   * Balance = (Sum of Valid Invoices) - (Sum of Collected Amounts) - (Sum of Balance Deducted Returns)
   */
  static calculateCustomerBalance(
    invoices: InvoiceRecord[] = [],
    returns: ReturnRecord[] = []
  ): BalanceSummary {
    let totalInvoiced = 0;
    let totalPaid = 0;

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        const invTotal = Number(inv.total_invoice_amount ?? inv.total_amount) || 0;
        const paid = Number(inv.paid_amount) || 0;
        totalInvoiced += invTotal;
        totalPaid += paid;
      }
    }

    let totalReturns = 0;
    for (const ret of returns) {
      if (ret.refund_method === 'deduct_balance' || ret.refund_status === 'deduct_balance') {
        totalReturns += Number(ret.refund_amount ?? ret.total_amount) || 0;
      }
    }

    const balanceDue = Math.max(0, Number((totalInvoiced - totalPaid - totalReturns).toFixed(2)));

    return {
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      totalReturns: Number(totalReturns.toFixed(2)),
      balanceDue
    };
  }

  /**
   * 3. Calculate Treasury Balance (حساب رصيد الخزينة أو البنك بعد العمليات)
   */
  static calculateTreasuryBalance(
    initialBalance: number,
    transactions: Array<{ tx_type: 'inflow' | 'outflow'; amount: number }> = []
  ): number {
    let balance = Number(initialBalance) || 0;
    for (const tx of transactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.tx_type === 'inflow') {
        balance += amt;
      } else if (tx.tx_type === 'outflow') {
        balance -= amt;
      }
    }
    return Number(balance.toFixed(2));
  }
}

export default BalanceCalculator;
