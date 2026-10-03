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
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

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
    batch_quantity: '10',
    start_date: new Date().toISOString().split('T')[0],
    location_type: 'inside', // 'inside' | 'outsourced'
    external_supplier_id: '',
    external_pricing_type: 'per_piece',
    external_service_rate: '',
    external_transport_cost: '',
    labor_type: 'hourly', // 'hourly' | 'piece_rate'
    labor_hours: '30',
    labor_hourly_rate: '50',
    labor_piece_rate: '',
    machine_hours: '15',
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
    notes: 'مصاريف تشغيل الشهر'
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
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveOrder = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createProductionOrder(newOrder);
      onNotify(res.message);
      setShowAddOrderModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCompleteOrder = async (id) => {
    if (!window.confirm('هل أنت متأكد من إنهاء مرحلة التصنيع وتحويل الدفعة إلى جاهز للتشطيب؟')) return;
    try {
      const res = await api.completeStage1(id);
      onNotify(res.message);
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
            <h2 className="text-xl font-bold text-gray-900 leading-none">أوامر التصنيع والتشغيل (مرحلة 1)</h2>
            <span className="text-xs text-gray-500 font-medium">تشغيل الهياكل، أجور العمالة، ونظام توزيع مصاريف التشغيل</span>
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
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
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
                <th className="py-3 px-4">اسم المنتج</th>
                <th className="py-3 px-4 text-center">الكمية</th>
                <th className="py-3 px-4">تاريخ البدء</th>
                <th className="py-3 px-4">مكان التشغيل</th>
                <th className="py-3 px-4 text-left">تكلفة الخامات</th>
                <th className="py-3 px-4 text-left">العمالة</th>
                <th className="py-3 px-4 text-left">نصيب المصاريف</th>
                <th className="py-3 px-4 text-left font-bold">تكلفة القطعة (م1)</th>
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
                        {ord.location_type === 'inside' ? 'تشغيل داخلي' : 'مصنع خارجي'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-800">{formatCurrency(ord.total_material_cost)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(ord.total_labor_cost)}</td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-600">{formatCurrency(ord.allocated_overhead_cost)}</td>
                    <td className="py-3 px-4 text-left font-bold text-[#1F3A5F]">{formatCurrency(ord.unit_stage1_cost)}</td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'stage1_completed' ? (
                        <span className="erp-badge-green text-xs">جاهز للتشطيب ✓</span>
                      ) : (
                        <span className="erp-badge-gray text-xs">قيد التشغيل</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'in_production' && (
                        <button
                          onClick={() => handleCompleteOrder(ord.id)}
                          className="px-3 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                        >
                          إنهاء التصنيع ✓
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

      {/* MODAL 1: ADD PRODUCTION ORDER */}
      {showAddOrderModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-2xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">بدء أمر تشغيل جديد (مرحلة 1)</h3>
              <button onClick={() => setShowAddOrderModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              سيتم خصم الخامات من المخزن تلقائياً بناءً على شجرة الصنف ونسبة الهالك
            </p>

            <form onSubmit={handleSaveOrder} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">المنتج المراد تصنيعه *</label>
                  <select
                    required
                    value={newOrder.product_id}
                    onChange={e => setNewOrder({ ...newOrder, product_id: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="">اختر المنتج...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">عدد قطع الدفعة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newOrder.batch_quantity}
                    onChange={e => setNewOrder({ ...newOrder, batch_quantity: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              {/* Location Type */}
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <label className="block text-sm font-bold text-gray-800 mb-2">مكان التصنيع</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-sm text-gray-800">
                    <input
                      type="radio"
                      name="location_type"
                      value="inside"
                      checked={newOrder.location_type === 'inside'}
                      onChange={() => setNewOrder({ ...newOrder, location_type: 'inside' })}
                      className="w-4 h-4"
                    />
                    <span>داخل الورشة (عمالة + ماكينات ومصاريف)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-sm text-gray-800">
                    <input
                      type="radio"
                      name="location_type"
                      value="outsourced"
                      checked={newOrder.location_type === 'outsourced'}
                      onChange={() => setNewOrder({ ...newOrder, location_type: 'outsourced' })}
                      className="w-4 h-4"
                    />
                    <span>مصنع خارجي (مقاول تشغيل)</span>
                  </label>
                </div>
              </div>

              {/* If Inside: Labor & Machine Hours */}
              {newOrder.location_type === 'inside' ? (
                <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <h4 className="font-bold text-sm text-gray-800">حساب العمالة الداخلية وتشغيل الماكينات</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">نظام حساب العمال</label>
                      <select
                        value={newOrder.labor_type}
                        onChange={e => setNewOrder({ ...newOrder, labor_type: e.target.value })}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      >
                        <option value="hourly">بالساعة</option>
                        <option value="piece_rate">بالقطعة</option>
                      </select>
                    </div>

                    {newOrder.labor_type === 'hourly' ? (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">ساعات عمل العمال</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={newOrder.labor_hours}
                            onChange={e => setNewOrder({ ...newOrder, labor_hours: e.target.value })}
                            className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">أجر الساعة (جنيه)</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={newOrder.labor_hourly_rate}
                            onChange={e => setNewOrder({ ...newOrder, labor_hourly_rate: e.target.value })}
                            className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">مصنعية القطعة (جنيه)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={newOrder.labor_piece_rate}
                          onChange={e => setNewOrder({ ...newOrder, labor_piece_rate: e.target.value })}
                          className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">ساعات تشغيل الماكينات للدفعة</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="لحساب نصيبها من الكهرباء والإيجار والإهلاك"
                      value={newOrder.machine_hours}
                      onChange={e => setNewOrder({ ...newOrder, machine_hours: e.target.value })}
                      className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                    />
                  </div>
                </div>
              ) : (
                /* If Outsourced */
                <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <h4 className="font-bold text-sm text-gray-800">بيانات المصنع أو الورشة الخارجية</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">اختر المصنع الخارجي</label>
                      <select
                        value={newOrder.external_supplier_id}
                        onChange={e => setNewOrder({ ...newOrder, external_supplier_id: e.target.value })}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      >
                        <option value="">اختر المورد الخارجي...</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">طريقة الحساب</label>
                      <select
                        value={newOrder.external_pricing_type}
                        onChange={e => setNewOrder({ ...newOrder, external_pricing_type: e.target.value })}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      >
                        <option value="per_piece">سعر القطعة</option>
                        <option value="per_batch">مقطوعية على الدفعة</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">قيمة المصنعية (جنيه)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="المبلغ"
                        value={newOrder.external_service_rate}
                        onChange={e => setNewOrder({ ...newOrder, external_service_rate: e.target.value })}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">تكلفة النقل والعودة</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="نقل الشحنة"
                        value={newOrder.external_transport_cost}
                        onChange={e => setNewOrder({ ...newOrder, external_transport_cost: e.target.value })}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات التشغيل</label>
                <input
                  type="text"
                  placeholder="تعليمات أو مقاسات خاصة"
                  value={newOrder.notes}
                  onChange={e => setNewOrder({ ...newOrder, notes: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddOrderModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  بدء التصنيع وخصم الخامات ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OVERHEADS SETTINGS */}
      {showOverheadsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تسجيل مصاريف الورشة الشهرية العامة</h3>
              <button onClick={() => setShowOverheadsModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم تقسيم المصاريف على ساعات تشغيل الماكينات وتوزيعها تلقائياً على كل دفعة
            </p>

            <form onSubmit={handleSaveOverhead} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">الشهر والسنة (YYYY-MM)</label>
                <input
                  type="text"
                  required
                  value={overheadForm.month_year}
                  onChange={e => setOverheadForm({ ...overheadForm, month_year: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">فاتورة الكهرباء (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={overheadForm.electricity_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, electricity_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">فاتورة المياه (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={overheadForm.water_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, water_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">إيجار الورشة (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={overheadForm.rent_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, rent_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">إهلاك الماكينات والمعدات</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={overheadForm.depreciation_cost}
                    onChange={e => setOverheadForm({ ...overheadForm, depreciation_cost: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">مصاريف وصيانة أخرى</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={overheadForm.other_expenses}
                    onChange={e => setOverheadForm({ ...overheadForm, other_expenses: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">ساعات تشغيل الماكينات المقدرة</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={overheadForm.estimated_machine_hours}
                    onChange={e => setOverheadForm({ ...overheadForm, estimated_machine_hours: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowOverheadsModal(false)}
                  className="h-10 px-5 rounded-md font-medium text-xs border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-xs cursor-pointer"
                >
                  حفظ واحتساب معدل الساعة ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
