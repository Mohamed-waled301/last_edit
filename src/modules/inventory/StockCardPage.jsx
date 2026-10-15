import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Search, 
  Calendar, 
  ArrowDownRight, 
  ArrowUpRight, 
  Layers, 
  Printer, 
  Download, 
  Filter,
  Package,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function StockCardPage({ initialItemId = null, onNavigate, onNotify }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(initialItemId || '');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [loading, setLoading] = useState(true);
  const [cardData, setCardData] = useState(null);
  const [recomputing, setRecomputing] = useState(false);

  // Sync initialItemId and hash query param
  useEffect(() => {
    if (initialItemId && String(initialItemId) !== String(selectedItemId)) {
      setSelectedItemId(initialItemId);
      return;
    }
    const hash = window.location.hash || '';
    const match = hash.match(/[?&]itemId=([^&]+)/);
    if (match && match[1] && String(match[1]) !== String(selectedItemId)) {
      setSelectedItemId(match[1]);
    }
  }, [initialItemId]);

  const loadDependencies = async () => {
    try {
      setLoading(true);
      const [itemsRes, locsRes] = await Promise.all([
        api.getItems(),
        api.getStorageLocations()
      ]);
      const itemList = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.items || []);
      const locList = Array.isArray(locsRes.data) ? locsRes.data : (locsRes.locations || []);
      setItems(itemList);
      setLocations(locList);

      if (!selectedItemId && itemList.length > 0) {
        setSelectedItemId(itemList[0].id);
      }
    } catch (err) {
      console.error('Failed to load stock card dependencies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDependencies();
  }, []);

  const loadStockCard = async () => {
    if (!selectedItemId) return;
    try {
      setLoading(true);
      const filters = {
        variantId: selectedVariantId || undefined,
        locationId: selectedLocationId || undefined,
        movementType: movementTypeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        dateFrom: startDate || undefined,
        dateTo: endDate || undefined
      };
      const res = await api.getItemStockCard(selectedItemId, filters);
      setCardData(res.data || res);
    } catch (err) {
      console.error('Failed to load item stock card:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedItemId) {
      loadStockCard();
    }
  }, [selectedItemId, selectedVariantId, selectedLocationId, movementTypeFilter, startDate, endDate]);

  const handleRecompute = async () => {
    try {
      setRecomputing(true);
      const res = await api.recomputeStockBalances();
      if (onNotify) onNotify(res.message || 'تم إعادة احتساب أرصدة المخزون بنجاح');
      await loadStockCard();
    } catch (err) {
      console.error('Recompute error:', err);
      alert(err.message || 'تعذر إعادة احتساب الأرصدة');
    } finally {
      setRecomputing(false);
    }
  };

  const selectedItem = items.find((i) => String(i.id) === String(selectedItemId));

  const handleExport = () => {
    if (!cardData || !cardData.entries) return;
    const exportRows = cardData.entries.map((entry) => ({
      'التاريخ': entry.date,
      'رقم المستند': entry.document_id || '-',
      'نوع الحركة': getMovementLabel(entry.movement_type),
      'الاتجاه': entry.direction === 'in' ? 'وارد' : 'صادر',
      'الكمية الواردة': entry.direction === 'in' ? entry.quantity : 0,
      'الكمية الصادرة': entry.direction === 'out' ? entry.quantity : 0,
      'الرصيد بعد الحركة': entry.running_balance,
      'سعر التكلفة': entry.unit_cost || 0,
      'البيان والملاحظات': entry.notes || '-'
    }));
    exportToExcel(exportRows, `كارت_حركة_صنف_${selectedItem?.code || selectedItemId}`);
    if (onNotify) onNotify('تم تصدير كارت الصنف إلى إكسيل');
  };

  const handlePrint = () => {
    window.print();
  };

  const getMovementLabel = (type) => {
    switch (type) {
      case 'opening_balance': return 'رصيد أول المدة';
      case 'purchase_receipt': return 'وارد استلام مشتريات';
      case 'sales_invoice': return 'صادر بيع بفاتورة';
      case 'production_issue': return 'صرف خامات للتشغيل';
      case 'production_receipt': return 'استلام منتج تام مصنع';
      case 'outsourced_issue': return 'صرف لمصنع خارجي';
      case 'outsourced_receipt': return 'استلام من مصنع خارجي';
      case 'purchase_return': return 'مرتجع مشتريات لمورد';
      case 'sales_return': return 'مرتجع مبيعات من عميل';
      case 'stock_adjustment_in': return 'تسوية جردية (زيادة)';
      case 'stock_adjustment_out': return 'تسوية جردية (عجز)';
      case 'stock_transfer_in': return 'وارد تحويل مخزني';
      case 'stock_transfer_out': return 'صادر تحويل مخزني';
      case 'reversal': return 'حركة عكسية لإلغاء مستند';
      default: return type || 'حركة مخزنية';
    }
  };

  return (
    <PageContainer
      title="حركة الصنف وكارت الصنف (Stock Card)"
      subtitle="سجل الأستاذ المخزني التفصيلي مع الرصيد التراكمي الحي، صافي تغير الفترة، والتدقيق الرقابي"
      breadcrumbs={[
        { label: 'المخزن', href: '#/inventory' },
        { label: 'كارت الصنف' }
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecompute}
            disabled={recomputing}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            title="إعادة مطابقة واحتساب كل الأرصدة التراكمية من الحركات مباشرة"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recomputing ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
            <span>{recomputing ? 'جاري التدقيق...' : 'إعادة احتساب الأرصدة'}</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={!cardData}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!cardData}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>طباعة كارت الصنف</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Filters and Item Picker */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Item Picker (shows code + name, searchable) */}
            <div className="sm:col-span-2">
              <label htmlFor="card-item-select" className="block text-xs font-semibold text-slate-700 mb-1">
                اختر الصنف المطلوب (كود واسم الصنف) *
              </label>
              <select
                id="card-item-select"
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              >
                {items.map((itm) => (
                  <option key={itm.id} value={itm.id}>
                    [{itm.code}] {itm.name} ({itm.unit})
                  </option>
                ))}
              </select>
            </div>

            {/* Storage Location Filter */}
            <div>
              <label htmlFor="card-loc-select" className="block text-xs font-semibold text-slate-700 mb-1">
                موقع التخزين / المستودع
              </label>
              <select
                id="card-loc-select"
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              >
                <option value="">كل مواقع التخزين</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Movement Type Filter */}
            <div>
              <label htmlFor="card-type-select" className="block text-xs font-semibold text-slate-700 mb-1">
                نوع الحركة المخزنية
              </label>
              <select
                id="card-type-select"
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              >
                <option value="">كل أنواع الحركات</option>
                <option value="purchase_receipt">وارد مشتريات</option>
                <option value="sales_invoice">صادر مبيعات</option>
                <option value="production_issue">صرف خامات للتشغيل</option>
                <option value="production_receipt">استلام منتج تام مصنع</option>
                <option value="outsourced_issue">صرف لتشغيل خارجي</option>
                <option value="outsourced_receipt">استلام من تشغيل خارجي</option>
                <option value="purchase_return">مرتجع مشتريات</option>
                <option value="sales_return">مرتجع مبيعات</option>
                <option value="stock_adjustment_in">تسوية بالزيادة</option>
                <option value="stock_adjustment_out">تسوية بالعجز</option>
                <option value="reversal">حركات عكسية</option>
              </select>
            </div>

            {/* Date Range Filters */}
            <div>
              <label htmlFor="card-start-date" className="block text-xs font-semibold text-slate-700 mb-1">
                من تاريخ
              </label>
              <input
                id="card-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            <div>
              <label htmlFor="card-end-date" className="block text-xs font-semibold text-slate-700 mb-1">
                إلى تاريخ
              </label>
              <input
                id="card-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Metric Cards: Opening, In, Out, Net Change with sign/color, Closing */}
        {cardData && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 block mb-1">رصيد أول المدة:</span>
              <span className="text-xl font-bold font-mono text-slate-800">
                {formatNumber(cardData.opening_balance ?? cardData.periodOpeningBalance ?? 0)}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">{selectedItem?.unit || 'قطعة'}</span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 mb-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                <span>إجمالي الوارد (In):</span>
              </span>
              <span className="text-xl font-bold font-mono text-emerald-800">
                +{formatNumber(cardData.total_in ?? cardData.totalIn ?? 0)}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-0.5">زيادة بالمخزن</span>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-rose-700 font-semibold flex items-center gap-1 mb-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                <span>إجمالي المنصرف (Out):</span>
              </span>
              <span className="text-xl font-bold font-mono text-rose-800">
                -{formatNumber(cardData.total_out ?? cardData.totalOut ?? 0)}
              </span>
              <span className="text-[11px] text-rose-600 block mt-0.5">صرف واستخدام</span>
            </div>

            <div className={`border rounded-xl p-4 shadow-xs ${
              (cardData.net_change ?? cardData.netChange ?? 0) >= 0 
                ? 'bg-emerald-50 border-emerald-300' 
                : 'bg-rose-50 border-rose-300'
            }`}>
              <span className="text-xs font-semibold flex items-center gap-1 mb-1 text-slate-700">
                {(cardData.net_change ?? cardData.netChange ?? 0) >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                )}
                <span>صافي التغير للفترة:</span>
              </span>
              <span className={`text-xl font-bold font-mono ${
                (cardData.net_change ?? cardData.netChange ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {(cardData.net_change ?? cardData.netChange ?? 0) >= 0 ? `+${formatNumber(cardData.net_change ?? cardData.netChange ?? 0)}` : formatNumber(cardData.net_change ?? cardData.netChange ?? 0)}
              </span>
              <span className="text-[11px] block mt-0.5 text-slate-500 font-semibold">
                {(cardData.net_change ?? cardData.netChange ?? 0) >= 0 ? 'زيادة صافية' : 'نقص صافي'}
              </span>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-blue-700 font-semibold block mb-1">الرصيد الفعلي الختامي:</span>
              <span className="text-xl font-bold font-mono text-blue-900">
                {formatNumber(cardData.closing_balance ?? cardData.closingBalance ?? 0)}
              </span>
              <span className="text-[11px] text-blue-600 block mt-0.5 font-semibold">رصيد المخزن الحالي</span>
            </div>
          </div>
        )}

        {/* Ledger Movements Table with Running Balance */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>جدول حركة الصنف والرصيد التراكمي (Running Balance)</span>
            </h3>
            {cardData && (
              <span className="text-xs text-slate-500">
                {cardData.entries ? cardData.entries.length : 0} حركة مسجلة
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-800 text-white font-semibold">
                <tr>
                  <th className="p-3 w-10">#</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">نوع الحركة</th>
                  <th className="p-3">رقم المستند / الإذن</th>
                  <th className="p-3 text-center">الاتجاه</th>
                  <th className="p-3 text-center font-mono text-emerald-300">وارد (+)</th>
                  <th className="p-3 text-center font-mono text-rose-300">منصرف (-)</th>
                  <th className="p-3 text-center font-mono text-blue-200">الرصيد التراكمي</th>
                  <th className="p-3 text-left font-mono">سعر التكلفة</th>
                  <th className="p-3">البيان والملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-10 text-center text-slate-500 font-semibold">
                      جاري استخراج كارت حركة الصنف...
                    </td>
                  </tr>
                ) : !cardData || !cardData.entries || cardData.entries.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-12 text-center text-slate-500">
                      <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold">لا توجد حركات مخزنية مسجلة لهذا الصنف في الفترة المحددة</p>
                    </td>
                  </tr>
                ) : (
                  cardData.entries.map((entry, idx) => {
                    const isIn = entry.direction === 'in';
                    return (
                      <tr key={entry.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-semibold text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-mono font-medium text-slate-700">{formatDate(entry.date)}</td>
                        <td className="p-3 font-bold text-slate-800">{getMovementLabel(entry.movement_type)}</td>
                        <td className="p-3 font-mono text-slate-600">{entry.document_id || entry.reference_id || '-'}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isIn 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {isIn ? 'وارد' : 'صادر'}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700">
                          {isIn ? formatNumber(entry.quantity) : '-'}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-rose-700">
                          {!isIn ? formatNumber(entry.quantity) : '-'}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-blue-900 bg-blue-50/40">
                          {formatNumber(entry.running_balance)}
                        </td>
                        <td className="p-3 text-left font-mono text-slate-700">
                          {entry.unit_cost ? formatCurrency(entry.unit_cost) : '-'}
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate">
                          {entry.notes || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
