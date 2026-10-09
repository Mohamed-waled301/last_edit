import React, { useState, useEffect } from 'react';
import { Factory, Plus, Truck, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function OutsourcedOrderFormPage({ onSaved, onNotify }) {
  const [productionOrders, setProductionOrders] = useState([]);
  const [serviceSuppliers, setServiceSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  const [form, setForm] = useState({
    finishing_number: '',
    production_order_id: '',
    supplier_id: '',
    external_factory_name: '',
    finishing_quantity: '100',
    service_fee: '25', // مصنعية القطعة لدى المصنع الخارجي
    transport_cost: '300',
    transfer_date: getTodayDateString(),
    notes: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [poRes, supsRes] = await Promise.all([
          api.getProductionOrders(),
          api.getSuppliers()
        ]);

        const pos = Array.isArray(poRes.data) ? poRes.data : [];
        const sups = Array.isArray(supsRes.data) ? supsRes.data : [];

        setProductionOrders(pos);
        setServiceSuppliers(sups);

        if (pos.length > 0) {
          const firstPO = pos[0];
          setSelectedPO(firstPO);
          setForm(prev => ({
            ...prev,
            production_order_id: firstPO.id,
            finishing_quantity: String(firstPO.batch_quantity || 100),
            finishing_number: `ORD-OUT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
          }));
        }

        const defaultServiceSup = sups.find(s => s.supplier_type === 'service') || sups[0];
        if (defaultServiceSup) {
          setForm(prev => ({
            ...prev,
            supplier_id: defaultServiceSup.id,
            external_factory_name: defaultServiceSup.name
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handlePOSelect = (poId) => {
    const po = productionOrders.find(p => String(p.id) === String(poId));
    setSelectedPO(po || null);
    if (po) {
      setForm(prev => ({
        ...prev,
        production_order_id: poId,
        finishing_quantity: String(po.batch_quantity || 100)
      }));
    }
  };

  const handleSupplierSelect = (supId) => {
    const sup = serviceSuppliers.find(s => String(s.id) === String(supId));
    setForm(prev => ({
      ...prev,
      supplier_id: supId,
      external_factory_name: sup ? sup.name : prev.external_factory_name
    }));
  };

  // Cost Accumulation Formula:
  // Internal Stage Cost + Outsourced Stage Cost = Final Cost (NO WASTE PERCENTAGE)
  const qty = Number(form.finishing_quantity) || 1;
  const stage1UnitCost = selectedPO ? (Number(selectedPO.unit_stage1_cost) || (Number(selectedPO.total_stage1_cost || 0) / (Number(selectedPO.batch_quantity) || 1))) : 180;
  const internalStageCost = Number((qty * stage1UnitCost).toFixed(2));

  const serviceFeePerUnit = Number(form.service_fee) || 0;
  const totalServiceFee = Number((qty * serviceFeePerUnit).toFixed(2));
  const transportCost = Number(form.transport_cost) || 0;
  const outsourcedStageCost = Number((totalServiceFee + transportCost).toFixed(2));

  const finalTotalCost = Number((internalStageCost + outsourcedStageCost).toFixed(2));
  const finalUnitCost = Number((finalTotalCost / qty).toFixed(2));

  const validate = () => {
    const errs = {};
    if (!form.production_order_id) errs.production_order_id = 'يرجى اختيار أمر الإنتاج الأصلي';
    if (!form.external_factory_name.trim() && !form.supplier_id) {
      errs.external_factory_name = 'اسم مصنع التشغيل الخارجي مطلوب';
    }
    const qtyErr = Validators.positiveNumber(form.finishing_quantity, 'كمية التشغيل الخارجي');
    if (qtyErr) errs.finishing_quantity = qtyErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.createFinishingOrder({
        finishing_number: form.finishing_number,
        production_order_id: form.production_order_id,
        product_id: selectedPO ? selectedPO.product_id : null,
        supplier_id: form.supplier_id || null,
        external_factory_name: form.external_factory_name.trim(),
        finishing_quantity: qty,
        finishing_labor_fee: totalServiceFee,
        service_fee: totalServiceFee,
        transport_cost: transportCost,
        transfer_date: form.transfer_date,
        notes: form.notes
      });

      if (onNotify) onNotify('تم إصدار أمر التشغيل لدى الغير بنجاح');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/outsourced';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إصدار أمر التشغيل لدى الغير');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.production_order_id && (form.external_factory_name || form.supplier_id) && qty > 0);

  return (
    <PageContainer
      title="إصدار أمر تصنيع وتشغيل لدى الغير"
      subtitle="تكاليف تراكمية: تكلفة المرحلة الداخلية + تكلفة التشغيل الخارجي = التكلفة النهائية (بدون نسب هالك)"
      breadcrumbs={[
        { label: 'التصنيع لدى الغير', href: '#/outsourced' },
        { label: 'أمر تشغيل خارجي جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/outsourced'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار أمر التشغيل لدى الغير"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>تكلفة المرحلة الداخلية: <span className="font-mono">{formatCurrency(internalStageCost)}</span></span>
          <span className="text-gray-300">+</span>
          <span>تكلفة التشغيل الخارجي: <span className="font-mono text-indigo-700">{formatCurrency(outsourcedStageCost)}</span></span>
          <span className="text-gray-300">=</span>
          <span className="text-emerald-700">التكلفة النهائية التراكمية: <span className="font-mono text-base font-bold">{formatCurrency(finalTotalCost)}</span> ({formatCurrency(finalUnitCost)} / قطعة)</span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Order and Factory Selection (Requirement E2) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Factory className="w-5 h-5 text-indigo-600" />
            بيانات أمر التشغيل والمصنع الخارجي (مورد خدمة)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Base Production Order */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                أمر الإنتاج الداخلي الأصلي (المرحلة 1) <span className="text-red-500">*</span>
              </label>
              <select
                value={form.production_order_id}
                onChange={(e) => handlePOSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر أمر الإنتاج المحول للتشغيل الخارجي --</option>
                {productionOrders.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.order_number} - {p.product_name} ({p.batch_quantity} قطعة) - تكلفة م1: {formatCurrency(p.total_stage1_cost || 0)}
                  </option>
                ))}
              </select>
              <FieldError error={errors.production_order_id} />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الكمية المحولة للتشغيل الخارجي <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.finishing_quantity}
                onChange={(e) => setForm(prev => ({ ...prev, finishing_quantity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.finishing_quantity} />
            </div>

            {/* External Factory Name (Requirement E2) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  المصنع الخارجي (مورد خدمة) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/suppliers/new'; }}
                  className="text-[11px] font-bold text-indigo-700 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ إضافة مصنع</span>
                </button>
              </div>
              <select
                value={form.supplier_id}
                onChange={(e) => handleSupplierSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="">-- اختر من قائمة المصانع المعتمدة --</option>
                {serviceSuppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.supplier_type === 'service' ? '(مصنع خدمة متخصص)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Factory Name Field */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                اسم المصنع الخارجي كتابةً <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.external_factory_name}
                onChange={(e) => setForm(prev => ({ ...prev, external_factory_name: e.target.value }))}
                placeholder="مثال: مصنع الفاخر للتطريز الآلي أو مغسلة الشروق"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.external_factory_name} />
            </div>

            {/* Transfer Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ الإرسال للمصنع الخارجي
              </label>
              <input
                type="date"
                value={form.transfer_date}
                onChange={(e) => setForm(prev => ({ ...prev, transfer_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Cumulative Costing (Requirement E2) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              احتساب التكلفة التراكمية للمنتج
            </h2>
            <span className="text-xs text-gray-500 font-bold">
              تكلفة داخلية + تكلفة خارجية = التكلفة النهائية (بدون نسب هالك)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Internal Transferred Cost */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تكلفة المرحلة الداخلية المنقولة
              </label>
              <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-mono font-bold text-gray-800">
                {formatCurrency(internalStageCost)}
              </div>
              <span className="text-[11px] text-gray-400 mt-0.5 block font-mono">
                {qty} قطعة × {stage1UnitCost.toFixed(2)} ج.م
              </span>
            </div>

            {/* Service Fee per Unit */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                أجر خدمة المصنع الخارجي للقطعة
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.service_fee}
                onChange={(e) => setForm(prev => ({ ...prev, service_fee: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold text-indigo-700 focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                تطريز / طباعة / غسيل للقطعة
              </span>
            </div>

            {/* Transport Cost */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تكاليف النقل والشحن ذهاب وعودة
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.transport_cost}
                onChange={(e) => setForm(prev => ({ ...prev, transport_cost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Final Cumulative Unit Cost */}
            <div>
              <label className="block text-xs font-bold text-emerald-900 mb-1">
                التكلفة النهائية التراكمية للقطعة
              </label>
              <div className="px-3 py-2 border border-emerald-300 bg-emerald-50 rounded-md text-sm font-mono font-bold text-emerald-800">
                {formatCurrency(finalUnitCost)}
              </div>
              <span className="text-[11px] text-emerald-700 mt-0.5 block font-bold">
                إجمالي الدفعة: {formatCurrency(finalTotalCost)}
              </span>
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
