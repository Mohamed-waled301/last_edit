/**
 * Apex Apparel ERP - Inventory Balance & Stock Movement Engine
 * محرك احتساب الأرصدة المخزنية وحركات كارت الصنف وإعادة الاحتساب
 */

export interface StockMovement {
  id: string;
  item_id: string;
  material_id?: string;
  variant_id?: string | null;
  location_id?: string | null;
  movement_type: string; // 'purchase_receipt' | 'purchase_return' | 'sales_invoice' | 'sales_return' | 'production_issue' | 'production_receipt' | 'outsourced_issue' | 'outsourced_receipt' | 'adjustment' | 'transfer' | 'opening_balance' | 'reversal'
  direction: 'in' | 'out';
  quantity: number;
  quantity_change?: number; // positive or negative
  unit_cost?: number;
  document_id?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  movement_date?: string;
  date?: string;
  created_at?: string;
  created_by?: string;
  notes?: string;
}

export interface StockMovementTypeLabel {
  key: string;
  label: string;
  direction: 'in' | 'out';
}

export const MOVEMENT_TYPE_LABELS: Record<string, { label: string; direction: 'in' | 'out' }> = {
  opening_balance: { label: 'رصيد أول المدة', direction: 'in' },
  purchase_receipt: { label: 'وارد مشتريات (إذن استلام)', direction: 'in' },
  purchase_in: { label: 'وارد مشتريات (إذن استلام)', direction: 'in' },
  purchase_return: { label: 'منصرف مرتجع مشتريات للمورد', direction: 'out' },
  sales_invoice: { label: 'منصرف فاتورة مبيعات', direction: 'out' },
  sales_return: { label: 'وارد مرتجع مبيعات من العميل', direction: 'in' },
  production_issue: { label: 'صرف خامات لأمر تصنيع', direction: 'out' },
  production_out: { label: 'صرف خامات لأمر تصنيع', direction: 'out' },
  production_receipt: { label: 'وارد منتج تام من الإنتاج', direction: 'in' },
  production_in: { label: 'وارد منتج تام من الإنتاج', direction: 'in' },
  outsourced_issue: { label: 'صرف مستلزمات لتشغيل خارجي', direction: 'out' },
  finishing_out: { label: 'صرف مستلزمات لتشغيل خارجي', direction: 'out' },
  outsourced_receipt: { label: 'وارد استلام من تشغيل خارجي', direction: 'in' },
  finishing_in: { label: 'وارد استلام من تشغيل خارجي', direction: 'in' },
  adjustment_addition: { label: 'تسوية جردية (فائض / زيادة)', direction: 'in' },
  adjustment_waste: { label: 'تسوية جردية (عجز / هالك)', direction: 'out' },
  adjustment_samples: { label: 'تسوية جردية (عينات تطوير)', direction: 'out' },
  transfer_in: { label: 'وارد تحويل مخزني بين المواقع', direction: 'in' },
  transfer_out: { label: 'منصرف تحويل مخزني بين المواقع', direction: 'out' },
  reversal: { label: 'حركة عكسية (إلغاء / تعديل مستند)', direction: 'out' },
  reversal_in: { label: 'حركة عكسية واردة', direction: 'in' },
};

export function getMovementDirection(m: Partial<StockMovement>): 'in' | 'out' {
  if (m.direction === 'in' || m.direction === 'out') {
    return m.direction;
  }
  const meta = m.movement_type ? MOVEMENT_TYPE_LABELS[m.movement_type] : null;
  if (meta) return meta.direction;

  if (m.quantity_change !== undefined && m.quantity_change < 0) {
    return 'out';
  }
  return 'in';
}

export function getMovementQuantity(m: Partial<StockMovement>): number {
  if (m.quantity !== undefined && m.quantity !== null) {
    return Math.abs(Number(m.quantity) || 0);
  }
  if (m.quantity_change !== undefined && m.quantity_change !== null) {
    return Math.abs(Number(m.quantity_change) || 0);
  }
  return 0;
}

/**
 * Actual balance formula: opening balance + sum of all "in" movements - sum of all "out" movements
 */
export function calculateItemActualBalance(
  openingBalance: number = 0,
  movements: StockMovement[] = [],
  variantId: string | null = null,
  locationId: string | null = null
): number {
  let balance = Math.max(0, Number(openingBalance) || 0);

  for (const m of movements) {
    if (m.movement_type === 'opening_balance') {
      // Opening balance movement is already accounted for in openingBalance
      continue;
    }
    if (variantId && m.variant_id && m.variant_id !== variantId) {
      continue;
    }
    if (locationId && m.location_id && m.location_id !== locationId) {
      continue;
    }

    const dir = getMovementDirection(m);
    const qty = getMovementQuantity(m);

    if (dir === 'in') {
      balance += qty;
    } else {
      balance -= qty;
    }
  }

  return Number(balance.toFixed(3));
}

export interface StockCardFilter {
  dateFrom?: string;
  dateTo?: string;
  variantId?: string | null;
  locationId?: string | null;
  movementType?: string | null;
}

export interface StockCardLedgerRow {
  id: string;
  date: string;
  movement_type: string;
  type_label: string;
  direction: 'in' | 'out';
  in_quantity: number;
  out_quantity: number;
  running_balance: number;
  unit_cost: number;
  document_reference: string;
  location_id?: string | null;
  variant_id?: string | null;
  notes: string;
  user: string;
}

export interface StockCardReport {
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  initialOpeningBalance: number;
  periodOpeningBalance: number;
  totalIn: number;
  totalOut: number;
  netChange: number;
  closingBalance: number;
  movementBreakdown: Record<string, { label: string; inQty: number; outQty: number; count: number }>;
  rows: StockCardLedgerRow[];
}

export function buildItemStockCard(
  item: { id: string; name: string; code?: string; unit?: string; opening_balance?: number },
  allMovements: StockMovement[],
  filter: StockCardFilter & { startDate?: string; endDate?: string } = {}
): StockCardReport & {
  opening_balance: number;
  total_in: number;
  total_out: number;
  net_change: number;
  closing_balance: number;
  entries: StockCardLedgerRow[];
} {
  const itemId = item.id;
  const initialOpening = Number(item.opening_balance) || 0;

  // Filter movements for this item (matching item_id or legacy material_id)
  const itemMovements = allMovements.filter(
    (m) => String(m.item_id || m.material_id) === String(itemId)
  );

  // Sort chronologically
  itemMovements.sort((a, b) => {
    const da = a.movement_date || a.date || a.created_at || '';
    const db = b.movement_date || b.date || b.created_at || '';
    return da.localeCompare(db);
  });

  const dateFrom = filter.startDate || filter.dateFrom;
  const dateTo = filter.endDate || filter.dateTo;
  const { variantId, locationId, movementType } = filter;

  // 1. Calculate Period Opening Balance (initial opening + movements before dateFrom)
  let periodOpening = initialOpening;
  const inPeriodMovements: StockMovement[] = [];

  for (const m of itemMovements) {
    if (m.movement_type === 'opening_balance') continue;

    if (variantId && m.variant_id && m.variant_id !== variantId) continue;
    if (locationId && m.location_id && m.location_id !== locationId) continue;

    const mDate = (m.movement_date || m.date || (m.created_at ? m.created_at.split('T')[0] : '')) || '';
    const dir = getMovementDirection(m);
    const qty = getMovementQuantity(m);

    if (dateFrom && mDate < dateFrom) {
      if (dir === 'in') {
        periodOpening += qty;
      } else {
        periodOpening -= qty;
      }
    } else if (!dateTo || mDate <= dateTo) {
      if (!movementType || m.movement_type === movementType) {
        inPeriodMovements.push(m);
      }
    }
  }

  periodOpening = Number(periodOpening.toFixed(3));

  // 2. Process in-period movements with running balance
  let running = periodOpening;
  let totalIn = 0;
  let totalOut = 0;
  const breakdown: Record<string, { label: string; inQty: number; outQty: number; count: number }> = {};
  const rows: (StockCardLedgerRow & { quantity: number; document_id: string })[] = [];

  for (const m of inPeriodMovements) {
    const dir = getMovementDirection(m);
    const qty = getMovementQuantity(m);
    const inQty = dir === 'in' ? qty : 0;
    const outQty = dir === 'out' ? qty : 0;

    if (dir === 'in') {
      running += inQty;
      totalIn += inQty;
    } else {
      running -= outQty;
      totalOut += outQty;
    }

    const typeKey = m.movement_type || 'other';
    const typeMeta = MOVEMENT_TYPE_LABELS[typeKey] || { label: typeKey, direction: dir };
    if (!breakdown[typeKey]) {
      breakdown[typeKey] = { label: typeMeta.label, inQty: 0, outQty: 0, count: 0 };
    }
    breakdown[typeKey].inQty += inQty;
    breakdown[typeKey].outQty += outQty;
    breakdown[typeKey].count += 1;

    rows.push({
      id: m.id,
      date: (m.movement_date || m.date || (m.created_at ? m.created_at.split('T')[0] : '')) || '',
      movement_type: typeKey,
      type_label: typeMeta.label,
      direction: dir,
      quantity: qty,
      in_quantity: inQty,
      out_quantity: outQty,
      running_balance: Number(running.toFixed(3)),
      unit_cost: Number(m.unit_cost) || 0,
      document_id: m.document_id || m.reference_id || '-',
      document_reference: m.document_id || m.reference_id || '-',
      location_id: m.location_id,
      variant_id: m.variant_id,
      notes: m.notes || '',
      user: m.created_by || 'النظام'
    });
  }

  totalIn = Number(totalIn.toFixed(3));
  totalOut = Number(totalOut.toFixed(3));
  const netChange = Number((totalIn - totalOut).toFixed(3));
  const closingBalance = Number(running.toFixed(3));

  return {
    itemId,
    itemName: item.name,
    itemCode: item.code || '',
    unit: item.unit || 'قطعة',
    initialOpeningBalance: initialOpening,
    periodOpeningBalance: periodOpening,
    opening_balance: periodOpening,
    totalIn,
    total_in: totalIn,
    totalOut,
    total_out: totalOut,
    netChange,
    net_change: netChange,
    closingBalance,
    closing_balance: closingBalance,
    movementBreakdown: breakdown,
    rows,
    entries: rows
  };
}

export interface DiscrepancyReportItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  storedStock: number;
  computedStock: number;
  difference: number;
  hasDiscrepancy: boolean;
}

export interface RecomputeStockResult {
  totalItems: number;
  discrepanciesCount: number;
  fixedItemsCount: number;
  items: DiscrepancyReportItem[];
}

export function recomputeStockDiscrepancies(
  items: Array<{
    id: string;
    code?: string;
    name: string;
    unit?: string;
    opening_balance?: number;
    current_stock?: number;
    variants?: Array<{ id: string; opening_balance?: number; current_stock?: number }>;
  }>,
  allMovements: StockMovement[]
): RecomputeStockResult {
  const report: DiscrepancyReportItem[] = [];
  let discrepanciesCount = 0;

  for (const item of items) {
    const opening = Number(item.opening_balance) || 0;
    const computed = calculateItemActualBalance(opening, allMovements.filter(m => (m.item_id || m.material_id) === item.id));
    const stored = Number(item.current_stock) || 0;
    const diff = Number((computed - stored).toFixed(3));
    const hasDiscrepancy = Math.abs(diff) > 0.0001;

    if (hasDiscrepancy) {
      discrepanciesCount++;
    }

    report.push({
      id: item.id,
      code: item.code || '',
      name: item.name,
      unit: item.unit || 'قطعة',
      storedStock: stored,
      computedStock: computed,
      difference: diff,
      hasDiscrepancy
    });
  }

  return {
    totalItems: items.length,
    discrepanciesCount,
    fixedItemsCount: discrepanciesCount,
    items: report
  };
}
