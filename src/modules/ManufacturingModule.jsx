import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Cog, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Users, 
  Building, 
  Download, 
  Sliders, 
  Check, 
  X,
  AlertTriangle,
  Scissors
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { FieldError, validators } from '../utils/validation';
import { calculateClothingInternalStagesCost } from '../logic/costCalculator';

export default function ManufacturingModule({ onBack, onNotify }) {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [overheads, setOverheads] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [showOverheadsModal, setShowOverheadsModal] = useState(false);

  // Form State
  const [newOrder, setNewOrder] = useState({
    product_id: '',
    batch_quantity: '50',
    start_date: getTodayDateString(),
    location_type: 'inside', // 'inside' | 'outsourced'
    external_supplier_id: '',
    // Clothing stages costs (cutting -> sewing -> ironing/packing)
    cutting_cost_per_piece: '5',
    sewing_cost_per_piece: '15',
    ironing_packing_cost_per_piece: '5',
    fabric_waste_percent: '5',
    notes: ''
  });

  const [overheadForm, setOverheadForm] = useState({
    month_year: new Date().toISOString().slice(0, 7),
    electricity_cost: '4500',
    water_cost: '600',
    rent_cost: '12000',
    depreciation_cost: '3500',
    other_expenses: '1400',
    estimated_machine_hours: '440',
    notes: 'مصاريف تشغيل شهرية لمصنع الملابس'
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [ordRes, prdRes, supRes, ovhRes] = await Promise.all([
        api.getProductionOrders(),
        api.getProducts(),
        api.getSuppliers(),
        api.getOverheads()
      ]);
      setOrders(ordRes.data || []);
      setProducts(prdRes.data || []);
      setSuppliers(supRes.data || []);
      setOverheads(ovhRes.data || []);
    } catch (err) {
      console.error('Failed to load manufacturing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Selected product metadata
  const selectedProduct = products.find(p => String(p.id) === String(newOrder.product_id));
  const minRequiredQty = selectedProduct?.min_issue_qty || selectedProduct?.minimum_manufacturing_qty || 20;
  const isBelowMinQty = selectedProduct && (parseFloat(newOrder.batch_quantity) || 0) < minRequiredQty;

  // Calculate live labor cost from stages
  const internalStagesCost = calculateClothingInternalStagesCost(
    parseFloat(newOrder.cutting_cost_per_piece) || 0,
    parseFloat(newOrder.sewing_cost_per_piece) || 0,
    parseFloat(newOrder.ironing_packing_cost_per_piece) || 0
  );
  const totalStagesLaborCost = internalStagesCost * (parseFloat(newOrder.batch_quantity) || 0);

  const handleSaveOrder = async (e) => {
    e.preventDefault();
    if (!newOrder.product_id || !validators.positiveNumber(newOrder.batch_quantity)) {
      return;
    }

    try {
      const payload = {
        ...newOrder,
        batch_quantity: parseFloat(newOrder.batch_quantity),
        labor_type: 'piece_rate',
        labor_piece_rate: internalStagesCost,
        total_labor_cost: totalStagesLaborCost,
        fabric_waste_percent: parseFloat(newOrder.fabric_waste_percent) || 5
      };
      const res = await api.createProductionOrder(payload);
      onNotify(res.message || 'تم بدء أمر تشغيل الملابس بنجاح ✓');
      setShowAddOrderModal(false);
      setNewOrder({
        product_id: '',
        batch_quantity: '50',
        start_date: getTodayDateString(),
        location_type: 'inside',
        external_supplier_id: '',
        cutting_cost_per_piece: '5',
        sewing_cost_per_piece: '15',
        ironing_packing_cost_per_piece: '5',
        fabric_waste_percent: '5',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCompleteOrder = async (id) => {
    if (!window.confirm('هل أنت متأكد من إنهاء مرحلة التشغيل الداخلي وتحويل الدفعة للمرحلة التالية (التشغيل الخارجي/التشطيب)؟')) return;
    try {
      const res = await api.completeStage1(id);
      onNotify(res.message || 'تم إتمام المرحلة بنجاح ✓');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveOverhead = async (e) => {
    e.preventDefault();
    try {
      const res = await api.saveOverhead(overheadForm);
      onNotify(res.message);
      setShowOverheadsModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">أوامر الإنتاج والتصنيع (مصنع ملابس)</h2>
            <span className="text-xs text-gray-500 font-medium">مراحل الإنتاج (قص ← خياطة ← كوي وتعبئة)، هالك القماش، والتحقق من الحد الأدنى للتشغيل</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOverheadsModal(true)}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Sliders className="w-4 h-4 text-gray-600" />
            <span>مصاريف التشغيل الشهرية</span>
          </button>
          <button
            onClick={() => setShowAddOrderModal(true)}
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ بدء أمر تشغيل جديد</span>
          </button>
        </div>
      </div>

      {/* Orders Data Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <th className="py-3 px-4">رقم الأمر</th>
                <th className="py-3 px-4">اسم المنتج (الملابس)</th>
                <th className="py-3 px-4 text-center">الكمية</th>
                <th className="py-3 px-4">تاريخ البدء</th>
                <th className="py-3 px-4">مكان التشغيل</th>
                <th className="py-3 px-4 text-left">تكلفة الأقمشة والخامات</th>
                <th className="py-3 px-4 text-left">أجور مراحل التشغيل</th>
                <th className="py-3 px-4 text-left">نصيب المصاريف</th>
                <th className="py-3 px-4 text-left font-bold text-[#1F3A5F]">تكلفة القطعة (م1)</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-gray-500 font-medium">
                    لا توجد أوامر تشغيل مسجلة حالياً.
                  </td>
                </tr>
              ) : (
                orders.map(ord => (
                  <tr key={ord.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-700">{ord.order_number}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">{ord.product_name}</td>
                    <td className="py-3 px-4 text-center font-bold text-gray-800">{ord.batch_quantity} قطعة</td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(ord.start_date)}</td>
                    <td className="py-3 px-4 text-gray-600">
                      <span className="erp-badge-gray text-xs">
                        {ord.location_type === 'inside' ? 'عنبر المصنع' : 'تشغيل خارجي'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-800">{formatCurrency(ord.total_material_cost)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(ord.total_labor_cost)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-600">{formatCurrency(ord.allocated_overhead_cost)}</td>
                    <td className="py-3 px-4 text-left font-bold text-[#1F3A5F]">{formatCurrency(ord.unit_stage1_cost)}</td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'stage1_completed' ? (
                        <span className="erp-badge-green text-xs">جاهز للمرحلة التالية ✓</span>
                      ) : (
                        <span className="erp-badge-gray text-xs">قيد التشغيل</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'in_production' && (
                        <button
                          onClick={() => handleCompleteOrder(ord.id)}
                          className="px-3 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer shadow-sm"
                        >
                          إنهاء المرحلة ✓
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD PRODUCTION ORDER */}
      {showAddOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-2xl w-full border border-gray-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إنشاء أمر تشغيل ملابس جديد</h3>
              <button onClick={() => setShowAddOrderModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              خصم الأقمشة والإكسسوارات من المخزن آلياً مع احتساب نسبة هالك القص ومراحل التشغيل.
            </p>

            <form onSubmit={handleSaveOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الموديل / المنتج المراد تصنيعه *</label>
                  <select
                    required
                    value={newOrder.product_id}
                    onChange={e => setNewOrder({ ...newOrder, product_id: e.target.value })}
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="">اختر الموديل...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (حد أدنى: {p.min_issue_qty || 20} ق)
                      </option>
                    ))}
                  </select>
                  {!newOrder.product_id && <FieldError error="يرجى اختيار الموديل المطلوب" />}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">عدد قطع الدفعة المطلوبة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newOrder.batch_quantity}
                    onChange={e => setNewOrder({ ...newOrder, batch_quantity: e.target.value })}
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-bold focus:border-[#1F3A5F] focus:outline-none"
                  />
                  {!validators.positiveNumber(newOrder.batch_quantity) && <FieldError error="أدخل كمية صحيحة أكبر من الصفر" />}
                </div>
              </div>

              {/* Requirement D: Minimum Issue / Manufacturing Quantity Warning */}
              {isBelowMinQty && (
                <div className="bg-amber-50 border border-amber-300 p-3 rounded-md flex items-start gap-2.5 text-amber-900 animate-pulse">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-xs block">تحذير: كمية أمر التشغيل أقل من الحد الأدنى للتشغيل!</span>
                    <span className="text-[11px] text-amber-800">
                      الكمية المدخلة ({newOrder.batch_quantity} قطعة) أقل من الحد الأدنى المعتمد لإنتاج هذا الصنف ({minRequiredQty} قطعة). قد ترتفع تكلفة الهالك وإعداد خط الإنتاج.
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ بدء أمر التشغيل *</label>
                  <input
                    type="date"
                    required
                    value={newOrder.start_date}
                    onChange={e => setNewOrder({ ...newOrder, start_date: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">نسبة هالك القماش في القص (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="any"
                    value={newOrder.fabric_waste_percent}
                    onChange={e => setNewOrder({ ...newOrder, fabric_waste_percent: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Clothing Stages: Cutting -> Sewing -> Ironing/Packing */}
              <div className="p-3 bg-blue-50/40 rounded-md border border-blue-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-[#1F3A5F]" />
                  <span className="text-xs font-bold text-gray-900">مراحل تصنيع الملابس وأجور التشغيل لكل قطعة:</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">1. مرحلة القص (ج/قطعة)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newOrder.cutting_cost_per_piece}
                      onChange={e => setNewOrder({ ...newOrder, cutting_cost_per_piece: e.target.value })}
                      className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">2. مرحلة الخياطة والتجميع</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newOrder.sewing_cost_per_piece}
                      onChange={e => setNewOrder({ ...newOrder, sewing_cost_per_piece: e.target.value })}
                      className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">3. الكوي والتعبئة والتغليف</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={newOrder.ironing_packing_cost_per_piece}
                      onChange={e => setNewOrder({ ...newOrder, ironing_packing_cost_per_piece: e.target.value })}
                      className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center bg-white p-2.5 rounded border border-blue-200 text-xs font-bold text-blue-950">
                  <span>إجمالي أجور المراحل الثلاث للقطعة:</span>
                  <span className="font-mono text-sm">{formatCurrency(internalStagesCost)} / قطعة</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات خط الإنتاج</label>
                <input
                  type="text"
                  placeholder="مثال: باترون رقم 102 - تسليم مستعجل لموسم العيد"
                  value={newOrder.notes}
                  onChange={e => setNewOrder({ ...newOrder, notes: e.target.value })}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddOrderModal(false)}
                  className="h-11 px-5 rounded-md font-medium text-xs border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!newOrder.product_id || !validators.positiveNumber(newOrder.batch_quantity)}
                  className="h-11 px-6 bg-[#1F3A5F] hover:bg-[#172c48] disabled:opacity-50 text-white rounded-md font-bold text-sm cursor-pointer shadow-sm"
                >
                  اعتماد وبدء أمر التشغيل ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MONTHLY OVERHEADS */}
      {showOverheadsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">مصاريف تشغيل المصنع الشهرية</h3>
              <button onClick={() => setShowOverheadsModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOverhead} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">إيجار المصنع (جنيه)</label>
                  <input
                    type="number"
                    value={overheadForm.rent_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, rent_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">فاتورة الكهرباء والإنارة</label>
                  <input
                    type="number"
                    value={overheadForm.electricity_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, electricity_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">إهلاك ماكينات الخياطة</label>
                  <input
                    type="number"
                    value={overheadForm.depreciation_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, depreciation_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ساعات تشغيل الماكينات المقدرة</label>
                  <input
                    type="number"
                    value={overheadForm.estimated_machine_hours}
                    onChange={e => setOverheadForm({ ...overheadForm, estimated_machine_hours: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowOverheadsModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  حفظ المصاريف ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
