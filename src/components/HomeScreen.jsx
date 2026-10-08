import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  AlertTriangle,
  Clock,
  ExternalLink,
  Plus,
  Package
} from 'lucide-react';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import DataTable from './DataTable';

export default function HomeScreen({ onNavigate, userRole }) {
  const [dashboard, setDashboard] = useState(null);
  const [dueInvoices, setDueInvoices] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [dashRes, invRes, stockRes] = await Promise.all([
          api.getDashboard(userRole),
          api.getSupplierInvoices().catch(() => ({ data: [] })),
          api.getLowStockAlerts().catch(() => ({ data: [] }))
        ]);

        setDashboard(dashRes.dashboard || dashRes.data || {});

        // Filter invoices: unpaid / partially paid, prioritize overdue and due soon
        const invoices = invRes.invoices || invRes.data || [];
        const unpaid = invoices
          .filter(inv => inv.status !== 'paid' && (inv.remaining_amount > 0 || (inv.total_amount - inv.paid_amount) > 0))
          .sort((a, b) => {
            if (a.is_overdue && !b.is_overdue) return -1;
            if (!a.is_overdue && b.is_overdue) return 1;
            return (a.due_date || '').localeCompare(b.due_date || '');
          });
        setDueInvoices(unpaid);

        // Low stock items
        setLowStockItems(stockRes.alerts || stockRes.materials || stockRes.data || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
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
      render: (val, row) => (
        <span
          className="font-mono tabular-nums text-xs font-semibold text-gray-700"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={formatDate(val || row.invoice_date)}
        >
          {formatDate(val || row.invoice_date)}
        </span>
      ),
    },
    {
      key: 'remaining_amount',
      header: 'المتبقي',
      align: 'left',
      render: (val, row) => {
        const remaining = val != null ? val : (row.total_amount - (row.paid_amount || 0));
        return (
          <span
            className="font-mono tabular-nums font-bold text-red-600"
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
      header: 'كود الخامة',
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
      header: 'اسم الخامة',
      maxWidth: 'max-w-[200px]',
      render: (val, row) => (
        <div className="truncate max-w-[200px] font-semibold text-gray-900" title={val || row.item_name || 'خامة'}>
          {val || row.item_name || 'خامة'}
        </div>
      ),
    },
    {
      key: 'current_stock',
      header: 'الرصيد الحالي',
      align: 'center',
      render: (val, row) => (
        <span
          className="font-mono tabular-nums font-bold text-red-600"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={`${formatNumber(val || 0)} ${row.unit || ''}`}
        >
          {formatNumber(val || 0)} {row.unit || ''}
        </span>
      ),
    },
    {
      key: 'min_stock_alert',
      header: 'حد الأمان',
      align: 'center',
      render: (val, row) => (
        <span
          className="font-mono tabular-nums font-medium text-gray-600"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={`${formatNumber(val || 0)} ${row.unit || ''}`}
        >
          {formatNumber(val || 0)} {row.unit || ''}
        </span>
      ),
    },
    {
      key: 'average_cost',
      header: 'متوسط التكلفة',
      align: 'left',
      render: (val, row) => (
        <span
          className="font-mono tabular-nums font-semibold text-gray-800"
          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          title={formatCurrency(val || row.unit_cost || 0)}
        >
          {formatCurrency(val || row.unit_cost || 0)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* Page Title & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">لوحة التحكم الرئيسية</h2>
          <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
            ملخص الأرصدة، الالتزامات المالية، ومؤشرات المخزن والإنتاج
          </p>
        </div>
      </div>

      {/* Row of 5 Equal-Width Summary Boxes */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 w-full">
          {/* Box 1: Cash Balance */}
          <div
            className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none"
            title="رصيد الخزينة والبنك: متاح للصرف والعمليات"
          >
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block">
              رصيد الخزينة والبنك
            </span>
            <div
              className="text-2xl font-bold text-gray-900 mt-1 leading-tight tracking-tight font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis block"
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              title={formatCurrency(dashboard.cashBalance || 0)}
            >
              {formatCurrency(dashboard.cashBalance || 0)}
            </div>
            <span
              className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block"
              title="متاح للصرف والعمليات"
            >
              متاح للصرف والعمليات
            </span>
          </div>

          {/* Box 2: Supplier Debts (RED) */}
          <div
            className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none"
            title="ديون الموردين: مطلوب سدادها للموردين"
          >
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block">
              ديون الموردين
            </span>
            <div
              className="text-2xl font-bold text-red-600 mt-1 leading-tight tracking-tight font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis block"
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              title={formatCurrency(dashboard.supplierDebts || 0)}
            >
              {formatCurrency(dashboard.supplierDebts || 0)}
            </div>
            <span
              className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block"
              title="مطلوب سدادها للموردين"
            >
              مطلوب سدادها للموردين
            </span>
          </div>

          {/* Box 3: Customer Receivables (GREEN) */}
          <div
            className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none"
            title="مستحقات عند العملاء: مطلوب تحصيلها من العملاء والشركات"
          >
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block">
              مستحقات عند العملاء
            </span>
            <div
              className="text-2xl font-bold text-green-600 mt-1 leading-tight tracking-tight font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis block"
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              title={formatCurrency(dashboard.customerReceivables || 0)}
            >
              {formatCurrency(dashboard.customerReceivables || 0)}
            </div>
            <span
              className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block"
              title="مطلوب تحصيلها من العملاء والشركات"
            >
              مطلوب تحصيلها من العملاء
            </span>
          </div>

          {/* Box 4: Monthly Profit (Owner) OR Production Batches (Other roles) */}
          {userRole === 'owner' ? (
            <div
              className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none"
              title="صافي أرباح الشهر: بعد تكاليف الإنتاج والمصروفات التشغيلية"
            >
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block">
                صافي أرباح الشهر
              </span>
              <div
                className="text-2xl font-bold text-green-600 mt-1 leading-tight tracking-tight font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis block"
                style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                title={formatCurrency(dashboard.monthProfit || 0)}
              >
                {formatCurrency(dashboard.monthProfit || 0)}
              </div>
              <span
                className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block"
                title="بعد تكاليف الإنتاج والمصروفات التشغيلية"
              >
                بعد التكاليف والمصروفات
              </span>
            </div>
          ) : (
            <div
              className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none"
              title="أوامر التصنيع الجارية: قيد التشغيل على خطوط الإنتاج"
            >
              <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block">
                أوامر التصنيع الجارية
              </span>
              <div
                className="text-2xl font-bold text-gray-900 mt-1 leading-tight tracking-tight font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis block"
                style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                title={`${dashboard.inProductionCount || 0} دفعة`}
              >
                {dashboard.inProductionCount || 0} دفعة
              </div>
              <span
                className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block"
                title="قيد التشغيل على خطوط الإنتاج"
              >
                قيد التشغيل بالخطوط
              </span>
            </div>
          )}

          {/* Box 5: Low Stock Count (RED if > 0) */}
          <div
            className="bg-white border border-gray-200 rounded-md p-3.5 flex flex-col justify-between overflow-hidden shadow-none"
            title={dashboard.lowStockCount > 0 ? 'تنبيهات نواقص المستودع: خامات تحت حد الأمان' : 'المخزن آمن ومكتمل'}
          >
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis block">
              تنبيهات نواقص المستودع
            </span>
            <div
              className={`text-2xl font-bold mt-1 leading-tight tracking-tight font-mono tabular-nums whitespace-nowrap overflow-hidden text-ellipsis block ${
                dashboard.lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'
              }`}
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              title={`${dashboard.lowStockCount || 0} أصناف`}
            >
              {dashboard.lowStockCount || 0} أصناف
            </div>
            <span
              className="text-[11px] text-gray-400 font-medium mt-1 whitespace-nowrap overflow-hidden text-ellipsis block"
              title={dashboard.lowStockCount > 0 ? 'تحت حد الأمان الأدنى' : 'المخزن آمن ومكتمل'}
            >
              {dashboard.lowStockCount > 0 ? 'تحت حد الأمان' : 'المخزن آمن ومكتمل'}
            </span>
          </div>
        </div>
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
              onClick: () => onNavigate('suppliers'),
            }}
            actions={
              <button
                type="button"
                onClick={() => onNavigate('suppliers')}
                className="text-xs text-[#1F3A5F] hover:underline font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>عرض الكل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            }
          />
        </div>

        {/* Table 2: خامات قربت تخلص */}
        <div className="w-full overflow-hidden">
          <DataTable
            title="خامات قربت تخلص"
            subtitle="أصناف الخامات التي وصلت أو نزلت عن حد الأمان"
            columns={lowStockColumns}
            data={lowStockItems}
            loading={loading}
            pageSize={10}
            emptyMessage="جميع أرصدة الخامات آمنة وفوق حد الأمان الأدنى."
            emptyAction={{
              label: 'استعراض حركة المخزن',
              onClick: () => onNavigate('inventory'),
            }}
            actions={
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-xs text-[#1F3A5F] hover:underline font-bold flex items-center gap-1 cursor-pointer shrink-0"
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
