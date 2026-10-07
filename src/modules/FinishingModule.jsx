import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Factory, 
  CheckCircle2, 
  Truck, 
  DollarSign, 
  Download, 
  Building2, 
  X,
  ExternalLink,
  Calculator
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { FieldError, validators } from '../utils/validation';
import { calculateOutsourcedAccumulation } from '../logic/costCalculator';

export default function FinishingModule({ onBack, onNotify }) {
  const [outsourcedOrders, setOutsourcedOrders] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [serviceSuppliers, setServiceSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [newOrder, setNewOrder] = useState({
    production_order_id: '',
    supplier_id: '', // Service supplier (المصنع الخارجي)
    factory_name: '',
    finishing_quantity: '50',
    transfer_date: getTodayDateString(),
    service_type: 'تطريز وطباعة وتشطيب خارجي', // e.g. تطريز، صباغة، غسيل، طباعة
    service_fee_per_piece: '12',
    transport_cost: '250',
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [finRes, prodRes, supRes, matRes] = await Promise.all([
        api.getFinishingOrders(),
        api.getProductionOrders(),
        api.getSuppliers(),
        api.getRawMaterials()
      ]);
      setOutsourcedOrders(finRes.data || []);
      // Filter production orders that finished stage 1 or are available
      setProductionOrders(prodRes.data || []);
      // Suppliers of type 'service' or all suppliers
      const allSups = supRes.data || [];
      const services = allSups.filter(s => s.type === 'service' || s.is_service_provider || true);
      setServiceSuppliers(services);
      setRawMaterials(matRes.data || []);
    } catch (err) {
      console.error('Failed to load outsourced manufacturing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Selected production order to accumulate costs
  const selectedPO = productionOrders.find(p => String(p.id) === String(newOrder.production_order_id));
  const stage1Cost = selectedPO?.unit_stage1_cost || 45;
  const outsourcedUnitFee = parseFloat(newOrder.service_fee_per_piece) || 0;
  const transportPerUnit = (parseFloat(newOrder.transport_cost) || 0) / (parseFloat(newOrder.finishing_quantity) || 1);
  const outsourcedStageUnitCost = outsourcedUnitFee + transportPerUnit;

  // Cumulative formula: internal stage + outsourced stage = final cost
  const finalCalculatedUnitCost = calculateOutsourcedAccumulation(stage1Cost, outsourcedStageUnitCost);

  const handleSaveOutsourced = async (e) => {
    e.preventDefault();
    if (!newOrder.production_order_id || !newOrder.supplier_id || !validators.positiveNumber(newOrder.finishing_quantity)) {
      return;
    }

    try {
      const selectedSup = serviceSuppliers.find(s => String(s.id) === String(newOrder.supplier_id));
      const payload = {
        ...newOrder,
        factory_name: selectedSup ? selectedSup.name : newOrder.factory_name,
        finishing_location: selectedSup ? `مصنع خارجي: ${selectedSup.name}` : 'مصنع خارجي',
        finishing_labor_fee: (parseFloat(newOrder.service_fee_per_piece) || 0) * parseFloat(newOrder.finishing_quantity),
        stage1_transferred_cost: stage1Cost,
        total_finishing_stage_cost: outsourcedStageUnitCost,
        final_unit_cost: finalCalculatedUnitCost
      };

      const res = await api.createFinishingOrder(payload);
      onNotify(res.message || 'تم إرسال أمر التشغيل الخارجي وحساب التكلفة التراكمية بنجاح ✓');
      setShowAddModal(false);
      setNewOrder({
        production_order_id: '',
        supplier_id: '',
        factory_name: '',
        finishing_quantity: '50',
        transfer_date: getTodayDateString(),
        service_type: 'تطريز وطباعة وتشطيب خارجي',
        service_fee_per_piece: '12',
        transport_cost: '250',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMarkReadyForSale = async (id) => {
    if (!window.confirm('هل استلمت البضاعة من المصنع الخارجي وجاهزة لدخول معرض البيع ومخزن المنتج التام؟')) return;
    try {
      const res = await api.markReadyForSale(id);
      onNotify(res.message || 'تم توريد المنتج التام للمخزن وجاهز للبيع ✓');
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
            <h2 className="text-xl font-bold text-gray-900 leading-none">التصنيع لدى الغير (تشغيل خارجي)</h2>
            <span className="text-xs text-gray-500 font-medium">
              مصانع ومطابع التطريز والغسيل الخارجية (موردو خدمات) وتراكم التكاليف: الداخلي + الخارجي = التكلفة النهائية
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['رقم الإذن', 'الموديل', 'المصنع الخارجي', 'الكمية', 'تكلفة المرحلة الداخلية', 'تكلفة التشغيل الخارجي', 'التكلفة النهائية للقطعة', 'الحالة'];
              const rows = outsourcedOrders.map(fo => [
                fo.finishing_number, fo.product_name, fo.factory_name || fo.finishing_location, fo.finishing_quantity, fo.stage1_transferred_cost, fo.total_finishing_stage_cost, fo.final_unit_cost, fo.status
              ]);
              exportToExcel('تقارير_التشغيل_الخارجي_لدى_الغير', headers, rows);
            }}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ إرسال تشغيل لمصنع خارجي</span>
          </button>
        </div>
      </div>

      {/* Info Banner on Cost Accumulation */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3.5 flex items-center justify-between text-xs text-blue-900">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-700" />
          <span className="font-bold">معادلة تراكم تكلفة الملابس:</span>
          <span>تكلفة المرحلة الداخلية (أقمشة + قص وخياطة) + تكلفة تشغيل المصنع الخارجي (تطريز/طباعة + نقل) = <strong>التكلفة الإجمالية النهائية للمنتج التام</strong></span>
        </div>
      </div>

      {/* Orders Data Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <th className="py-3 px-4">رقم الإذن</th>
                <th className="py-3 px-4">اسم الموديل / المنتج</th>
                <th className="py-3 px-4">المصنع الخارجي (مورد الخدمة)</th>
                <th className="py-3 px-4 text-center">الكمية</th>
                <th className="py-3 px-4 text-left">تكلفة المرحلة الداخلية</th>
                <th className="py-3 px-4 text-left">تكلفة التشغيل الخارجي</th>
                <th className="py-3 px-4 text-left font-black text-blue-950 bg-blue-50/50">التكلفة النهائية للقطعة</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {outsourcedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500 font-medium">
                    لا توجد أوامر تشغيل خارجي مسجلة حالياً.
                  </td>
                </tr>
              ) : (
                outsourcedOrders.map(fo => (
                  <tr key={fo.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-900">{fo.finishing_number}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">{fo.product_name}</td>
                    <td className="py-3 px-4 text-xs font-semibold text-gray-700">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-gray-500" />
                        <span>{fo.factory_name || fo.finishing_location}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-gray-800">{fo.finishing_quantity} قطعة</td>
                    <td className="py-3 px-4 text-left text-xs font-semibold text-gray-600">{formatCurrency(fo.stage1_transferred_cost || 0)}</td>
                    <td className="py-3 px-4 text-left text-xs font-semibold text-gray-700">{formatCurrency(fo.total_finishing_stage_cost || 0)}</td>
                    <td className="py-3 px-4 text-left font-mono font-black text-sm text-[#1F3A5F] bg-blue-50/30">
                      {formatCurrency(fo.final_unit_cost || 0)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {fo.status === 'ready_for_sale' ? (
                        <span className="erp-badge-green text-xs">تم الاستلام وجاهز للبيع ✓</span>
                      ) : (
                        <span className="erp-badge-amber text-xs">لدى المصنع الخارجي</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {fo.status !== 'ready_for_sale' && (
                        <button
                          onClick={() => handleMarkReadyForSale(fo.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold cursor-pointer shadow-sm"
                        >
                          استلام للمخزن التام ✓
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

      {/* MODAL: ADD OUTSOURCED ORDER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-xl w-full border border-gray-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إرسال دفعة للتصنيع لدى الغير (تشغيل خارجي)</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              اختر أمر التشغيل الداخلي والمصنع الخارجي لحساب التكلفة التراكمية تلقائياً.
            </p>

            <form onSubmit={handleSaveOutsourced} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">أمر التشغيل الداخلي المراد تحويله *</label>
                <select
                  required
                  value={newOrder.production_order_id}
                  onChange={e => {
                    const sel = productionOrders.find(p => String(p.id) === String(e.target.value));
                    setNewOrder({
                      ...newOrder,
                      production_order_id: e.target.value,
                      finishing_quantity: sel ? String(sel.batch_quantity) : '50'
                    });
                  }}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الدفعة من أوامر التشغيل...</option>
                  {productionOrders.map(po => (
                    <option key={po.id} value={po.id}>
                      {po.order_number} - {po.product_name} ({po.batch_quantity} قطعة) - تكلفة م1: {formatCurrency(po.unit_stage1_cost || 0)}
                    </option>
                  ))}
                </select>
                {!newOrder.production_order_id && <FieldError error="يرجى اختيار أمر التشغيل" />}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">المصنع الخارجي (مورد خدمة التشغيل) *</label>
                <select
                  required
                  value={newOrder.supplier_id}
                  onChange={e => setNewOrder({ ...newOrder, supplier_id: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المصنع أو الورشة الخارجية...</option>
                  {serviceSuppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone || 'بدون هاتف'}) {s.address ? `- ${s.address}` : ''}
                    </option>
                  ))}
                </select>
                {!newOrder.supplier_id && <FieldError error="يرجى اختيار المصنع الخارجي" />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">نوع خدمة التشغيل الخارجي</label>
                  <select
                    value={newOrder.service_type}
                    onChange={e => setNewOrder({ ...newOrder, service_type: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                  >
                    <option value="تطريز وطباعة">تطريز وطباعة شعارات</option>
                    <option value="غسيل ومعالجة جينز">غسيل ومعالجة جينز (Stone Wash)</option>
                    <option value="صباغة خاصة">صباغة خاصة للأقمشة</option>
                    <option value="تشطيب وتجهيز كامل">تشطيب وتركيب إكسسوارات كامل</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">عدد القطع المحولة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newOrder.finishing_quantity}
                    onChange={e => setNewOrder({ ...newOrder, finishing_quantity: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">أجر المصنع الخارجي للقطعة (جنيه) *</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={newOrder.service_fee_per_piece}
                    onChange={e => setNewOrder({ ...newOrder, service_fee_per_piece: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold text-blue-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">مصاريف نقل ونولون الشحنة (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newOrder.transport_cost}
                    onChange={e => setNewOrder({ ...newOrder, transport_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
              </div>

              {/* Cumulative Cost Summary Card */}
              <div className="bg-gray-100 p-3 rounded-md border border-gray-300 space-y-2">
                <span className="font-bold text-gray-800 block">حساب التكلفة التراكمية للقطعة:</span>
                <div className="flex justify-between items-center text-gray-600">
                  <span>تكلفة المرحلة الداخلية (م1):</span>
                  <span className="font-mono font-bold">{formatCurrency(stage1Cost)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span>تكلفة مرحلة التشغيل الخارجي (خدمة + نقل):</span>
                  <span className="font-mono font-bold">{formatCurrency(outsourcedStageUnitCost)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-300 font-bold text-gray-900 text-sm">
                  <span>التكلفة النهائية التراكمية للقطعة:</span>
                  <span className="text-base text-[#1F3A5F] font-mono font-black">{formatCurrency(finalCalculatedUnitCost)}</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">ملاحظات ومواصفات التشغيل</label>
                <input
                  type="text"
                  placeholder="تعليمات الجودة وألوان خيوط التطريز"
                  value={newOrder.notes}
                  onChange={e => setNewOrder({ ...newOrder, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!newOrder.production_order_id || !newOrder.supplier_id || !validators.positiveNumber(newOrder.finishing_quantity)}
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold shadow-sm"
                >
                  إرسال للتشغيل الخارجي وحفظ التكلفة ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
