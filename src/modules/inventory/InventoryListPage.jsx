import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  ArrowRightLeft, 
  SlidersHorizontal, 
  MapPin, 
  Search, 
  Download, 
  Package, 
  AlertTriangle,
  History,
  CheckCircle2
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatNumber, formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function InventoryListPage({ onNotify }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('balances'); // 'balances' | 'transfers' | 'adjustments'

  const loadData = async () => {
    try {
      setLoading(true);
      const [itemsRes, locsRes, adjRes, trfRes] = await Promise.all([
        api.getItems(),
        api.getStorageLocations(),
        api.getStockAdjustments(),
        api.getStockTransfers()
      ]);

      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setLocations(Array.isArray(locsRes.data) ? locsRes.data : []);
      setAdjustments(Array.isArray(adjRes.data) ? adjRes.data : []);
      setTransfers(Array.isArray(trfRes.data) ? trfRes.data : []);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = items.filter(it => 
    (it.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (it.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (it.item_group || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalActualStock = filteredItems.reduce((sum, it) => sum + (Number(it.actual_balance ?? it.current_stock) || 0), 0);
  const totalCostValue = filteredItems.reduce((sum, it) => {
    const stock = Number(it.actual_balance ?? it.current_stock) || 0;
    const cost = Number(it.cost_price) || 0;
    return sum + (stock * cost);
  }, 0);

  const handleExportBalances = () => {
    const exportData = filteredItems.map(it => ({
      'كود الصنف': it.code,
      'اسم الصنف': it.name,
      'المجموعة': it.item_group,
      'الوحدة': it.unit,
      'الرصيد الافتتاحي (ثابت)': it.opening_balance || 0,
      'حركات التوريد والصرف': (Number(it.actual_balance ?? it.current_stock) || 0) - (Number(it.opening_balance) || 0),
      'الرصيد الفعلي (المجموع)': it.actual_balance ?? it.current_stock ?? 0,
      'سعر التكلفة (ج.م)': it.cost_price || 0,
      'إجمالي قيمة المخزون (ج.م)': ((Number(it.actual_balance ?? it.current_stock) || 0) * (Number(it.cost_price) || 0)).toFixed(2)
    }));
    exportToExcel(exportData, 'تقرير_أرصدة_المخزن_الفعلية');
    if (onNotify) onNotify('تم تصدير تقرير المخزن إلى Excel ✓');
  };

  return (
    <PageContainer
      title="المخزن والأرصدة الفعلية"
      subtitle="الرصيد الفعلي = الرصيد الافتتاحي (ثابت) + الحركات. التحويلات المخزنية والتسويات الجردية بلا أثر مالي"
      breadcrumbs={[{ label: 'المخزن' }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportBalances}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/locations'; }}
            className="px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-gray-500" />
            <span>أماكن التخزين ({locations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/stock-transfers/new'; }}
            className="px-3.5 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>+ تحويل مخزني</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/stock-adjustments/new'; }}
            className="px-4 py-2 rounded-md bg-[#1F3A5F] hover:bg-[#162a45] text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ تسوية جردية (عجز/زيادة)</span>
          </button>
        </div>
      }
    >
      {/* Top Aggregated Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">إجمالي كميات الأصناف بالمخازن</span>
          <div className="text-2xl font-bold text-[#1F3A5F] mt-1 font-mono">
            {formatNumber(totalActualStock)} <span className="text-sm font-normal text-gray-500">قطعة / وحدة</span>
          </div>
          <span className="text-xs text-gray-400 mt-0.5 block">الرصيد الفعلي التراكمي الشامل</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">إجمالي قيمة تقييم المخزون بسعر التكلفة</span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {formatCurrency(totalCostValue)}
          </div>
          <span className="text-xs text-gray-400 mt-0.5 block">تقييم مالي استرشادي</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
          <span className="text-xs font-semibold text-gray-500">أصناف تحت الحد الأدنى للصرف</span>
          <div className="text-2xl font-bold text-amber-600 mt-1 font-mono">
            {items.filter(i => (Number(i.actual_balance ?? i.current_stock) || 0) <= (Number(i.min_issue_qty) || 1)).length} <span className="text-sm font-normal text-gray-500">صنف</span>
          </div>
          <span className="text-xs text-amber-700 mt-0.5 block">تنبيه إعادة طلب أو تصنيع</span>
        </div>
      </div>

      {/* Tabs Selector: Balances / Transfers / Adjustments */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 rounded-md font-bold text-xs transition-colors cursor-pointer ${
            activeTab === 'balances' ? 'bg-[#1F3A5F] text-white shadow-xs' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          أرصدة الأصناف (الرصيد الفعلي)
        </button>
        <button
          onClick={() => setActiveTab('adjustments')}
          className={`px-4 py-2 rounded-md font-bold text-xs transition-colors cursor-pointer ${
            activeTab === 'adjustments' ? 'bg-[#1F3A5F] text-white shadow-xs' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          سجل التسويات الجردية ({adjustments.length})
        </button>
        <button
          onClick={() => setActiveTab('transfers')}
          className={`px-4 py-2 rounded-md font-bold text-xs transition-colors cursor-pointer ${
            activeTab === 'transfers' ? 'bg-[#1F3A5F] text-white shadow-xs' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          سجل التحويلات بين المخازن ({transfers.length})
        </button>
      </div>

      {activeTab === 'balances' && (
        <>
          {/* Search Bar */}
          <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs">
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="البحث باسم الصنف أو الكود..."
                className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>

          {/* Stock Balances Table */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10 select-none">
                  <tr>
                    <th className="p-3">الكود</th>
                    <th className="p-3">اسم الصنف</th>
                    <th className="p-3">المجموعة والقسم</th>
                    <th className="p-3 text-center">الوحدة</th>
                    <th className="p-3 text-center font-mono bg-blue-900/40">الرصيد الافتتاحي (ثابت)</th>
                    <th className="p-3 text-center font-mono">حركات التوريد والصرف</th>
                    <th className="p-3 text-center font-mono bg-emerald-900/40">الرصيد الفعلي (المجموع)</th>
                    <th className="p-3 text-left font-mono">سعر التكلفة</th>
                    <th className="p-3 text-left font-mono">إجمالي التكلفة</th>
                    <th className="p-3 text-center">الحد الأدنى للصرف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="p-10 text-center text-gray-500 font-bold">
                        جاري تحميل بيانات الأرصدة...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="p-10 text-center text-gray-400">
                        لا توجد أصناف تطابق البحث
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((it, idx) => {
                      const opening = Number(it.opening_balance) || 0;
                      const actual = Number(it.actual_balance ?? it.current_stock ?? 0);
                      const movements = actual - opening;
                      const cost = Number(it.cost_price) || 0;
                      const isLow = actual <= (Number(it.min_issue_qty) || 1);

                      return (
                        <tr 
                          key={it.id || idx}
                          className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                        >
                          <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                            {it.code}
                          </td>

                          <td className="p-3 font-bold text-gray-900">
                            <div>{it.name}</div>
                            {Array.isArray(it.variants) && it.variants.length > 0 && (
                              <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                                {it.variants.map(v => `${v.size}/${v.color}: ${v.current_stock ?? v.opening_balance}`).join(' • ')}
                              </div>
                            )}
                          </td>

                          <td className="p-3 text-gray-600">
                            {it.item_group} - {it.item_department}
                          </td>

                          <td className="p-3 text-center text-gray-700 font-semibold">
                            {it.unit}
                          </td>

                          {/* Opening Balance (Constant) - Requirement D1 */}
                          <td className="p-3 text-center font-mono font-bold text-blue-700 bg-blue-50/30">
                            {formatNumber(opening)}
                          </td>

                          {/* Net Movements */}
                          <td className="p-3 text-center font-mono font-semibold text-gray-600">
                            {movements >= 0 ? `+${formatNumber(movements)}` : formatNumber(movements)}
                          </td>

                          {/* Actual Balance = Opening + Movements - Requirement D1 */}
                          <td className="p-3 text-center bg-emerald-50/30">
                            <span className={`inline-block font-mono font-bold px-2.5 py-0.5 rounded text-xs ${
                              isLow 
                                ? 'bg-red-100 text-red-800 border border-red-200' 
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {formatNumber(actual)}
                            </span>
                          </td>

                          {/* Cost Price */}
                          <td className="p-3 text-left font-mono font-bold text-gray-800">
                            {formatCurrency(cost)}
                          </td>

                          {/* Total Cost Value */}
                          <td className="p-3 text-left font-mono font-bold text-[#1F3A5F]">
                            {formatCurrency(actual * cost)}
                          </td>

                          {/* Minimum Alert */}
                          <td className="p-3 text-center">
                            <span className="font-mono text-gray-500 font-semibold">
                              {it.min_issue_qty || 1}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Adjustments Tab (Requirement D2) */}
      {activeTab === 'adjustments' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">رقم المحضر</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الصنف</th>
                  <th className="p-3 text-center">نوع التسوية</th>
                  <th className="p-3 text-center font-mono">الكمية المسواة</th>
                  <th className="p-3">السبب / نوع العجز (توالف / عينات)</th>
                  <th className="p-3 text-center font-semibold text-amber-200">الأثر المالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {adjustments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-10 text-center text-gray-400">
                      لا توجد محاضر تسويات جردية مسجلة بعد
                    </td>
                  </tr>
                ) : (
                  adjustments.map((a, idx) => (
                    <tr key={a.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{a.adjustment_number}</td>
                      <td className="p-3 text-gray-600 font-mono">{formatDate(a.adjustment_date)}</td>
                      <td className="p-3 font-bold text-gray-900">{a.item_name}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          a.adjustment_type === 'shortage' 
                            ? 'bg-rose-100 text-rose-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {a.adjustment_type === 'shortage' ? 'عجز' : 'زيادة'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-gray-900">
                        {a.quantity}
                      </td>
                      <td className="p-3 text-gray-700">
                        <span className="font-semibold block">{a.reason}</span>
                        {a.sub_type === 'waste' && <span className="text-[10px] text-rose-600 font-bold">هالك وتوالف</span>}
                        {a.sub_type === 'samples' && <span className="text-[10px] text-indigo-600 font-bold">عينات تشغيل وتطوير</span>}
                      </td>
                      <td className="p-3 text-center text-gray-400 font-bold">
                        بلا أثر مالي (كميات فقط)
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transfers Tab (Requirement B4) */}
      {activeTab === 'transfers' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">رقم إذن التحويل</th>
                  <th className="p-3">تاريخ التحويل</th>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">من موقع</th>
                  <th className="p-3">إلى موقع</th>
                  <th className="p-3 text-center font-mono">الكمية المحولة</th>
                  <th className="p-3">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-10 text-center text-gray-400">
                      لا توجد أذون تحويل مخزني مسجلة بعد
                    </td>
                  </tr>
                ) : (
                  transfers.map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{t.transfer_number}</td>
                      <td className="p-3 text-gray-600 font-mono">{formatDate(t.transfer_date)}</td>
                      <td className="p-3 font-bold text-gray-900">{t.item_name}</td>
                      <td className="p-3 text-gray-700 font-semibold">{t.from_location_name}</td>
                      <td className="p-3 text-gray-700 font-semibold">{t.to_location_name}</td>
                      <td className="p-3 text-center font-mono font-bold text-blue-700">{t.quantity}</td>
                      <td className="p-3 text-gray-500">{t.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
