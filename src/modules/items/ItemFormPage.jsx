import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Layers, 
  Image as ImageIcon,
  DollarSign, 
  Percent, 
  AlertCircle,
  Sparkles,
  Palette,
  Check
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { compressImageToBase64 } from '../../utils/imageCompressor';
import { Validators, FieldError } from '../../utils/validation';
import { calculateProfitMargin, calculateSellingPriceFromMargin } from '../../logic/costCalculator';

export default function ItemFormPage({ itemId = null, onSaved, onCancel, onNotify }) {
  const isEdit = Boolean(itemId);

  const [form, setForm] = useState({
    code: '',
    name: '',
    item_group: 'ملابس صيفية كاجوال',
    item_department: 'قسم التيشيرتات والبولو',
    item_type: 'finished', // 'finished' | 'raw_material'
    unit: 'قطعة',
    cost_price: '',
    selling_price: '',
    margin_percent: '35',
    margin_value: '0',
    image: '',
    min_issue_qty: '50',
    opening_balance: '0',
    location_id: 'loc-main',
    notes: '',
    variants: []
  });

  const [errors, setErrors] = useState({});
  const [existingItems, setExistingItems] = useState([]);
  const [sizesList, setSizesList] = useState([]);
  const [colorsList, setColorsList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  // Variant helper input states
  const [newVariant, setNewVariant] = useState({
    size: 'L (كبير)',
    color: 'أبيض ناصع',
    opening_balance: '10'
  });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [itemsRes, sizesRes, colorsRes, locsRes] = await Promise.all([
          api.getItems(),
          api.getItemSizes(),
          api.getItemColors(),
          api.getStorageLocations()
        ]);

        const allItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        setExistingItems(allItems);
        setSizesList(Array.isArray(sizesRes.data) ? sizesRes.data : []);
        setColorsList(Array.isArray(colorsRes.data) ? colorsRes.data : []);
        setLocations(Array.isArray(locsRes.data) ? locsRes.data : []);

        if (isEdit && itemId) {
          const itemRes = await api.getItem(itemId);
          if (itemRes && itemRes.data) {
            const itm = itemRes.data;
            const cost = Number(itm.cost_price) || 0;
            const sell = Number(itm.selling_price) || 0;
            const { marginValue, marginPercent } = calculateProfitMargin(cost, sell);

            setForm({
              code: itm.code || '',
              name: itm.name || '',
              item_group: itm.item_group || 'عام',
              item_department: itm.item_department || 'عام',
              item_type: itm.item_type || 'finished',
              unit: itm.unit || 'قطعة',
              cost_price: itm.cost_price ? String(itm.cost_price) : '',
              selling_price: itm.selling_price ? String(itm.selling_price) : '',
              margin_percent: String(marginPercent),
              margin_value: String(marginValue),
              image: itm.image || '',
              min_issue_qty: String(itm.min_issue_qty || 1),
              opening_balance: String(itm.opening_balance || 0),
              location_id: itm.location_id || 'loc-main',
              notes: itm.notes || '',
              variants: Array.isArray(itm.variants) ? itm.variants : []
            });
            setImagePreview(itm.image || null);
          }
        } else {
          // Dynamic auto-increment code continues from highest existing code
          const nextCodeRes = await api.getNextItemCode();
          const nextCode = nextCodeRes?.code || '1001';
          setForm(prev => ({
            ...prev,
            code: nextCode
          }));
        }
      } catch (err) {
        console.error('Error loading item form data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [itemId, isEdit]);

  // Image Upload with base64 canvas compression
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageToBase64(file, 600, 600, 0.8);
      setForm(prev => ({ ...prev, image: compressed }));
      setImagePreview(compressed);
      if (onNotify) onNotify('تم ضغط وتحميل صورة الصنف بنجاح');
    } catch (err) {
      alert(err.message || 'فشل في تحميل الصورة');
    }
  };

  // Bidirectional Cost & Selling Price Live Calculation
  const handleCostPriceChange = (val) => {
    const cost = Number(val) || 0;
    const sell = Number(form.selling_price) || 0;
    const marginPct = Number(form.margin_percent) || 0;

    let newSell = form.selling_price;
    let newMarginVal = form.margin_value;
    let newMarginPct = form.margin_percent;

    if (cost > 0 && marginPct > 0) {
      newSell = String(calculateSellingPriceFromMargin(cost, marginPct));
      newMarginVal = String((Number(newSell) - cost).toFixed(2));
    } else if (cost > 0 && sell > 0) {
      const calc = calculateProfitMargin(cost, sell);
      newMarginVal = String(calc.marginValue);
      newMarginPct = String(calc.marginPercent);
    }

    setForm(prev => ({
      ...prev,
      cost_price: val,
      selling_price: newSell,
      margin_value: newMarginVal,
      margin_percent: newMarginPct
    }));
  };

  const handleSellingPriceChange = (val) => {
    const sell = Number(val) || 0;
    const cost = Number(form.cost_price) || 0;
    const { marginValue, marginPercent } = calculateProfitMargin(cost, sell);

    setForm(prev => ({
      ...prev,
      selling_price: val,
      margin_value: String(marginValue),
      margin_percent: String(marginPercent)
    }));
  };

  const handleMarginPercentChange = (val) => {
    const marginPct = Number(val) || 0;
    const cost = Number(form.cost_price) || 0;
    const newSell = cost > 0 ? calculateSellingPriceFromMargin(cost, marginPct) : 0;
    const marginVal = newSell > cost ? Number((newSell - cost).toFixed(2)) : 0;

    setForm(prev => ({
      ...prev,
      margin_percent: val,
      selling_price: String(newSell),
      margin_value: String(marginVal)
    }));
  };

  // Add Variant to Table
  const handleAddVariant = () => {
    if (!newVariant.size || !newVariant.color) return;
    const existing = form.variants.find(
      v => v.size === newVariant.size && v.color === newVariant.color
    );
    if (existing) {
      alert('هذا المتغير (المقاس واللون) مضاف بالفعل في قائمة المتغيرات');
      return;
    }

    const varId = `var-${Date.now()}-${form.variants.length + 1}`;
    const opBal = Math.max(0, Number(newVariant.opening_balance) || 0);
    const added = {
      id: varId,
      size: newVariant.size,
      color: newVariant.color,
      sku: `${form.code || 'SKU'}-${newVariant.size.split(' ')[0]}-${newVariant.color.split(' ')[0]}`,
      opening_balance: opBal,
      current_stock: opBal
    };

    const updated = [...form.variants, added];
    const totalOpening = updated.reduce((s, v) => s + v.opening_balance, 0);

    setForm(prev => ({
      ...prev,
      variants: updated,
      opening_balance: String(totalOpening)
    }));
  };

  const handleRemoveVariant = (index) => {
    const updated = form.variants.filter((_, idx) => idx !== index);
    const totalOpening = updated.reduce((s, v) => s + v.opening_balance, 0);
    setForm(prev => ({
      ...prev,
      variants: updated,
      opening_balance: String(totalOpening)
    }));
  };

  // Validate form
  const validateForm = () => {
    const errs = {};
    const codeErr = Validators.uniqueCode(form.code, existingItems, itemId);
    if (codeErr) errs.code = codeErr;

    const nameErr = Validators.required(form.name, 'اسم وتوصيف الصنف');
    if (nameErr) errs.name = nameErr;

    const groupErr = Validators.required(form.item_group, 'مجموعة الصنف');
    if (groupErr) errs.item_group = groupErr;

    const deptErr = Validators.required(form.item_department, 'قسم الصنف');
    if (deptErr) errs.item_department = deptErr;

    const costErr = Validators.positiveNumber(form.cost_price, 'سعر التكلفة');
    if (costErr) errs.cost_price = costErr;

    if (form.item_type === 'finished') {
      const sellErr = Validators.positiveNumber(form.selling_price, 'سعر البيع');
      if (sellErr) errs.selling_price = sellErr;
    }

    const minQtyErr = Validators.positiveNumber(form.min_issue_qty, 'الحد الأدنى للصرف / أمر التصنيع');
    if (minQtyErr) errs.min_issue_qty = minQtyErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) {
      const firstField = Object.keys(errors)[0];
      const el = document.getElementById(firstField);
      if (el) el.focus();
      return;
    }

    try {
      setSaving(true);
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        item_group: form.item_group,
        item_department: form.item_department,
        item_type: form.item_type,
        image: form.image,
        unit: form.unit,
        cost_price: Number(form.cost_price) || 0,
        selling_price: form.item_type === 'finished' ? (Number(form.selling_price) || 0) : 0,
        min_issue_qty: Number(form.min_issue_qty) || 1,
        opening_balance: Number(form.opening_balance) || 0,
        variants: form.variants,
        location_id: form.location_id,
        notes: form.notes
      };

      if (isEdit) {
        await api.updateItem(itemId, payload);
        if (onNotify) onNotify('تم تحديث بيانات الصنف بنجاح');
      } else {
        await api.createItem(payload);
        if (onNotify) onNotify('تم إضافة الصنف الجديد بنجاح');
      }

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/items';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ الصنف');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.name && form.code && form.cost_price && Number(form.cost_price) > 0);

  return (
    <PageContainer
      title={isEdit ? `تعديل صنف: ${form.name || form.code}` : 'إضافة صنف جديد'}
      subtitle="تسجيل بيانات الصنف مع تكويد آلي، هامش الربح الحي، صور الصنف، ومتغيرات المقاس واللون"
      breadcrumbs={[
        { label: 'الأصناف', href: '#/items' },
        { label: isEdit ? 'تعديل الصنف' : 'إضافة صنف جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/items'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText={isEdit ? 'حفظ التعديلات' : 'حفظ الصنف'}
      extraBottomContent={
        form.item_type === 'finished' && Number(form.cost_price) > 0 && Number(form.selling_price) > 0 ? (
          <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
            <span>سعر التكلفة: <span className="font-mono text-[#1F3A5F]">{formatCurrency(form.cost_price)}</span></span>
            <span className="text-gray-300">|</span>
            <span>سعر البيع: <span className="font-mono text-green-700">{formatCurrency(form.selling_price)}</span></span>
            <span className="text-gray-300">|</span>
            <span>هامش الربح: <span className="font-mono text-emerald-600 font-bold">{form.margin_percent}% ({formatCurrency(form.margin_value)})</span></span>
          </div>
        ) : null
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Main Identification & Image */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#1F3A5F]" />
            البيانات الأساسية وتوصيف الصنف
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Item Code */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود الصنف <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="code"
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="مثال: 1001 أو 01"
                  className={`w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-1 ${
                    errors.code ? 'border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-gray-300 focus:ring-[#1F3A5F]'
                  }`}
                  required
                />
              </div>
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                تكويد آلي مستمر من أعلى رقم، وقابل للتعديل اليدوي بشرط عدم التكرار
              </span>
              <FieldError error={errors.code} />
            </div>

            {/* Item Name / Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                اسم الصنف - توصيف الصنف <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: تيشيرت بولو رجالي قطن 100% مطرز أو قماش سنجل جيرسي 180 جم"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 ${
                  errors.name ? 'border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              <FieldError error={errors.name} />
            </div>

            {/* Item Type */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                نوع الصنف <span className="text-red-500">*</span>
              </label>
              <select
                value={form.item_type}
                onChange={(e) => setForm(prev => ({ ...prev, item_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="finished">منتج تام (ملابس جاهزة للبيع)</option>
                <option value="raw_material">مادة خام / مستلزم إنتاج (أقمشة وإكسسوارات)</option>
              </select>
            </div>

            {/* Item Group */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                مجموعة الصنف <span className="text-red-500">*</span>
              </label>
              <input
                id="item_group"
                type="text"
                value={form.item_group}
                onChange={(e) => setForm(prev => ({ ...prev, item_group: e.target.value }))}
                placeholder="مثال: ملابس صيفية، أقمشة قطنية"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 ${
                  errors.item_group ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              <FieldError error={errors.item_group} />
            </div>

            {/* Item Department */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                قسم الصنف <span className="text-red-500">*</span>
              </label>
              <input
                id="item_department"
                type="text"
                value={form.item_department}
                onChange={(e) => setForm(prev => ({ ...prev, item_department: e.target.value }))}
                placeholder="مثال: قسم البولو، قسم الجينز، قسم القص"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 ${
                  errors.item_department ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              <FieldError error={errors.item_department} />
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                وحدة القياس <span className="text-red-500">*</span>
              </label>
              <select
                value={form.unit}
                onChange={(e) => setForm(prev => ({ ...prev, unit: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="قطعة">قطعة</option>
                <option value="دريزن">دريزن (12 قطعة)</option>
                <option value="متر">متر</option>
                <option value="كجم">كيلوجرام</option>
                <option value="بكرة">بكرة خيط</option>
                <option value="كيس">كيس</option>
                <option value="كرتونة">كرتونة</option>
              </select>
            </div>

            {/* Minimum Issue / Manufacturing Qty */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الحد الأدنى للصرف / أمر التصنيع <span className="text-red-500">*</span>
              </label>
              <input
                id="min_issue_qty"
                type="number"
                min="1"
                value={form.min_issue_qty}
                onChange={(e) => setForm(prev => ({ ...prev, min_issue_qty: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-1 ${
                  errors.min_issue_qty ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                تنبيه تحذيري في أمر التصنيع إذا قلت الكمية عن هذا الحد
              </span>
              <FieldError error={errors.min_issue_qty} />
            </div>

            {/* Image Upload with Canvas Base64 Compression */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                صورة الصنف (ضغط تلقائي للحجم)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md cursor-pointer text-xs font-bold text-gray-700 transition-colors">
                  <Upload className="w-4 h-4 text-[#1F3A5F]" />
                  <span>اختر صورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                {imagePreview ? (
                  <div className="relative group w-12 h-12 rounded-md overflow-hidden border border-gray-300 shadow-2xs">
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setForm(p => ({ ...p, image: '' })); setImagePreview(null); }}
                      className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="حذف الصورة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">لا توجد صورة محملة</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Pricing, Cost Price & Profit Margin Live Calculation */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              التسعير، سعر التكلفة، وهامش الربح
            </h2>
            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              احتساب حي متبادل للأسعار والربحية
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Cost Price (سعر التكلفة) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                سعر التكلفة (ج.م) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost_price}
                  onChange={(e) => handleCostPriceChange(e.target.value)}
                  placeholder="0.00"
                  className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 ${
                    errors.cost_price ? 'border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-gray-300 focus:ring-[#1F3A5F]'
                  }`}
                  required
                />
              </div>
              <span className="text-[11px] text-gray-400 mt-0.5 block">
                تكلفة الشراء أو تصنيع القطعة
              </span>
              <FieldError error={errors.cost_price} />
            </div>

            {/* Profit Margin Percentage */}
            {form.item_type === 'finished' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    نسبة هامش الربح (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.margin_percent}
                      onChange={(e) => handleMarginPercentChange(e.target.value)}
                      placeholder="35"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                    />
                    <Percent className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-0.5 block">
                    كتابة النسبة تحسب سعر البيع تلقائياً
                  </span>
                </div>

                {/* Selling Price */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    سعر البيع (ج.م) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="selling_price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.selling_price}
                      onChange={(e) => handleSellingPriceChange(e.target.value)}
                      placeholder="0.00"
                      className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold text-green-700 focus:outline-none focus:ring-1 ${
                        errors.selling_price ? 'border-red-500 focus:ring-red-500 bg-red-50/30' : 'border-gray-300 focus:ring-[#1F3A5F]'
                      }`}
                      required={form.item_type === 'finished'}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 mt-0.5 block">
                    كتابة سعر البيع تحسب نسبة الربح
                  </span>
                  <FieldError error={errors.selling_price} />
                </div>

                {/* Profit Margin Value */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    قيمة الربح للقطعة (ج.م)
                  </label>
                  <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-mono font-bold text-emerald-700">
                    {formatCurrency(form.margin_value)}
                  </div>
                  <span className="text-[11px] text-gray-400 mt-0.5 block">
                    سعر البيع - سعر التكلفة
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Section 3: Clothing Variants Matrix (المقاسات والألوان) */}
        {form.item_type === 'finished' && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-600" />
                  متغيرات الملابس (المقاسات والألوان ورصيد كل متغير)
                </h2>
                <span className="text-xs text-gray-500 font-medium">
                  لكل مقاس ولون باركود ورصيد مخزني منفصل
                </span>
              </div>
            </div>

            {/* Add Variant Form Row */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3.5 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-gray-700 mb-1">المقاس</label>
                <select
                  value={newVariant.size}
                  onChange={(e) => setNewVariant(p => ({ ...p, size: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                >
                  <option value="صغير">صغير</option>
                  <option value="وسط">وسط</option>
                  <option value="كبير">كبير</option>
                  <option value="كبير جداً">كبير جداً</option>
                  <option value="كبير مضاعف">كبير مضاعف</option>
                  <option value="30 (بنطلون)">30 (بنطلون)</option>
                  <option value="32 (بنطلون)">32 (بنطلون)</option>
                  <option value="34 (بنطلون)">34 (بنطلون)</option>
                  <option value="36 (بنطلون)">36 (بنطلون)</option>
                  <option value="38 (بنطلون)">38 (بنطلون)</option>
                </select>
              </div>

              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-gray-700 mb-1">اللون</label>
                <select
                  value={newVariant.color}
                  onChange={(e) => setNewVariant(p => ({ ...p, color: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white"
                >
                  <option value="أبيض ناصع">أبيض ناصع</option>
                  <option value="أسود فحمي">أسود فحمي</option>
                  <option value="كحلي داكن">كحلي داكن</option>
                  <option value="رمادي ميلانج">رمادي ميلانج</option>
                  <option value="زيتي عسكري">زيتي عسكري</option>
                  <option value="أزرق جينز كلاسيك">أزرق جينز كلاسيك</option>
                  <option value="نبيتي داكن">نبيتي داكن</option>
                </select>
              </div>

              <div className="w-28">
                <label className="block text-xs font-bold text-gray-700 mb-1">الرصيد الافتتاحي</label>
                <input
                  type="number"
                  min="0"
                  value={newVariant.opening_balance}
                  onChange={(e) => setNewVariant(p => ({ ...p, opening_balance: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-mono font-bold bg-white"
                />
              </div>

              <button
                type="button"
                onClick={handleAddVariant}
                className="px-4 py-2 bg-[#1F3A5F] text-white rounded-md text-xs font-bold hover:bg-[#162a45] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة المتغير</span>
              </button>
            </div>

            {/* Variants Table */}
            {form.variants.length > 0 ? (
              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">المقاس</th>
                      <th className="p-2.5">اللون</th>
                      <th className="p-2.5">كود الباركود والتتبع</th>
                      <th className="p-2.5 text-center">الرصيد الافتتاحي</th>
                      <th className="p-2.5 text-center">الرصيد الفعلي</th>
                      <th className="p-2.5 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.variants.map((v, idx) => (
                      <tr key={v.id || idx} className="hover:bg-gray-50">
                        <td className="p-2.5 font-bold text-gray-400">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-gray-800">{v.size}</td>
                        <td className="p-2.5 font-bold text-gray-800">{v.color}</td>
                        <td className="p-2.5 font-mono text-gray-600">{v.sku}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-blue-700">{v.opening_balance}</td>
                        <td className="p-2.5 text-center font-mono font-bold text-green-700">{v.current_stock ?? v.opening_balance}</td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(idx)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded cursor-pointer"
                            title="حذف المتغير"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t border-gray-200 font-bold">
                    <tr>
                      <td colSpan="4" className="p-2.5 text-left text-gray-700">إجمالي الأرصدة للمتغيرات:</td>
                      <td className="p-2.5 text-center font-mono text-blue-700">{form.opening_balance}</td>
                      <td className="p-2.5 text-center font-mono text-green-700">{form.opening_balance}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-md">
                لم يتم إضافة متغيرات مقاس ولون بعد. يمكنك إضافة مقاسات وألوان بالأعلى، أو الاحتفاظ بالصنف كقطعة موحدة.
              </div>
            )}
          </div>
        )}

        {/* Section 4: Notes and Initial Stock Location */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
            موقع التخزين والملاحظات
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                موقع التخزين الافتراضي
              </label>
              <select
                value={form.location_id}
                onChange={(e) => setForm(prev => ({ ...prev, location_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code || loc.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات الصنف
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="أي مواصفات فنية إضافية..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
