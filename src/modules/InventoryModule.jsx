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
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function InventoryModule({ onBack, onNotify }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStockCountModal, setShowStockCountModal] = useState(false);
  const [selectedMaterialForMovements, setSelectedMaterialForMovements] = useState(null);
  const [movementData, setMovementData] = useState(null);

  // Forms
  const [newMaterial, setNewMaterial] = useState({
    code: '',
    name: '',
    unit: 'لوح',
    current_stock: '',
    min_stock_alert: '',
    average_cost: '',
    location_in_warehouse: '',
    notes: ''
  });

  const [stockCountItems, setStockCountItems] = useState([]);
  const [stockCountNotes, setStockCountNotes] = useState('');

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const res = await api.getRawMaterials();
      setMaterials(res.data || res.materials || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
  }, []);

  // Save new material
  const handleSaveMaterial = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createRawMaterial(newMaterial);
      onNotify(res.message);
      setShowAddModal(false);
      setNewMaterial({
        code: '',
        name: '',
        unit: 'لوح',
        current_stock: '',
        min_stock_alert: '',
        average_cost: '',
        location_in_warehouse: '',
        notes: ''
      });
      loadMaterials();
    } catch (err) {
      alert(err.message);
    }
  };

  // View movement history (كارت الصنف)
  const handleViewMovements = async (id) => {
    try {
      setSelectedMaterialForMovements(id);
      const res = await api.getMaterialMovements(id);
      setMovementData(res.data);
    } catch (err) {
      alert(err.message);
    }
  };

  // Open stock count modal
  const handleOpenStockCount = () => {
    setStockCountItems(
      materials.map(m => ({
        material_id: m.id,
        name: m.name,
        unit: m.unit,
        system_quantity: m.current_stock,
        actual_quantity: m.current_stock,
        reason: ''
      }))
    );
    setStockCountNotes('');
    setShowStockCountModal(true);
  };

  // Save stock count
  const handleSaveStockCount = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        notes: stockCountNotes,
        items: stockCountItems.map(item => ({
          material_id: item.material_id,
          actual_quantity: Number(item.actual_quantity),
          reason: item.reason
        }))
      };
      const res = await api.saveStockCount(payload);
      onNotify(res.message);
      setShowStockCountModal(false);
      loadMaterials();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter materials
  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockCount = materials.filter(m => m.is_low_stock).length;
  const totalStockValue = materials.reduce((s, m) => s + (m.current_stock * m.average_cost), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">المخزن والخامات</h2>
            <span className="text-xs text-gray-500 font-medium">أرصدة الخامات، كارت الصنف، والتنبيه بالنواقص</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['كود الخامة', 'اسم الخامة', 'الوحدة', 'الرصيد الحالي', 'حد الأمان', 'متوسط التكلفة', 'القيمة الإجمالية'];
              const rows = materials.map(m => [
                m.code, m.name, m.unit, m.current_stock, m.min_stock_alert, m.average_cost, (m.current_stock * m.average_cost).toFixed(2)
              ]);
              exportToExcel('جرد_مخزن_الخامات', headers, rows);
            }}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={handleOpenStockCount}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <ClipboardList className="w-4 h-4 text-gray-600" />
            <span>جلسة جرد</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ ضيف خامة جديدة</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">إجمالي قيمة الخامات بالمخزن</span>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(totalStockValue)}
          </div>
          <span className="text-xs text-gray-400 font-medium">محسوبة بمتوسط التكلفة المرجح</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">عدد أصناف الخامات المسجلة</span>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {materials.length} خامة
          </div>
          <span className="text-xs text-gray-400 font-medium">أخشاب، دهانات، إكسسوارات</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">خامات قاربت على النفاد</span>
          <div className={`text-2xl font-bold mt-1 ${lowStockCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {lowStockCount > 0 ? `${lowStockCount} خامات تحت حد الأمان!` : 'المخزن آمن ومكتمل'}
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {lowStockCount > 0 ? 'تتطلب إصدار أمر شراء قبل توقف الإنتاج' : 'كل الأرصدة فوق حد الأمان'}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white border border-gray-200 rounded-md p-3">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder="ابحث عن خامة باسمها أو كودها (زان، دهان، مفصلات)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
          />
        </div>
      </div>

      {/* Materials Data Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <th className="py-3 px-4">كود الخامة</th>
                <th className="py-3 px-4">اسم الخامة</th>
                <th className="py-3 px-4">الوحدة</th>
                <th className="py-3 px-4 text-center">الرصيد الحالي بالمخزن</th>
                <th className="py-3 px-4 text-center">حد الأمان</th>
                <th className="py-3 px-4 text-left">متوسط التكلفة</th>
                <th className="py-3 px-4">مكان التخزين</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMaterials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    لا توجد خامات مطابقة للبحث.
                  </td>
                </tr>
              ) : (
                filteredMaterials.map(mat => (
                  <tr key={mat.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-700">{mat.code}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{mat.name}</span>
                        {mat.is_low_stock && (
                          <span className="erp-badge-red text-[11px]">
                            قرب يخلص!
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{mat.unit}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${mat.is_low_stock ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatNumber(mat.current_stock)}
                      </span>
                      <span className="text-xs text-gray-400 mr-1">{mat.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600 font-medium">
                      {formatNumber(mat.min_stock_alert)} {mat.unit}
                    </td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-800">
                      {formatCurrency(mat.average_cost)}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{mat.location_in_warehouse || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleViewMovements(mat.id)}
                        className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 rounded border border-gray-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        title="عرض كارت حركة الصنف"
                      >
                        <History className="w-3.5 h-3.5 text-gray-500" />
                        <span>كارت الصنف</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD RAW MATERIAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة خامة جديدة</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaterial} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الخامة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: لوح خشب زان مجفف 2 بوصة"
                  value={newMaterial.name}
                  onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">وحدة القياس *</label>
                  <select
                    value={newMaterial.unit}
                    onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="لوح">لوح</option>
                    <option value="متر">متر</option>
                    <option value="كجم">كجم</option>
                    <option value="لتر">لتر</option>
                    <option value="قطعة">قطعة</option>
                    <option value="طقم">طقم</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">كود الخامة</label>
                  <input
                    type="text"
                    placeholder="تلقائي إن تُرِك فارغاً"
                    value={newMaterial.code}
                    onChange={e => setNewMaterial({ ...newMaterial, code: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={newMaterial.current_stock}
                    onChange={e => setNewMaterial({ ...newMaterial, current_stock: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-2 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">سعر الوحدة (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={newMaterial.average_cost}
                    onChange={e => setNewMaterial({ ...newMaterial, average_cost: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-2 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">حد الأمان (تنبيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="10"
                    value={newMaterial.min_stock_alert}
                    onChange={e => setNewMaterial({ ...newMaterial, min_stock_alert: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-2 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">مكان التخزين بالورشة</label>
                <input
                  type="text"
                  placeholder="مثال: عنبر الأخشاب - رف رقم 2"
                  value={newMaterial.location_in_warehouse}
                  onChange={e => setNewMaterial({ ...newMaterial, location_in_warehouse: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ الخامة ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ITEM MOVEMENT LEDGER (كارت الصنف) */}
      {selectedMaterialForMovements && movementData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-4xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  كارت الصنف: {movementData.material.name}
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  كود: {movementData.material.code} | الرصيد الحالي: {formatNumber(movementData.material.current_stock)} {movementData.material.unit} | متوسط التكلفة: {formatCurrency(movementData.material.average_cost)}
                </p>
              </div>
              <button
                onClick={() => setSelectedMaterialForMovements(null)}
                className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-semibold text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="mt-4 border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2 px-3">التاريخ</th>
                    <th className="py-2 px-3">نوع الحركة</th>
                    <th className="py-2 px-3 text-center">الكمية (+ وارد / - صادر)</th>
                    <th className="py-2 px-3 text-left">التكلفة</th>
                    <th className="py-2 px-3 text-center">الرصيد بعد الحركة</th>
                    <th className="py-2 px-3">البيان</th>
                    <th className="py-2 px-3">المسؤول</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movementData.movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-500 font-medium">لا توجد حركات مسجلة حتى الآن</td>
                    </tr>
                  ) : (
                    movementData.movements.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-600">{formatDate(m.created_at)}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            m.movement_type === 'purchase_in' ? 'erp-badge-green' :
                            m.movement_type === 'stock_count_adj' ? 'erp-badge-gray' : 'erp-badge-red'
                          }`}>
                            {m.movement_type === 'purchase_in' ? 'وارد استلام' :
                             m.movement_type === 'production_out' ? 'صادر تصنيع' :
                             m.movement_type === 'finishing_out' ? 'صادر تشطيب' :
                             m.movement_type === 'stock_count_adj' ? 'تسوية جرد' : 'مرتجع مورد'}
                          </span>
                        </td>
                        <td className={`py-2 px-3 text-center font-bold ${m.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                        </td>
                        <td className="py-2 px-3 text-left font-medium text-gray-700">{formatCurrency(m.unit_cost)}</td>
                        <td className="py-2 px-3 text-center font-bold text-gray-900">{m.new_balance}</td>
                        <td className="py-2 px-3 text-gray-600">{m.notes}</td>
                        <td className="py-2 px-3 text-gray-500 text-[11px]">{m.user_name || 'النظام'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: STOCK COUNT */}
      {showStockCountModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-4xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">جلسة جرد المخزن الدوري</h3>
              <button onClick={() => setShowStockCountModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              أدخل الرصيد الفعلي الموجود على أرض الورشة؛ النظام سيسجل الفروق تلقائياً
            </p>

            <form onSubmit={handleSaveStockCount} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات لجنة الجرد</label>
                <input
                  type="text"
                  placeholder="مثال: جرد نهاية الربع السنوي"
                  value={stockCountNotes}
                  onChange={e => setStockCountNotes(e.target.value)}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="border border-gray-200 rounded-md overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">اسم الخامة</th>
                      <th className="py-2.5 px-3 text-center">الرصيد الدفتري</th>
                      <th className="py-2.5 px-3 text-center">الرصيد الفعلي (العد)</th>
                      <th className="py-2.5 px-3 text-center">الفرق</th>
                      <th className="py-2.5 px-3">سبب الفرق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockCountItems.map((item, idx) => {
                      const diff = Number((Number(item.actual_quantity) - item.system_quantity).toFixed(3));
                      return (
                        <tr key={item.material_id} className="hover:bg-gray-50">
                          <td className="py-2 px-3 font-semibold text-gray-900">{item.name}</td>
                          <td className="py-2 px-3 text-center text-gray-600">{item.system_quantity} {item.unit}</td>
                          <td className="py-2 px-3 text-center">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              required
                              value={item.actual_quantity}
                              onChange={e => {
                                const updated = [...stockCountItems];
                                updated[idx].actual_quantity = e.target.value;
                                setStockCountItems(updated);
                              }}
                              className="w-24 h-8 px-2 rounded border border-gray-300 text-center font-bold text-sm"
                            />
                          </td>
                          <td className={`py-2 px-3 text-center font-bold ${
                            diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff} {item.unit}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="تلف / عجز / غير مطابق"
                              value={item.reason}
                              onChange={e => {
                                const updated = [...stockCountItems];
                                updated[idx].reason = e.target.value;
                                setStockCountItems(updated);
                              }}
                              className="w-full h-8 px-2 rounded border border-gray-300 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowStockCountModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  اعتماد الجرد وترحيل الفروق ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
