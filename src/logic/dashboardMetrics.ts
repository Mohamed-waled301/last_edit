/**
 * Apex Apparel ERP - Unified Dashboard Metrics & Selector Engine
 * محرك احتساب مؤشرات لوحة التحكم من واقع دفاتر المعاملات وحركات الأستاذ العام
 *
 * One Single Source of Truth:
 * All 5 dashboard KPI cards are computed deterministically from document transactions,
 * eliminating stale cached counters, floating-point drift, and cross-screen discrepancies.
 */

import { toPiasters, fromPiasters } from '../utils/money';
import { resolveOpeningBalance, resolveOpeningType } from './balances';
import { calculateItemActualBalance } from './inventoryBalances';

export interface TreasuryBalanceResult {
  total: number;
  accountsBreakdown: Array<{
    id: string;
    name: string;
    current_balance: number;
    computed_balance: number;
    is_main?: number | boolean;
    outlet_id?: string | null;
  }>;
}

export interface SupplierDebtsResult {
  total: number;
  suppliersBreakdown: Array<{
    id: string;
    name: string;
    opening_balance: number;
    credit_invoices_total: number;
    stage_costs_total: number;
    payments_total: number;
    returns_total: number;
    balance_due: number;
  }>;
}

export interface CustomerReceivablesResult {
  total: number;
  customersBreakdown: Array<{
    id: string;
    name: string;
    opening_balance: number;
    credit_sales_total: number;
    receipts_total: number;
    returns_total: number;
    balance_due: number;
  }>;
}

export interface MonthlyProfitResult {
  netSales: number;
  cogs: number;
  operatingExpenses: number;
  netProfit: number;
  monthStr: string;
}

export interface LowStockAlertsResult {
  count: number;
  items: Array<{
    id: string;
    code: string;
    name: string;
    current_stock: number;
    min_level: number;
    unit: string;
    type: 'raw_material' | 'finished_good' | 'item';
  }>;
}

export interface DashboardMetricsResult {
  cashBalance: number;
  treasuryBalance: number;
  supplierDebts: number;
  supplierBalanceDue: number;
  customerReceivables: number;
  customerBalanceDue: number;
  monthProfit: number | null;
  netProfit: number | null;
  lowStockCount: number;
  inProductionCount: number;
  suppliersBreakdown: SupplierDebtsResult['suppliersBreakdown'];
  customersBreakdown: CustomerReceivablesResult['customersBreakdown'];
  treasuriesBreakdown: TreasuryBalanceResult['accountsBreakdown'];
  lowStockItems: LowStockAlertsResult['items'];
}

/**
 * 1. رصيد الخزنة والبنك
 * Sum of all treasury and bank balances = opening balances + all receipts - all payments.
 * Cash sales, customer receipts, cash returns, cash purchases, supplier payments,
 * cash disbursements by expense code, cut order stage payments, transfers (net zero), reversals.
 */
export function computeTreasuryBalance(
  accounts: any[] = [],
  transactions: any[] = []
): TreasuryBalanceResult {
  const activeAccounts = accounts.filter(a => a.is_active !== 0 && a.is_active !== false);
  let totalPiasters = 0;

  const accountsBreakdown = activeAccounts.map(acc => {
    const accTxs = transactions.filter(t => t.account_id === acc.id && t.status !== 'cancelled');
    const openingPiasters = toPiasters(acc.opening_balance ?? acc.initial_balance ?? 0);

    if (accTxs.length > 0) {
      let netChangePiasters = 0;
      for (const tx of accTxs) {
        const amtPiasters = toPiasters(tx.amount);
        if (tx.tx_type === 'inflow' || tx.tx_type === 'deposit') {
          netChangePiasters += amtPiasters;
        } else if (tx.tx_type === 'outflow' || tx.tx_type === 'withdrawal') {
          netChangePiasters -= amtPiasters;
        }
      }
      const finalPiasters = openingPiasters + netChangePiasters;
      totalPiasters += finalPiasters;
      return {
        id: acc.id,
        name: acc.name || 'خزينة',
        current_balance: fromPiasters(finalPiasters),
        computed_balance: fromPiasters(finalPiasters),
        is_main: acc.is_main,
        outlet_id: acc.outlet_id || null,
      };
    }

    // No transactions recorded for this account:
    // If opening or initial balance was set, use it
    if (acc.opening_balance !== undefined || acc.initial_balance !== undefined) {
      totalPiasters += openingPiasters;
      return {
        id: acc.id,
        name: acc.name || 'خزينة',
        current_balance: fromPiasters(openingPiasters),
        computed_balance: fromPiasters(openingPiasters),
        is_main: acc.is_main,
        outlet_id: acc.outlet_id || null,
      };
    }

    // Fallback to stored current_balance (updated inside same Dexie transaction)
    const storedPiasters = toPiasters(acc.current_balance ?? 0);
    totalPiasters += storedPiasters;
    return {
      id: acc.id,
      name: acc.name || 'خزينة',
      current_balance: fromPiasters(storedPiasters),
      computed_balance: fromPiasters(storedPiasters),
      is_main: acc.is_main,
      outlet_id: acc.outlet_id || null,
    };
  });

  return {
    total: fromPiasters(totalPiasters),
    accountsBreakdown,
  };
}

/**
 * 2. ديون الموردين
 * Sum of all supplier & service-vendor balances owed =
 * opening balances + credit purchases + credit stage costs (printing, embroidery, sewing)
 * - supplier payments - stage payments - purchase returns.
 */
export function computeSupplierDebts(
  parties: any[] = [],
  suppliers: any[] = [],
  supplierInvoices: any[] = [],
  purchaseOrders: any[] = [],
  payments: any[] = [],
  supplierReturns: any[] = [],
  cutOrders: any[] = [],
  settlements: any[] = [],
  options: { includeCutting?: boolean } = { includeCutting: true }
): SupplierDebtsResult {
  // Merge parties (is_supplier === 1) and raw suppliers
  const map = new Map<string, any>();
  for (const s of suppliers) {
    if (s.is_active !== 0 && s.is_active !== false) {
      map.set(s.id, { ...s, is_supplier: 1 });
    }
  }
  for (const p of parties) {
    if (p.is_supplier === 1 && p.is_active !== 0 && p.is_active !== false) {
      if (map.has(p.id)) {
        map.set(p.id, { ...map.get(p.id), ...p, is_supplier: 1 });
      } else {
        map.set(p.id, { ...p, is_supplier: 1 });
      }
    }
  }

  // Also discover any vendors referenced in cut orders (stages) if cutting is enabled
  if (options.includeCutting !== false) {
    for (const co of cutOrders) {
      if (co.status === 'cancelled') continue;
      const stages = co.stages || {};
      for (const stKey of ['printing', 'embroidery', 'sewing', 'operation']) {
        const stage = stages[stKey];
        if (stage && stage.vendor_id && !map.has(stage.vendor_id)) {
          map.set(stage.vendor_id, {
            id: stage.vendor_id,
            name: stage.vendor_name || 'ورشة خارجية',
            is_supplier: 1,
            opening_balance: 0,
            opening_balance_type: 'credit',
          });
        }
      }
    }
  }

  const allSuppliers = Array.from(map.values());
  let totalDebtsPiasters = 0;

  const suppliersBreakdown = allSuppliers.map(sup => {
    const opening = resolveOpeningBalance(sup, 'supplier');
    const openingType = resolveOpeningType(sup, 'supplier');
    const signedOpeningPiasters = openingType === 'debit' ? -toPiasters(opening) : toPiasters(opening);

    // 1. Credit Purchases (Invoices + POs without duplicate)
    const creditInvoices = supplierInvoices.filter(
      inv => (inv.supplier_id === sup.id || inv.party_id === sup.id) &&
             inv.payment_terms === 'credit' &&
             inv.status !== 'cancelled'
    );
    const creditPOs = purchaseOrders.filter(
      po => (po.supplier_id === sup.id || po.party_id === sup.id) &&
            po.payment_terms === 'credit' &&
            po.status !== 'cancelled' &&
            !creditInvoices.some(inv => inv.po_id === po.id || inv.id === po.id)
    );
    let creditPurchasesPiasters = 0;
    for (const inv of creditInvoices) {
      creditPurchasesPiasters += toPiasters(inv.total_amount ?? inv.grand_total ?? 0);
    }
    for (const po of creditPOs) {
      creditPurchasesPiasters += toPiasters(po.total_amount ?? po.grand_total ?? 0);
    }

    // 2. Credit Stage Costs (Cutting Edition only: printing, embroidery, sewing)
    let stageCostsPiasters = 0;
    if (options.includeCutting !== false) {
      for (const co of cutOrders) {
        if (co.status === 'cancelled') continue;
        const stages = co.stages;
        if (stages) {
          for (const stKey of ['printing', 'embroidery', 'sewing', 'operation']) {
            const st = stages[stKey];
            if (st && (st.vendor_id === sup.id || (!st.vendor_id && st.vendor_name && st.vendor_name === sup.name))) {
              stageCostsPiasters += toPiasters(st.total_cost || 0);
            }
          }
        } else {
          // Legacy fields on cut order
          if (co.printing_vendor_id === sup.id || co.printing_vendor === sup.id || co.printing_vendor === sup.name) {
            stageCostsPiasters += toPiasters(co.total_printing_cost || 0);
          }
        }
      }
    }

    // 3. Supplier Payments & Stage Payments
    const supPayments = payments.filter(
      p => (p.supplier_id === sup.id || p.party_id === sup.id) &&
           p.status !== 'cancelled'
    );
    let paymentsPiasters = 0;
    for (const p of supPayments) {
      paymentsPiasters += toPiasters(p.amount);
    }

    // 4. Purchase Returns
    const supReturns = supplierReturns.filter(
      r => (r.supplier_id === sup.id || r.party_id === sup.id) &&
           r.status !== 'cancelled'
    );
    let returnsPiasters = 0;
    for (const r of supReturns) {
      returnsPiasters += toPiasters(r.refund_amount ?? r.total_amount ?? 0);
    }

    // Net balance due calculation in integer piasters
    const netDuePiasters = Math.max(
      0,
      signedOpeningPiasters + creditPurchasesPiasters + stageCostsPiasters - paymentsPiasters - returnsPiasters
    );
    totalDebtsPiasters += netDuePiasters;

    return {
      id: sup.id,
      name: sup.name || 'مورد',
      opening_balance: opening,
      credit_invoices_total: fromPiasters(creditPurchasesPiasters),
      stage_costs_total: fromPiasters(stageCostsPiasters),
      payments_total: fromPiasters(paymentsPiasters),
      returns_total: fromPiasters(returnsPiasters),
      balance_due: fromPiasters(netDuePiasters),
    };
  });

  return {
    total: fromPiasters(totalDebtsPiasters),
    suppliersBreakdown,
  };
}

/**
 * 3. مستحقات عند العملاء
 * Sum of all customer balances owed =
 * opening balances + credit sales - customer receipts - sales returns (credit) - settlements.
 */
export function computeCustomerReceivables(
  parties: any[] = [],
  customers: any[] = [],
  salesInvoices: any[] = [],
  customerPayments: any[] = [],
  customerReturns: any[] = [],
  settlements: any[] = []
): CustomerReceivablesResult {
  // Merge parties (is_customer === 1) and raw customers
  const map = new Map<string, any>();
  for (const c of customers) {
    if (c.is_active !== 0 && c.is_active !== false) {
      map.set(c.id, { ...c, is_customer: 1 });
    }
  }
  for (const p of parties) {
    if (p.is_customer === 1 && p.is_active !== 0 && p.is_active !== false) {
      if (map.has(p.id)) {
        map.set(p.id, { ...map.get(p.id), ...p, is_customer: 1 });
      } else {
        map.set(p.id, { ...p, is_customer: 1 });
      }
    }
  }

  const allCustomers = Array.from(map.values());
  let totalReceivablesPiasters = 0;

  const customersBreakdown = allCustomers.map(cust => {
    const opening = resolveOpeningBalance(cust, 'customer');
    const openingType = resolveOpeningType(cust, 'customer');
    const signedOpeningPiasters = openingType === 'credit' ? -toPiasters(opening) : toPiasters(opening);

    // 1. Credit Sales Invoices
    const creditInvoices = salesInvoices.filter(
      inv => (inv.customer_id === cust.id || inv.party_id === cust.id) &&
             inv.payment_terms === 'credit' &&
             inv.status !== 'cancelled'
    );
    let creditSalesPiasters = 0;
    for (const inv of creditInvoices) {
      creditSalesPiasters += toPiasters(
        inv.net_amount ?? inv.grand_total ?? inv.total_invoice_amount ?? inv.total_amount ?? 0
      );
    }

    // 2. Customer Receipts (includes receipts and offset settlements logged in customer_payments)
    const custReceipts = customerPayments.filter(
      p => (p.customer_id === cust.id || p.party_id === cust.id) &&
           p.status !== 'cancelled'
    );
    let receiptsPiasters = 0;
    for (const p of custReceipts) {
      receiptsPiasters += toPiasters(p.amount);
    }

    // 3. Sales Returns (credit deduction)
    const custReturns = customerReturns.filter(
      r => (r.customer_id === cust.id || r.party_id === cust.id) &&
           r.status !== 'cancelled' &&
           r.refund_method !== 'cash_refund'
    );
    let returnsPiasters = 0;
    for (const r of custReturns) {
      returnsPiasters += toPiasters(r.refund_amount ?? r.total_amount ?? 0);
    }

    // Net balance due calculation in integer piasters
    const netDuePiasters = Math.max(
      0,
      signedOpeningPiasters + creditSalesPiasters - receiptsPiasters - returnsPiasters
    );
    totalReceivablesPiasters += netDuePiasters;

    return {
      id: cust.id,
      name: cust.name || 'عميل',
      opening_balance: opening,
      credit_sales_total: fromPiasters(creditSalesPiasters),
      receipts_total: fromPiasters(receiptsPiasters),
      returns_total: fromPiasters(returnsPiasters),
      balance_due: fromPiasters(netDuePiasters),
    };
  });

  return {
    total: fromPiasters(totalReceivablesPiasters),
    customersBreakdown,
  };
}

/**
 * 4. صافي أرباح الشهر (Owner role only)
 * For the current calendar month (local time):
 * Net sales (sales minus returns, excluding VAT)
 * - Cost of goods sold (quantity sold x item weighted average cost at time of sale; returns reverse it)
 * - Operating expenses (cash disbursements by expense code).
 * Purchases, supplier payments, transfers, and customer receipts are excluded.
 */
export function computeMonthlyProfit(
  salesInvoices: any[] = [],
  customerReturns: any[] = [],
  cashTransactions: any[] = [],
  currentMonthStr?: string,
  options: { includeCutting?: boolean } = { includeCutting: true }
): MonthlyProfitResult {
  const targetMonth = currentMonthStr || new Date().toISOString().slice(0, 7);

  // 1. Net Sales (excl VAT) for target month
  let salesPiasters = 0;
  let cogsPiasters = 0;

  for (const inv of salesInvoices) {
    if (inv.status === 'cancelled') continue;
    const dateStr = inv.invoice_date || inv.created_at || '';
    if (dateStr.startsWith(targetMonth)) {
      // Subtotal is sales price before VAT (excluding VAT)
      const subtotal = inv.subtotal !== undefined
        ? inv.subtotal
        : ((Number(inv.total_invoice_amount ?? inv.total_amount) || 0) - (Number(inv.tax_amount) || 0));
      salesPiasters += toPiasters(subtotal);

      // Total COGS computed at time of sale
      cogsPiasters += toPiasters(inv.total_cogs || 0);
    }
  }

  // 2. Returns in target month (reverse sales & reverse COGS)
  let returnsPiasters = 0;
  let returnCogsReversedPiasters = 0;

  for (const ret of customerReturns) {
    if (ret.status === 'cancelled') continue;
    const dateStr = ret.return_date || ret.created_at || '';
    if (dateStr.startsWith(targetMonth)) {
      const retAmt = ret.refund_amount ?? ret.total_amount ?? 0;
      returnsPiasters += toPiasters(retAmt);

      // Reversal of COGS for returned goods
      if (ret.unit_cost && ret.quantity) {
        returnCogsReversedPiasters += toPiasters(Number(ret.quantity) * Number(ret.unit_cost));
      } else if (ret.total_cost) {
        returnCogsReversedPiasters += toPiasters(ret.total_cost);
      }
    }
  }

  // 3. Operating Expenses in target month (Disbursements by expense code only)
  let operatingExpensesPiasters = 0;
  for (const tx of cashTransactions) {
    if (tx.status === 'cancelled') continue;
    const dateStr = tx.tx_date || tx.date || tx.created_at || '';
    if (dateStr.startsWith(targetMonth)) {
      const isExpense =
        tx.tx_type === 'outflow' &&
        (tx.category === 'disbursement' ||
         tx.category === 'expense' ||
         tx.category === 'cash_disbursement' ||
         tx.reference_type === 'EXPENSE');

      if (isExpense) {
        operatingExpensesPiasters += toPiasters(tx.amount);
      }
    }
  }

  const netSalesPiasters = salesPiasters - returnsPiasters;
  const netCogsPiasters = Math.max(0, cogsPiasters - returnCogsReversedPiasters);
  const netProfitPiasters = netSalesPiasters - netCogsPiasters - operatingExpensesPiasters;

  return {
    netSales: fromPiasters(netSalesPiasters),
    cogs: fromPiasters(netCogsPiasters),
    operatingExpenses: fromPiasters(operatingExpensesPiasters),
    netProfit: fromPiasters(netProfitPiasters),
    monthStr: targetMonth,
  };
}

/**
 * 5. تنبيهات نواقص المستودع
 * Number of items whose actual balance is at or below their minimum level
 * (count of items; variants counted per item, not per variant),
 * with raw materials and finished goods both included.
 */
export function computeLowStockAlerts(
  items: any[] = [],
  materials: any[] = [],
  movements: any[] = []
): LowStockAlertsResult {
  const lowStockList: LowStockAlertsResult['items'] = [];
  const seenIds = new Set<string>();

  // 1. Master Items (covers finished goods, raw materials, etc.)
  for (const item of items) {
    if (item.is_active === 0 || item.is_active === false) continue;
    const itemId = String(item.id);
    seenIds.add(itemId);

    const itemMovements = movements.filter(m => String(m.item_id || m.material_id) === itemId);
    const variants = Array.isArray(item.variants) ? item.variants : [];

    let totalStock = 0;
    if (itemMovements.length > 0) {
      if (variants.length > 0) {
        totalStock = variants.reduce((sum: number, v: any) => {
          const vMovements = itemMovements.filter(m => m.variant_id === v.id);
          const vOpening = Number(v.opening_balance) || 0;
          return sum + calculateItemActualBalance(vOpening, vMovements, v.id);
        }, 0);
      } else {
        const opening = Number(item.opening_balance) || 0;
        totalStock = calculateItemActualBalance(opening, itemMovements);
      }
    } else {
      totalStock = Number(item.actual_balance ?? item.current_stock ?? item.opening_balance ?? 0);
    }

    const minLevel = Number(item.min_stock_alert ?? item.min_issue_qty ?? 0);
    // Alert if stock is at or below minimum level
    if (totalStock <= minLevel) {
      lowStockList.push({
        id: itemId,
        code: item.code || '',
        name: item.name || 'صنف',
        current_stock: totalStock,
        min_level: minLevel,
        unit: item.unit || 'قطعة',
        type: item.item_type === 'finished' ? 'finished_good' : 'item',
      });
    }
  }

  // 2. Legacy Materials table (check raw materials not already counted in items)
  for (const mat of materials) {
    if (mat.is_active === 0 || mat.is_active === false) continue;
    const matId = String(mat.id);
    if (seenIds.has(matId)) continue;

    const currentStock = Number(mat.current_stock) || 0;
    const minAlert = Number(mat.min_stock_alert) || 0;

    if (currentStock <= minAlert) {
      lowStockList.push({
        id: matId,
        code: mat.code || '',
        name: mat.name || 'خامة',
        current_stock: currentStock,
        min_level: minAlert,
        unit: mat.unit || 'وحدة',
        type: 'raw_material',
      });
    }
  }

  return {
    count: lowStockList.length,
    items: lowStockList,
  };
}

/**
 * Complete Dashboard Aggregator
 * Executes all 5 selectors over the database tables.
 */
export async function getDashboardMetrics(
  dbInstance: any,
  currentMonthStr?: string,
  options: { includeCutting?: boolean; userRole?: string } = { includeCutting: true, userRole: 'owner' }
): Promise<DashboardMetricsResult> {
  const [
    accounts,
    cashTxs,
    parties,
    suppliers,
    customers,
    supplierInvoices,
    purchaseOrders,
    payments,
    supplierReturns,
    salesInvoices,
    customerPayments,
    customerReturns,
    partySettlements,
    cutOrders,
    items,
    materials,
    stockMovements,
  ] = await Promise.all([
    dbInstance.treasury_accounts?.toArray().catch(() => []) || [],
    dbInstance.cash_transactions?.toArray().catch(() => []) || [],
    dbInstance.parties?.toArray().catch(() => []) || [],
    dbInstance.suppliers?.toArray().catch(() => []) || [],
    dbInstance.customers?.toArray().catch(() => []) || [],
    dbInstance.supplier_invoices?.toArray().catch(() => []) || [],
    dbInstance.purchase_orders?.toArray().catch(() => []) || [],
    dbInstance.payments?.toArray().catch(() => []) || [],
    dbInstance.supplier_returns?.toArray().catch(() => []) || [],
    dbInstance.sales_invoices?.toArray().catch(() => []) || [],
    dbInstance.customer_payments?.toArray().catch(() => []) || [],
    dbInstance.customer_returns?.toArray().catch(() => []) || [],
    dbInstance.party_settlements?.toArray().catch(() => []) || [],
    options.includeCutting !== false
      ? (dbInstance.production_orders?.toArray().catch(() => []) || [])
      : Promise.resolve([]),
    dbInstance.items?.toArray().catch(() => []) || [],
    dbInstance.materials?.toArray().catch(() => []) || [],
    dbInstance.stock_movements?.toArray().catch(() => []) || [],
  ]);

  const treasuryRes = computeTreasuryBalance(accounts, cashTxs);
  const supplierRes = computeSupplierDebts(
    parties,
    suppliers,
    supplierInvoices,
    purchaseOrders,
    payments,
    supplierReturns,
    cutOrders,
    partySettlements,
    options
  );
  const customerRes = computeCustomerReceivables(
    parties,
    customers,
    salesInvoices,
    customerPayments,
    customerReturns,
    partySettlements
  );
  const profitRes = computeMonthlyProfit(
    salesInvoices,
    customerReturns,
    cashTxs,
    currentMonthStr,
    options
  );
  const lowStockRes = computeLowStockAlerts(items, materials, stockMovements);

  const inProdCount = options.includeCutting !== false
    ? cutOrders.filter((o: any) => o.status === 'in_production').length
    : 0;

  const isOwner = options.userRole === 'owner';

  return {
    cashBalance: treasuryRes.total,
    treasuryBalance: treasuryRes.total,
    supplierDebts: supplierRes.total,
    supplierBalanceDue: supplierRes.total,
    customerReceivables: customerRes.total,
    customerBalanceDue: customerRes.total,
    monthProfit: isOwner ? profitRes.netProfit : null,
    netProfit: isOwner ? profitRes.netProfit : null,
    lowStockCount: lowStockRes.count,
    inProductionCount: inProdCount,
    suppliersBreakdown: supplierRes.suppliersBreakdown,
    customersBreakdown: customerRes.customersBreakdown,
    treasuriesBreakdown: treasuryRes.accountsBreakdown,
    lowStockItems: lowStockRes.items,
  };
}
