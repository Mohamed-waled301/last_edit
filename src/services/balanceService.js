import db from '../data/db';
import { toPiasters, fromPiasters } from '../utils/money';
import {
  resolveOpeningBalance,
  resolveOpeningType,
  DEFAULT_SUPPLIER_OPENING_TYPE,
  DEFAULT_CUSTOMER_OPENING_TYPE
} from '../logic/balances';

/**
 * Universal Centralized Balance Engine (محرك مركزي موحد لحساب الأرصدة)
 *
 * Exact mandatory accounting formula:
 * Balance = Opening Balance (رصيد أول المدة) + Sum(Period Invoices / Charges) - Sum(Period Payments / Receipts / Settlements)
 *
 * Rules:
 * 1. Positive balance:
 *    - For supplier / workshop / contractor: Positive = amount owed to supplier (له / مستحق له).
 *    - For customer: Positive = amount owed by customer (عليه / مستحق عليه).
 * 2. Negative balance:
 *    - For supplier / workshop / contractor: Negative = advance payment to supplier (لنا / دفعة مقدمة لصالحنا).
 *    - For customer: Negative = customer prepayment / advance deposit (له / دفعة مقدمة أمانة طرفنا).
 * 3. Zero balance (0.00):
 *    - Account is completely balanced (الحساب متزن 0.00 ج.م).
 *    - Supported across all screens for advance payments.
 * 4. Calculations are computed in exact integer piasters to eliminate floating-point drift.
 */

/**
 * @typedef {Object} EntityBalanceSummary
 * @property {string} entityId
 * @property {string} name
 * @property {string} [code]
 * @property {boolean} isSupplier
 * @property {boolean} isCustomer
 * @property {boolean} isBoth
 * @property {number} currentBalance
 * @property {number} balance
 * @property {number} balanceDue
 * @property {number} supplierBalance
 * @property {number} customerBalance
 * @property {number} netBalance
 * @property {number} maxOffsetAmount
 * @property {number} supplierOpening
 * @property {'debit' | 'credit'} supplierOpeningType
 * @property {number} signedSupplierOpening
 * @property {number} supplierInvoiced
 * @property {number} supplierPaid
 * @property {number} supplierReturns
 * @property {number} customerOpening
 * @property {'debit' | 'credit'} customerOpeningType
 * @property {number} signedCustomerOpening
 * @property {number} customerInvoiced
 * @property {number} customerPaid
 * @property {number} customerReturns
 * @property {number} openingBalance
 * @property {'debit' | 'credit'} openingType
 * @property {number} signedOpening
 * @property {number} totalInvoiced
 * @property {number} totalPaid
 * @property {number} totalReturns
 * @property {boolean} isAdvance
 * @property {boolean} supplierIsAdvance
 * @property {boolean} customerIsAdvance
 * @property {() => number} valueOf
 * @property {() => string} toString
 */

/**
 * Core global function to calculate the authoritative, exact current balance for any entity.
 * Queryable by supplier, customer, workshop, printer, embroidery or sewing contractor ID.
 *
 * @param {string | number | object} entityId - The entity ID or object containing an id
 * @returns {Promise<EntityBalanceSummary>} The complete authoritative balance summary
 */
export async function getEntityCurrentBalance(entityId) {
  const id = typeof entityId === 'object' && entityId !== null ? entityId.id : entityId;
  if (!id) {
    return createEmptyBalanceResult('');
  }

  // 1. Fetch party from db.parties, with fallback to suppliers or customers
  let party = null;
  if (db.parties) {
    party = await db.parties.get(id);
  }
  if (!party && db.suppliers) {
    const s = await db.suppliers.get(id);
    if (s) {
      party = {
        ...s,
        is_supplier: 1,
        is_customer: s.is_customer ? 1 : 0
      };
    }
  }
  if (!party && db.customers) {
    const c = await db.customers.get(id);
    if (c) {
      party = {
        ...c,
        is_customer: 1,
        is_supplier: c.is_supplier ? 1 : 0
      };
    }
  }

  if (!party) {
    return createEmptyBalanceResult(String(id));
  }

  const strId = String(id);
  const isCust = Boolean(party.is_customer);
  const isSup = Boolean(party.is_supplier || (!party.is_customer && !party.is_supplier));
  const isBoth = Boolean(party.is_supplier && party.is_customer);

  // 2. Load relevant transactional records concurrently
  const [
    supInvoices,
    supPayments,
    supReturns,
    custInvoices,
    custPayments,
    custReturns,
    purchaseOrders,
    cutOrders
  ] = await Promise.all([
    isSup && db.supplier_invoices
      ? db.supplier_invoices.where('supplier_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isSup && db.payments
      ? db.payments.where('supplier_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isSup && db.supplier_returns
      ? db.supplier_returns.where('supplier_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isCust && db.sales_invoices
      ? db.sales_invoices.where('customer_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isCust && db.customer_payments
      ? db.customer_payments.where('customer_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isCust && db.customer_returns
      ? db.customer_returns.where('customer_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isSup && db.purchase_orders
      ? db.purchase_orders.where('supplier_id').equals(id).toArray().catch(() => [])
      : Promise.resolve([]),
    isSup && db.production_orders
      ? db.production_orders.toArray().catch(() => [])
      : Promise.resolve([])
  ]);

  // Fallback checks for string/number id mismatch
  const safeSupInvoices = Array.isArray(supInvoices) ? supInvoices : [];
  const safeSupPayments = Array.isArray(supPayments) ? supPayments : [];
  const safeSupReturns = Array.isArray(supReturns) ? supReturns : [];
  const safeCustInvoices = Array.isArray(custInvoices) ? custInvoices : [];
  const safeCustPayments = Array.isArray(custPayments) ? custPayments : [];
  const safeCustReturns = Array.isArray(custReturns) ? custReturns : [];

  // ==========================================
  // A) Supplier Side Calculations
  // ==========================================
  let supplierBalance = 0;
  let supplierInvoiced = 0;
  let supplierPaid = 0;
  let supplierReturnsTotal = 0;
  let supOpening = 0;
  let supOpeningType = DEFAULT_SUPPLIER_OPENING_TYPE;
  let signedSupOpening = 0;

  if (isSup) {
    supOpening = resolveOpeningBalance(party, 'supplier');
    supOpeningType = resolveOpeningType(party, 'supplier');
    const rawSupOpeningPiasters = toPiasters(supOpening);
    // Supplier normal balance is credit (+). If debit, it is an advance payment (-).
    const supOpeningPiasters = supOpeningType === 'debit' ? -rawSupOpeningPiasters : rawSupOpeningPiasters;
    signedSupOpening = fromPiasters(supOpeningPiasters);

    let supInvoicedPiasters = 0;
    let supPaidPiasters = 0;

    // Track synced invoice and cut order IDs to prevent any double counting
    const processedInvoiceIds = new Set();
    const processedCutOrderIds = new Set();

    for (const inv of safeSupInvoices) {
      if (inv.status !== 'cancelled') {
        processedInvoiceIds.add(String(inv.id));
        if (inv.po_id) processedInvoiceIds.add(String(inv.po_id));
        if (inv.cut_order_id) processedCutOrderIds.add(String(inv.cut_order_id));

        const invTotal = toPiasters(inv.total_amount ?? inv.grand_total ?? 0);
        supInvoicedPiasters += invTotal;

        // If invoice was cash purchase, paid_amount was settled immediately at invoice creation
        if (inv.payment_terms === 'cash') {
          supPaidPiasters += toPiasters(inv.paid_amount ?? inv.total_amount ?? 0);
        }
      }
    }

    // Include any un-invoiced purchase orders if any
    for (const po of (Array.isArray(purchaseOrders) ? purchaseOrders : [])) {
      if (po.status !== 'cancelled' && !processedInvoiceIds.has(String(po.id))) {
        processedInvoiceIds.add(String(po.id));
        const poTotal = toPiasters(po.total_amount ?? po.grand_total ?? 0);
        supInvoicedPiasters += poTotal;
        if (po.payment_terms === 'cash') {
          supPaidPiasters += poTotal;
        }
      }
    }

    // Check for any workshop/contractor stages in cut orders NOT yet synced into supplier_invoices
    for (const co of (Array.isArray(cutOrders) ? cutOrders : [])) {
      if (co.status === 'cancelled') continue;
      const stages = co.stages || {};
      for (const stKey of ['printing', 'embroidery', 'sewing', 'operation']) {
        const stage = stages[stKey];
        if (!stage) continue;
        const vId = stage.vendor_id || stage.workshop_id || stage.party_id;
        if (String(vId) === strId) {
          const sinvCutId = `sinv-cut-${co.id}-${stKey}`;
          // If invoice for this stage already exists in supplier_invoices, skip to prevent double counting!
          if (processedInvoiceIds.has(sinvCutId)) continue;
          if (processedCutOrderIds.has(String(co.id))) continue;

          const stageCostPiasters = toPiasters(stage.total_cost || stage.stage_cost || 0);
          if (stageCostPiasters > 0) {
            supInvoicedPiasters += stageCostPiasters;
          }
        }
      }
    }

    // Add payments from payments table (payment vouchers, advance payments, settlements)
    for (const p of safeSupPayments) {
      if (p.status !== 'cancelled') {
        supPaidPiasters += toPiasters(p.amount);
      }
    }

    // Add returns from supplier_returns table
    let supReturnsPiasters = 0;
    for (const ret of safeSupReturns) {
      if (ret.status !== 'cancelled') {
        supReturnsPiasters += toPiasters(ret.refund_amount ?? ret.total_amount ?? 0);
      }
    }

    // Exact balance formula: Opening + Invoiced - Paid - Returns
    const supBalancePiasters = supOpeningPiasters + supInvoicedPiasters - supPaidPiasters - supReturnsPiasters;

    supplierInvoiced = fromPiasters(supInvoicedPiasters);
    supplierPaid = fromPiasters(supPaidPiasters);
    supplierReturnsTotal = fromPiasters(supReturnsPiasters);
    supplierBalance = fromPiasters(supBalancePiasters);
  }

  // ==========================================
  // B) Customer Side Calculations
  // ==========================================
  let customerBalance = 0;
  let customerInvoiced = 0;
  let customerPaid = 0;
  let customerReturnsTotal = 0;
  let custOpening = 0;
  let custOpeningType = DEFAULT_CUSTOMER_OPENING_TYPE;
  let signedCustOpening = 0;

  if (isCust) {
    custOpening = resolveOpeningBalance(party, 'customer');
    custOpeningType = resolveOpeningType(party, 'customer');
    const rawCustOpeningPiasters = toPiasters(custOpening);
    // Customer normal balance is debit (+). If credit, it is an advance prepayment (-).
    const custOpeningPiasters = custOpeningType === 'credit' ? -rawCustOpeningPiasters : rawCustOpeningPiasters;
    signedCustOpening = fromPiasters(custOpeningPiasters);

    let custInvoicedPiasters = 0;
    let custPaidPiasters = 0;

    for (const inv of safeCustInvoices) {
      if (inv.status !== 'cancelled') {
        const invTotal = toPiasters(inv.total_invoice_amount ?? inv.total_amount ?? 0);
        custInvoicedPiasters += invTotal;

        // If invoice was cash sale or partially paid on invoice creation, credit immediately
        if (inv.payment_terms === 'cash' || (Number(inv.paid_amount) > 0)) {
          custPaidPiasters += toPiasters(inv.paid_amount ?? inv.total_invoice_amount ?? 0);
        }
      }
    }

    // Add payments from customer_payments table (receipt vouchers, deposits, settlements)
    for (const p of safeCustPayments) {
      if (p.status !== 'cancelled') {
        custPaidPiasters += toPiasters(p.amount);
      }
    }

    // Add returns from customer_returns table
    let custReturnsPiasters = 0;
    for (const ret of safeCustReturns) {
      if (ret.status !== 'cancelled') {
        custReturnsPiasters += toPiasters(ret.refund_amount ?? ret.total_amount ?? 0);
      }
    }

    // Exact balance formula: Opening + Invoiced - Paid - Returns
    const custBalancePiasters = custOpeningPiasters + custInvoicedPiasters - custPaidPiasters - custReturnsPiasters;

    customerInvoiced = fromPiasters(custInvoicedPiasters);
    customerPaid = fromPiasters(custPaidPiasters);
    customerReturnsTotal = fromPiasters(custReturnsPiasters);
    customerBalance = fromPiasters(custBalancePiasters);
  }

  // ==========================================
  // C) Net Balance & Offset Determination
  // ==========================================
  const netBalance = fromPiasters(toPiasters(customerBalance) - toPiasters(supplierBalance));
  const maxOffsetAmount = Math.max(
    0,
    fromPiasters(Math.min(Math.max(0, toPiasters(supplierBalance)), Math.max(0, toPiasters(customerBalance))))
  );

  // Authoritative primary balance depending on entity roles
  let currentBalance = 0;
  let openingBalance = 0;
  let openingType = 'credit';
  let signedOpening = 0;
  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalReturns = 0;

  if (isBoth) {
    currentBalance = netBalance;
    openingBalance = custOpening >= supOpening ? custOpening : supOpening;
    openingType = custOpening >= supOpening ? custOpeningType : supOpeningType;
    signedOpening = fromPiasters(toPiasters(signedCustOpening) - toPiasters(signedSupOpening));
    totalInvoiced = fromPiasters(toPiasters(customerInvoiced) + toPiasters(supplierInvoiced));
    totalPaid = fromPiasters(toPiasters(customerPaid) + toPiasters(supplierPaid));
    totalReturns = fromPiasters(toPiasters(customerReturnsTotal) + toPiasters(supplierReturnsTotal));
  } else if (isCust) {
    currentBalance = customerBalance;
    openingBalance = custOpening;
    openingType = custOpeningType;
    signedOpening = signedCustOpening;
    totalInvoiced = customerInvoiced;
    totalPaid = customerPaid;
    totalReturns = customerReturnsTotal;
  } else {
    // Default to supplier
    currentBalance = supplierBalance;
    openingBalance = supOpening;
    openingType = supOpeningType;
    signedOpening = signedSupOpening;
    totalInvoiced = supplierInvoiced;
    totalPaid = supplierPaid;
    totalReturns = supplierReturnsTotal;
  }

  const supplierIsAdvance = supplierBalance < 0;
  const customerIsAdvance = customerBalance < 0;
  const isAdvance = currentBalance < 0;

  const summary = {
    entityId: strId,
    name: party.name || '',
    code: party.code || '',
    isSupplier: isSup,
    isCustomer: isCust,
    isBoth,

    currentBalance,
    balance: currentBalance,
    balanceDue: currentBalance,

    supplierBalance,
    customerBalance,
    netBalance,
    maxOffsetAmount,

    supplierOpening: supOpening,
    supplierOpeningType: supOpeningType,
    signedSupplierOpening: signedSupOpening,
    supplierInvoiced,
    supplierPaid,
    supplierReturns: supplierReturnsTotal,

    customerOpening: custOpening,
    customerOpeningType: custOpeningType,
    signedCustomerOpening: signedCustOpening,
    customerInvoiced,
    customerPaid,
    customerReturns: customerReturnsTotal,

    openingBalance,
    openingType,
    signedOpening,
    totalInvoiced,
    totalPaid,
    totalReturns,

    isAdvance,
    supplierIsAdvance,
    customerIsAdvance,

    valueOf() {
      return this.currentBalance;
    },
    toString() {
      return String(this.currentBalance);
    }
  };

  return summary;
}

/**
 * Batch calculation of current balances for multiple parties in an optimized pass.
 * Used for listing pages to guarantee exact matching with single entity queries.
 */
export async function getAllEntitiesCurrentBalances() {
  const parties = await db.parties.filter(p => p.is_active === 1).toArray().catch(() => []);
  const map = new Map();

  for (const p of parties) {
    const bal = await getEntityCurrentBalance(p.id);
    map.set(p.id, bal);
  }

  return map;
}

function createEmptyBalanceResult(id) {
  const summary = {
    entityId: String(id || ''),
    name: '',
    code: '',
    isSupplier: false,
    isCustomer: false,
    isBoth: false,

    currentBalance: 0,
    balance: 0,
    balanceDue: 0,

    supplierBalance: 0,
    customerBalance: 0,
    netBalance: 0,
    maxOffsetAmount: 0,

    supplierOpening: 0,
    supplierOpeningType: 'credit',
    signedSupplierOpening: 0,
    supplierInvoiced: 0,
    supplierPaid: 0,
    supplierReturns: 0,

    customerOpening: 0,
    customerOpeningType: 'debit',
    signedCustomerOpening: 0,
    customerInvoiced: 0,
    customerPaid: 0,
    customerReturns: 0,

    openingBalance: 0,
    openingType: 'credit',
    signedOpening: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    totalReturns: 0,

    isAdvance: false,
    supplierIsAdvance: false,
    customerIsAdvance: false,

    valueOf() {
      return 0;
    },
    toString() {
      return '0';
    }
  };
  return summary;
}

export default getEntityCurrentBalance;
