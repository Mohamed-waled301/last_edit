import React, { useState, useEffect } from 'react';
import { Cog, Plus, Image as ImageIcon, AlertTriangle, Layers, DollarSign, CheckCircle2 } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function ProductionOrderFormPage({ onSaved, onNotify }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [form, setForm] = useState({
    order_number: `ORD-MFG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
    product_id: '',
    batch_quantity: '',
    start_date: getTodayDateString(),
    cutting_labor_cost: '0',
    sewing_labor_cost: '0',
    ironing_packing_cost: '0',
    notes: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [itemsRes, prodsRes] = await Promise.all([
          api.getItems(),
          api.getProducts()
        ]);
        const itemsList = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        const prodsList = Array.isArray(prodsRes.data) ? prodsRes.data : [];

        // Combine items of type finished + products
        const finishedItems = itemsList.filter(i => i.item_type === 'finished');
        const allProds = finishedItems.length > 0 ? finishedItems : prodsList;
        setProducts(allProds);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleProductSelect = (productId) => {
    const prod = products.find(p => String(p.id) === String(productId));
    setSelectedProduct(prod || null);
    setForm(prev => ({
      ...prev,
      product_id: productId,
      batch_quantity: prod ? String(prod.min_issue_qty || 100) : prev.batch_quantity
    }));
  };

  const batchQty = Number(form.batch_quantity) || 0;
  const minQty = selectedProduct ? (Number(selectedProduct.min_issue_qty) || 1) : 1;
  const isBelowMin = batchQty > 0 && batchQty < minQty;

  const cuttingCost = Number(form.cutting_labor_cost) || 0;
  const sewingCost = Number(form.sewing_labor_cost) || 0;
  const packingCost = Number(form.ironing_packing_cost) || 0;
  const totalStagesLabor = cuttingCost + sewingCost + packingCost;

  const validate = () => {
    const errs = {};
    if (!form.product_id) errs.product_id = 'يرجى اختيار المنتج المراد تصنيعه';
    const qtyErr = Validators.positiveNumber(form.batch_quantity, 'كمية الدفعة');
    if (qtyErr) errs.batch_quantity = qtyErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.createProductionOrder({
        order_number: form.order_number,
        product_id: form.product_id,
        batch_quantity: batchQty,
        start_date: form.start_date,
        cutting_labor_cost: cuttingCost,
        sewing_labor_cost: sewingCost,
        ironing_packing_cost: packingCost,
        notes: form.notes
      });

      if (onNotify) onNotify('تم إصدار أمر التصنيع بنجاح وحجز الخامات');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/manufacturing';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إصدار أمر التصنيع');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.product_id && batchQty > 0);

  return (
    <PageContainer
      title="إصدار أمر تصنيع داخلي (المرحلة الأولى)"
      subtitle="تجهيز الدفعة، مراحل التشغيل (قص - خياطة - كي وتعبئة)، والتحقق من الحد الأدنى للتشغيل"
      breadcrumbs={[
        { label: 'التصنيع', href: '#/manufacturing' },
        { label: 'أمر تصنيع جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/manufacturing'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار أمر التصنيع"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>كمية الدفعة: <span className="font-mono text-gray-900">{batchQty} قطعة</span></span>
          <span className="text-gray-300">|</span>
          <span>إجمالي أجور المراحل: <span className="font-mono text-[#1F3A5F]">{formatCurrency(totalStagesLabor)}</span></span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Product Selection and Image Display (Requirement E1) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Cog className="w-5 h-5 text-[#1F3A5F]" />
            المنتج المطلوب تصنيعه وصورته
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Left: Product Selector */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  اختر المنتج التام <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.product_id}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  required
                >
                  <option value="">-- اختر المنتج من دليل الأصناف --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.code}] - الحد الأدنى: {p.min_issue_qty || 1} قطعة
                    </option>
                  ))}
                </select>
                <FieldError error={errors.product_id} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    كمية الدفعة المراد تصنيعها <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.batch_quantity}
                    onChange={(e) => setForm(prev => ({ ...prev, batch_quantity: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 ${
                      isBelowMin ? 'border-amber-500 focus:ring-amber-500 bg-amber-50/40 text-amber-900' : 'border-gray-300 focus:ring-[#1F3A5F]'
                    }`}
                    required
                  />
                  <FieldError error={errors.batch_quantity} />

                  {/* Warning when below minimum issue/mfg quantity (Requirement E1) */}
                  {isBelowMin && (
                    <div className="mt-1.5 p-2 bg-amber-50 border border-amber-300 rounded text-[11px] font-bold text-amber-800 flex items-center gap-1.5 animate-fadeIn">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        تنبيه: كمية الدفعة ({batchQty}) أقل من الحد الأدنى للتشغيل ({minQty} قطعة)!
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    تاريخ بدء أمر التشغيل
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>
            </div>

            {/* Right: Item Image Box (Requirement E1) */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold text-gray-600 mb-2">صورة الصنف المستهدف</span>
              {selectedProduct?.image ? (
                <div className="w-36 h-36 rounded-md overflow-hidden border border-gray-300 shadow-sm">
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-36 h-36 rounded-md bg-white border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
                  <ImageIcon className="w-8 h-8 mb-1" />
                  <span className="text-[11px]">لا توجد صورة محملة</span>
                </div>
              )}
              {selectedProduct && (
                <span className="text-xs font-bold text-[#1F3A5F] mt-2 block">
                  {selectedProduct.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Clothing Factory Stages Labor (أجور مراحل التشغيل) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            أجور مراحل التصنيع الداخلية (قص - خياطة - كي وتعبئة)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تكلفة مرحلة القص (ج.م)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cutting_labor_cost}
                onChange={(e) => setForm(prev => ({ ...prev, cutting_labor_cost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تكلفة مرحلة الخياطة والتجميع (ج.م)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sewing_labor_cost}
                onChange={(e) => setForm(prev => ({ ...prev, sewing_labor_cost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تكلفة مرحلة الكي والتعبئة (ج.م)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.ironing_packing_cost}
                onChange={(e) => setForm(prev => ({ ...prev, ironing_packing_cost: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
