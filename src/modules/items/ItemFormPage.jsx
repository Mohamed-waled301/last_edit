import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Layers, 
  DollarSign, 
  Percent, 
  AlertCircle, 
  Palette, 
  Lock,
  ArrowRight,
  Save,
  FolderTree,
  X
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { compressImageToBase64 } from '../../utils/imageCompressor';
import { Validators, FieldError } from '../../utils/validation';
import { calculateProfitMargin, calculateSellingPriceFromMargin } from '../../logic/costCalculator';

export default function ItemFormPage({ itemId = null, onSaved, onCancel, onNotify, onBack }) {
  const isEdit = Boolean(itemId);

  const [form, setForm] = useState({
    code: '',
    name: '',
    item_group: '',
    item_department: '',
    item_type: '', // Always starts empty
    unit: 'قطعة',
    cost_price: '0',
    selling_price: '0',
    margin_percent: '0',
    margin_value: '0',
    image: '',
    min_issue_qty: '1',
    opening_balance: '0',
    opening_cost: '0',
    location_id: 'loc-main',
    notes: '',
    has_variants: false,
    variants: []
  });

  const [errors, setErrors] = useState({});
  const [existingItems, setExistingItems] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [sizesList, setSizesList] = useState([]);
  const [colorsList, setColorsList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [hasOperationalMovements, setHasOperationalMovements] = useState(false);
  const [variantToggleError, setVariantToggleError] = useState('');

  // Quick inline add modals/panels for Group, Section, and Unit
  const [quickAddGroupOpen, setQuickAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [quickAddSectionOpen, setQuickAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [quickAddUnitOpen, setQuickAddUnitOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [unitsList, setUnitsList] = useState([]);

  // Variant helper input states
  const [newVariant, setNewVariant] = useState({
    size: 'L (كبير)',
    color: 'أبيض ناصع',
    opening_balance: '0'
  });

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (onCancel) {
      onCancel();
    } else {
      window.location.hash = '#/items';
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [itemsRes, groupsRes, sectionsRes, sizesRes, colorsRes, locsRes, unitsRes, settingsRes] = await Promise.all([
          api.getItems(),
          api.getItemGroups(),
          api.getItemSections(),
          api.getItemSizes(),
          api.getItemColors(),
          api.getStorageLocations(),
          api.getItemUnits(),
          api.getSettings()
        ]);

        const allItems = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.items || []);
        const grps = Array.isArray(groupsRes.data) ? groupsRes.data : (groupsRes.groups || []);
        const secs = Array.isArray(sectionsRes.data) ? sectionsRes.data : (sectionsRes.sections || []);
        const unList = Array.isArray(unitsRes.data) ? unitsRes.data : (unitsRes.units || []);
        const defMargin = Number(settingsRes?.data?.default_profit_margin_percent ?? settingsRes?.settings?.default_profit_margin_percent ?? 0);

        setExistingItems(allItems);
        setGroupsList(grps);
        setSectionsList(secs);
        setUnitsList(unList);
        setSizesList(Array.isArray(sizesRes.data) ? sizesRes.data : []);
        setColorsList(Array.isArray(colorsRes.data) ? colorsRes.data : []);
        setLocations(Array.isArray(locsRes.data) ? locsRes.data : []);

        if (isEdit && itemId) {
          const [itemRes, opsCheck] = await Promise.all([
            api.getItem(itemId),
            api.hasItemOperationalMovements(itemId)
          ]);

          setHasOperationalMovements(Boolean(opsCheck?.hasOperationalMovements));

          if (itemRes && itemRes.data) {
            const itm = itemRes.data;
            const cost = Number(itm.cost_price) || 0;
            const sell = Number(itm.selling_price) || 0;
            const { marginValue, marginPercent } = calculateProfitMargin(cost, sell);

            const hasVar = Boolean(itm.has_variants || (Array.isArray(itm.variants) && itm.variants.length > 0));

            setForm({
              code: itm.code || '',
              name: itm.name || '',
              item_group: itm.item_group || '',
              item_department: itm.item_department || '',
              item_type: itm.item_type || 'finished',
              unit: itm.unit || 'قطعة',
              cost_price: itm.cost_price !== undefined ? String(itm.cost_price) : '0',
              selling_price: itm.selling_price !== undefined ? String(itm.selling_price) : '0',
              margin_percent: String(marginPercent || 0),
              margin_value: String(marginValue || 0),
              image: itm.image || '',
              min_issue_qty: String(itm.min_issue_qty || 1),
              opening_balance: String(itm.opening_balance || 0),
              opening_cost: itm.opening_cost !== undefined ? String(itm.opening_cost) : String(cost),
              location_id: itm.location_id || 'loc-main',
              notes: itm.notes || '',
              has_variants: hasVar,
              variants: Array.isArray(itm.variants) ? itm.variants : []
            });
            setImagePreview(itm.image || null);
          }
        } else {
          const nextCodeRes = await api.getNextItemCode();
          const nextCode = nextCodeRes?.code || '1001';
          setForm((prev) => ({
            ...prev,
            code: nextCode,
            item_group: '',
            item_department: '',
            item_type: '',
            unit: 'قطعة',
            cost_price: '0',
            selling_price: '0',
            margin_percent: String(defMargin),
            margin_value: '0'
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
      setForm((prev) => ({ ...prev, image: compressed }));
      setImagePreview(compressed);
      if (onNotify) onNotify('تم ضغط وتحميل صورة الصنف بنجاح');
    } catch (err) {
      alert(err.message || 'فشل في تحميل الصورة');
    }
  };

  // Bidirectional Cost & Selling Price Live Calculation
  const handleCostPriceChange = (val) => {
    const cost = Math.max(0, Number(val) || 0);
    const marginPct = Number(form.margin_percent) || 0;

    let newSell = form.selling_price;
    let newMarginVal = form.margin_value;

    if (cost === 0) {
      newSell = '0';
      newMarginVal = '0';
    } else if (marginPct === 0) {
      newSell = String(cost);
      newMarginVal = '0';
    } else {
      newSell = String(calculateSellingPriceFromMargin(cost, marginPct));
      newMarginVal = String(Number((Number(newSell) - cost).toFixed(2)));
    }

    setForm((prev) => ({
      ...prev,
      cost_price: val,
      selling_price: newSell,
      margin_value: newMarginVal,
      opening_cost: prev.opening_cost ? prev.opening_cost : val
    }));
  };

  const handleSellingPriceChange = (val) => {
    const sell = Math.max(0, Number(val) || 0);
    const cost = Math.max(0, Number(form.cost_price) || 0);
    const { marginValue, marginPercent } = calculateProfitMargin(cost, sell);

    setForm((prev) => ({
      ...prev,
      selling_price: val,
      margin_value: String(marginValue),
      margin_percent: String(marginPercent)
    }));
  };

  const handleMarginPercentChange = (val) => {
    const marginPct = Number(val) || 0;
    const cost = Math.max(0, Number(form.cost_price) || 0);

    let newSell = 0;
    let marginVal = 0;

    if (cost === 0) {
      newSell = 0;
      marginVal = 0;
    } else if (marginPct === 0) {
      newSell = cost;
      marginVal = 0;
    } else {
      newSell = calculateSellingPriceFromMargin(cost, marginPct);
      marginVal = newSell > cost ? Number((newSell - cost).toFixed(2)) : 0;
    }

    setForm((prev) => ({
      ...prev,
      margin_percent: val,
      selling_price: String(newSell),
      margin_value: String(marginVal)
    }));
  };

  // Clothing Variants Toggle Switch
  const handleToggleVariants = () => {
    setVariantToggleError('');
    if (form.has_variants) {
      // Switching ON to OFF: verify no variant stock exists
      const hasVariantStock = form.variants.some(
        (v) => (Number(v.current_stock) || 0) > 0 || (Number(v.opening_balance) || 0) > 0
      );

      if (hasVariantStock) {
        setVariantToggleError(
          'لا يمكن إلغاء تفعيل متغيرات الصنف لوجود أرصدة مسجلة على مقاسات وألوان هذا الصنف. يرجى تصفية أو تسوية أرصدة المتغيرات أولاً.'
        );
        return;
      }

      setForm((prev) => ({
        ...prev,
        has_variants: false
      }));
    } else {
      // Switching OFF to ON
      setForm((prev) => ({
        ...prev,
        has_variants: true
      }));
    }
  };

  // Add Variant to Table
  const handleAddVariant = () => {
    if (!newVariant.size || !newVariant.color) return;
    const existing = form.variants.find(
      (v) => v.size === newVariant.size && v.color === newVariant.color
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

    setForm((prev) => ({
      ...prev,
      variants: updated,
      opening_balance: String(totalOpening)
    }));
  };

  const handleRemoveVariant = (index) => {
    const target = form.variants[index];
    if (target && ((Number(target.current_stock) || 0) > 0 || (Number(target.opening_balance) || 0) > 0)) {
      if (hasOperationalMovements) {
        alert('لا يمكن حذف متغير مقاس/لون مسجل عليه رصيد وحركات مخزنية');
        return;
      }
    }
    const updated = form.variants.filter((_, idx) => idx !== index);
    const totalOpening = updated.reduce((s, v) => s + (Number(v.opening_balance) || 0), 0);
    setForm((prev) => ({
      ...prev,
      variants: updated,
      opening_balance: String(totalOpening)
    }));
  };

  // Quick Add Group
  const handleQuickAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await api.createItemGroup({ name: newGroupName.trim() });
      const created = res.data || res.group;
      setGroupsList((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, item_group: created.name }));
      setNewGroupName('');
      setQuickAddGroupOpen(false);
      if (onNotify) onNotify(`تم إضافة مجموعة "${created.name}" بنجاح`);
    } catch (err) {
      alert(err.message || 'تعذر إضافة مجموعة الصنف');
    }
  };

  // Quick Add Section
  const handleQuickAddSection = async () => {
    if (!newSectionName.trim()) return;
    try {
      const res = await api.createItemSection({ name: newSectionName.trim() });
      const created = res.data || res.section;
      setSectionsList((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, item_department: created.name }));
      setNewSectionName('');
      setQuickAddSectionOpen(false);
      if (onNotify) onNotify(`تم إضافة قسم "${created.name}" بنجاح`);
    } catch (err) {
      alert(err.message || 'تعذر إضافة قسم الصنف');
    }
  };

  // Quick Add Unit
  const handleQuickAddUnit = async () => {
    if (!newUnitName.trim()) return;
    try {
      const res = await api.createItemUnit({ name: newUnitName.trim() });
      const created = res.data || res.unit;
      setUnitsList((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, unit: created.name }));
      setNewUnitName('');
      setQuickAddUnitOpen(false);
      if (onNotify) onNotify(`تم إضافة وحدة القياس "${created.name}" بنجاح`);
    } catch (err) {
      alert(err.message || 'تعذر إضافة وحدة القياس');
    }
  };

  // Validate form
  const validateForm = () => {
    const errs = {};
    const codeErr = Validators.uniqueCode(form.code, existingItems, itemId);
    if (codeErr) errs.code = codeErr;

    const nameErr = Validators.required(form.name, 'اسم وتوصيف الصنف');
    if (nameErr) errs.name = nameErr;

    if (!form.item_group || !form.item_group.trim()) {
      errs.item_group = 'اختر مجموعة الصنف (مجموعة الصنف مطلوبة)';
    }

    if (!form.item_department || !form.item_department.trim()) {
      errs.item_department = 'اختر قسم الصنف (قسم الصنف مطلوب)';
    }

    if (!form.item_type || !form.item_type.trim()) {
      errs.item_type = 'اختر نوع الصنف';
    }

    if (form.cost_price === '' || form.cost_price === null || form.cost_price === undefined) {
      errs.cost_price = 'سعر التكلفة مطلوب';
    } else if (Number(form.cost_price) < 0) {
      errs.cost_price = 'سعر التكلفة لا يمكن أن يكون سالباً';
    }

    if (form.item_type === 'finished') {
      if (form.selling_price === '' || form.selling_price === null || form.selling_price === undefined) {
        errs.selling_price = 'سعر البيع مطلوب';
      } else if (Number(form.selling_price) < 0) {
        errs.selling_price = 'سعر البيع لا يمكن أن يكون سالباً';
      }
    }

    const minQtyErr = Validators.positiveNumber(form.min_issue_qty, 'الحد الأدنى للصرف / أمر التصنيع');
    if (minQtyErr) errs.min_issue_qty = minQtyErr;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateForm()) {
      if (onNotify) onNotify('أكمل البيانات المطلوبة', 'error');
      alert('أكمل البيانات المطلوبة');
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
        margin_percent: Number(form.margin_percent) || 0,
        min_issue_qty: Number(form.min_issue_qty) || 1,
        opening_balance: Number(form.opening_balance) || 0,
        opening_cost: Number(form.opening_cost || form.cost_price) || 0,
        location_id: form.location_id,
        notes: form.notes,
        has_variants: Boolean(form.has_variants),
        variants: form.has_variants ? form.variants : []
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
        handleBack();
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ الصنف');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.name && form.code && form.cost_price && Number(form.cost_price) >= 0);

  if (loading) {
    return (
      <PageContainer title="بيانات الصنف">
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          جاري تحميل بيانات الصنف...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={isEdit ? `تعديل صنف: ${form.name || form.code}` : 'إضافة صنف جديد'}
      subtitle="تسجيل بطاقة الصنف، ربط المجموعات والأقسام، التسعير بهامش الربح، ومتغيرات المقاسات والألوان"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للأصناف</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ الصنف'}</span>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Main Identification & Image */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            البيانات الأساسية وتوصيف الصنف
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Item Code */}
            <div>
              <label htmlFor="item-code-input" className="block text-xs font-semibold text-slate-700 mb-1">
                كود الصنف *
              </label>
              <input
                id="item-code-input"
                type="text"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-800 ${
                  errors.code ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                }`}
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تكويد آلي متسلسل من أعلى رقم، وقابل للتعديل اليدوي بشرط عدم التكرار
              </span>
              <FieldError error={errors.code} />
            </div>

            {/* Item Name / Description */}
            <div className="md:col-span-2">
              <label htmlFor="item-name-input" className="block text-xs font-semibold text-slate-700 mb-1">
                اسم وتوصيف الصنف *
              </label>
              <input
                id="item-name-input"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-800 ${
                  errors.name ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                }`}
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                توصيف الصنف الكامل للمنتج
              </span>
              <FieldError error={errors.name} />
            </div>

            {/* Item Type */}
            <div>
              <label htmlFor="item-type-select" className="block text-xs font-semibold text-slate-700 mb-1">
                نوع الصنف *
              </label>
              <select
                id="item-type-select"
                value={form.item_type}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, item_type: e.target.value }));
                  if (errors.item_type) setErrors((prev) => ({ ...prev, item_type: '' }));
                }}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-medium bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 ${
                  errors.item_type ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                }`}
                required
              >
                <option value="">-- اختر نوع الصنف --</option>
                <option value="raw_material">مادة خام</option>
                <option value="finished">منتج تام</option>
                <option value="supplies">مستلزم إنتاج</option>
              </select>
              <FieldError error={errors.item_type} />
            </div>

            {/* Item Group with Inline Quick-Add panel */}
            <div>
              <label htmlFor="item-group-select" className="block text-xs font-semibold text-slate-700 mb-1">
                مجموعة الصنف *
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  id="item-group-select"
                  value={form.item_group}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, item_group: e.target.value }));
                    if (errors.item_group) setErrors((prev) => ({ ...prev, item_group: '' }));
                  }}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 ${
                    errors.item_group ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  }`}
                  required
                >
                  <option value="">-- اختر مجموعة الصنف --</option>
                  {groupsList.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setQuickAddGroupOpen((prev) => !prev)}
                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-blue-600 transition-colors shrink-0"
                  title="إضافة مجموعة جديدة"
                  aria-label="إضافة مجموعة جديدة"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {quickAddGroupOpen && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5">
                  <label htmlFor="quick-group-name" className="block text-[11px] font-semibold text-blue-900">
                    اسم المجموعة الجديدة
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="quick-group-name"
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-xs bg-white border border-blue-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddGroup}
                      className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAddGroupOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                      title="إلغاء"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
              <FieldError error={errors.item_group} />
            </div>

            {/* Item Department/Section with Inline Quick-Add panel */}
            <div>
              <label htmlFor="item-section-select" className="block text-xs font-semibold text-slate-700 mb-1">
                قسم الصنف *
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  id="item-section-select"
                  value={form.item_department}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, item_department: e.target.value }));
                    if (errors.item_department) setErrors((prev) => ({ ...prev, item_department: '' }));
                  }}
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 ${
                    errors.item_department ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  }`}
                  required
                >
                  <option value="">-- اختر قسم الصنف --</option>
                  {sectionsList.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setQuickAddSectionOpen((prev) => !prev)}
                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-blue-600 transition-colors shrink-0"
                  title="إضافة قسم جديد"
                  aria-label="إضافة قسم جديد"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {quickAddSectionOpen && (
                <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1.5">
                  <label htmlFor="quick-section-name" className="block text-[11px] font-semibold text-emerald-900">
                    اسم القسم الجديد
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="quick-section-name"
                      type="text"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-xs bg-white border border-emerald-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddSection}
                      className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAddSectionOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                      title="إلغاء"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
              <FieldError error={errors.item_department} />
            </div>

            {/* Unit with Inline Quick-Add panel */}
            <div>
              <label htmlFor="item-unit-select" className="block text-xs font-semibold text-slate-700 mb-1">
                وحدة القياس *
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  id="item-unit-select"
                  value={form.unit}
                  onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                >
                  {unitsList.map((u) => (
                    <option key={u.id || u.name} value={u.name}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setQuickAddUnitOpen((prev) => !prev)}
                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-blue-600 transition-colors shrink-0"
                  title="إضافة وحدة قياس جديدة"
                  aria-label="إضافة وحدة قياس جديدة"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {quickAddUnitOpen && (
                <div className="mt-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg space-y-1.5">
                  <label htmlFor="quick-unit-name" className="block text-[11px] font-semibold text-indigo-900">
                    اسم وحدة القياس الجديدة
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="quick-unit-name"
                      type="text"
                      value={newUnitName}
                      onChange={(e) => setNewUnitName(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-xs bg-white border border-indigo-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddUnit}
                      className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      حفظ
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAddUnitOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                      title="إلغاء"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Minimum Issue / Manufacturing Qty */}
            <div>
              <label htmlFor="min-issue-input" className="block text-xs font-semibold text-slate-700 mb-1">
                الحد الأدنى للصرف / أمر التصنيع *
              </label>
              <input
                id="min-issue-input"
                type="number"
                min="1"
                value={form.min_issue_qty}
                onChange={(e) => setForm((prev) => ({ ...prev, min_issue_qty: e.target.value }))}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-800 ${
                  errors.min_issue_qty ? 'border-red-500' : 'border-slate-300'
                }`}
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تنبيه تحذيري في أمر التصنيع إذا قلت الكمية عن هذا الحد
              </span>
              <FieldError error={errors.min_issue_qty} />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                صورة الصنف (ضغط تلقائي للحجم)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer text-xs font-semibold text-slate-700 transition-colors">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>اختر صورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                {imagePreview ? (
                  <div className="relative group w-11 h-11 rounded-lg overflow-hidden border border-slate-300 shadow-2xs">
                    <img src={imagePreview} alt="معاينة الصنف" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setForm((p) => ({ ...p, image: '' })); setImagePreview(null); }}
                      className="absolute inset-0 bg-red-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="حذف الصورة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">لا توجد صورة محملة</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Pricing & Profit Margin & Opening Balance */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              التسعير، هوامش الربحية، والرصيد الافتتاحي
            </h2>
            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              ربط حي متبادل بين التكلفة وهامش الربح وسعر البيع
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            {/* Cost Price */}
            <div>
              <label htmlFor="cost-price-input" className="block text-xs font-semibold text-slate-700 mb-1">
                سعر التكلفة (ج.م) *
              </label>
              <input
                id="cost-price-input"
                type="number"
                step="0.01"
                min="0"
                value={form.cost_price}
                onChange={(e) => handleCostPriceChange(e.target.value)}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-800 ${
                  errors.cost_price ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                }`}
                required
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تكلفة الشراء أو تصنيع القطعة
              </span>
              <FieldError error={errors.cost_price} />
            </div>

            {/* Base Profit Margin % (Default 0) */}
            {form.item_type === 'finished' && (
              <>
                <div>
                  <label htmlFor="margin-pct-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    نسبة هامش الربح (%)
                  </label>
                  <div className="relative">
                    <input
                      id="margin-pct-input"
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.margin_percent}
                      onChange={(e) => handleMarginPercentChange(e.target.value)}
                      className="w-full pr-3.5 pl-9 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-800"
                    />
                    <Percent className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    القيمة الافتراضية 0 (سعر البيع = سعر التكلفة)
                  </span>
                </div>

                {/* Selling Price */}
                <div>
                  <label htmlFor="selling-price-input" className="block text-xs font-semibold text-slate-700 mb-1">
                    سعر البيع (ج.م) *
                  </label>
                  <input
                    id="selling-price-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.selling_price}
                    onChange={(e) => handleSellingPriceChange(e.target.value)}
                    className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono font-bold text-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 ${
                      errors.selling_price ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                    }`}
                    required={form.item_type === 'finished'}
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    تعديل سعر البيع يعيد حساب نسبة الربح
                  </span>
                  <FieldError error={errors.selling_price} />
                </div>

                {/* Margin Value */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    قيمة الربح للقطعة (ج.م)
                  </label>
                  <div className="px-3.5 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm font-mono font-bold text-emerald-700">
                    {formatCurrency(form.margin_value)}
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    سعر البيع - سعر التكلفة
                  </span>
                </div>
              </>
            )}

            {/* Opening Balance - moved to Pricing Section */}
            <div>
              <label htmlFor="opening-balance-input" className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <span>الرصيد الافتتاحي</span>
                {hasOperationalMovements && (
                  <span className="inline-flex items-center text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-sm border border-amber-200">
                    <Lock className="w-3 h-3 mr-1" />
                    مقفل
                  </span>
                )}
              </label>
              <input
                id="opening-balance-input"
                type="number"
                min="0"
                disabled={hasOperationalMovements || form.has_variants}
                value={form.opening_balance}
                onChange={(e) => setForm((prev) => ({ ...prev, opening_balance: e.target.value }))}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono font-bold text-slate-800 ${
                  hasOperationalMovements || form.has_variants
                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500'
                }`}
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                {form.has_variants
                  ? 'يتم احتسابه تلقائياً من مجموع أرصدة المقاسات والألوان بالأسفل'
                  : hasOperationalMovements
                  ? 'تم قفل تعديل الرصيد الافتتاحي لوجود حركات مخزنية مسجلة على الصنف'
                  : 'قابل للتعديل حتى تسجيل أول حركة مخزنية أو أمر توريد'}
              </span>
            </div>

            {/* Opening Cost */}
            <div>
              <label htmlFor="opening-cost-input" className="block text-xs font-semibold text-slate-700 mb-1">
                تكلفة الرصيد الافتتاحي (ج.م)
              </label>
              <input
                id="opening-cost-input"
                type="number"
                step="0.01"
                min="0"
                disabled={hasOperationalMovements}
                value={form.opening_cost || form.cost_price}
                onChange={(e) => setForm((prev) => ({ ...prev, opening_cost: e.target.value }))}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono font-bold text-slate-800 ${
                  hasOperationalMovements
                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                    : 'bg-slate-50 border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500'
                }`}
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تكلفة تقييم بضاعة أول المدة
              </span>
            </div>

            {/* Storage Location */}
            <div>
              <label htmlFor="storage-location-select" className="block text-xs font-semibold text-slate-700 mb-1">
                موقع التخزين المعتمد
              </label>
              <select
                id="storage-location-select"
                value={form.location_id}
                onChange={(e) => setForm((prev) => ({ ...prev, location_id: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code || loc.id})
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500 mt-1 block">
                مستودع إيداع الرصيد الافتتاحي
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Clothing Variants ON/OFF Switch (Size / Color) */}
        {form.item_type === 'finished' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-600" />
                  متغيرات الملابس (المقاسات والألوان)
                </h2>
                <span className="text-xs text-slate-500 font-medium">
                  تفعيل المقاسات والألوان يتيح مصفوفة المخزون والباركود لكل مقاس ولون
                </span>
              </div>

              {/* ON / OFF Switch */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700">
                  {form.has_variants ? 'المتغيرات مفعلة (ON)' : 'المتغيرات معطلة (OFF)'}
                </span>
                <button
                  type="button"
                  onClick={handleToggleVariants}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    form.has_variants ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                  role="switch"
                  aria-checked={form.has_variants}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      form.has_variants ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {variantToggleError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{variantToggleError}</span>
              </div>
            )}

            {!form.has_variants ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                الصنف مسجل كوحدة موحدة بدون تفريد للمقاسات والألوان. يتم إدارة رصيده كبند مفرد بالرصيد الافتتاحي أعلاه.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Add Variant Form Row */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[140px]">
                    <label htmlFor="variant-size-select" className="block text-xs font-semibold text-slate-700 mb-1">
                      المقاس
                    </label>
                    <select
                      id="variant-size-select"
                      value={newVariant.size}
                      onChange={(e) => setNewVariant((p) => ({ ...p, size: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-800"
                    >
                      <option value="صغير">صغير (S)</option>
                      <option value="وسط">وسط (M)</option>
                      <option value="كبير">كبير (L)</option>
                      <option value="كبير جداً">كبير جداً (XL)</option>
                      <option value="كبير مضاعف">كبير مضاعف (XXL)</option>
                      <option value="30 (بنطلون)">30 (بنطلون)</option>
                      <option value="32 (بنطلون)">32 (بنطلون)</option>
                      <option value="34 (بنطلون)">34 (بنطلون)</option>
                      <option value="36 (بنطلون)">36 (بنطلون)</option>
                      <option value="38 (بنطلون)">38 (بنطلون)</option>
                    </select>
                  </div>

                  <div className="flex-1 min-w-[140px]">
                    <label htmlFor="variant-color-select" className="block text-xs font-semibold text-slate-700 mb-1">
                      اللون
                    </label>
                    <select
                      id="variant-color-select"
                      value={newVariant.color}
                      onChange={(e) => setNewVariant((p) => ({ ...p, color: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white text-slate-800"
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

                  <div className="w-32">
                    <label htmlFor="variant-opening-input" className="block text-xs font-semibold text-slate-700 mb-1">
                      الرصيد الافتتاحي
                    </label>
                    <input
                      id="variant-opening-input"
                      type="number"
                      min="0"
                      value={newVariant.opening_balance}
                      onChange={(e) => setNewVariant((p) => ({ ...p, opening_balance: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-800"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddVariant}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة المتغير</span>
                  </button>
                </div>

                {/* Variants Table */}
                {form.variants.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                    <table className="w-full text-right border-collapse text-xs">
                      <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">المقاس</th>
                          <th className="p-3">اللون</th>
                          <th className="p-3">كود الباركود والتتبع</th>
                          <th className="p-3 text-center">الرصيد الافتتاحي</th>
                          <th className="p-3 text-center">الرصيد الفعلي</th>
                          <th className="p-3 text-center">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {form.variants.map((v, idx) => (
                          <tr key={v.id || idx} className="hover:bg-slate-50">
                            <td className="p-3 font-medium text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-bold text-slate-800">{v.size}</td>
                            <td className="p-3 font-bold text-slate-800">{v.color}</td>
                            <td className="p-3 font-mono text-slate-600">{v.sku}</td>
                            <td className="p-3 text-center font-mono font-bold text-blue-700">{v.opening_balance}</td>
                            <td className="p-3 text-center font-mono font-bold text-emerald-700">
                              {v.current_stock !== undefined ? v.current_stock : v.opening_balance}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveVariant(idx)}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md"
                                title="حذف المتغير"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                        <tr>
                          <td colSpan="4" className="p-3 text-left text-slate-700">
                            إجمالي الأرصدة للمتغيرات:
                          </td>
                          <td className="p-3 text-center font-mono text-blue-700">{form.opening_balance}</td>
                          <td className="p-3 text-center font-mono text-emerald-700">{form.opening_balance}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    تم تفعيل المتغيرات ولكن لم يتم إضافة مقاسات وألوان بعد. استخدم النموذج بالأعلى لإضافة المقاسات والألوان.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Section 4: Notes */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            الملاحظات والمواصفات الفنية
          </h2>
          <div>
            <label htmlFor="item-notes-input" className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات الصنف والمواصفات الفنية
            </label>
            <textarea
              id="item-notes-input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={handleBack}
            className="px-5 py-2.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={!isFormValid || saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ الصنف'}</span>
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
