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
  supplierBalance: number; // فلوس علينا للمورد (أو دفعة مقدمة لنا إذا كان سالباً)
  customerBalance: number; // فلوس لينا عند العميل (أو دفعة مقدمة له إذا كان سالباً)
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

import { toPiasters, fromPiasters } from '../utils/money';

export class BalanceCalculator {
  /**
   * 1. Calculate Supplier Balance (حساب رصيد المورد المستحق - فلوس علينا أو دفعة مقدمة لنا)
   * Computed using exact integer piasters to eliminate floating-point drift.
   * Positive = money owed to supplier (مستحق له).
   * Negative = advance payment / money supplier owes us (دفعة مقدمة لصالحنا).
   */
  static calculateSupplierBalance(
    invoices: InvoiceRecord[] = [],
    returns: ReturnRecord[] = [],
    openingBalance: number = 0,
    unlinkedPayments: number = 0,
    openingType: AccountNature = DEFAULT_SUPPLIER_OPENING_TYPE
  ): BalanceSummary {
    let totalInvoicedPiasters = 0;
    let totalPaidPiasters = 0;

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        const invTotal = toPiasters(inv.total_amount);
        const paid = toPiasters(inv.paid_amount);
        totalInvoicedPiasters += invTotal;
        totalPaidPiasters += paid;
      }
    }

    let totalReturnsPiasters = 0;
    for (const ret of returns) {
      if (ret.refund_status === 'deduct_balance') {
        totalReturnsPiasters += toPiasters(ret.total_amount);
      }
    }

    const unlinkedPiasters = Math.max(0, toPiasters(unlinkedPayments));
    const rawOpeningPiasters = toPiasters(Math.abs(Number(openingBalance) || 0));
    // Supplier normal balance is credit (+). If debit, it is an advance payment (-).
    const openingPiasters = (Number(openingBalance) < 0 || openingType === 'debit')
      ? -rawOpeningPiasters
      : rawOpeningPiasters;

    const balanceDuePiasters =
      openingPiasters + totalInvoicedPiasters - totalPaidPiasters - totalReturnsPiasters - unlinkedPiasters;

    return {
      totalInvoiced: fromPiasters(totalInvoicedPiasters),
      totalPaid: fromPiasters(totalPaidPiasters + unlinkedPiasters),
      totalReturns: fromPiasters(totalReturnsPiasters),
      balanceDue: fromPiasters(balanceDuePiasters)
    };
  }

  /**
   * 2. Calculate Customer Balance (حساب رصيد العميل المستحق - فلوس لينا بره أو دفعة مقدمة له)
   * Computed using exact integer piasters to eliminate floating-point drift.
   * Positive = money owed by customer (مستحق عليه).
   * Negative = customer prepayment / advance deposit (دفعة مقدمة للعميل أمانة طرفنا).
   */
  static calculateCustomerBalance(
    invoices: InvoiceRecord[] = [],
    returns: ReturnRecord[] = [],
    openingBalance: number = 0,
    unlinkedPayments: number = 0,
    openingType: AccountNature = DEFAULT_CUSTOMER_OPENING_TYPE
  ): BalanceSummary {
    let totalInvoicedPiasters = 0;
    let totalPaidPiasters = 0;

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        const invTotal = toPiasters(inv.total_invoice_amount ?? inv.total_amount);
        const paid = toPiasters(inv.paid_amount);
        totalInvoicedPiasters += invTotal;
        totalPaidPiasters += paid;
      }
    }

    let totalReturnsPiasters = 0;
    for (const ret of returns) {
      if (ret.refund_method === 'deduct_balance' || ret.refund_status === 'deduct_balance') {
        totalReturnsPiasters += toPiasters(ret.refund_amount ?? ret.total_amount);
      }
    }

    const unlinkedPiasters = Math.max(0, toPiasters(unlinkedPayments));
    const rawOpeningPiasters = toPiasters(Math.abs(Number(openingBalance) || 0));
    // Customer normal balance is debit (+). If credit, it is an advance prepayment (-).
    const openingPiasters = (Number(openingBalance) < 0 || openingType === 'credit')
      ? -rawOpeningPiasters
      : rawOpeningPiasters;

    const balanceDuePiasters =
      openingPiasters + totalInvoicedPiasters - totalPaidPiasters - totalReturnsPiasters - unlinkedPiasters;

    return {
      totalInvoiced: fromPiasters(totalInvoicedPiasters),
      totalPaid: fromPiasters(totalPaidPiasters + unlinkedPiasters),
      totalReturns: fromPiasters(totalReturnsPiasters),
      balanceDue: fromPiasters(balanceDuePiasters)
    };
  }

  /**
   * 3. Calculate Unified Party Balances, Net Balance & Offset (حساب رصيد الجهة الموحدة والمقاصة)
   * Each side includes its own opening balance and advances.
   */
  static calculateUnifiedPartyBalance(
    supplierInvoices: InvoiceRecord[] = [],
    supplierReturns: ReturnRecord[] = [],
    customerInvoices: InvoiceRecord[] = [],
    customerReturns: ReturnRecord[] = [],
    supplierOpening: number = 0,
    customerOpening: number = 0,
    supplierUnlinkedPayments: number = 0,
    customerUnlinkedPayments: number = 0,
    supplierOpeningType: AccountNature = DEFAULT_SUPPLIER_OPENING_TYPE,
    customerOpeningType: AccountNature = DEFAULT_CUSTOMER_OPENING_TYPE
  ): PartyBalanceSummary {
    const supBal = this.calculateSupplierBalance(
      supplierInvoices,
      supplierReturns,
      supplierOpening,
      supplierUnlinkedPayments,
      supplierOpeningType
    );
    const custBal = this.calculateCustomerBalance(
      customerInvoices,
      customerReturns,
      customerOpening,
      customerUnlinkedPayments,
      customerOpeningType
    );

    const supPiasters = toPiasters(supBal.balanceDue);
    const custPiasters = toPiasters(custBal.balanceDue);
    const netPiasters = custPiasters - supPiasters;
    // Offset is only possible between positive mutual liabilities
    const maxOffsetPiasters = Math.max(0, Math.min(Math.max(0, supPiasters), Math.max(0, custPiasters)));

    return {
      supplierBalance: fromPiasters(supPiasters),
      customerBalance: fromPiasters(custPiasters),
      netBalance: fromPiasters(netPiasters),
      maxOffsetAmount: fromPiasters(maxOffsetPiasters)
    };
  }

  /**
   * 4. Calculate Treasury Balance (حساب رصيد الخزينة أو البنك بعد العمليات)
   */
  static calculateTreasuryBalance(
    initialBalance: number,
    transactions: Array<{ tx_type: 'inflow' | 'outflow'; amount: number }> = []
  ): number {
    let balancePiasters = toPiasters(initialBalance);
    for (const tx of transactions) {
      const amtPiasters = toPiasters(tx.amount);
      if (tx.tx_type === 'inflow') {
        balancePiasters += amtPiasters;
      } else if (tx.tx_type === 'outflow') {
        balancePiasters -= amtPiasters;
      }
    }
    return fromPiasters(balancePiasters);
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
