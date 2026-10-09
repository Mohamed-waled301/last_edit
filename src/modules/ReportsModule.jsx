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
  Calendar,
  Package,
  Search,
  Filter
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function ReportsModule({ onBack, userRole, onNotify }) {
  const [reportType, setReportType] = useState('products'); // 'products' | 'cost' | 'profit' | 'debts'
  const [dashboard, setDashboard] = useState(null);
  const [productsReport, setProductsReport] = useState([]);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [profitability, setProfitability] = useState({ byProduct: [], byOutlet: [] });
  const [debtAging, setDebtAging] = useState({ suppliers: [], customers: [] });
  const [loading, setLoading] = useState(true);

  // Filters for Products Report (Requirement G)
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [dashRes, costRes, debtRes, prodRepRes] = await Promise.all([
        api.getDashboard(),
        api.getCostBreakdown(),
        api.getDebtAging(),
        api.getProductsReport ? api.getProductsReport() : Promise.resolve({ data: [] })
      ]);
      setDashboard(dashRes.data);
      setCostBreakdown(costRes.data || []);
      setDebtAging(debtRes.data || { suppliers: [], customers: [] });
      setProductsReport(prodRepRes.data || []);

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

  // Filtered Products Report (Requirement G)
  const filteredProducts = productsReport.filter(p => {
    const matchesSearch = !searchTerm || 
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = !groupFilter || p.group === groupFilter;
    const matchesType = !typeFilter || p.type === typeFilter;
    return matchesSearch && matchesGroup && matchesType;
  });

  const uniqueGroups = Array.from(new Set(productsReport.map(p => p.group).filter(Boolean)));

  const totalProductsCostVal = filteredProducts.reduce((sum, p) => sum + (p.total_cost || 0), 0);
  const totalProductsSalesVal = filteredProducts.reduce((sum, p) => sum + (p.total_selling_value || 0), 0);

  const handleExportProductsExcel = () => {
    const headers = [
      'كود الصنف', 
      'اسم الصنف', 
      'المجموعة', 
      'الوحدة', 
      'الرصيد الفعلي', 
      'سعر التكلفة', 
      'متوسط سعر التكلفة', 
      'سعر البيع', 
      'متوسط سعر البيع', 
      'إجمالي التكلفة', 
      'إجمالي القيمة البيعية',
      'هامش الربح %'
    ];
    const rows = filteredProducts.map(p => [
      p.code,
      p.name,
      p.group,
      p.unit,
      p.current_stock,
      p.cost_price,
      p.avg_cost_price,
      p.selling_price,
      p.avg_selling_price,
      p.total_cost,
      p.total_selling_value,
      `${p.margin_percent}%`
    ]);
    exportToExcel('تقرير_المنتجات_والأسعار_والتكاليف_مصنع_ملابس', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">تقارير وتحليلات مصنع الملابس</h2>
            <span className="text-xs text-gray-500 font-medium">تقرير المنتجات، أسعار التكلفة ومتوسطاتها، الأرباح، وأعمار الديون</span>
          </div>
        </div>

        {/* Report Selector Tabs & Print */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {[
              { id: 'products', label: 'تقرير المنتجات والأسعار والتكلفة' },
              { id: 'cost', label: 'تفاصيل مراحل التصنيع' },
              ...(userRole === 'owner' ? [{ id: 'profit', label: 'كشف الأرباح والمبيعات' }] : []),
              { id: 'debts', label: 'أعمار الديون والتحصيلات' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setReportType(t.id)}
                className={`px-3 py-1.5 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                  reportType === t.id
                    ? 'bg-[#1F3A5F] text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => window.print()}
            className="h-9 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-xs border border-gray-300 flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-gray-600" />
            <span>طباعة</span>
          </button>
        </div>
      </div>

      {/* DASHBOARD SUMMARY CARDS */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs font-semibold text-gray-500 block">رصيد الخزائن والبنك</span>
            <span className="text-xl font-bold text-gray-900 mt-1 block font-mono">
              {formatCurrency(dashboard.cashBalance)}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs font-semibold text-gray-500 block">ديون الموردين</span>
            <span className="text-xl font-bold text-red-600 mt-1 block font-mono">
              {formatCurrency(dashboard.supplierDebts)}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs font-semibold text-gray-500 block">مستحقات العملاء</span>
            <span className="text-xl font-bold text-green-700 mt-1 block font-mono">
              {formatCurrency(dashboard.customerReceivables)}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs font-semibold text-gray-500 block">خامات تحت حد الأمان</span>
            <span className={`text-xl font-bold mt-1 block font-mono ${dashboard.lowStockCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {dashboard.lowStockCount} خامة
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-md p-3.5">
            <span className="text-xs font-semibold text-gray-500 block">
              {userRole === 'owner' ? 'صافي أرباح الشهر' : 'دفعات التشغيل الخارجي'}
            </span>
            <span className={`text-xl font-bold mt-1 block font-mono ${userRole === 'owner' ? 'text-green-700' : 'text-gray-900'}`}>
              {userRole === 'owner' ? formatCurrency(dashboard.monthProfit) : `${dashboard.inFinishingCount} دفعات`}
            </span>
          </div>
        </div>
      )}

      {/* REPORT G: PRODUCTS REPORT (Showing Price, Total, and Cost with filters/columns) */}
      {reportType === 'products' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">تقرير المنتجات والخامات التراكمي</h3>
                <p className="text-xs text-gray-500 font-medium">
                  عرض سعر التكلفة، متوسط سعر التكلفة، سعر البيع، ومتوسط سعر البيع، مع الإجماليات وهوامش الربح
                </p>
              </div>
              <button
                onClick={handleExportProductsExcel}
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-xs flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>تصدير إلى إكسيل</span>
              </button>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث بكود أو اسم المنتج..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full h-9 pr-9 pl-3 rounded border border-gray-300 text-xs focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div>
                <select
                  value={groupFilter}
                  onChange={e => setGroupFilter(e.target.value)}
                  className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                >
                  <option value="">جميع المجموعات...</option>
                  {uniqueGroups.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                >
                  <option value="">جميع الأنواع (تام وخامات)...</option>
                  <option value="finished">منتجات تامة الصنع</option>
                  <option value="raw">خامات ومستلزمات إنتاج</option>
                </select>
              </div>
            </div>

            {/* Summary Strip */}
            <div className="flex flex-wrap items-center justify-between bg-blue-50/50 p-2.5 rounded border border-blue-200 text-xs font-bold text-blue-950">
              <div>عدد الأصناف المعروضة: <span className="font-mono">{formatNumber(filteredProducts.length)}</span> صنف</div>
              <div>إجمالي قيمة التكلفة: <span className="font-mono text-red-700">{formatCurrency(totalProductsCostVal)}</span></div>
              <div>إجمالي القيمة البيعية: <span className="font-mono text-green-700">{formatCurrency(totalProductsSalesVal)}</span></div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                    <th className="py-3 px-3 w-12 text-center">الصورة</th>
                    <th className="py-3 px-3">كود الصنف</th>
                    <th className="py-3 px-3">اسم المنتج / الخامة</th>
                    <th className="py-3 px-3">المجموعة</th>
                    <th className="py-3 px-3 text-center">الرصيد الفعلي</th>
                    <th className="py-3 px-3 text-left bg-amber-50/70 font-black text-amber-950">سعر التكلفة</th>
                    <th className="py-3 px-3 text-left bg-amber-50/40 text-amber-900">متوسط سعر التكلفة</th>
                    <th className="py-3 px-3 text-left bg-emerald-50/70 font-black text-emerald-950">سعر البيع</th>
                    <th className="py-3 px-3 text-left bg-emerald-50/40 text-emerald-900">متوسط سعر البيع</th>
                    <th className="py-3 px-3 text-left font-bold text-gray-900">إجمالي التكلفة</th>
                    <th className="py-3 px-3 text-left font-bold text-green-800">إجمالي البيع</th>
                    <th className="py-3 px-3 text-center">هامش الربح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد منتجات مطابقة لخيارات التصفية.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map(p => (
                      <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-2 px-2 text-center">
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="w-9 h-9 object-cover rounded mx-auto border border-gray-200" />
                          ) : (
                            <div className="w-9 h-9 bg-gray-100 rounded flex items-center justify-center mx-auto text-gray-300">
                              <Layers className="w-4 h-4" />
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-gray-900">{p.code}</td>
                        <td className="py-2.5 px-3 font-bold text-gray-900">{p.name}</td>
                        <td className="py-2.5 px-3 text-gray-500">{p.group}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-gray-800">
                          {formatNumber(p.current_stock)} {p.unit}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-amber-950 bg-amber-50/40">
                          {formatCurrency(p.cost_price)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono text-gray-700 bg-amber-50/20">
                          {formatCurrency(p.avg_cost_price)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-black text-emerald-950 bg-emerald-50/40">
                          {formatCurrency(p.selling_price)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono text-gray-700 bg-emerald-50/20">
                          {formatCurrency(p.avg_selling_price)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-bold text-gray-900">
                          {formatCurrency(p.total_cost)}
                        </td>
                        <td className="py-2.5 px-3 text-left font-mono font-bold text-green-700">
                          {formatCurrency(p.total_selling_value)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.margin_percent > 30 ? 'bg-green-100 text-green-800' : p.margin_percent > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {p.margin_percent}%
                          </span>
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

      {/* REPORT: COST BREAKDOWN */}
      {reportType === 'cost' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">تفاصيل تكاليف مراحل تصنيع الملابس</h3>
              <p className="text-xs text-gray-500 font-medium">
                تكلفة الخامات + القص والخياطة + التشغيل الخارجي = التكلفة النهائية
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
              <span>تصدير إكسيل</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-right border-collapse text-sm">
              <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <tr>
                  <th className="py-3 px-4">كود الصنف</th>
                  <th className="py-3 px-4">اسم المنتج</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4 text-left">تكلفة مرحلة 1 (داخلي)</th>
                  <th className="py-3 px-4 text-left">تكلفة مرحلة 2 (تشغيل خارجي)</th>
                  <th className="py-3 px-4 text-left font-bold text-[#1F3A5F]">التكلفة النهائية للقطعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {costBreakdown.map(p => (
                  <tr key={p.id} className="hover:bg-blue-50/20">
                    <td className="py-3 px-4 font-mono font-bold text-gray-900">{p.code}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">{p.name}</td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{p.category}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-800">{formatCurrency(p.avg_stage1_unit_cost)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-800">{formatCurrency(p.avg_stage2_unit_cost)}</td>
                    <td className="py-3 px-4 text-left font-bold font-mono text-[#1F3A5F]">{formatCurrency(p.avg_final_unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REPORT: DEBT AGING */}
      {reportType === 'debts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Suppliers */}
            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
              <h3 className="font-bold text-sm text-gray-900">أعمار ديون الموردين (مستحقات واجبة السداد)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3">المورد</th>
                      <th className="py-2 px-3 text-left">المبلغ</th>
                      <th className="py-2 px-3 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(debtAging.suppliers || []).map(s => (
                      <tr key={s.id}>
                        <td className="py-2 px-3 font-semibold text-gray-900">{s.name}</td>
                        <td className="py-2 px-3 text-left font-bold text-red-600 font-mono">{formatCurrency(s.balance_due || s.balance)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className="erp-badge-red text-[10px]">مستحق</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Customers */}
            <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
              <h3 className="font-bold text-sm text-gray-900">أعمار ديون العملاء (مستحقات للتحصيل)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                    <tr>
                      <th className="py-2 px-3">العميل</th>
                      <th className="py-2 px-3 text-left">الرصيد المدين</th>
                      <th className="py-2 px-3 text-center">الحد الائتماني</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(debtAging.customers || []).map(c => (
                      <tr key={c.id}>
                        <td className="py-2 px-3 font-semibold text-gray-900">{c.name}</td>
                        <td className="py-2 px-3 text-left font-bold text-blue-900 font-mono">{formatCurrency(c.balance_due || c.balance)}</td>
                        <td className="py-2 px-3 text-center font-mono text-gray-600">{formatCurrency(c.credit_limit || 0)}</td>
                      </tr>
                    ))}
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
