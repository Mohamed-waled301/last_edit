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

/** Account nature for opening balances (طبيعة الحساب): دائن = credit, مدين = debit. */
export type AccountNature = 'credit' | 'debit';

export const DEFAULT_SUPPLIER_OPENING_TYPE: AccountNature = 'credit'; // المورد دائن افتراضياً
export const DEFAULT_CUSTOMER_OPENING_TYPE: AccountNature = 'debit'; // العميل مدين افتراضياً

const VALID_NATURES: AccountNature[] = ['credit', 'debit'];

/** Normalize an account nature value with a role-based fallback. */
export function normalizeAccountNature(value: unknown, fallback: AccountNature): AccountNature {
  return (VALID_NATURES as string[]).includes(String(value)) ? (value as AccountNature) : fallback;
}

/** Normalize an opening balance magnitude (>= 0, defaults to 0 for legacy records). */
export function normalizeOpeningBalance(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

/**
 * Resolve the effective opening balance for one ledger side with graceful
 * fallbacks for legacy records (missing fields -> 0).
 *
 * Priority: side-specific field > generic opening_balance > legacy initial_* >
 * legacy *_balance snapshot > 0.
 */
export function resolveOpeningBalance(
  record: Record<string, unknown> | null | undefined,
  side: 'supplier' | 'customer'
): number {
  if (!record) return 0;
  if (side === 'supplier') {
    const v =
      record.supplier_opening_balance ??
      record.opening_balance ??
      record.initial_supplier_balance ??
      record.supplier_balance ??
      0;
    return normalizeOpeningBalance(v);
  }
  const v =
    record.customer_opening_balance ??
    record.opening_balance ??
    record.initial_customer_balance ??
    record.customer_balance ??
    0;
  return normalizeOpeningBalance(v);
}

/** Resolve the stored account nature for one ledger side (with role defaults). */
export function resolveOpeningType(
  record: Record<string, unknown> | null | undefined,
  side: 'supplier' | 'customer'
): AccountNature {
  if (!record) return side === 'supplier' ? DEFAULT_SUPPLIER_OPENING_TYPE : DEFAULT_CUSTOMER_OPENING_TYPE;
  if (side === 'supplier') {
    return normalizeAccountNature(
      record.supplier_opening_type ?? record.opening_balance_type,
      DEFAULT_SUPPLIER_OPENING_TYPE
    );
  }
  return normalizeAccountNature(
    record.customer_opening_type ?? record.opening_balance_type,
    DEFAULT_CUSTOMER_OPENING_TYPE
  );
}

export class BalanceCalculator {
  /**
   * 1. Calculate Supplier Balance (حساب رصيد المورد المستحق - فلوس علينا)
   * Current Balance = Opening Balance + Credit Purchases (فواتير آجل) - Cash Out / Payments (سندات صرف نقدية)
   * In invoice terms: Balance = Opening + (Sum of Valid Invoices) - (Sum of Paid Amounts) - (Sum of Balance Deducted Returns)
   */
  static calculateSupplierBalance(
    invoices: InvoiceRecord[] = [],
    returns: ReturnRecord[] = [],
    openingBalance: number = 0,
    unlinkedPayments: number = 0
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

    const unlinked = Math.max(0, Number(unlinkedPayments) || 0);
    const opening = normalizeOpeningBalance(openingBalance);
    const balanceDue = Math.max(0, Number((opening + totalInvoiced - totalPaid - totalReturns - unlinked).toFixed(2)));

    return {
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalPaid: Number((totalPaid + unlinked).toFixed(2)),
      totalReturns: Number(totalReturns.toFixed(2)),
      balanceDue
    };
  }

  /**
   * 2. Calculate Customer Balance (حساب رصيد العميل المستحق - فلوس لينا بره)
   * Current Balance = Opening Balance + Credit Sales (سحب فواتير آجل) - Cash In / Receipts (سندات قبض نقدية)
   * In invoice terms: Balance = Opening + (Sum of Valid Invoices) - (Sum of Collected Amounts) - (Sum of Balance Deducted Returns)
   */
  static calculateCustomerBalance(
    invoices: InvoiceRecord[] = [],
    returns: ReturnRecord[] = [],
    openingBalance: number = 0,
    unlinkedPayments: number = 0
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

    const unlinked = Math.max(0, Number(unlinkedPayments) || 0);
    const opening = normalizeOpeningBalance(openingBalance);
    const balanceDue = Math.max(0, Number((opening + totalInvoiced - totalPaid - totalReturns - unlinked).toFixed(2)));

    return {
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalPaid: Number((totalPaid + unlinked).toFixed(2)),
      totalReturns: Number(totalReturns.toFixed(2)),
      balanceDue
    };
  }

  /**
   * 3. Calculate Unified Party Balances, Net Balance & Offset (حساب رصيد الجهة الموحدة والمقاصة)
   * Each side includes its own opening balance (رصيد أول المدة).
   */
  static calculateUnifiedPartyBalance(
    supplierInvoices: InvoiceRecord[] = [],
    supplierReturns: ReturnRecord[] = [],
    customerInvoices: InvoiceRecord[] = [],
    customerReturns: ReturnRecord[] = [],
    supplierOpening: number = 0,
    customerOpening: number = 0,
    supplierUnlinkedPayments: number = 0,
    customerUnlinkedPayments: number = 0
  ): PartyBalanceSummary {
    const supBal = this.calculateSupplierBalance(supplierInvoices, supplierReturns, supplierOpening, supplierUnlinkedPayments);
    const custBal = this.calculateCustomerBalance(customerInvoices, customerReturns, customerOpening, customerUnlinkedPayments);

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
