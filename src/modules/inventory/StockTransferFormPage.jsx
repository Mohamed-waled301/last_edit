import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function StockTransferFormPage({ onSaved, onNotify }) {
  const [items, setItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState([]);

  const [form, setForm] = useState({
    from_location_id: '',
    to_location_id: '',
    item_id: '',
    variant_id: '',
    quantity: '',
    transfer_date: getTodayDateString(),
    notes: ''
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

        if (locs.length >= 2) {
          setForm(prev => ({
            ...prev,
            from_location_id: locs[0].id,
            to_location_id: locs[1].id
          }));
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
    setSelectedVariants(vars);
    setForm(prev => ({
      ...prev,
      item_id: itemId,
      variant_id: vars.length > 0 ? vars[0].id : ''
    }));
  };

  const validate = () => {
    const errs = {};
    if (!form.item_id) errs.item_id = 'يرجى تحديد الصنف';
    if (!form.from_location_id) errs.from_location_id = 'موقع المصدر مطلوب';
    if (!form.to_location_id) errs.to_location_id = 'موقع الوجهة مطلوب';
    if (form.from_location_id === form.to_location_id) {
      errs.to_location_id = 'لا يمكن التحويل لنفس موقع التخزين';
    }
    const qtyErr = Validators.positiveNumber(form.quantity, 'كمية التحويل');
    if (qtyErr) errs.quantity = qtyErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.createStockTransfer({
        from_location_id: form.from_location_id,
        to_location_id: form.to_location_id,
        item_id: form.item_id,
        variant_id: form.variant_id || null,
        quantity: Number(form.quantity) || 0,
        transfer_date: form.transfer_date,
        notes: form.notes
      });

      if (onNotify) onNotify('تم تنفيذ إذن التحويل المخزني بنجاح');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/inventory';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء تنفيذ التحويل');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(
    form.item_id && 
    form.from_location_id && 
    form.to_location_id && 
    form.from_location_id !== form.to_location_id &&
    Number(form.quantity) > 0
  );

  return (
    <PageContainer
      title="إصدار إذن تحويل مخزني"
      subtitle="نقل بضاعة أو خامات بين أماكن التخزين والمعارض مع تحديث أرصدة المواقع"
      breadcrumbs={[
        { label: 'المخزن', href: '#/inventory' },
        { label: 'تحويل مخزني جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/inventory'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="تنفيذ التحويل المخزني"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#1F3A5F]" />
            بيانات التحويل بين المواقع
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* From Location */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                من موقع تخزين (المصدر) <span className="text-red-500">*</span>
              </label>
              <select
                value={form.from_location_id}
                onChange={(e) => setForm(prev => ({ ...prev, from_location_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر موقع المصدر --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <FieldError error={errors.from_location_id} />
            </div>

            {/* To Location */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                إلى موقع تخزين (الوجهة) <span className="text-red-500">*</span>
              </label>
              <select
                value={form.to_location_id}
                onChange={(e) => setForm(prev => ({ ...prev, to_location_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر موقع الوجهة --</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
              <FieldError error={errors.to_location_id} />
            </div>

            {/* Item Selector */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الصنف المراد تحويله <span className="text-red-500">*</span>
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
                    {it.name} [{it.code}] - الرصيد الإجمالي: {it.actual_balance ?? it.current_stock} ({it.unit})
                  </option>
                ))}
              </select>
              <FieldError error={errors.item_id} />
            </div>

            {/* Variant Selector */}
            {selectedVariants.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  المتغير (المقاس واللون)
                </label>
                <select
                  value={form.variant_id}
                  onChange={(e) => setForm(prev => ({ ...prev, variant_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                >
                  {selectedVariants.map(v => (
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
                كمية التحويل <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm(prev => ({ ...prev, quantity: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.quantity} />
            </div>

            {/* Transfer Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ التحويل
              </label>
              <input
                type="date"
                value={form.transfer_date}
                onChange={(e) => setForm(prev => ({ ...prev, transfer_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات إذن التحويل
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="بيانات سيارة النقل أو إذن الاستلام..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
