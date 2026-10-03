import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  AlertTriangle,
  Clock,
  ExternalLink,
  Plus
} from 'lucide-react';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

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
          api.getDashboard(),
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
          })
          .slice(0, 6);
        setDueInvoices(unpaid);

        // Low stock items
        setLowStockItems((stockRes.alerts || stockRes.materials || stockRes.data || []).slice(0, 6));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [userRole]);

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">لوحة التحكم الرئيسية</h2>
          <p className="text-sm text-gray-500 font-medium mt-0.5">
            ملخص الأرصدة، الالتزامات المالية، ومؤشرات المخزن والإنتاج
          </p>
        </div>
      </div>

      {/* Row of 4-5 Summary Boxes (White, Thin Border, Small Gray Label, Large Bold Number) */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Box 1: Cash Balance */}
          <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col justify-between">
            <span className="text-sm font-semibold text-gray-500">رصيد الخزينة والبنك</span>
            <div className="text-[28px] font-bold text-gray-900 mt-1 leading-tight tracking-tight">
              {formatCurrency(dashboard.cashBalance)}
            </div>
            <span className="text-xs text-gray-400 font-medium mt-1">متاح للصرف والعمليات</span>
          </div>

          {/* Box 2: Supplier Debts (RED) */}
          <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col justify-between">
            <span className="text-sm font-semibold text-gray-500">ديون الموردين</span>
            <div className="text-[28px] font-bold text-red-600 mt-1 leading-tight tracking-tight">
              {formatCurrency(dashboard.supplierDebts)}
            </div>
            <span className="text-xs text-gray-400 font-medium mt-1">مطلوب سدادها للموردين</span>
          </div>

          {/* Box 3: Customer Receivables (GREEN) */}
          <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col justify-between">
            <span className="text-sm font-semibold text-gray-500">مستحقات عند العملاء</span>
            <div className="text-[28px] font-bold text-green-600 mt-1 leading-tight tracking-tight">
              {formatCurrency(dashboard.customerReceivables)}
            </div>
            <span className="text-xs text-gray-400 font-medium mt-1">مطلوب تحصيلها من الشركات والعملاء</span>
          </div>

          {/* Box 4: Monthly Profit (Owner) OR Production Batches (Other roles) */}
          {userRole === 'owner' ? (
            <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col justify-between">
              <span className="text-sm font-semibold text-gray-500">صافي أرباح الشهر</span>
              <div className="text-[28px] font-bold text-green-600 mt-1 leading-tight tracking-tight">
                {formatCurrency(dashboard.monthProfit)}
              </div>
              <span className="text-xs text-gray-400 font-medium mt-1">بعد تكاليف الإنتاج والمصروفات التشغيلية</span>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col justify-between">
              <span className="text-sm font-semibold text-gray-500">أوامر التصنيع الجارية</span>
              <div className="text-[28px] font-bold text-gray-900 mt-1 leading-tight tracking-tight">
                {dashboard.inProductionCount} دفعة
              </div>
              <span className="text-xs text-gray-400 font-medium mt-1">قيد التشغيل على خطوط الإنتاج</span>
            </div>
          )}

          {/* Box 5: Low Stock Count (RED if > 0) */}
          <div className="bg-white border border-gray-200 rounded-md p-4 flex flex-col justify-between">
            <span className="text-sm font-semibold text-gray-500">تنبيهات نواقص المستودع</span>
            <div className={`text-[28px] font-bold mt-1 leading-tight tracking-tight ${dashboard.lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {dashboard.lowStockCount} أصناف
            </div>
            <span className="text-xs text-gray-400 font-medium mt-1">
              {dashboard.lowStockCount > 0 ? 'تحت حد الأمان الأدنى' : 'المخزن آمن ومكتمل'}
            </span>
          </div>
        </div>
      )}

      {/* Two Simple Data Tables Below the Summary Boxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: فواتير مستحقة قريباً */}
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h3 className="text-base font-bold text-gray-900">فواتير مستحقة قريباً</h3>
              <p className="text-xs text-gray-500 font-medium">فواتير مشتريات يلزم سدادها للموردين</p>
            </div>
            <button
              onClick={() => onNavigate('suppliers')}
              className="text-xs text-[#1F3A5F] hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>عرض كل الفواتير</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200 text-xs">
                  <th className="py-2.5 px-3">رقم الفاتورة</th>
                  <th className="py-2.5 px-3">المورد</th>
                  <th className="py-2.5 px-3">تاريخ الاستحقاق</th>
                  <th className="py-2.5 px-3 text-left">المتبقي</th>
                  <th className="py-2.5 px-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dueInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500 font-medium">
                      لا توجد فواتير مستحقة حالياً. جميع الالتزامات مسددة.
                    </td>
                  </tr>
                ) : (
                  dueInvoices.map((inv) => {
                    const remaining = inv.remaining_amount != null ? inv.remaining_amount : (inv.total_amount - inv.paid_amount);
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-gray-900">
                          {inv.invoice_number || inv.id}
                        </td>
                        <td className="py-2.5 px-3 text-gray-700 font-medium">
                          {inv.supplier_name || 'مورد عام'}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {formatDate(inv.due_date || inv.invoice_date)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-bold text-red-600">
                          {formatCurrency(remaining)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {inv.is_overdue ? (
                            <span className="erp-badge-red text-xs">متأخرة</span>
                          ) : inv.is_due_soon ? (
                            <span className="erp-badge-red text-xs">تستحق قريباً</span>
                          ) : (
                            <span className="erp-badge-gray text-xs">آجلة</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: خامات قربت تخلص */}
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h3 className="text-base font-bold text-gray-900">خامات قربت تخلص</h3>
              <p className="text-xs text-gray-500 font-medium">أصناف الخامات التي وصلت أو نزلت عن حد الأمان</p>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-[#1F3A5F] hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>سجل الخامات بالمخزن</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600 font-bold border-b border-gray-200 text-xs">
                  <th className="py-2.5 px-3">كود الخامة</th>
                  <th className="py-2.5 px-3">اسم الخامة</th>
                  <th className="py-2.5 px-3 text-center">الرصيد الحالي</th>
                  <th className="py-2.5 px-3 text-center">حد الأمان</th>
                  <th className="py-2.5 px-3 text-left">متوسط التكلفة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lowStockItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500 font-medium">
                      جميع أرصدة الخامات آمنة وفوق حد الأمان.
                    </td>
                  </tr>
                ) : (
                  lowStockItems.map((mat) => (
                    <tr key={mat.id || Math.random()} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-gray-700">
                        {mat.code || mat.item_code || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        {mat.name || mat.item_name || 'خامة'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-red-600">
                        {formatNumber(mat.current_stock || 0)} {mat.unit || ''}
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-600 font-medium">
                        {formatNumber(mat.min_stock_alert || 0)} {mat.unit || ''}
                      </td>
                      <td className="py-2.5 px-3 text-left font-semibold text-gray-800">
                        {formatCurrency(mat.average_cost || mat.unit_cost || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
