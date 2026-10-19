/**
 * Statement of Account (كشف الحساب) Summary Cards Logic
 * Unified financial calculations for Customer, Supplier, Workshop, Printer, and Subcontractor statements.
 * 
 * Rules:
 * 1. Card #1: رصيد أول المدة (Opening Balance)
 *    - Dynamic nature: مدين (مستحق عليه) or دائن (مستحق له)
 * 2. Card #2: إجمالي الفواتير والتوريدات (Period Invoices & Services)
 *    - Sum of all debits strictly within active filters / date range
 *    - Subtitle: الفواتير وتكلفة المراحل للفترة
 * 3. Card #3: إجمالي المسدد (Total Paid / Settled)
 *    - Sum of all credits strictly within active filters / date range
 *    - Subtitle: سندات الصرف والدفعات المعتمدة
 * 4. Card #4: الرصيد المتبقي الحالي (Final Remaining Cumulative Balance)
 *    - Exact cumulative formula matching the bottom transaction ledger's last row
 *    - Dynamic subtitles and styling based on party nature and positive/zero/negative values
 */

export interface PartyInfo {
  id?: string | number;
  name?: string;
  is_customer?: boolean | number;
  is_supplier?: boolean | number;
  customer_opening_balance?: number;
  supplier_opening_balance?: number;
  opening_balance?: number;
  opening_balance_type?: 'debit' | 'credit';
  customer_opening_type?: 'debit' | 'credit';
  supplier_opening_type?: 'debit' | 'credit';
}

export interface StatementMovement {
  id?: string | number;
  date?: string;
  doc_number?: string;
  stage?: string;
  category?: string;
  description?: string;
  debit: number;
  credit: number;
  running_balance?: number;
  cut_order_id?: string | number | null;
  po_id?: string | number | null;
}

export interface StatementSummaryCardsResult {
  openingBalance: number;
  openingNature: 'debit' | 'credit';
  openingNatureText: string;
  signedOpening: number;
  periodInvoices: number;
  periodPaid: number;
  finalBalance: number;
  subtitle: string;
  subtitleClass: string;
  valueClass: string;
  isCustomer: boolean;
}

/**
 * Computes running balances chronologically for movements.
 * Debit increases balance, Credit decreases balance.
 */
export function computeMovementsWithRunningBalance(
  rawMovements: StatementMovement[],
  signedOpening: number
): {
  items: StatementMovement[];
  closing_balance: number;
  total_debit: number;
  total_credit: number;
} {
  let running = Number(signedOpening) || 0;
  let totDebit = 0;
  let totCredit = 0;

  const items = rawMovements.map((m) => {
    const d = Number(m.debit) || 0;
    const c = Number(m.credit) || 0;
    running = Number((running + d - c).toFixed(2));
    totDebit += d;
    totCredit += c;
    return {
      ...m,
      debit: d,
      credit: c,
      running_balance: running
    };
  });

  return {
    items,
    closing_balance: Number(running.toFixed(2)),
    total_debit: Number(totDebit.toFixed(2)),
    total_credit: Number(totCredit.toFixed(2))
  };
}

/**
 * Calculates the 4 summary cards for Statement of Account.
 */
export function calculateStatementSummaryCards(options: {
  party: PartyInfo | null;
  openingBalance?: number;
  openingType?: 'debit' | 'credit' | string;
  filteredRows?: StatementMovement[];
  allMovements?: StatementMovement[];
  txTypeFilter?: string;
}): StatementSummaryCardsResult {
  const {
    party,
    openingBalance = 0,
    openingType,
    filteredRows = [],
    allMovements = [],
    txTypeFilter = 'all'
  } = options;

  const isCust = Boolean(party?.is_customer && !party?.is_supplier);
  const openBal = Math.abs(Number(openingBalance) || 0);

  // Determine nature of opening balance
  const resolvedOpeningType: 'debit' | 'credit' = (openingType === 'debit' || openingType === 'credit')
    ? openingType
    : (isCust ? 'debit' : 'credit');

  const openingNatureText = resolvedOpeningType === 'debit'
    ? 'مدين (مستحق عليه)'
    : 'دائن (مستحق له)';

  // Signed opening balance:
  // For customer: Debit is positive (they owe us), Credit is negative (advance credit).
  // For supplier/workshop: Credit is positive (we owe them), Debit is negative (advance payment to them).
  const signedOpening = isCust
    ? (resolvedOpeningType === 'credit' ? -openBal : openBal)
    : (resolvedOpeningType === 'debit' ? -openBal : openBal);

  // Card #2: Period Invoices & Services (sum of debits in active filtered view)
  const periodInvoices = Number(
    filteredRows.reduce((sum, r) => sum + (Number(r.debit) || 0), 0).toFixed(2)
  );

  // Card #3: Total Paid / Settled (sum of credits in active filtered view)
  const periodPaid = Number(
    filteredRows.reduce((sum, r) => sum + (Number(r.credit) || 0), 0).toFixed(2)
  );

  // Card #4: Final Remaining Cumulative Balance
  // MUST ALWAYS equal the final value shown in the last row of the ledger table.
  let finalBalance = 0;
  if (filteredRows && filteredRows.length > 0) {
    const lastRow = filteredRows[filteredRows.length - 1];
    finalBalance = Number((lastRow.running_balance ?? 0).toFixed(2));
  } else if (txTypeFilter === 'all' || txTypeFilter === 'opening') {
    // When no movement rows exist, the opening balance row is the only/last row
    finalBalance = Number(signedOpening.toFixed(2));
  } else if (allMovements && allMovements.length > 0) {
    const lastMovement = allMovements[allMovements.length - 1];
    finalBalance = Number((lastMovement.running_balance ?? 0).toFixed(2));
  } else {
    finalBalance = Number(signedOpening.toFixed(2));
  }

  // Dynamic Subtitles and Styling
  const isZero = Math.abs(finalBalance) < 0.001;
  const isPositive = finalBalance > 0.001;

  let subtitle = '';
  let subtitleClass = '';
  let valueClass = '';

  if (isCust) {
    if (isPositive) {
      subtitle = 'مستحق على العميل (لنا)';
      subtitleClass = 'text-emerald-400';
      valueClass = 'text-emerald-400';
    } else if (isZero) {
      subtitle = 'الحساب متزن (0.00 ج.م)';
      subtitleClass = 'text-slate-400';
      valueClass = 'text-slate-200';
    } else {
      subtitle = 'رصيد دائن / دافع زيادات (له)';
      subtitleClass = 'text-rose-400';
      valueClass = 'text-rose-400';
    }
  } else {
    // Supplier, Workshop, Printer, Subcontractor
    if (isPositive) {
      subtitle = 'مستحق للجهة (له)';
      subtitleClass = 'text-emerald-400';
      valueClass = 'text-emerald-400';
    } else if (isZero) {
      subtitle = 'الحساب متزن (0.00 ج.م)';
      subtitleClass = 'text-slate-400';
      valueClass = 'text-slate-200';
    } else {
      subtitle = 'رصيد مدين / دفعات مقدمة (لنا)';
      subtitleClass = 'text-amber-400';
      valueClass = 'text-amber-400';
    }
  }

  return {
    openingBalance: openBal,
    openingNature: resolvedOpeningType,
    openingNatureText,
    signedOpening,
    periodInvoices,
    periodPaid,
    finalBalance,
    subtitle,
    subtitleClass,
    valueClass,
    isCustomer: isCust
  };
}
