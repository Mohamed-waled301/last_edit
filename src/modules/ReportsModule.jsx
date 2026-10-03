import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Printer, 
  Download, 
  PieChart, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  Layers, 
  ShieldAlert,
  Calendar
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function ReportsModule({ onBack, userRole, onNotify }) {
  const [reportType, setReportType] = useState('cost'); // 'cost' | 'profit' | 'debts'
  const [dashboard, setDashboard] = useState(null);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [profitability, setProfitability] = useState({ byProduct: [], byOutlet: [] });
  const [debtAging, setDebtAging] = useState({ suppliers: [], customers: [] });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashRes, costRes, debtRes] = await Promise.all([
        api.getDashboard(),
        api.getCostBreakdown(),
        api.getDebtAging()
      ]);
      setDashboard(dashRes.data);
      setCostBreakdown(costRes.data || []);
      setDebtAging(debtRes.data || { suppliers: [], customers: [] });

      if (userRole === 'owner') {
        try {
          const profRes = await api.getProfitability();
          setProfitability(profRes.data || { byProduct: [], byOutlet: [] });
        } catch {
          // Gated if not owner
        }
      }
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userRole]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">تقارير ومؤشرات أداء المؤسسة</h2>
            <span className="text-xs text-gray-500 font-medium">تحليل تكلفة المنتجات، تقارير الأرباح، وأعمار الديون والسيولة</span>
          </div>
        </div>

        {/* Report Selector Tabs & Print */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'cost', label: 'تفاصيل تكاليف المنتجات' },
              ...(userRole === 'owner' ? [{ id: 'profit', label: 'كشف الأرباح والمبيعات' }] : []),
              { id: 'debts', label: 'أعمار الديون والتحصيلات' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setReportType(t.id)}
                className={`px-4 py-2 rounded-md font-bold text-sm transition-colors cursor-pointer ${
                  reportType === t.id
                    ? 'bg-[#1F3A5F] text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => window.print()}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span>طباعة التقرير</span>
          </button>
        </div>
      </div>

      {/* DASHBOARD 5 SUMMARY BOXES */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <span className="text-xs font-semibold text-gray-500 block">رصيد الخزائن والبنك</span>
            <span className="text-2xl font-bold text-gray-900 mt-1 block tracking-tight">
              {formatCurrency(dashboard.cashBalance)}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <span className="text-xs font-semibold text-gray-500 block">ديون الموردين</span>
            <span className="text-2xl font-bold text-red-600 mt-1 block tracking-tight">
              {formatCurrency(dashboard.supplierDebts)}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <span className="text-xs font-semibold text-gray-500 block">مستحقات عند العملاء</span>
            <span className="text-2xl font-bold text-green-700 mt-1 block tracking-tight">
              {formatCurrency(dashboard.customerReceivables)}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <span className="text-xs font-semibold text-gray-500 block">خامات تحت حد الأمان</span>
            <span className={`text-2xl font-bold mt-1 block tracking-tight ${dashboard.lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {dashboard.lowStockCount} خامة
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <span className="text-xs font-semibold text-gray-500 block">
              {userRole === 'owner' ? 'صافي أرباح الشهر' : 'دفعات التشطيب الجارية'}
            </span>
            <span className={`text-2xl font-bold mt-1 block tracking-tight ${userRole === 'owner' ? 'text-green-700' : 'text-gray-900'}`}>
              {userRole === 'owner' ? formatCurrency(dashboard.monthProfit) : `${dashboard.inFinishingCount} دفعات`}
            </span>
          </div>
        </div>
      )}

      {/* REPORT 1: COST BREAKDOWN PER PRODUCT */}
      {reportType === 'cost' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">تقرير تفصيل تكاليف المنتجات والموبيليا</h3>
              <p className="text-xs text-gray-500 font-medium">
                متوسط تكلفة كل صنف: الهيكل من مرحلة 1 + مصاريف التشطيب مرحلة 2 = التكلفة الصافية النهائية للقطعة
              </p>
            </div>
            <button
              onClick={() => {
                const headers = ['كود الصنف', 'اسم المنتج', 'التصنيف', 'متوسط تكلفة مرحلة 1', 'متوسط تكلفة مرحلة 2', 'التكلفة النهائية للقطعة'];
                const rows = costBreakdown.map(p => [
                  p.code, p.name, p.category, p.avg_stage1_unit_cost, p.avg_stage2_unit_cost, p.avg_final_unit_cost
                ]);
                exportToExcel('تقرير_تفصيل_تكاليف_المنتجات', headers, rows);
              }}
              className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-gray-600" />
              <span>تصدير Excel</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">كود الصنف</th>
                    <th className="py-3 px-4">اسم المنتج</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4 text-left">متوسط تكلفة مرحلة 1 (الهيكل)</th>
                    <th className="py-3 px-4 text-left">متوسط تكلفة مرحلة 2 (التشطيب)</th>
                    <th className="py-3 px-4 text-left font-bold text-[#1F3A5F]">التكلفة النهائية للقطعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {costBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد بيانات تكاليف متوفرة حالياً.
                      </td>
                    </tr>
                  ) : (
                    costBreakdown.map(p => (
                      <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-700">{p.code || '-'}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{p.name || 'منتج'}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{p.category}</td>
                        <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(p.avg_stage1_unit_cost)}</td>
                        <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(p.avg_stage2_unit_cost)}</td>
                        <td className="py-3 px-4 text-left font-bold text-green-700">
                          {p.avg_final_unit_cost > 0 ? formatCurrency(p.avg_final_unit_cost) : 'قيد الإنتاج'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 2: PROFITABILITY (OWNER ONLY) */}
      {reportType === 'profit' && userRole === 'owner' && (
        <div className="space-y-6">
          {/* Profit by Product */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">تقرير ربحية المنتجات (خاص بصاحب العمل)</h3>
                <p className="text-xs text-gray-500 font-medium">
                  حساب صافي الأرباح المحققة من كل منتج بعد خصم تكلفة الصنع ومصاريف البيع
                </p>
              </div>
              <button
                onClick={() => {
                  const headers = ['اسم المنتج', 'كود الصنف', 'الكمية المباعة', 'إجمالي الإيراد', 'إجمالي التكلفة', 'صافي الربح'];
                  const rows = profitability.byProduct.map(p => [
                    p.name, p.code, p.total_qty_sold, p.total_revenue, p.total_cogs, p.total_profit
                  ]);
                  exportToExcel('تقرير_ربحية_المنتجات', headers, rows);
                }}
                className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-gray-600" />
                <span>تصدير Excel</span>
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                      <th className="py-3 px-4">اسم المنتج</th>
                      <th className="py-3 px-4 text-center">الكمية المباعة</th>
                      <th className="py-3 px-4 text-left">إجمالي الإيراد</th>
                      <th className="py-3 px-4 text-left">إجمالي تكلفة الصنع (COGS)</th>
                      <th className="py-3 px-4 text-left font-bold text-green-700">صافي الربح المحقق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {profitability.byProduct.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500 font-medium">
                          لا توجد مبيعات مسجلة حتى الآن.
                        </td>
                      </tr>
                    ) : (
                      profitability.byProduct.map(p => (
                        <tr key={p.id || Math.random()} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">{p.name || 'منتج'}</td>
                          <td className="py-3 px-4 text-center font-bold text-gray-700">{p.total_qty_sold} قطعة</td>
                          <td className="py-3 px-4 text-left font-bold text-gray-900">{formatCurrency(p.total_revenue)}</td>
                          <td className="py-3 px-4 text-left font-semibold text-gray-600">{formatCurrency(p.total_cogs)}</td>
                          <td className="py-3 px-4 text-left font-bold text-green-700">
                            +{formatCurrency(p.total_profit)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Profit by Outlet */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">تقرير ربحية معارض ومنافذ البيع</h3>
                <p className="text-xs text-gray-500 font-medium">متابعة إيرادات وصافي أرباح كل منفذ ومعرض</p>
              </div>
              <button
                onClick={() => {
                  const headers = ['المعرض', 'عدد الفواتير', 'إجمالي المبيعات', 'صافي الربح'];
                  const rows = profitability.byOutlet.map(o => [
                    o.name, o.invoices_count, o.total_revenue, o.total_profit
                  ]);
                  exportToExcel('تقرير_ربحية_المعارض', headers, rows);
                }}
                className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-gray-600" />
                <span>تصدير Excel</span>
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                      <th className="py-3 px-4">اسم المعرض / المنفذ</th>
                      <th className="py-3 px-4 text-center">عدد الفواتير</th>
                      <th className="py-3 px-4 text-left">إجمالي المبيعات</th>
                      <th className="py-3 px-4 text-left font-bold text-green-700">صافي أرباح المعرض</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {profitability.byOutlet.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-500 font-medium">
                          لا توجد بيانات منافذ متوفرة.
                        </td>
                      </tr>
                    ) : (
                      profitability.byOutlet.map(o => (
                        <tr key={o.id || Math.random()} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">{o.name || 'المنفذ الرئيسي'}</td>
                          <td className="py-3 px-4 text-center text-gray-700 font-semibold">{o.invoices_count} فاتورة</td>
                          <td className="py-3 px-4 text-left font-bold text-gray-900">{formatCurrency(o.total_revenue)}</td>
                          <td className="py-3 px-4 text-left font-bold text-green-700">
                            +{formatCurrency(o.total_profit)}
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
      )}

      {/* REPORT 3: DEBT AGING */}
      {reportType === 'debts' && (
        <div className="space-y-6">
          {/* Supplier Debts Aging */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-md p-3">
              <h3 className="text-base font-bold text-red-600">ديون الموردين ومواعيد استحقاقها</h3>
              <p className="text-xs text-gray-500 font-medium">أعمار فواتير المشتريات غير المسددة</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                      <th className="py-3 px-4">المورد</th>
                      <th className="py-3 px-4">رقم الفاتورة</th>
                      <th className="py-3 px-4">تاريخ الاستحقاق</th>
                      <th className="py-3 px-4 text-left">المتبقي المطلوب سداده</th>
                      <th className="py-3 px-4 text-center">حالة التأخير</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {debtAging.suppliers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500 font-medium">
                          لا توجد ديون موردين متأخرة.
                        </td>
                      </tr>
                    ) : (
                      debtAging.suppliers.map(d => (
                        <tr key={d.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">{d.supplier_name}</td>
                          <td className="py-3 px-4 font-mono font-medium text-gray-700">{d.invoice_number}</td>
                          <td className="py-3 px-4 text-gray-600">{formatDate(d.due_date)}</td>
                          <td className="py-3 px-4 text-left font-bold text-red-600">{formatCurrency(d.remaining_amount)}</td>
                          <td className="py-3 px-4 text-center">
                            {d.days_overdue > 0 ? (
                              <span className="erp-badge-red text-xs">
                                متأخرة منذ {d.days_overdue} يوم
                              </span>
                            ) : (
                              <span className="erp-badge-green text-xs">
                                لم يحن ميعادها بعد
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Customer Receivables Aging */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-md p-3">
              <h3 className="text-base font-bold text-green-700">مستحقات المؤسسة لدى العملاء ومنافذ التوزيع</h3>
              <p className="text-xs text-gray-500 font-medium">أعمار فواتير المبيعات غير المحصلة</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                      <th className="py-3 px-4">العميل</th>
                      <th className="py-3 px-4">رقم الفاتورة</th>
                      <th className="py-3 px-4">تاريخ الاستحقاق</th>
                      <th className="py-3 px-4 text-left">المتبقي المطلوب تحصيله</th>
                      <th className="py-3 px-4 text-center">حالة التأخير</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {debtAging.customers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500 font-medium">
                          لا توجد مستحقات عملاء متأخرة.
                        </td>
                      </tr>
                    ) : (
                      debtAging.customers.map(d => (
                        <tr key={d.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900">{d.customer_name}</td>
                          <td className="py-3 px-4 font-mono font-medium text-gray-700">{d.invoice_number}</td>
                          <td className="py-3 px-4 text-gray-600">{formatDate(d.due_date)}</td>
                          <td className="py-3 px-4 text-left font-bold text-green-700">{formatCurrency(d.remaining_amount)}</td>
                          <td className="py-3 px-4 text-center">
                            {d.days_overdue > 0 ? (
                              <span className="erp-badge-red text-xs">
                                متأخر عن السداد منذ {d.days_overdue} يوم
                              </span>
                            ) : (
                              <span className="erp-badge-gray text-xs">
                                ضمن فترة السماح
                              </span>
                            )}
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
      )}
    </div>
  );
}
