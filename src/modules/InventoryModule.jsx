import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Package, 
  AlertTriangle, 
  ClipboardList, 
  History, 
  Download, 
  Search, 
  CheckCircle2, 
  X,
  ArrowRightLeft,
  Sliders,
  MapPin,
  FileSpreadsheet,
  Layers
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { FieldError, validators } from '../utils/validation';

export default function InventoryModule({ onBack, onNotify }) {
  const [activeTab, setActiveTab] = useState('balances'); // 'balances' | 'adjustments' | 'transfers' | 'locations'
  const [items, setItems] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedItemForMovements, setSelectedItemForMovements] = useState(null);
  const [movementData, setMovementData] = useState(null);

  // Forms
  const [adjustmentForm, setAdjustmentForm] = useState({
    item_id: '',
    adjustment_type: 'shortage_waste', // 'shortage_waste' | 'shortage_samples' | 'addition'
    quantity: '',
    reason: '',
    notes: ''
  });

  const [transferForm, setTransferForm] = useState({
    from_location_id: '',
    to_location_id: '',
    item_id: '',
    quantity: '',
    notes: ''
  });

  const [locationForm, setLocationForm] = useState({
    name: '',
    code: '',
    type: 'raw_materials',
    capacity: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [itemsRes, adjRes, trRes, locRes] = await Promise.all([
        api.getItems ? api.getItems() : api.getRawMaterials(),
        api.getStockAdjustments ? api.getStockAdjustments() : Promise.resolve({ data: [] }),
        api.getStockTransfers ? api.getStockTransfers() : Promise.resolve({ data: [] }),
        api.getStorageLocations ? api.getStorageLocations() : Promise.resolve({ data: [] })
      ]);
      setItems(itemsRes.data || itemsRes.materials || []);
      setAdjustments(adjRes.data || []);
      setTransfers(trRes.data || []);
      setLocations(locRes.data || []);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Handle Adjustment Save (Pure Quantity change, NO financial impact)
  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustmentForm.item_id || !validators.positiveNumber(adjustmentForm.quantity) || !validators.required(adjustmentForm.reason)) {
      return;
    }
    try {
      const res = await api.createStockAdjustment({
        ...adjustmentForm,
        quantity: parseFloat(adjustmentForm.quantity)
      });
      onNotify(res.message || 'تم تسجيل تسوية الجرد وتحديث الكميات بنجاح');
      setShowAdjustmentModal(false);
      setAdjustmentForm({
        item_id: '',
        adjustment_type: 'shortage_waste',
        quantity: '',
        reason: '',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Stock Transfer Save
  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.from_location_id || !transferForm.to_location_id || !transferForm.item_id || !validators.positiveNumber(transferForm.quantity)) {
      return;
    }
    if (transferForm.from_location_id === transferForm.to_location_id) {
      alert('لا يمكن التحويل إلى نفس موقع التخزين!');
      return;
    }
    try {
      const res = await api.transferStock({
        ...transferForm,
        quantity: parseFloat(transferForm.quantity)
      });
      onNotify(res.message || 'تم تسجيل التحويل المخزني بنجاح');
      setShowTransferModal(false);
      setTransferForm({
        from_location_id: '',
        to_location_id: '',
        item_id: '',
        quantity: '',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Location Save
  const handleSaveLocation = async (e) => {
    e.preventDefault();
    if (!validators.required(locationForm.name)) return;
    try {
      const res = await api.createStorageLocation(locationForm);
      onNotify(res.message || 'تمت إضافة موقع التخزين بنجاح');
      setShowLocationModal(false);
      setLocationForm({ name: '', code: '', type: 'raw_materials', capacity: '', notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // View item card / movements
  const handleViewMovements = async (item) => {
    try {
      setSelectedItemForMovements(item);
      const res = await api.getMaterialMovements(item.id);
      setMovementData({
        item,
        movements: res.data || res.movements || []
      });
    } catch (err) {
      alert('خطأ في جلب كارت الصنف: ' + err.message);
    }
  };

  const filteredItems = items.filter(it => 
    (it.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (it.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (it.group || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalActualStockCount = items.reduce((sum, it) => sum + (parseFloat(it.actual_balance ?? it.current_stock) || 0), 0);
  const totalStockCostVal = items.reduce((sum, it) => {
    const qty = parseFloat(it.actual_balance ?? it.current_stock) || 0;
    const cost = parseFloat(it.cost_price || it.average_cost || 0);
    return sum + (qty * cost);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">إدارة المخزون والتخزين (مصنع ملابس)</h2>
            <span className="text-xs text-gray-500 font-medium">
              الأرصدة الفعلية (أول المدة + الحركات)، تسويات الهالك والعينات، والتحويلات بين المخازن
            </span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'balances', label: 'أرصدة المخزون الفعلية' },
            { id: 'adjustments', label: 'تسويات الجرد (هالك/عينات/إضافة)' },
            { id: 'transfers', label: 'التحويل بين المخازن' },
            { id: 'locations', label: 'مواقع التخزين' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-md font-bold text-sm transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'bg-[#1F3A5F] text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: STOCK BALANCES */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">إجمالي قطع وخامات المخزون</span>
              <div className="text-2xl font-bold text-gray-900 mt-1 font-mono">
                {formatNumber(totalActualStockCount)}
              </div>
              <span className="text-xs text-gray-400 font-medium">متر / كيلو / قطعة / دزينة</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">إجمالي قيمة المخزون بسعر التكلفة</span>
              <div className="text-2xl font-bold text-blue-700 mt-1">
                {formatCurrency(totalStockCostVal)}
              </div>
              <span className="text-xs text-gray-400 font-medium">محسوبة بسعر التكلفة ومتوسط الشراء</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">أصناف تحت حد الطلب الأدنى</span>
              <div className="text-2xl font-bold text-amber-600 mt-1">
                {formatNumber(items.filter(i => (i.actual_balance ?? i.current_stock) < (i.min_issue_qty || 10)).length)} صنف
              </div>
              <span className="text-xs text-gray-400 font-medium">تحتاج لأمر شراء جديد أو أمر تشغيل</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                aria-label="بحث بكود أو اسم الخامة أو المنتج التام"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 pr-9 pl-3 rounded-md border border-gray-300 text-sm focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdjustmentModal(true)}
                className="h-10 px-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sliders className="w-4 h-4" />
                <span>+ تسوية جرد (هالك/عينات)</span>
              </button>
              <button
                onClick={() => setShowTransferModal(true)}
                className="h-10 px-3.5 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>+ تحويل بين المخازن</span>
              </button>
            </div>
          </div>

          {/* Balances Table (Opening + Movements = Actual) */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">كود الصنف</th>
                    <th className="py-3 px-4">اسم الصنف والمجموعة</th>
                    <th className="py-3 px-4">النوع والوحدة</th>
                    <th className="py-3 px-4 text-center">رصيد أول المدة</th>
                    <th className="py-3 px-4 text-center">صافي الحركات</th>
                    <th className="py-3 px-4 text-center bg-blue-50/60 font-black text-blue-950">الرصيد الفعلي الحالي</th>
                    <th className="py-3 px-4 text-left">سعر التكلفة</th>
                    <th className="py-3 px-4 text-left">إجمالي قيمة المخزون</th>
                    <th className="py-3 px-4 text-center">كارت الصنف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد أصناف مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(it => {
                      const opening = parseFloat(it.opening_balance) || 0;
                      const actual = parseFloat(it.actual_balance ?? it.current_stock) || 0;
                      const currentMovements = actual - opening;
                      const cost = parseFloat(it.cost_price || it.average_cost || 0);
                      const totalVal = actual * cost;
                      const isLow = actual < (it.min_issue_qty || 10);

                      return (
                        <tr key={it.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-gray-900">{it.code}</td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900">{it.name}</div>
                            <div className="text-xs text-gray-500">{it.group} {it.department ? `• ${it.department}` : ''}</div>
                            {/* Variants preview if present */}
                            {it.variants && it.variants.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {it.variants.map((v, idx) => (
                                  <span key={idx} className="bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.5 rounded border border-gray-200">
                                    {v.size}/{v.color}: {v.stock}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <span className={it.type === 'finished' ? 'erp-badge-green' : 'erp-badge-blue'}>
                              {it.type === 'finished' ? 'تام الصنع' : 'خامة تصنيع'}
                            </span>
                            <span className="text-gray-500 mr-1.5 font-medium">({it.unit || 'قطعة'})</span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-semibold text-gray-600">
                            {formatNumber(opening)}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-semibold text-gray-700">
                            {currentMovements >= 0 ? `+${formatNumber(currentMovements)}` : formatNumber(currentMovements)}
                          </td>
                          <td className="py-3 px-4 text-center bg-blue-50/40 font-mono font-black text-sm">
                            <span className={isLow ? 'text-amber-700 font-black' : 'text-gray-900'}>
                              {formatNumber(actual)} {it.unit || ''}
                            </span>
                            {isLow && (
                              <div className="text-[10px] text-amber-700 font-bold">منخفض!</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-left font-semibold text-gray-800">
                            {formatCurrency(cost)}
                          </td>
                          <td className="py-3 px-4 text-left font-bold text-blue-900">
                            {formatCurrency(totalVal)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleViewMovements(it)}
                              className="px-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-300 rounded text-xs font-semibold text-gray-700 cursor-pointer"
                            >
                              سجل الحركة
                            </button>
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
      )}

      {/* TAB 2: STOCK ADJUSTMENTS (Requirement C: Pure Quantity change, NO financial impact) */}
      {activeTab === 'adjustments' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-900">
            <div className="flex items-start gap-3">
              <Sliders className="w-5 h-5 text-amber-700 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">قاعدة تسويات الجرد المخزنية:</h4>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  تسويات العجز (هالك تشغيل وعينات فحص) أو الإضافة تقوم بتعديل الأرصدة الكمية فقط في المخزن، 
                  <strong> دون أي تأثير مالي أو قيود محاسبية</strong>، مع حفظ سجل تدقيق كامل بالسبب والتاريخ والملاحظات.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">سجل تسويات الجرد والعجز المخزني</h3>
            <button
              onClick={() => setShowAdjustmentModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ تسجيل تسوية جردية جديدة</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم الحركة</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">الصنف / الخامة</th>
                    <th className="py-3 px-4">نوع التسوية</th>
                    <th className="py-3 px-4 text-center">الكمية المسواة</th>
                    <th className="py-3 px-4">سبب الحركة الموثق</th>
                    <th className="py-3 px-4">الأثر المالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد تسويات جرد مسجلة حتى الآن.
                      </td>
                    </tr>
                  ) : (
                    adjustments.map(adj => {
                      const isShortage = adj.adjustment_type?.includes('shortage');
                      return (
                        <tr key={adj.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-gray-900">{adj.adjustment_number || `ADJ-${adj.id}`}</td>
                          <td className="py-3 px-4 text-gray-600 text-xs">{formatDate(adj.created_at || getTodayDateString())}</td>
                          <td className="py-3 px-4 font-bold text-gray-900">{adj.item_name}</td>
                          <td className="py-3 px-4">
                            {adj.adjustment_type === 'shortage_waste' && (
                              <span className="erp-badge-red text-xs">عجز - هالك تصنيع</span>
                            )}
                            {adj.adjustment_type === 'shortage_samples' && (
                              <span className="erp-badge-gray text-xs">عجز - عينات وفحص</span>
                            )}
                            {adj.adjustment_type === 'addition' && (
                              <span className="erp-badge-green text-xs">إضافة / فائض جرد</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-black text-sm">
                            <span className={isShortage ? 'text-red-600' : 'text-green-700'}>
                              {isShortage ? `-${adj.quantity}` : `+${adj.quantity}`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-700">
                            <span className="font-semibold text-gray-900">{adj.reason}</span>
                            {adj.notes && <span className="text-gray-400 block">{adj.notes}</span>}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-gray-500">
                            لا يوجد أثر مالي (كميات فقط)
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
      )}

      {/* TAB 3: STOCK TRANSFERS */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">سجل التحويلات بين مواقع التخزين</h3>
              <p className="text-xs text-gray-500 font-medium">نقل الأقمشة والخامات بين مخزن الخامات، عنابر القص والتشغيل، ومنافذ البيع</p>
            </div>
            <button
              onClick={() => setShowTransferModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ تحويل مخزني جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم التحويل</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">الصنف المحول</th>
                    <th className="py-3 px-4">من موقع</th>
                    <th className="py-3 px-4">إلى موقع</th>
                    <th className="py-3 px-4 text-center">الكمية</th>
                    <th className="py-3 px-4">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد حركات تحويل مسجلة.
                      </td>
                    </tr>
                  ) : (
                    transfers.map(tr => (
                      <tr key={tr.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{tr.transfer_number || `TR-${tr.id}`}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{formatDate(tr.created_at || getTodayDateString())}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{tr.item_name}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-gray-700">{tr.from_location_name}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-blue-900">{tr.to_location_name}</td>
                        <td className="py-3 px-4 text-center font-mono font-black text-sm text-gray-900">{tr.quantity}</td>
                        <td className="py-3 px-4 text-xs text-gray-500">{tr.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STORAGE LOCATIONS */}
      {activeTab === 'locations' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">مواقع التخزين والأرفف</h3>
              <p className="text-xs text-gray-500 font-medium">تعريف المخازن الرئيسية، عنابر التشغيل، ومنافذ التوزيع</p>
            </div>
            <button
              onClick={() => setShowLocationModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة موقع تخزين</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {locations.map(loc => (
              <div key={loc.id} className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#1F3A5F]" />
                    <span>{loc.name}</span>
                  </div>
                  <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold">
                    {loc.code}
                  </span>
                </div>
                <div className="text-xs text-gray-600 font-medium">
                  النوع: {loc.type === 'raw_materials' ? 'مخزن خامات' : loc.type === 'finished_goods' ? 'مخزن منتجات تامة' : 'عنبر إنتاج وتجهيز'}
                </div>
                {loc.notes && (
                  <div className="text-xs text-gray-500">{loc.notes}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: STOCK ADJUSTMENT */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">تسجيل تسوية جردية (كميات فقط)</h3>
              <button onClick={() => setShowAdjustmentModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 mb-4">
              تنبيه: التسوية تغير الكميات فقط في المخزن وليس لها أي أثر مالي أو محاسبي.
            </p>

            <form onSubmit={handleSaveAdjustment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">الصنف أو الخامة *</label>
                <select
                  required
                  value={adjustmentForm.item_id}
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, item_id: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                >
                  <option value="">اختر الصنف من المخزن...</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.code} - {it.name} (الرصيد الفعلي: {it.actual_balance ?? it.current_stock} {it.unit})
                    </option>
                  ))}
                </select>
                {!adjustmentForm.item_id && <FieldError error="يرجى اختيار الصنف" />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">نوع التسوية *</label>
                  <select
                    value={adjustmentForm.adjustment_type}
                    onChange={e => setAdjustmentForm({ ...adjustmentForm, adjustment_type: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-semibold"
                  >
                    <option value="shortage_waste">عجز - هالك تصنيع</option>
                    <option value="shortage_samples">عجز - عينات وفحص جودة</option>
                    <option value="addition">إضافة / فائض جرد</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">الكمية المسواة *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={adjustmentForm.quantity}
                    onChange={e => setAdjustmentForm({ ...adjustmentForm, quantity: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 text-sm font-bold"
                  />
                  {!validators.positiveNumber(adjustmentForm.quantity) && <FieldError error="أدخل كمية موجبة" />}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">سبب التسوية الموثق *</label>
                <input
                  type="text"
                  required
                  value={adjustmentForm.reason}
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                />
                {!validators.required(adjustmentForm.reason) && <FieldError error="سبب التسوية إجباري للتدقيق" />}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات إضافية</label>
                <input
                  type="text"
                  value={adjustmentForm.notes}
                  onChange={e => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                />
                <p className="text-xs text-gray-500 mt-1">رقم محضر الجرد أو قرار الإتلاف</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!adjustmentForm.item_id || !validators.positiveNumber(adjustmentForm.quantity) || !validators.required(adjustmentForm.reason)}
                  className="h-10 px-5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded font-bold"
                >
                  حفظ التسوية وتعديل الكمية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STOCK TRANSFER */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">تحويل مخزني بين المواقع</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">الصنف المحول *</label>
                <select
                  required
                  value={transferForm.item_id}
                  onChange={e => setTransferForm({ ...transferForm, item_id: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                >
                  <option value="">اختر الصنف المراد نقله...</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.code} - {it.name} (المتاح: {it.actual_balance ?? it.current_stock} {it.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">من موقع تخزين *</label>
                  <select
                    required
                    value={transferForm.from_location_id}
                    onChange={e => setTransferForm({ ...transferForm, from_location_id: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                  >
                    <option value="">اختر الموقع المصدر...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">إلى موقع تخزين *</label>
                  <select
                    required
                    value={transferForm.to_location_id}
                    onChange={e => setTransferForm({ ...transferForm, to_location_id: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                  >
                    <option value="">اختر الموقع الوجهة...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">الكمية المحولة *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={transferForm.quantity}
                  onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-sm font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات وسند الصرف</label>
                <input
                  type="text"
                  value={transferForm.notes}
                  onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  تأكيد النقل المخزني
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD LOCATION */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-md w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">إضافة موقع تخزين جديد</h3>
              <button onClick={() => setShowLocationModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">اسم الموقع / المخزن *</label>
                <input
                  type="text"
                  required
                  value={locationForm.name}
                  onChange={e => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">كود الموقع</label>
                  <input
                    type="text"
                    value={locationForm.code}
                    onChange={e => setLocationForm({ ...locationForm, code: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">نوع الموقع</label>
                  <select
                    value={locationForm.type}
                    onChange={e => setLocationForm({ ...locationForm, type: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                  >
                    <option value="raw_materials">خامات أولية</option>
                    <option value="finished_goods">منتجات تامة</option>
                    <option value="production_floor">عنبر تشغيل</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={locationForm.notes}
                  onChange={e => setLocationForm({ ...locationForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  حفظ الموقع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ITEM CARD (كارت الصنف) */}
      {selectedItemForMovements && movementData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-3xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  كارت الصنف: {movementData.item?.name} ({movementData.item?.code})
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  الرصيد الفعلي الحالي: {movementData.item?.actual_balance ?? movementData.item?.current_stock} {movementData.item?.unit} | سعر التكلفة: {formatCurrency(movementData.item?.cost_price || 0)}
                </p>
              </div>
              <button
                onClick={() => setSelectedItemForMovements(null)}
                className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-semibold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="my-4 border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2.5 px-3">التاريخ</th>
                    <th className="py-2.5 px-3">نوع الحركة</th>
                    <th className="py-2.5 px-3">البيان / المرجع</th>
                    <th className="py-2.5 px-3 text-center">وارد (+)</th>
                    <th className="py-2.5 px-3 text-center">صادر (-)</th>
                    <th className="py-2.5 px-3 text-center">الرصيد بعدها</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(!movementData.movements || movementData.movements.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400">لا توجد حركات مسجلة لهذا الصنف</td>
                    </tr>
                  ) : (
                    movementData.movements.map((m, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/10">
                        <td className="py-2 px-3 text-gray-600">{formatDate(m.date || m.created_at)}</td>
                        <td className="py-2 px-3 font-semibold text-gray-800">{m.movement_type || m.type}</td>
                        <td className="py-2 px-3 text-gray-600">{m.reference || m.notes || '-'}</td>
                        <td className="py-2 px-3 text-center font-bold text-green-700">{m.in_qty > 0 ? `+${m.in_qty}` : '-'}</td>
                        <td className="py-2 px-3 text-center font-bold text-red-600">{m.out_qty > 0 ? `-${m.out_qty}` : '-'}</td>
                        <td className="py-2 px-3 text-center font-bold font-mono text-gray-900">{m.balance_after ?? '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
