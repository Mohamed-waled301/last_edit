import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Printer, 
  Download, 
  Layers, 
  Calendar,
  Package,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Scale,
  Truck,
  Users,
  ShoppingCart,
  Receipt,
  RotateCcw,
  Cog,
  Factory,
  Landmark,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileSpreadsheet,
  Scissors
} from 'lucide-react';
import PageContainer from '../components/PageContainer';
import { api } from '../services/api';
import db from '../data/db';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import StockCardPage from './inventory/StockCardPage';
import { resolveOpeningBalance, resolveOpeningType } from '../logic/balances';
import { toPiasters, fromPiasters } from '../utils/money';
import { isValidEgyptianMobile } from '../utils/phone';
import {
  computeSupplierDebts,
  computeCustomerReceivables,
  computeLowStockAlerts,
} from '../logic/dashboardMetrics';
import { isFeatureEnabled } from '../editions/editionConfig';

export default function ReportsModule({ onBack, userRole, onNotify, onNavigate, initialReport = 'index' }) {
  // 'index' or specific report key:
  // 'items' | 'stock-card' | 'low-stock' | 'goods-receipts' | 'stock-adjustments' |
  // 'purchase-orders' | 'supplier-statements' | 'installments-due' |
  // 'sales-invoices' | 'customer-statements' | 'returns' | 'dual-netting' |
  // 'production-orders' | 'outsourced-manufacturing' |
  // 'disbursements-by-expense' | 'audit-log'
  const [activeReport, setActiveReport] = useState(initialReport || 'index');
  const [indexSearch, setIndexSearch] = useState('');

  useEffect(() => {
    if (initialReport && initialReport !== 'index') {
      setActiveReport(initialReport);
    }
  }, [initialReport]);

  // General Filter States across active reports
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [salesViewMode, setSalesViewMode] = useState('customers'); // 'customers' | 'invoices'
  const [paymentFilter, setPaymentFilter] = useState('all'); // 'all' | 'cash' | 'credit'
  const [salesReportSummary, setSalesReportSummary] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Loaded Data Repositories Cache
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);

  // Report Definitions Catalog (Grouped by Module)
  const reportCatalog = [
    {
      group: 'المخزون والأصناف',
      reports: [
        {
          key: 'items',
          title: 'تقرير دليل وتقييم الأصناف',
          desc: 'بيانات الأصناف، المجموعات، الأقسام، الرصيد الفعلي، التكلفة، سعر البيع وهامش الربحية',
          icon: Layers,
          color: 'blue'
        },
        {
          key: 'stock-card',
          title: 'كارت وحركة الصنف وصافي التغير',
          desc: 'حركة الصنف التفصيلية، الرصيد التراكمي، الوارد والمنصرف، وصافي التغير للفترة',
          icon: FileSpreadsheet,
          color: 'emerald'
        },
        {
          key: 'low-stock',
          title: 'تقرير النواقص والحد الأدنى للمخزون',
          desc: 'الأصناف والخامات التي وصل رصيدها للحد الأدنى أو نفدت مع كميات إعادة الطلب',
          icon: AlertTriangle,
          color: 'amber'
        },
        {
          key: 'goods-receipts',
          title: 'تقرير أذون الاستلام المخزني',
          desc: 'أذون استلام المشتريات وتوريد الخامات بالمخازن مع تفاصيل البنود والكميات المستلمة',
          icon: Package,
          color: 'blue'
        },
        {
          key: 'stock-adjustments',
          title: 'تقرير التسويات الجردية حسب السبب',
          desc: 'محاضر تسوية أرصدة المخزون، العجز والزيادة، مصنفة حسب سبب التسوية',
          icon: Scale,
          color: 'purple'
        }
      ]
    },
    {
      group: 'المشتريات والموردين',
      reports: [
        {
          key: 'purchase-orders',
          title: 'تقرير أوامر الشراء والتوريد',
          desc: 'أوامر الشراء مصنفة بالمورد، الحالة، تاريخ الطلب، ونوع السداد (نقدي / آجل)',
          icon: ShoppingCart,
          color: 'blue'
        },
        {
          key: 'supplier-statements',
          title: 'كشف حساب وأعمار ديون الموردين',
          desc: 'أرصدة الموردين، المستحقات، فواتير التوريد، وسندات الصرف المسددة',
          icon: Truck,
          color: 'indigo'
        },
        {
          key: 'installments-due',
          title: 'تقرير الأقساط المستحقة للموردين',
          desc: 'جدول استحقاق الأقساط الآجلة ومواعيد سدادها وأيام التأخير والمبالغ المتبقية',
          icon: Clock,
          color: 'rose'
        }
      ]
    },
    {
      group: 'المبيعات والعملاء',
      reports: [
        {
          key: 'sales-invoices',
          title: 'تقرير فواتير المبيعات',
          desc: 'فواتير البيع حسب العميل، المنفذ والمعرض، نوع السداد (نقدي / آجل)، والتواريخ',
          icon: Receipt,
          color: 'emerald'
        },
        {
          key: 'customer-statements',
          title: 'كشف حساب وأعمار ديون العملاء',
          desc: 'أرصدة العملاء، سقف الائتمان، المديونيات غير المسددة، وتواريخ الفواتير',
          icon: Users,
          color: 'teal'
        },
        {
          key: 'returns',
          title: 'تقرير المرتجعات (مبيعات ومشتريات)',
          desc: 'حركات المرتجع من العملاء وإلى الموردين مع بيان الأسباب والآثار المالية',
          icon: RotateCcw,
          color: 'rose'
        },
        {
          key: 'dual-netting',
          title: 'تقرير صافي المركز المالي والمقاصة',
          desc: 'الجهات المسجلة كعميل ومورد في آن واحد (له / عليه / الصافي) مع سجل عمليات المقاصة',
          icon: Scale,
          color: 'purple'
        },
        {
          key: 'invalid-phones',
          title: 'تقرير أرقام الهواتف غير المطابقة',
          desc: 'حصر شامل لكافة جهات التعامل والورش والعملاء التي لا تبدأ بـ 01 أو لا تتكون من 11 رقماً بدقة',
          icon: AlertTriangle,
          color: 'amber'
        }
      ]
    },
    ...(isFeatureEnabled('cutting') ? [{
      group: 'التصنيع والإنتاج',
      reports: [
        {
          key: 'production-orders',
          title: 'تقرير أوامر التصنيع والإنتاج التام',
          desc: 'أوامر الإنتاج، تكاليف المراحل (قص، حياكة، مكواة)، ومستلزمات الخامات المنصرفة',
          icon: Cog,
          color: 'blue'
        },
        {
          key: 'cut-order-stages',
          title: 'تقرير مراحل القص (المطابع والتطريز والحياكة)',
          desc: 'إجماليات التكلفة، المسدد، والمتبقي لكل ورشة ولكل أمر قص مع التصدير لإكسيل',
          icon: Scissors,
          color: 'indigo'
        },
        {
          key: 'cut-production-by-size-color',
          title: 'إنتاج القص حسب المقاس واللون',
          desc: 'حصر كميات قطع القص مصنفة بالألوان والمقاسات لكافة المقاسات التفصيلية لكل أمر قص مع الإجماليات والتصدير لإكسيل',
          icon: Scissors,
          color: 'emerald'
        }
      ]
    }] : []),
    {
      group: 'الخزينة والمالية والرقابة',
      reports: [
        {
          key: 'disbursements-by-expense',
          title: 'تقرير حركة الخزائن وصرف النقدية حسب كود المصروف',
          desc: 'سندات صرف النقدية مصنفة بأكواد المصروفات، الخزينة، والمبالغ المنصرفة',
          icon: Landmark,
          color: 'emerald'
        },
        {
          key: 'audit-log',
          title: 'سجل الرقابة وتدقيق الحركات',
          desc: 'السجل الأمني الشامل لكافة عمليات الإضافة والتعديل والإلغاء مع المستخدم والتاريخ',
          icon: ShieldCheck,
          color: 'slate'
        }
      ]
    }
  ];

  // Load report data when activeReport changes
  useEffect(() => {
    if (activeReport === 'index' || activeReport === 'stock-card') return;

    async function fetchReportData() {
      try {
        setLoading(true);
        setCurrentPage(1);

        switch (activeReport) {
          case 'items': {
            const res = await api.getItems();
            setReportData(res.data || res.items || []);
            break;
          }
          case 'low-stock': {
            const [items, materials, movements] = await Promise.all([
              db.items.toArray(),
              db.materials.toArray(),
              db.stock_movements.toArray()
            ]);
            const alerts = computeLowStockAlerts(items, materials, movements);
            setReportData(alerts.items);
            break;
          }
          case 'goods-receipts': {
            const grns = await db.goods_receipts.toArray();
            const sups = await db.suppliers.toArray();
            const parties = await db.parties.toArray();
            const supMap = new Map();
            for (const s of sups) supMap.set(s.id, s.name);
            for (const p of parties) supMap.set(p.id, p.name);
            const populated = grns.map((g) => ({
              ...g,
              supplier_name: supMap.get(g.supplier_id) || g.supplier_name || g.supplier_id
            }));
            setReportData(populated);
            break;
          }
          case 'stock-adjustments': {
            const adjs = await db.stock_adjustments.toArray();
            const items = await db.items.toArray();
            const itemMap = new Map(items.map((i) => [i.id, i]));
            const populated = adjs.map((a) => ({
              ...a,
              item_name: itemMap.get(a.item_id)?.name || a.item_id,
              item_code: itemMap.get(a.item_id)?.code || ''
            }));
            setReportData(populated);
            break;
          }
          case 'purchase-orders': {
            const res = await api.getPurchaseOrders();
            setReportData(res.data || res.purchase_orders || []);
            break;
          }
          case 'supplier-statements': {
            const [sups, rawSuppliers, supplierInvoices, purchaseOrders, payments, returns, cutOrders, settlements] = await Promise.all([
              db.parties.filter((p) => p.is_supplier === 1).toArray(),
              db.suppliers.toArray(),
              db.supplier_invoices.toArray(),
              db.purchase_orders.toArray(),
              db.payments.toArray(),
              db.supplier_returns.toArray(),
              db.production_orders ? db.production_orders.toArray().catch(() => []) : Promise.resolve([]),
              db.party_settlements ? db.party_settlements.toArray().catch(() => []) : Promise.resolve([]),
            ]);
            const debts = computeSupplierDebts(sups, rawSuppliers, supplierInvoices, purchaseOrders, payments, returns, cutOrders, settlements);
            setReportData(debts.suppliersBreakdown);
            break;
          }
          case 'installments-due': {
            const res = await api.getDueInstallments();
            setReportData(res.data || res.installments || []);
            break;
          }
          case 'sales-invoices': {
            const salesRep = await api.getSalesReport({
              startDate,
              endDate,
              paymentType: paymentFilter,
              status: statusFilter,
            });
            setSalesReportSummary(salesRep.summary);
            setReportData(salesViewMode === 'customers' ? salesRep.customerRows : salesRep.invoices);
            break;
          }
          case 'customer-statements': {
            const [custs, rawCustomers, salesInvoices, customerPayments, customerReturns, settlements] = await Promise.all([
              db.parties.filter((p) => p.is_customer === 1).toArray(),
              db.customers.toArray(),
              db.sales_invoices.toArray(),
              db.customer_payments.toArray(),
              db.customer_returns.toArray(),
              db.party_settlements ? db.party_settlements.toArray().catch(() => []) : Promise.resolve([]),
            ]);
            let filteredInvoices = salesInvoices;
            if (startDate || endDate) {
              const safeInvs = Array.isArray(salesInvoices) ? salesInvoices : [];
              filteredInvoices = safeInvs.filter(i => {
                const d = i.invoice_date || i.date;
                if (startDate && d && d < startDate) return false;
                if (endDate && d && d > endDate) return false;
                return true;
              });
            }
            const receivables = computeCustomerReceivables(custs, rawCustomers, filteredInvoices, customerPayments, customerReturns, settlements);
            let breakdown = receivables.customersBreakdown;
            if (startDate || endDate) {
              const activeCustIds = new Set(filteredInvoices.map(i => i.customer_id || i.party_id));
              breakdown = breakdown.filter(c => activeCustIds.has(c.id) || (c.credit_sales_total > 0));
            }
            setReportData(breakdown);
            break;
          }
          case 'returns': {
            const [cRet, sRet] = await Promise.all([
              db.customer_returns.toArray(),
              db.supplier_returns.toArray()
            ]);
            const merged = [
              ...cRet.map((r) => ({ ...r, return_type: 'مرتجع مبيعات (من عميل)' })),
              ...sRet.map((r) => ({ ...r, return_type: 'مرتجع مشتريات (لمورد)' }))
            ];
            merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            setReportData(merged);
            break;
          }
          case 'dual-netting': {
            const duals = await db.parties.filter((p) => p.is_supplier === 1 && p.is_customer === 1).toArray();
            const settlements = await db.party_settlements.toArray();
            const setMap = new Map();
            for (const s of settlements) {
              const cur = setMap.get(s.party_id) || [];
              cur.push(s);
              setMap.set(s.party_id, cur);
            }
            const populated = duals.map((d) => {
              const sup = Number(d.supplier_balance || 0);
              const cust = Number(d.customer_balance || 0);
              return {
                ...d,
                supplier_balance: sup,
                customer_balance: cust,
                net_balance: Number((cust - sup).toFixed(2)),
                settlements_count: (setMap.get(d.id) || []).length
              };
            });
            setReportData(populated);
            break;
          }
          case 'invalid-phones': {
            const parties = await db.parties.toArray();
            const safeParties = Array.isArray(parties) ? parties : [];
            const invalid = safeParties.filter((p) => p.phone && !isValidEgyptianMobile(p.phone));
            setReportData(invalid.map((p) => {
              const ph = String(p.phone || '');
              let reason = 'رقم غير صالح';
              if (!ph.startsWith('01')) {
                reason = 'لا يبدأ بـ 01';
              } else if (ph.length !== 11) {
                reason = `طول غير مطابق (${ph.length} أرقام بدلاً من 11)`;
              }
              return {
                ...p,
                phone_status: reason,
                party_type_label: p.is_supplier && p.is_customer ? 'مورد وعميل' : (p.is_supplier ? 'مورد' : 'عميل')
              };
            }));
            break;
          }
          case 'production-orders': {
            const res = await api.getProductionOrders();
            setReportData(res.data || res.production_orders || []);
            break;
          }
          case 'outsourced-manufacturing': {
            const res = await api.getFinishingOrders();
            setReportData(res.data || res.finishing_orders || []);
            break;
          }
          case 'cut-order-stages': {
            const res = await api.getProductionOrders();
            const list = res.data || res.production_orders || [];
            const rows = [];
            for (const o of list) {
              const stages = o.stages || {};
              for (const [stKey, stData] of Object.entries(stages)) {
                if (!stData) continue;
                rows.push({
                  id: `${o.id}-${stKey}`,
                  order_id: o.id,
                  cutting_number: o.cutting_number || o.order_number,
                  cutting_name: o.cutting_name || o.product_name,
                  stage_title: stKey === 'printing' ? 'الطباعة' : stKey === 'embroidery' ? 'التطريز' : 'الحياكة',
                  vendor_name: stData.vendor_name || 'غير محدد',
                  pricing_type: stData.pricing_type === 'per_piece' ? 'سعر قطعة' : stData.pricing_type === 'batches' ? 'دفعات' : 'مبلغ ثابت',
                  total_cost: stData.total_cost || 0,
                  paid: stData.paid || 0,
                  remaining: stData.remaining || 0,
                  date: o.start_date || o.created_at?.split('T')[0]
                });
              }
            }
            setReportData(rows);
            break;
          }
          case 'cut-production-by-size-color': {
            const res = await api.getProductionOrders();
            const list = res.data || res.production_orders || [];
            const rows = [];
            const SIZES = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
            for (const o of list) {
              const matrix = Array.isArray(o.matrix) ? o.matrix : [];
              if (matrix.length > 0) {
                for (const mRow of matrix) {
                  const qtyObj = mRow.quantities || {};
                  const rowTot = SIZES.reduce((s, sz) => s + (Number(qtyObj[sz]) || 0), 0);
                  if (rowTot > 0 || mRow.color) {
                    rows.push({
                      id: `${o.id}-${mRow.color}-${rows.length}`,
                      order_id: o.id,
                      cutting_number: o.cutting_number || o.order_number,
                      cutting_name: o.cutting_name || o.product_name,
                      fabric_type: o.fabric_type || '---',
                      color: mRow.color || 'بدون لون',
                      ...SIZES.reduce((acc, sz) => ({ ...acc, [sz]: Number(qtyObj[sz]) || 0 }), {}),
                      row_total: rowTot,
                      date: o.start_date || o.created_at?.split('T')[0],
                      status: o.status === 'closed' ? 'مقفل' : 'مُصدر'
                    });
                  }
                }
              } else if (o.batch_quantity) {
                rows.push({
                  id: `${o.id}-legacy`,
                  order_id: o.id,
                  cutting_number: o.cutting_number || o.order_number,
                  cutting_name: o.cutting_name || o.product_name,
                  fabric_type: o.fabric_type || '---',
                  color: o.color || 'غير محدد',
                  ...SIZES.reduce((acc, sz) => ({ ...acc, [sz]: Number(o.size_breakdown?.[sz]) || 0 }), {}),
                  row_total: Number(o.batch_quantity) || 0,
                  date: o.start_date || o.created_at?.split('T')[0],
                  status: o.status === 'closed' ? 'مقفل' : 'مُصدر'
                });
              }
            }
            setReportData(rows);
            break;
          }
          case 'disbursements-by-expense': {
            const txs = await db.cash_transactions.filter((t) => t.type === 'expense').toArray();
            const codes = await db.expense_codes.toArray();
            const codeMap = new Map(codes.map((c) => [c.id, c.name]));
            const populated = txs.map((t) => ({
              ...t,
              expense_name: codeMap.get(t.expense_code_id) || t.expense_code_id || 'عام'
            }));
            setReportData(populated);
            break;
          }
          case 'audit-log': {
            const res = await api.getAuditLogs();
            setReportData(res.data || res.audit_logs || []);
            break;
          }
          default:
            setReportData([]);
        }
      } catch (err) {
        console.error('Failed to load report data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchReportData();
  }, [activeReport, startDate, endDate, statusFilter, paymentFilter, salesViewMode]);

  // Filtered dataset
  const filteredData = useMemo(() => {
    const safeList = Array.isArray(reportData) ? reportData : [];
    return safeList.filter((row) => {
      const term = searchTerm.trim().toLowerCase();
      if (term) {
        const matchesTerm = Object.values(row).some((val) => {
          if (typeof val === 'string' || typeof val === 'number') {
            return String(val).toLowerCase().includes(term);
          }
          return false;
        });
        if (!matchesTerm) return false;
      }

      // Date filtering (for reports where API doesn't pre-filter)
      if (activeReport !== 'sales-invoices' && (startDate || endDate)) {
        const rowDate = row.date || row.order_date || row.invoice_date || row.receipt_date || row.payment_date || row.created_at?.split('T')[0];
        if (rowDate) {
          if (startDate && rowDate < startDate) return false;
          if (endDate && rowDate > endDate) return false;
        }
      }

      // Status filtering (for reports where API doesn't pre-filter)
      if (activeReport !== 'sales-invoices' && statusFilter && row.status && row.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [reportData, searchTerm, startDate, endDate, statusFilter, activeReport]);

  // Pagination calculation
  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Export to Excel for active report
  const handleExportExcel = () => {
    if (filteredData.length === 0) return;
    exportToExcel(filteredData, `تقرير_${activeReport}_${new Date().toISOString().split('T')[0]}`);
    if (onNotify) onNotify('تم تصدير التقرير إلى إكسيل بنجاح');
  };

  const handlePrint = () => {
    try {
      sessionStorage.setItem('print_preview_payload', JSON.stringify({
        type: 'report',
        id: activeReport,
        reportKey: activeReport,
        reportTitle: currentReportMeta?.title || 'تقرير النظام',
        data: filteredData,
      }));
    } catch {}
    window.location.hash = `#/print-preview?type=report&id=${activeReport}&returnUrl=${encodeURIComponent('#/reports')}`;
  };

  // If Stock Card selected: render full StockCardPage component with back button to index!
  if (activeReport === 'stock-card') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveReport('index')}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة لفهرس التقارير الشامل</span>
          </button>
        </div>
        <StockCardPage onNotify={onNotify} onNavigate={onNavigate} />
      </div>
    );
  }

  // Render Index Screen
  if (activeReport === 'index') {
    return (
      <PageContainer
        title="فهرس التقارير الرقابية والإدارية"
        subtitle="منظومة تقارير شاملة ومترابطة لتغطية كافة دورات المصنع: المخزون، المشتريات، المبيعات، التصنيع، والمالية"
        breadcrumbs={[{ label: 'التقارير' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>طباعة الفهرس</span>
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Quick Search across reports */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="max-w-md">
              <label htmlFor="index-search-input" className="block text-xs font-semibold text-slate-700 mb-1">
                بحث في عناوين ووصف التقارير
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                <input
                  id="index-search-input"
                  type="text"
                  value={indexSearch}
                  onChange={(e) => setIndexSearch(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Grouped Reports Catalog */}
          <div className="space-y-8">
            {reportCatalog.map((group) => {
              const term = indexSearch.trim().toLowerCase();
              const matchingReports = group.reports.filter((r) => {
                if (!term) return true;
                return r.title.toLowerCase().includes(term) || r.desc.toLowerCase().includes(term);
              });

              if (matchingReports.length === 0) return null;

              return (
                <div key={group.group} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    <h3 className="text-sm font-bold text-slate-900">{group.group}</h3>
                    <span className="text-xs text-slate-500 font-semibold">({matchingReports.length} تقارير)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {matchingReports.map((r) => {
                      const Icon = r.icon;
                      return (
                        <div
                          key={r.key}
                          onClick={() => setActiveReport(r.key)}
                          className="p-5 bg-white rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <Icon className="w-5 h-5" />
                              </div>
                              <h4 className="font-bold text-sm text-slate-900 group-hover:text-blue-700 transition-colors">
                                {r.title}
                              </h4>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {r.desc}
                            </p>
                          </div>

                          <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-600">
                            <span>عرض التقرير وتصدير إكسيل</span>
                            <ArrowRight className="w-4 h-4 transform rotate-180 group-hover:-translate-x-1 transition-transform" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PageContainer>
    );
  }

  // Active Report Details View
  const activeMeta = reportCatalog.flatMap((g) => g.reports).find((r) => r.key === activeReport);

  return (
    <PageContainer
      title={activeMeta?.title || 'تقرير مفصل'}
      subtitle={activeMeta?.desc || 'استعراض البيانات مع الفلاتر والفرز والتصدير'}
      breadcrumbs={[
        { label: 'التقارير', href: '#/reports' },
        { label: activeMeta?.title || 'تقرير' }
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveReport('index')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>فهرس التقارير</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredData.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="rep-search-input" className="block text-xs font-semibold text-slate-700 mb-1">
                بحث في بيانات التقرير
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                <input
                  id="rep-search-input"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rep-from-date" className="block text-xs font-semibold text-slate-700 mb-1">
                من تاريخ
              </label>
              <input
                id="rep-from-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 text-slate-800"
              />
            </div>

            <div>
              <label htmlFor="rep-to-date" className="block text-xs font-semibold text-slate-700 mb-1">
                إلى تاريخ
              </label>
              <input
                id="rep-to-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 text-slate-800"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStartDate('');
                  setEndDate('');
                  setStatusFilter('');
                  setPaymentFilter('all');
                }}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          </div>

          {activeReport === 'sales-invoices' && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">طريقة العرض:</span>
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setSalesViewMode('customers')}
                    className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      salesViewMode === 'customers'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    تجميع حسب العملاء
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesViewMode('invoices')}
                    className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                      salesViewMode === 'invoices'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    تفصيلي حسب الفواتير
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">طريقة الدفع:</span>
                  <select
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50 font-semibold text-slate-800"
                  >
                    <option value="all">الكل</option>
                    <option value="cash">نقدي</option>
                    <option value="credit">آجل</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">الحالة:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded-lg bg-slate-50 font-semibold text-slate-800"
                  >
                    <option value="">الكل (غير الملغاة)</option>
                    <option value="paid">مدفوعة بالكامل</option>
                    <option value="unpaid">غير مدفوعة</option>
                    <option value="partially_paid">مدفوعة جزئياً</option>
                    <option value="cancelled">ملغاة</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-xs text-slate-500 block mb-1">
              {activeReport === 'sales-invoices' && salesViewMode === 'customers'
                ? 'عدد العملاء المطابقين:'
                : 'عدد السجلات المطابقة:'}
            </span>
            <span className="text-xl font-bold font-mono text-slate-900">
              {activeReport === 'sales-invoices' && salesReportSummary
                ? formatNumber(salesViewMode === 'customers' ? salesReportSummary.uniqueCustomersCount : salesReportSummary.invoicesCount)
                : formatNumber(totalRecords)}
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-xs text-slate-500 block mb-1">
              {activeReport === 'sales-invoices' ? 'إجمالي عدد الفواتير:' : 'الصفحة الحالية:'}
            </span>
            <span className="text-xl font-bold font-mono text-blue-700">
              {activeReport === 'sales-invoices' && salesReportSummary
                ? `${salesReportSummary.invoicesCount} فاتورة`
                : `${currentPage} من ${totalPages}`}
            </span>
          </div>

          {activeReport === 'sales-invoices' && salesReportSummary && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <span className="text-xs text-slate-500 block mb-1">إجمالي المبيعات الصافية:</span>
                <span className="text-xl font-bold font-mono text-emerald-600">
                  {formatCurrency(salesReportSummary.totalSales)}
                </span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
                <span className="text-xs text-slate-500 block mb-1">المتبقي (الآجل غير المسدد):</span>
                <span className="text-xl font-bold font-mono text-rose-600">
                  {formatCurrency(salesReportSummary.totalRemaining)}
                </span>
              </div>
            </>
          )}

          {activeReport === 'supplier-statements' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 block mb-1">إجمالي ديون الموردين:</span>
              <span className="text-xl font-bold font-mono text-red-600">
                {formatCurrency(filteredData.reduce((sum, r) => sum + (Number(r.balance_due ?? r.supplier_balance ?? r.current_balance ?? 0)), 0))}
              </span>
            </div>
          )}

          {activeReport === 'customer-statements' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 block mb-1">إجمالي مستحقات العملاء:</span>
              <span className="text-xl font-bold font-mono text-emerald-600">
                {formatCurrency(filteredData.reduce((sum, r) => sum + (Number(r.balance_due ?? r.customer_balance ?? r.current_balance ?? 0)), 0))}
              </span>
            </div>
          )}

          {activeReport === 'low-stock' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 block mb-1">إجمالي نواقص المخزون:</span>
              <span className="text-xl font-bold font-mono text-red-600">
                {formatNumber(filteredData.length)} أصناف
              </span>
            </div>
          )}
        </div>

        {/* Dynamic Table Rendering based on Active Report */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-800 text-white font-semibold sticky top-0">
                {renderTableHeaders(activeReport, salesViewMode)}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-10 text-center text-slate-500 font-semibold">
                      جاري استخراج وتجميع بيانات التقرير...
                    </td>
                  </tr>
                ) : pagedData.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-12 text-center text-slate-500">
                      لا توجد بيانات مطابقة لمعايير البحث في هذا التقرير
                    </td>
                  </tr>
                ) : (
                  pagedData.map((row, idx) => renderTableRow(activeReport, row, idx, salesViewMode))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-md disabled:opacity-50"
                >
                  <ChevronRight className="w-3.5 h-3.5 inline ml-1" />
                  السابق
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-md disabled:opacity-50"
                >
                  التالي
                  <ChevronLeft className="w-3.5 h-3.5 inline mr-1" />
                </button>
              </div>
              <span className="text-slate-600">
                عرض {pagedData.length} من أصل {totalRecords} سجل
              </span>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

// Helper: Render Table Headers
function renderTableHeaders(key, salesViewMode = 'customers') {
  switch (key) {
    case 'items':
    case 'low-stock':
      return (
        <tr>
          <th className="p-3">الكود</th>
          <th className="p-3">اسم الصنف</th>
          <th className="p-3">المجموعة</th>
          <th className="p-3">القسم</th>
          <th className="p-3 text-center">النوع</th>
          <th className="p-3 text-center font-mono">الرصيد الفعلي</th>
          <th className="p-3 text-left font-mono">سعر التكلفة</th>
          <th className="p-3 text-left font-mono">سعر البيع</th>
          <th className="p-3 text-center">هامش الربح %</th>
        </tr>
      );
    case 'goods-receipts':
      return (
        <tr>
          <th className="p-3">رقم الإذن</th>
          <th className="p-3">أمر التوريد</th>
          <th className="p-3">المورد</th>
          <th className="p-3">تاريخ الاستلام</th>
          <th className="p-3">المستلم</th>
          <th className="p-3">ملاحظات</th>
        </tr>
      );
    case 'stock-adjustments':
      return (
        <tr>
          <th className="p-3">رقم التسوية</th>
          <th className="p-3">الصنف</th>
          <th className="p-3 text-center">نوع الحركة</th>
          <th className="p-3 text-center font-mono">الكمية</th>
          <th className="p-3">سبب التسوية الجردية</th>
          <th className="p-3">التاريخ</th>
        </tr>
      );
    case 'purchase-orders':
      return (
        <tr>
          <th className="p-3">رقم الأمر</th>
          <th className="p-3">المورد</th>
          <th className="p-3">تاريخ الطلب</th>
          <th className="p-3 text-center">طريقة الدفع</th>
          <th className="p-3 text-center font-mono">البنود</th>
          <th className="p-3 text-left font-mono">الإجمالي</th>
          <th className="p-3 text-center">الحالة</th>
        </tr>
      );
    case 'supplier-statements':
    case 'customer-statements':
      return (
        <tr>
          <th className="p-3">الكود</th>
          <th className="p-3">اسم جهة التعامل</th>
          <th className="p-3">الهاتف</th>
          <th className="p-3 text-center font-mono">رصيد أول المدة</th>
          <th className="p-3 text-center font-mono">الرصيد الحالي</th>
          <th className="p-3 text-center">طبيعة الحساب</th>
        </tr>
      );
    case 'installments-due':
      return (
        <tr>
          <th className="p-3">أمر الشراء</th>
          <th className="p-3">المورد</th>
          <th className="p-3">تاريخ الاستحقاق</th>
          <th className="p-3 text-left font-mono">مبلغ القسط</th>
          <th className="p-3 text-left font-mono">المسدد</th>
          <th className="p-3 text-left font-mono">المتبقي</th>
          <th className="p-3 text-center">حالة السداد</th>
        </tr>
      );
    case 'sales-invoices':
      if (salesViewMode === 'customers') {
        return (
          <tr>
            <th className="p-3">كود العميل</th>
            <th className="p-3">اسم العميل</th>
            <th className="p-3">الهاتف</th>
            <th className="p-3 text-center font-mono">عدد الفواتير</th>
            <th className="p-3 text-left font-mono">إجمالي المبيعات</th>
            <th className="p-3 text-left font-mono">المسدد</th>
            <th className="p-3 text-left font-mono">المتبقي</th>
          </tr>
        );
      }
      return (
        <tr>
          <th className="p-3">رقم الفاتورة</th>
          <th className="p-3">العميل</th>
          <th className="p-3">التاريخ</th>
          <th className="p-3 text-center">طريقة الدفع</th>
          <th className="p-3 text-left font-mono">الصافي</th>
          <th className="p-3 text-center">الحالة</th>
        </tr>
      );
    case 'returns':
      return (
        <tr>
          <th className="p-3">رقم الإذن</th>
          <th className="p-3">نوع المرتجع</th>
          <th className="p-3">التاريخ</th>
          <th className="p-3 text-left font-mono">القيمة</th>
          <th className="p-3">السبب</th>
        </tr>
      );
    case 'dual-netting':
      return (
        <tr>
          <th className="p-3">الكود</th>
          <th className="p-3">اسم الجهة (عميل ومورد)</th>
          <th className="p-3 text-center font-mono text-blue-700">له (مشتريات)</th>
          <th className="p-3 text-center font-mono text-emerald-700">عليه (مبيعات)</th>
          <th className="p-3 text-center font-mono">الصافي</th>
          <th className="p-3 text-center font-mono">عدد المقاصات</th>
        </tr>
      );
    case 'invalid-phones':
      return (
        <tr>
          <th className="p-3">الكود</th>
          <th className="p-3">اسم جهة التعامل</th>
          <th className="p-3 text-center">الصفة</th>
          <th className="p-3 font-mono">رقم الهاتف المسجل</th>
          <th className="p-3 text-center">سبب عدم المطابقة</th>
          <th className="p-3 text-center">إجراء التصحيح</th>
        </tr>
      );
    case 'production-orders':
      return (
        <tr>
          <th className="p-3">رقم الأمر</th>
          <th className="p-3">المنتج</th>
          <th className="p-3 text-center font-mono">الكمية</th>
          <th className="p-3 text-center">الحالة</th>
          <th className="p-3">التاريخ</th>
        </tr>
      );
    case 'outsourced-manufacturing':
      return (
        <tr>
          <th className="p-3">رقم الإذن</th>
          <th className="p-3">المصنع الخارجي</th>
          <th className="p-3">نوع العملية</th>
          <th className="p-3 text-center font-mono">الكمية</th>
          <th className="p-3 text-center">الحالة</th>
        </tr>
      );
    case 'cut-order-stages':
      return (
        <tr>
          <th className="p-3">رقم القصة</th>
          <th className="p-3">اسم القصة</th>
          <th className="p-3">المرحلة</th>
          <th className="p-3">الورشة / المورد</th>
          <th className="p-3">نظام التسعير</th>
          <th className="p-3 text-left font-mono">إجمالي التكلفة</th>
          <th className="p-3 text-left font-mono">المسدد</th>
          <th className="p-3 text-left font-mono">المتبقي</th>
        </tr>
      );
    case 'cut-production-by-size-color':
      return (
        <tr>
          <th className="p-3">رقم القصة</th>
          <th className="p-3">اسم القصة / الموديل</th>
          <th className="p-3">اللون</th>
          {['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'].map(sz => (
            <th key={sz} className="p-2 text-center font-mono">{sz}</th>
          ))}
          <th className="p-3 text-center font-mono">الإجمالي</th>
          <th className="p-3">التاريخ</th>
          <th className="p-3 text-center">الحالة</th>
        </tr>
      );
    case 'disbursements-by-expense':
      return (
        <tr>
          <th className="p-3">رقم السند</th>
          <th className="p-3">كود وبند المصروف</th>
          <th className="p-3 text-left font-mono">المبلغ المنصرف</th>
          <th className="p-3">التاريخ</th>
          <th className="p-3">البيان</th>
        </tr>
      );
    case 'audit-log':
      return (
        <tr>
          <th className="p-3">التوقيت</th>
          <th className="p-3">المستخدم</th>
          <th className="p-3">نوع الحركة</th>
          <th className="p-3">الجدول / الشاشة</th>
          <th className="p-3">الرقم المرجعي</th>
        </tr>
      );
    default:
      return null;
  }
}

// Helper: Render Table Row
function renderTableRow(key, row, idx, salesViewMode = 'customers') {
  switch (key) {
    case 'items':
    case 'low-stock':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-800">{row.code}</td>
          <td className="p-3 font-bold text-slate-900">{row.name}</td>
          <td className="p-3 text-slate-600">{row.item_group}</td>
          <td className="p-3 text-slate-600">{row.item_department}</td>
          <td className="p-3 text-center">{row.item_type === 'finished' ? 'تام' : 'خام'}</td>
          <td className="p-3 text-center font-mono font-bold text-blue-700">
            {formatNumber(row.actual_balance ?? row.current_stock ?? 0)} {row.unit}
          </td>
          <td className="p-3 text-left font-mono">{formatCurrency(row.cost_price || 0)}</td>
          <td className="p-3 text-left font-mono">{formatCurrency(row.selling_price || 0)}</td>
          <td className="p-3 text-center font-mono font-bold text-emerald-700">
            {row.margin_percent !== undefined ? `${row.margin_percent}%` : '-'}
          </td>
        </tr>
      );
    case 'goods-receipts':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.grn_number}</td>
          <td className="p-3 font-mono text-slate-600">{row.po_id || '-'}</td>
          <td className="p-3 font-bold text-slate-800">{row.supplier_name || row.supplier_id}</td>
          <td className="p-3 font-mono">{formatDate(row.receipt_date)}</td>
          <td className="p-3 text-slate-700">{row.receiver_name}</td>
          <td className="p-3 text-slate-600">{row.notes || '-'}</td>
        </tr>
      );
    case 'stock-adjustments':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.id}</td>
          <td className="p-3 font-bold text-slate-800">{row.item_name}</td>
          <td className="p-3 text-center">
            {row.type === 'increase' ? (
              <span className="text-emerald-700 font-bold">زيادة</span>
            ) : (
              <span className="text-rose-700 font-bold">عجز</span>
            )}
          </td>
          <td className="p-3 text-center font-mono font-bold">{formatNumber(row.quantity)}</td>
          <td className="p-3 text-slate-800 font-semibold">{row.reason}</td>
          <td className="p-3 font-mono text-slate-600">{formatDate(row.date)}</td>
        </tr>
      );
    case 'purchase-orders':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.po_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.supplier_name}</td>
          <td className="p-3 font-mono">{formatDate(row.order_date)}</td>
          <td className="p-3 text-center">{row.payment_terms === 'credit' ? 'آجل' : 'نقدي'}</td>
          <td className="p-3 text-center font-mono">{Array.isArray(row.items) ? row.items.length : 0}</td>
          <td className="p-3 text-left font-mono font-bold text-slate-900">
            {formatCurrency(row.total_amount ?? row.grand_total ?? 0)}
          </td>
          <td className="p-3 text-center">{row.status}</td>
        </tr>
      );
    case 'supplier-statements':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.code || row.id}</td>
          <td className="p-3 font-bold text-slate-800">{row.name}</td>
          <td className="p-3 font-mono">{row.phone || '-'}</td>
          <td className="p-3 text-center font-mono">
            {formatCurrency(row.supplier_opening_balance ?? row.opening_balance ?? 0)}
          </td>
          <td className="p-3 text-center font-mono font-bold text-blue-900">
            {formatCurrency(row.supplier_balance ?? row.current_balance ?? 0)}
          </td>
          <td className="p-3 text-center">{row.supplier_opening_type ?? row.opening_balance_type ?? 'دائن'}</td>
        </tr>
      );
    case 'customer-statements':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.code || row.id}</td>
          <td className="p-3 font-bold text-slate-800">{row.name}</td>
          <td className="p-3 font-mono">{row.phone || '-'}</td>
          <td className="p-3 text-center font-mono">
            {formatCurrency(row.customer_opening_balance ?? row.opening_balance ?? 0)}
          </td>
          <td className="p-3 text-center font-mono font-bold text-teal-900">
            {formatCurrency(row.customer_balance ?? row.current_balance ?? 0)}
          </td>
          <td className="p-3 text-center">{row.customer_opening_type ?? row.opening_balance_type ?? 'مدين'}</td>
        </tr>
      );
    case 'installments-due':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.po_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.supplier_name}</td>
          <td className="p-3 font-mono text-rose-700 font-bold">{formatDate(row.due_date)}</td>
          <td className="p-3 text-left font-mono font-bold">{formatCurrency(row.amount)}</td>
          <td className="p-3 text-left font-mono text-emerald-700">{formatCurrency(row.paid_amount || 0)}</td>
          <td className="p-3 text-left font-mono text-rose-700 font-bold">{formatCurrency(row.remaining_amount || row.amount)}</td>
          <td className="p-3 text-center">
            {row.is_overdue ? (
              <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded-full font-bold">
                متأخر ({row.overdue_days} يوم)
              </span>
            ) : (
              <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full font-medium">مستحق</span>
            )}
          </td>
        </tr>
      );
    case 'sales-invoices':
      if (row.invoices_count !== undefined) {
        return (
          <tr key={row.id || idx} className="hover:bg-slate-50">
            <td className="p-3 font-mono font-bold text-slate-900">{row.code || row.customer_id}</td>
            <td className="p-3 font-bold text-slate-800">{row.name}</td>
            <td className="p-3 font-mono">{row.phone || '-'}</td>
            <td className="p-3 text-center font-mono font-bold text-blue-700">{row.invoices_count}</td>
            <td className="p-3 text-left font-mono font-bold text-slate-900">{formatCurrency(row.total_sales || 0)}</td>
            <td className="p-3 text-left font-mono text-emerald-700">{formatCurrency(row.paid_total || 0)}</td>
            <td className="p-3 text-left font-mono font-bold text-rose-700">{formatCurrency(row.balance_remaining || 0)}</td>
          </tr>
        );
      }
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.invoice_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.customer_name}</td>
          <td className="p-3 font-mono">{formatDate(row.invoice_date)}</td>
          <td className="p-3 text-center">{row.payment_terms === 'credit' ? 'آجل' : 'نقدي'}</td>
          <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(row.net_amount || row.grand_total || 0)}</td>
          <td className="p-3 text-center">{row.status}</td>
        </tr>
      );
    case 'returns':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.return_number}</td>
          <td className="p-3 font-semibold text-slate-800">{row.return_type}</td>
          <td className="p-3 font-mono">{formatDate(row.return_date || row.created_at)}</td>
          <td className="p-3 text-left font-mono font-bold text-rose-700">{formatCurrency(row.total_amount || 0)}</td>
          <td className="p-3 text-slate-600">{row.reason || '-'}</td>
        </tr>
      );
    case 'dual-netting':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.code}</td>
          <td className="p-3 font-bold text-slate-800">{row.name}</td>
          <td className="p-3 text-center font-mono font-bold text-blue-700">{formatCurrency(row.supplier_balance)}</td>
          <td className="p-3 text-center font-mono font-bold text-emerald-700">{formatCurrency(row.customer_balance)}</td>
          <td className="p-3 text-center font-mono font-bold text-purple-900">{formatCurrency(row.net_balance)}</td>
          <td className="p-3 text-center font-mono">{row.settlements_count}</td>
        </tr>
      );
    case 'invalid-phones':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.code}</td>
          <td className="p-3 font-bold text-slate-800">{row.name}</td>
          <td className="p-3 text-center font-semibold text-slate-700">{row.party_type_label}</td>
          <td className="p-3 font-mono font-bold text-rose-700">{row.phone}</td>
          <td className="p-3 text-center text-xs text-amber-800 font-bold bg-amber-50/50 rounded">{row.phone_status}</td>
          <td className="p-3 text-center">
            <button
              type="button"
              onClick={() => {
                const target = row.is_customer && !row.is_supplier ? 'customers' : 'suppliers';
                window.location.hash = `#/${target}/${row.id}/edit`;
              }}
              className="px-2.5 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-bold hover:bg-blue-100 cursor-pointer"
            >
              تصحيح الرقم
            </button>
          </td>
        </tr>
      );
    case 'production-orders':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.order_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.product_name}</td>
          <td className="p-3 text-center font-mono font-bold">{formatNumber(row.quantity_to_produce)}</td>
          <td className="p-3 text-center">{row.status}</td>
          <td className="p-3 font-mono text-slate-600">{formatDate(row.start_date || row.created_at)}</td>
        </tr>
      );
    case 'outsourced-manufacturing':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.order_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.workshop_name}</td>
          <td className="p-3 text-slate-700">{row.finishing_type}</td>
          <td className="p-3 text-center font-mono font-bold">{formatNumber(row.quantity_sent)}</td>
          <td className="p-3 text-center">{row.status}</td>
        </tr>
      );
    case 'cut-order-stages':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.cutting_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.cutting_name}</td>
          <td className="p-3 font-bold text-indigo-700">{row.stage_title}</td>
          <td className="p-3 font-semibold text-slate-900">{row.vendor_name}</td>
          <td className="p-3 text-slate-600">{row.pricing_type}</td>
          <td className="p-3 text-left font-mono font-bold text-slate-900">{formatCurrency(row.total_cost)}</td>
          <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(row.paid)}</td>
          <td className="p-3 text-left font-mono font-bold text-amber-700">{formatCurrency(row.remaining)}</td>
        </tr>
      );
    case 'cut-production-by-size-color':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-[#1F3A5F]">{row.cutting_number}</td>
          <td className="p-3 font-bold text-slate-800">{row.cutting_name}</td>
          <td className="p-3">
            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-semibold text-slate-800">
              {row.color}
            </span>
          </td>
          {['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'].map(sz => (
            <td key={sz} className="p-2 text-center font-mono font-medium text-slate-700">
              {row[sz] > 0 ? formatNumber(row[sz]) : '-'}
            </td>
          ))}
          <td className="p-3 text-center font-mono font-bold text-blue-800">
            {formatNumber(row.row_total)}
          </td>
          <td className="p-3 font-mono text-slate-600">{formatDate(row.date)}</td>
          <td className="p-3 text-center">
            <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
              row.status === 'مقفل' ? 'bg-slate-200 text-slate-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {row.status}
            </span>
          </td>
        </tr>
      );
    case 'disbursements-by-expense':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono font-bold text-slate-900">{row.receipt_number || row.id}</td>
          <td className="p-3 font-bold text-slate-800">{row.expense_name}</td>
          <td className="p-3 text-left font-mono font-bold text-rose-700">{formatCurrency(row.amount)}</td>
          <td className="p-3 font-mono text-slate-600">{formatDate(row.date)}</td>
          <td className="p-3 text-slate-600">{row.notes || '-'}</td>
        </tr>
      );
    case 'audit-log':
      return (
        <tr key={row.id || idx} className="hover:bg-slate-50">
          <td className="p-3 font-mono text-slate-500">{formatDate(row.created_at)}</td>
          <td className="p-3 font-bold text-slate-900">{row.user_id || 'النظام'}</td>
          <td className="p-3 text-slate-700 font-semibold">{row.action}</td>
          <td className="p-3 font-mono text-slate-600">{row.table_name}</td>
          <td className="p-3 font-mono text-slate-500">{row.record_id || '-'}</td>
        </tr>
      );
    default:
      return null;
  }
}
