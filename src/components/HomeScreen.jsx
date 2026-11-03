import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  AlertTriangle,
  Clock,
  ExternalLink,
  Plus,
  Package,
  Layers,
  ChevronLeft
} from 'lucide-react';
import { liveQuery } from 'dexie';
import db from '../data/db';
import { getDashboardMetrics } from '../logic/dashboardMetrics';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import DataTable from './DataTable';
import { isFeatureEnabled } from '../editions/editionConfig';

/**
 * Format currency split into numeric digits and Arabic currency symbol
 * so digits use tabular numbers while Arabic 'ج.م' uses the standard font.
 */
function formatCardCurrency(amount) {
  const num = Number(amount) || 0;
  const isNegative = num < 0;
  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    isNegative,
    digits: (isNegative ? '-' : '') + absFormatted,
    currency: 'ج.م',
  };
}

export default function HomeScreen({ onNavigate, userRole }) {
  const [dashboard, setDashboard] = useState(null);
  const [dueInvoices, setDueInvoices] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reactive subscription via Dexie liveQuery:
  // Automatically re-computes KPIs whenever any related transaction or record changes in Dexie!
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const subscription = liveQuery(async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const metrics = await getDashboardMetrics(db, currentMonth, { userRole });

      // Invoices: unpaid / partially paid, prioritize overdue and due soon
      const invoices = (await db.supplier_invoices?.toArray().catch(() => [])) || [];
      const unpaid = invoices
        .filter(inv => {
          if (inv.status === 'paid' || inv.status === 'cancelled') return false;
          const rem = inv.remaining_amount != null
            ? Number(inv.remaining_amount)
            : (Number(inv.total_amount || 0) - Number(inv.paid_amount || 0));
          return rem > 0;
        })
        .sort((a, b) => {
          if (a.is_overdue && !b.is_overdue) return -1;
          if (!a.is_overdue && b.is_overdue) return 1;
          return (a.due_date || '').localeCompare(b.due_date || '');
        });

      return {
        dashboard: metrics,
        dueInvoices: unpaid,
        lowStockItems: metrics.lowStockItems || [],
      };
    }).subscribe({
      next: (data) => {
        if (!isMounted) return;
        setDashboard(data.dashboard);
        setDueInvoices(data.dueInvoices);
        setLowStockItems(data.lowStockItems);
        setLoading(false);
      },
      error: (err) => {
        console.error('liveQuery error on HomeScreen:', err);
        if (isMounted) setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [userRole]);

  const dueInvoicesColumns = [
    {
      key: 'invoice_number',
      header: 'رقم الفاتورة',
      type: 'code',
      render: (val, row) => (
        <span
          className="font-mono font-bold text-[#1F3A5F] tabular-nums"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={val || row.id}
        >
          {val || row.id}
        </span>
      ),
    },
    {
      key: 'supplier_name',
      header: 'المورد',
      maxWidth: 'max-w-[180px]',
      render: (val) => (
        <div className="truncate max-w-[180px] font-semibold text-gray-900" title={val || 'مورد عام'}>
          {val || 'مورد عام'}
        </div>
      ),
    },
    {
      key: 'due_date',
      header: 'تاريخ الاستحقاق',
      align: 'center',
      render: (val) => (
        <span
          className="font-mono tabular-nums text-xs font-semibold text-gray-700"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={val ? formatDate(val) : 'بدون تاريخ استحقاق'}
        >
          {val ? formatDate(val) : 'بدون تاريخ استحقاق'}
        </span>
      ),
    },
    {
      key: 'remaining_amount',
      header: 'المتبقي',
      align: 'left',
      minWidth: '130px',
      render: (val, row) => {
        const remaining = val != null ? val : (row.total_amount - (row.paid_amount || 0));
        return (
          <span
            className="tabular-nums font-bold text-red-600 font-sans whitespace-nowrap min-w-[120px] inline-block"
            style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
            title={formatCurrency(remaining)}
          >
            {formatCurrency(remaining)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      render: (val, row) => {
        if (!row.due_date) {
          return <span className="erp-badge-gray text-xs">بدون تاريخ استحقاق</span>;
        }
        if (row.is_overdue) {
          return <span className="erp-badge-red text-xs">متأخرة</span>;
        }
        if (row.is_due_soon) {
          return <span className="erp-badge-red text-xs">تستحق قريباً</span>;
        }
        return <span className="erp-badge-gray text-xs">آجلة</span>;
      },
    },
  ];

  const lowStockColumns = [
    {
      key: 'code',
      header: 'كود الصنف / الخامة',
      type: 'code',
      render: (val, row) => (
        <span
          className="font-mono font-bold text-[#1F3A5F] tabular-nums"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={val || row.item_code || '-'}
        >
          {val || row.item_code || '-'}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'اسم الصنف / الخامة',
      maxWidth: 'max-w-[200px]',
      render: (val, row) => (
        <div className="truncate max-w-[200px] font-semibold text-gray-900" title={val || row.item_name || 'صنف'}>
          {val || row.item_name || 'صنف'}
        </div>
      ),
    },
    {
      key: 'current_stock',
      header: 'الرصيد الفعلي',
      align: 'center',
      render: (val, row) => (
        <span
          className="tabular-nums font-bold text-red-600 font-sans"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={`${formatNumber(val || 0)} ${row.unit || ''}`}
        >
          {formatNumber(val || 0)} {row.unit || ''}
        </span>
      ),
    },
    {
      key: 'min_level',
      header: 'حد الأمان',
      align: 'center',
      render: (val, row) => (
        <span
          className="tabular-nums font-medium text-gray-600 font-sans"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={`${formatNumber(val || row.min_stock_alert || 0)} ${row.unit || ''}`}
        >
          {formatNumber(val || row.min_stock_alert || 0)} {row.unit || ''}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'النوع',
      align: 'center',
      render: (val, row) => (
        <span className="text-xs text-gray-600 font-semibold font-sans">
          {val === 'finished_good' ? 'منتج تام' : val === 'raw_material' ? 'خامة أولية' : 'صنف'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* Page Title & Quick Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 font-sans">لوحة التحكم الرئيسية</h2>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5 font-sans">
            مؤشرات مالية ومخزنية حية ومحدثة تلقائياً من واقع المعاملات
          </p>
        </div>
      </div>

      {/* Row of 5 Equal-Width Summary Boxes */}
      {loading && !dashboard ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 w-full animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-md p-3.5 h-24 flex flex-col justify-between">
              <div className="h-3 bg-gray-200 rounded-sm w-24"></div>
              <div className="h-6 bg-gray-200 rounded-sm w-32"></div>
              <div className="h-2.5 bg-gray-100 rounded-sm w-20"></div>
            </div>
          ))}
        </div>
      ) : (
        dashboard && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 w-full">
            {/* Box 1: Cash Balance */}
            <div
              id="kpi-cash-balance"
              onClick={() => onNavigate && onNavigate('treasuries')}
              className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-gray-400 hover:shadow-xs transition-all"
              title="رصيد الخزينة والبنك: اضغط لاستعراض سجل وأرصدة الخزائن"
            >
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                رصيد الخزينة والبنك
              </span>
              {(() => {
                const { digits, currency, isNegative } = formatCardCurrency(dashboard.cashBalance || 0);
                return (
                  <div
                    className={`text-2xl font-bold mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5 ${
                      isNegative ? 'text-red-600' : 'text-gray-900'
                    }`}
                    style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                  >
                    <span className="tabular-nums font-bold tracking-tight">{digits}</span>
                    <span className="text-sm font-semibold text-gray-500 font-sans tracking-normal select-none">{currency}</span>
                  </div>
                );
              })()}
              <span
                className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                title="متاح للصرف والعمليات"
              >
                متاح للصرف والعمليات
              </span>
            </div>

            {/* Box 2: Supplier Debts (RED) */}
            <div
              id="kpi-supplier-debts"
              onClick={() => onNavigate && onNavigate('reports?tab=supplier-statements')}
              className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-red-300 hover:shadow-xs transition-all"
              title="ديون الموردين: اضغط لفتح كشف حساب وأعمار ديون الموردين"
            >
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                ديون الموردين
              </span>
              {(() => {
                const { digits, currency } = formatCardCurrency(dashboard.supplierDebts || 0);
                return (
                  <div
                    className="text-2xl font-bold text-red-600 mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5"
                    style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                  >
                    <span className="tabular-nums font-bold tracking-tight">{digits}</span>
                    <span className="text-sm font-semibold text-red-500 font-sans tracking-normal select-none">{currency}</span>
                  </div>
                );
              })()}
              <span
                className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                title="مطلوب سدادها للموردين"
              >
                مطلوب سدادها للموردين
              </span>
            </div>

            {/* Box 3: Customer Receivables (GREEN) */}
            <div
              id="kpi-customer-receivables"
              onClick={() => onNavigate && onNavigate('reports?tab=customer-statements')}
              className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-emerald-300 hover:shadow-xs transition-all"
              title="مستحقات عند العملاء: اضغط لفتح كشف حساب وأعمار ديون العملاء"
            >
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                مستحقات عند العملاء
              </span>
              {(() => {
                const { digits, currency } = formatCardCurrency(dashboard.customerReceivables || 0);
                return (
                  <div
                    className="text-2xl font-bold text-emerald-600 mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5"
                    style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                  >
                    <span className="tabular-nums font-bold tracking-tight">{digits}</span>
                    <span className="text-sm font-semibold text-emerald-600 font-sans tracking-normal select-none">{currency}</span>
                  </div>
                );
              })()}
              <span
                className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                title="مطلوب تحصيلها من العملاء"
              >
                مطلوب تحصيلها من العملاء
              </span>
            </div>

            {/* Box 4: Monthly Profit (Owner) OR Production Batches (Other roles) */}
            {userRole === 'owner' ? (
              <div
                id="kpi-month-profit"
                onClick={() => onNavigate && onNavigate('reports?tab=sales-invoices')}
                className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-emerald-300 hover:shadow-xs transition-all"
                title="صافي أرباح الشهر: اضغط لفتح تقرير فواتير المبيعات والأرباح"
              >
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                  صافي أرباح الشهر
                </span>
                {(() => {
                  const { digits, currency, isNegative } = formatCardCurrency(dashboard.monthProfit ?? 0);
                  return (
                    <div
                      className={`text-2xl font-bold mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5 ${
                        isNegative ? 'text-red-600' : 'text-emerald-600'
                      }`}
                      style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                    >
                      <span className="tabular-nums font-bold tracking-tight">{digits}</span>
                      <span className={`text-sm font-semibold font-sans tracking-normal select-none ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>
                        {currency}
                      </span>
                    </div>
                  );
                })()}
                <span
                  className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                  title="بعد التكاليف والمصروفات"
                >
                  بعد التكاليف والمصروفات
                </span>
              </div>
            ) : isFeatureEnabled('cutting') ? (
              <div
                id="kpi-production-batches"
                onClick={() => onNavigate && onNavigate('manufacturing')}
                className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-gray-400 hover:shadow-xs transition-all"
                title="أوامر التصنيع الجارية: اضغط للانتقال لأوامر الإنتاج"
              >
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                  أوامر التصنيع الجارية
                </span>
                <div
                  className="text-2xl font-bold text-gray-900 mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5"
                  style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                >
                  <span className="tabular-nums font-bold tracking-tight">{Math.round(dashboard.inProductionCount || 0)}</span>
                  <span className="text-sm font-semibold text-gray-500 font-sans tracking-normal select-none">دفعة</span>
                </div>
                <span
                  className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                  title="قيد التشغيل على خطوط الإنتاج"
                >
                  قيد التشغيل بالخطوط
                </span>
              </div>
            ) : (
              <div
                id="kpi-customers-count"
                onClick={() => onNavigate && onNavigate('customers')}
                className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-gray-400 hover:shadow-xs transition-all"
                title="إجمالي العملاء: اضغط للانتقال لدليل العملاء"
              >
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                  إجمالي جهات العملاء
                </span>
                <div
                  className="text-2xl font-bold text-gray-900 mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5"
                  style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                >
                  <span className="tabular-nums font-bold tracking-tight">{dashboard.customersBreakdown?.length || 0}</span>
                  <span className="text-sm font-semibold text-gray-500 font-sans tracking-normal select-none">عميل</span>
                </div>
                <span
                  className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                  title="عملاء مسجلين بالنظام"
                >
                  عملاء مسجلين بالنظام
                </span>
              </div>
            )}

            {/* Box 5: Low Stock Count (RED if > 0) */}
            <div
              id="kpi-low-stock"
              onClick={() => onNavigate && onNavigate('reports?tab=low-stock')}
              className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none cursor-pointer hover:border-amber-400 hover:shadow-xs transition-all"
              title={dashboard.lowStockCount > 0 ? 'تنبيهات نواقص المستودع: اضغط لفتح تقرير النواقص' : 'المخزن آمن ومكتمل'}
            >
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block font-sans">
                تنبيهات نواقص المستودع
              </span>
              <div
                className={`text-2xl font-bold mt-1 leading-tight tracking-tight whitespace-nowrap overflow-hidden text-ellipsis flex items-baseline gap-1.5 ${
                  dashboard.lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'
                }`}
                style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              >
                <span className="tabular-nums font-bold tracking-tight">{Math.round(dashboard.lowStockCount || 0)}</span>
                <span className="text-sm font-semibold text-gray-500 font-sans tracking-normal select-none">أصناف</span>
              </div>
              <span
                className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block font-sans"
                title={dashboard.lowStockCount > 0 ? 'تحت حد الأمان الأدنى' : 'المخزن آمن ومكتمل'}
              >
                {dashboard.lowStockCount > 0 ? 'تحت حد الأمان' : 'المخزن آمن ومكتمل'}
              </span>
            </div>
          </div>
        )
      )}

      {/* Two Clean Data Tables Spanning Consistent Full Width */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        {/* Table 1: فواتير مستحقة قريباً */}
        <div className="w-full overflow-hidden">
          <DataTable
            title="فواتير مستحقة قريباً"
            subtitle="فواتير مشتريات يلزم سدادها للموردين"
            columns={dueInvoicesColumns}
            data={dueInvoices}
            loading={loading}
            pageSize={10}
            emptyMessage="لا توجد فواتير مستحقة حالياً. جميع الالتزامات مسددة."
            emptyAction={{
              label: 'استعراض سجل الموردين',
              onClick: () => onNavigate && onNavigate('suppliers'),
            }}
            actions={
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('suppliers')}
                className="text-xs text-[#1F3A5F] hover:underline font-bold flex items-center gap-1 cursor-pointer shrink-0 font-sans"
              >
                <span>عرض الكل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            }
          />
        </div>

        {/* Table 2: خامات وأصناف قربت تخلص */}
        <div className="w-full overflow-hidden">
          <DataTable
            title="خامات وأصناف قربت تخلص"
            subtitle="الأصناف والخامات التي وصلت أو نزلت عن حد الأمان الأدنى"
            columns={lowStockColumns}
            data={lowStockItems}
            loading={loading}
            pageSize={10}
            emptyMessage="جميع أرصدة الأصناف والخامات آمنة وفوق حد الأمان الأدنى."
            emptyAction={{
              label: 'استعراض حركة المخزن',
              onClick: () => onNavigate && onNavigate('inventory'),
            }}
            actions={
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('reports?tab=low-stock')}
                className="text-xs text-[#1F3A5F] hover:underline font-bold flex items-center gap-1 cursor-pointer shrink-0 font-sans"
              >
                <span>عرض الكل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
