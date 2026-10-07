/**
 * Workshop ERP - Pure Balance & Accounting Engine (محرك احتساب الأرصدة والحسابات)
 * Computes customer, supplier, unified party, and treasury balances accurately.
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

export interface PartyBalanceSummary {
  supplierBalance: number; // فلوس علينا للمورد
  customerBalance: number; // فلوس لينا عند العميل
  netBalance: number;      // الصافي (إيجابي = لنا عند العميل، سلبي = علينا للمورد)
  maxOffsetAmount: number; // أقصى مبلغ ممكن إجراء مقاصة به = min(supplierBalance, customerBalance)
}

export class BalanceCalculator {
  /**
   * 1. Calculate Supplier Balance (حساب رصيد المورد المستحق - فلوس علينا)
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
   * 3. Calculate Unified Party Balances, Net Balance & Offset (حساب رصيد الجهة الموحدة والمقاصة)
   */
  static calculateUnifiedPartyBalance(
    supplierInvoices: InvoiceRecord[] = [],
    supplierReturns: ReturnRecord[] = [],
    customerInvoices: InvoiceRecord[] = [],
    customerReturns: ReturnRecord[] = []
  ): PartyBalanceSummary {
    const supBal = this.calculateSupplierBalance(supplierInvoices, supplierReturns);
    const custBal = this.calculateCustomerBalance(customerInvoices, customerReturns);

    const supplierBalance = supBal.balanceDue;
    const customerBalance = custBal.balanceDue;
    const netBalance = Number((customerBalance - supplierBalance).toFixed(2));
    const maxOffsetAmount = Math.max(0, Number(Math.min(supplierBalance, customerBalance).toFixed(2)));

    return {
      supplierBalance,
      customerBalance,
      netBalance,
      maxOffsetAmount
    };
  }

  /**
   * 4. Calculate Treasury Balance (حساب رصيد الخزينة أو البنك بعد العمليات)
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

export function calculateUnifiedPartyBalance(
  supplierVal: number | InvoiceRecord[] = 0,
  customerVal: number | InvoiceRecord[] = 0,
  supplierReturns: ReturnRecord[] = [],
  customerReturns: ReturnRecord[] = []
): {
  supplier_balance: number;
  customer_balance: number;
  net_balance: number;
  max_offset: number;
} {
  let sup = 0;
  let cust = 0;

  if (typeof supplierVal === 'number') {
    sup = Math.max(0, supplierVal);
  } else {
    sup = BalanceCalculator.calculateSupplierBalance(supplierVal, supplierReturns).balanceDue;
  }

  if (typeof customerVal === 'number') {
    cust = Math.max(0, customerVal);
  } else {
    cust = BalanceCalculator.calculateCustomerBalance(customerVal, customerReturns).balanceDue;
  }

  const net = Number((sup - cust).toFixed(2));
  const maxOffset = Math.max(0, Number(Math.min(sup, cust).toFixed(2)));

  return {
    supplier_balance: sup,
    customer_balance: cust,
    net_balance: net,
    max_offset: maxOffset
  };
}

export default BalanceCalculator;
