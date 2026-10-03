import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Sparkles, 
  CheckCircle2, 
  Truck, 
  DollarSign, 
  Download,
  Paintbrush,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString, isPastDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function FinishingModule({ onBack, onNotify }) {
  const [finishingOrders, setFinishingOrders] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [newFinishing, setNewFinishing] = useState({
    production_order_id: '',
    finishing_quantity: '10',
    transfer_date: new Date().toISOString().split('T')[0],
    finishing_location: 'عنبر الدهانات والتنجيد',
    finishing_labor_fee: '1200',
    transport_cost: '200',
    finishing_materials: [{ raw_material_id: '', quantity: '' }],
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [finRes, prodRes, matRes] = await Promise.all([
        api.getFinishingOrders(),
        api.getProductionOrders(),
        api.getRawMaterials()
      ]);
      setFinishingOrders(finRes.data || []);
      setProductionOrders(prodRes.data || []);
      setRawMaterials(matRes.data || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveFinishing = async (e) => {
    e.preventDefault();
    if (newFinishing.transfer_date && isPastDate(newFinishing.transfer_date)) {
      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
      return;
    }
    try {
      const validMaterials = newFinishing.finishing_materials.filter(m => m.raw_material_id && Number(m.quantity) > 0);
      const res = await api.createFinishingOrder({
        ...newFinishing,
        finishing_materials: validMaterials
      });
      onNotify(res.message);
      setShowAddModal(false);
      setNewFinishing({
        production_order_id: '',
        finishing_quantity: '10',
        transfer_date: getTodayDateString(),
        finishing_location: 'عنبر الدهانات والتنجيد',
        finishing_labor_fee: '1200',
        transport_cost: '200',
        finishing_materials: [{ raw_material_id: '', quantity: '' }],
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleMarkReadyForSale = async (id) => {
    if (!window.confirm('هل اكتمل التشطيب وجاهز لإدخال البضاعة لمعرض البيع؟')) return;
    try {
      const res = await api.markReadyForSale(id);
      onNotify(res.message);
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
            <h2 className="text-xl font-bold text-gray-900 leading-none">التشطيب والتجهيز (مرحلة 2)</h2>
            <span className="text-xs text-gray-500 font-medium">الدهان، التنجيد، وحساب التكلفة التراكمية النهائية للقطعة</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['رقم إذن التشطيب', 'اسم الصنف', 'الكمية', 'تكلفة مرحلة 1', 'تكلفة مرحلة 2', 'التكلفة النهائية للقطعة', 'الحالة'];
              const rows = finishingOrders.map(fo => [
                fo.finishing_number, fo.product_name, fo.finishing_quantity, fo.stage1_transferred_cost, fo.total_finishing_stage_cost, fo.final_unit_cost, fo.status
              ]);
              exportToExcel('تقارير_أوامر_التشطيب', headers, rows);
            }}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ تحويل دفعة للتشطيب</span>
          </button>
        </div>
      </div>

      {/* Orders Data Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <th className="py-3 px-4">رقم الإذن</th>
                <th className="py-3 px-4">اسم المنتج</th>
                <th className="py-3 px-4 text-center">الكمية</th>
                <th className="py-3 px-4">موقع التشطيب</th>
                <th className="py-3 px-4 text-left">تكلفة مرحلة 1</th>
                <th className="py-3 px-4 text-left">مصاريف التشطيب</th>
                <th className="py-3 px-4 text-left font-bold text-[#1F3A5F]">التكلفة النهائية للقطعة</th>
                <th className="py-3 px-4 text-center">الحالة</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {finishingOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500 font-medium">
                    لا توجد أوامر تشطيب مسجلة حالياً.
                  </td>
                </tr>
              ) : (
                finishingOrders.map(ord => (
                  <tr key={ord.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-700">{ord.finishing_number}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">{ord.product_name}</td>
                    <td className="py-3 px-4 text-center font-bold text-gray-800">{ord.finishing_quantity} قطعة</td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{ord.finishing_location || '-'}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(ord.stage1_transferred_cost)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(ord.total_finishing_stage_cost)}</td>
                    <td className="py-3 px-4 text-left font-bold text-green-700">{formatCurrency(ord.final_unit_cost)}</td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'ready_for_sale' ? (
                        <span className="erp-badge-green text-xs">جاهز للبيع بالمعرض ✓</span>
                      ) : (
                        <span className="erp-badge-gray text-xs">قيد التشطيب</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'in_finishing' && (
                        <button
                          onClick={() => handleMarkReadyForSale(ord.id)}
                          className="px-3 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                        >
                          اعتماد جاهز للبيع ✓
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

      {/* MODAL 1: ADD FINISHING ORDER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-2xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تحويل دفعة للتشطيب والتجهيز (مرحلة 2)</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم دمج تكلفة الهيكل من مرحلة 1 مع مصاريف الدهان والتنجيد للوصول للتكلفة النهائية للقطعة
            </p>

            <form onSubmit={handleSaveFinishing} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">أمر التصنيع المراد تشطيبه *</label>
                <select
                  required
                  value={newFinishing.production_order_id}
                  onChange={e => {
                    const po = productionOrders.find(p => p.id === e.target.value);
                    setNewFinishing({
                      ...newFinishing,
                      production_order_id: e.target.value,
                      finishing_quantity: po ? String(po.batch_quantity) : '10'
                    });
                  }}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر أمر التصنيع...</option>
                  {productionOrders.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.product_name} ({p.order_number}) - متبقي {p.batch_quantity} قطعة - تكلفة القطعة: {formatCurrency(p.unit_stage1_cost)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">عدد القطع المحولة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newFinishing.finishing_quantity}
                    onChange={e => setNewFinishing({ ...newFinishing, finishing_quantity: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">موقع خط التشطيب والفحص النهائي</label>
                  <input
                    type="text"
                    value={newFinishing.finishing_location}
                    onChange={e => setNewFinishing({ ...newFinishing, finishing_location: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ التحويل للتشطيب</label>
                <input
                  type="date"
                  min={getTodayDateString()}
                  value={newFinishing.transfer_date}
                  onChange={e => {
                    if (isPastDate(e.target.value)) {
                      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
                      return;
                    }
                    setNewFinishing({ ...newFinishing, transfer_date: e.target.value });
                  }}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">مصنعية وأجور التشطيب (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newFinishing.finishing_labor_fee}
                    onChange={e => setNewFinishing({ ...newFinishing, finishing_labor_fee: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تكلفة النقل والعودة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newFinishing.transport_cost}
                    onChange={e => setNewFinishing({ ...newFinishing, transport_cost: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              {/* Finishing materials consumed */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-800">
                    خامات التشطيب الإضافية (دهانات، أقمشة، إكسسوارات)
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewFinishing({
                      ...newFinishing,
                      finishing_materials: [...newFinishing.finishing_materials, { raw_material_id: '', quantity: '' }]
                    })}
                    className="text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer"
                  >
                    + إضافة خامة تشطيب
                  </button>
                </div>

                {newFinishing.finishing_materials.map((fm, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-3 mb-2">
                    <select
                      value={fm.raw_material_id}
                      onChange={e => {
                        const mats = [...newFinishing.finishing_materials];
                        mats[idx].raw_material_id = e.target.value;
                        setNewFinishing({ ...newFinishing, finishing_materials: mats });
                      }}
                      className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                    >
                      <option value="">اختر خامة التشطيب...</option>
                      {rawMaterials.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder="الكمية المستخدمة"
                      value={fm.quantity}
                      onChange={e => {
                        const mats = [...newFinishing.finishing_materials];
                        mats[idx].quantity = e.target.value;
                        setNewFinishing({ ...newFinishing, finishing_materials: mats });
                      }}
                      className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات الجودة والتشطيب</label>
                <input
                  type="text"
                  placeholder="درجة لمعة الدهان، كود لون القماش، إلخ"
                  value={newFinishing.notes}
                  onChange={e => setNewFinishing({ ...newFinishing, notes: e.target.value })}
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
                  حفظ واحتساب التكلفة التراكمية ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
