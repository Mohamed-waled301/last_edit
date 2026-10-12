import React, { useState, useEffect } from 'react';
import { SlidersHorizontal, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function StockAdjustmentFormPage({ onSaved, onNotify }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedItemVariants, setSelectedItemVariants] = useState([]);

  const [form, setForm] = useState({
    item_id: '',
    variant_id: '',
    location_id: '',
    adjustment_type: 'shortage', // 'shortage' (عجز) | 'addition' (زيادة)
    sub_type: 'waste', // 'waste' (توالف) | 'samples' (عينات) | 'surplus' (زيادة)
    quantity: '',
    reason: '',
    notes: '',
    adjustment_date: getTodayDateString()
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const [itemsRes, locsRes] = await Promise.all([
          api.getItems(),
          api.getStorageLocations()
        ]);
        const itms = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        const locs = Array.isArray(locsRes.data) ? locsRes.data : [];
        setItems(itms);
        setLocations(locs);
        if (locs.length > 0) {
          setForm(prev => ({ ...prev, location_id: locs[0].id }));
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, []);

  const handleItemChange = (itemId) => {
    const itm = items.find(i => String(i.id) === String(itemId));
    const vars = (itm && Array.isArray(itm.variants)) ? itm.variants : [];
    setSelectedItemVariants(vars);
    setForm(prev => ({
      ...prev,
      item_id: itemId,
      variant_id: vars.length > 0 ? vars[0].id : ''
    }));
  };

  const validate = () => {
    const errs = {};
    if (!form.item_id) errs.item_id = 'يرجى تحديد الصنف';
    const qtyErr = Validators.positiveNumber(form.quantity, 'كمية التسوية');
    if (qtyErr) errs.quantity = qtyErr;
    if (!form.reason.trim()) errs.reason = 'يرجى توضيح سبب محضر التسوية الجردية';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.createStockAdjustment({
        item_id: form.item_id,
        variant_id: form.variant_id || null,
        location_id: form.location_id || null,
        adjustment_type: form.adjustment_type,
        sub_type: form.adjustment_type === 'shortage' ? form.sub_type : 'surplus',
        quantity: Number(form.quantity) || 0,
        reason: form.reason.trim(),
        notes: form.notes,
        adjustment_date: form.adjustment_date
      });

      if (onNotify) onNotify('تم حفظ محضر التسوية الجردية وتحديث الرصيد بنجاح (بلا أثر مالي)');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/inventory';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ التسوية الجردية');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.item_id && Number(form.quantity) > 0 && form.reason.trim());

  return (
    <PageContainer
      title="تسجيل محضر تسوية جردية"
      subtitle="تسوية عجز (توالف / عينات) أو زيادة جردية - تغير الكميات فقط وبلا أي أثر مالي أو محاسبي"
      breadcrumbs={[
        { label: 'المخزن', href: '#/inventory' },
        { label: 'تسوية جردية جديدة' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/inventory'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="اعتماد وتطبيق التسوية الجردية"
      extraBottomContent={
        <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>التسوية تغير رصيد الكميات فقط، وليس لها أي قيود أو أثر مالي/محاسبي</span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-[#1F3A5F]" />
            نوع التسوية والصنف
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Adjustment Type: Shortage / Addition */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                نوع التسوية <span className="text-red-500">*</span>
              </label>
              <select
                value={form.adjustment_type}
                onChange={(e) => setForm(prev => ({ 
                  ...prev, 
                  adjustment_type: e.target.value,
                  sub_type: e.target.value === 'shortage' ? 'waste' : 'surplus'
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-bold bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="shortage">عجز جردي (خصم من الرصيد)</option>
                <option value="addition">زيادة جردية (إضافة للرصيد)</option>
              </select>
            </div>

            {/* Sub-Type (For Shortage: Waste / Samples) - Requirement D2 */}
            {form.adjustment_type === 'shortage' ? (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  تصنيف العجز <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.sub_type}
                  onChange={(e) => setForm(prev => ({ ...prev, sub_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-bold bg-white text-rose-700 focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                >
                  <option value="waste">توالف وهالك تشغيل</option>
                  <option value="samples">عينات عرض ونماذج</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  تصنيف الزيادة
                </label>
                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-xs font-bold text-emerald-700">
                  فائض جرد مخزني
                </div>
              </div>
            )}

            {/* Adjustment Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ التسوية
              </label>
              <input
                type="date"
                value={form.adjustment_date}
                onChange={(e) => setForm(prev => ({ ...prev, adjustment_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Item Selector */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الصنف المراد تسويته <span className="text-red-500">*</span>
              </label>
              <select
                value={form.item_id}
                onChange={(e) => handleItemChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر الصنف --</option>
                {items.map(it => (
                  <option key={it.id} value={it.id}>
                    {it.name} [{it.code}] - الرصيد الحالي: {it.actual_balance ?? it.current_stock} ({it.unit})
                  </option>
                ))}
              </select>
              <FieldError error={errors.item_id} />
            </div>

            {/* Storage Location */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                موقع التخزين
              </label>
              <select
                value={form.location_id}
                onChange={(e) => setForm(prev => ({ ...prev, location_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            {/* Clothing Variant (If available) */}
            {selectedItemVariants.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  المتغير (المقاس واللون)
                </label>
                <select
                  value={form.variant_id}
                  onChange={(e) => setForm(prev => ({ ...prev, variant_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                >
                  {selectedItemVariants.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.size} - {v.color} (الرصيد: {v.current_stock ?? v.opening_balance})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كمية التسوية <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.quantity} />
            </div>

            {/* Reason (Audit Trail) - Requirement D2 */}
            <div className={selectedItemVariants.length > 0 ? 'md:col-span-3' : 'md:col-span-2'}>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                سبب التسوية (سجل التدقيق الرقابي) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.reason} />
              <p className="text-xs text-gray-500 mt-1">مثال: تلف أثناء مرحلة الكي، عينات لعميل تصدير، فرق جرد دوري</p>
            </div>

            {/* Notes */}
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات إضافية
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
