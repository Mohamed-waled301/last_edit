import React, { useState, useEffect, useRef } from 'react';
import { Cog, Plus, Trash2, Image as ImageIcon, AlertTriangle, DollarSign, Package, CheckCircle2, ChevronDown, Search } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import {
  calculateMaterialLineCost,
  calculateTotalMaterialsCost,
  calculateTotalAdditionalCosts,
  calculateTotalProductCost,
  calculateUnitCost
} from '../../logic/productionOrderCalculations';

/**
 * Searchable Dropdown for Raw Materials (Requirement C1)
 * Opens with Tab or click, lists ONLY items of type "مادة خام", shows code and name.
 */
function SearchableMaterialSelect({ items, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedItem = items.find((i) => String(i.id) === String(value));

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    const codeMatch = String(item.code || '').toLowerCase().includes(query);
    const nameMatch = String(item.name || '').toLowerCase().includes(query);
    return codeMatch || nameMatch;
  });

  const handleSelect = (item) => {
    onChange(item);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      if (isOpen && filteredItems[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filteredItems[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const displayValue = isOpen
    ? searchQuery
    : selectedItem
    ? `[${selectedItem.code || '---'}] ${selectedItem.name}`
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onClick={() => {
            setIsOpen(true);
          }}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-label="اختر الخامة أو ابحث بالكود والاسم"
          className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F] font-semibold"
        />
        <ChevronDown
          className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              لا توجد خامات مطابقة للبحث
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = selectedItem && String(selectedItem.id) === String(item.id);
              const isHighlighted = idx === highlightedIndex;
              const stock = Number(item.current_stock) || 0;
              const cost = Number(item.cost_price) || 0;

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`p-2.5 text-xs cursor-pointer transition-colors flex items-center justify-between ${
                    isHighlighted ? 'bg-blue-50 text-blue-900' : isSelected ? 'bg-slate-50 font-bold' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex flex-col text-right">
                    <span className="font-bold text-slate-900">
                      [{item.code || '---'}] {item.name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      الوحدة: {item.unit || 'وحدة'} | الرصيد المتاح: <span className={stock > 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>{stock}</span>
                    </span>
                  </div>
                  <div className="text-left font-mono font-bold text-slate-700 text-[11px]">
                    {formatCurrency(cost)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductionOrderFormPage({ onSaved, onNotify, onBack }) {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [form, setForm] = useState({
    order_number: `ORD-MFG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
    product_id: '',
    batch_quantity: '1',
    start_date: getTodayDateString(),
    notes: ''
  });

  // Material lines (Requirement C1, C2, C3)
  const [materialLines, setMaterialLines] = useState([
    {
      id: `line-${Date.now()}-0`,
      material_id: '',
      code: '',
      name: '',
      unit: 'وحدة',
      quantity: 1,
      unit_price: 0,
      current_stock: 0
    }
  ]);

  // Additional costs (Requirement C4)
  const [additionalCosts, setAdditionalCosts] = useState([
    { id: 'c-1', name: 'أجور عمالة تشغيل', amount: '' },
    { id: 'c-2', name: 'كهرباء ومرافق', amount: '' }
  ]);

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

        // Raw materials: ONLY items of type "مادة خام" / "raw_material" (never finished products)
        const raw = itemsList.filter(
          (i) => i.item_type === 'raw_material' || i.item_type === 'مادة خام'
        );
        setRawMaterials(raw);

        // Finished products: items of type finished + products table
        const finishedItems = itemsList.filter(
          (i) => i.item_type === 'finished' || i.item_type === 'منتج تام'
        );
        const allProds = finishedItems.length > 0 ? finishedItems : prodsList;
        setProducts(allProds);
      } catch (err) {
        console.error('Error loading production form data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleProductSelect = (productId) => {
    const prod = products.find((p) => String(p.id) === String(productId));
    setSelectedProduct(prod || null);
    setForm((prev) => ({
      ...prev,
      product_id: productId,
      batch_quantity: prod ? String(prod.min_issue_qty || 1) : prev.batch_quantity
    }));
  };

  // Raw material lines handlers (Requirement C2)
  const handleMaterialSelect = (lineIndex, materialItem) => {
    setMaterialLines((prev) => {
      const updated = [...prev];
      updated[lineIndex] = {
        ...updated[lineIndex],
        material_id: materialItem.id,
        code: materialItem.code,
        name: materialItem.name,
        unit: materialItem.unit || 'وحدة',
        quantity: 1, // Default quantity = 1
        unit_price: Number(materialItem.cost_price) || 0, // Loads master cost price
        current_stock: Number(materialItem.current_stock) || 0
      };
      return updated;
    });
  };

  const handleLineQuantityChange = (lineIndex, qtyVal) => {
    setMaterialLines((prev) => {
      const updated = [...prev];
      updated[lineIndex] = {
        ...updated[lineIndex],
        quantity: qtyVal
      };
      return updated;
    });
  };

  const handleLinePriceChange = (lineIndex, priceVal) => {
    setMaterialLines((prev) => {
      const updated = [...prev];
      updated[lineIndex] = {
        ...updated[lineIndex],
        unit_price: priceVal
      };
      return updated;
    });
  };

  const handleAddMaterialLine = () => {
    setMaterialLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length}`,
        material_id: '',
        code: '',
        name: '',
        unit: 'وحدة',
        quantity: 1,
        unit_price: 0,
        current_stock: 0
      }
    ]);
  };

  const handleRemoveMaterialLine = (lineIndex) => {
    setMaterialLines((prev) => prev.filter((_, idx) => idx !== lineIndex));
  };

  // Additional costs handlers (Requirement C4)
  const handleAddCostRow = () => {
    setAdditionalCosts((prev) => [
      ...prev,
      { id: `c-${Date.now()}`, name: '', amount: '' }
    ]);
  };

  const handleRemoveCostRow = (costIndex) => {
    setAdditionalCosts((prev) => prev.filter((_, idx) => idx !== costIndex));
  };

  const handleCostChange = (costIndex, field, value) => {
    setAdditionalCosts((prev) => {
      const updated = [...prev];
      updated[costIndex] = {
        ...updated[costIndex],
        [field]: value
      };
      return updated;
    });
  };

  // Calculations (Requirement C3, C4, C5)
  const batchQty = Math.max(0, Number(form.batch_quantity) || 0);
  const totalMaterialsCost = calculateTotalMaterialsCost(materialLines);
  const totalAdditionalCosts = calculateTotalAdditionalCosts(additionalCosts);
  const totalProductCost = calculateTotalProductCost(totalMaterialsCost, totalAdditionalCosts);
  const unitCost = calculateUnitCost(totalProductCost, batchQty);

  // Validation
  const validate = () => {
    const errs = {};
    if (!form.product_id) errs.product_id = 'يرجى اختيار المنتج المطلوب تصنيعه';
    const qtyErr = Validators.positiveNumber(form.batch_quantity, 'كمية الدفعة');
    if (qtyErr) errs.batch_quantity = qtyErr;

    const validLines = materialLines.filter((l) => Boolean(l.material_id));
    if (validLines.length === 0) {
      errs.materials = 'يرجى اختيار خامة واحدة على الأقل من الخامات المتاحة';
    }

    // Check quantity and stock availability for every line
    const stockErrors = [];
    validLines.forEach((line) => {
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) {
        errs.materials = 'كمية كل خامة يجب أن تكون أكبر من صفر';
      }
      if (qty > line.current_stock) {
        stockErrors.push(
          `الكمية المطلوبة من (${line.name || line.code}) هي (${qty}) وهي أكبر من الرصيد المتاح بالمخزن (${line.current_stock})`
        );
      }
    });

    if (stockErrors.length > 0) {
      errs.stock = stockErrors.join(' | ');
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) {
      if (errors.stock) {
        alert(errors.stock);
      }
      return;
    }

    try {
      setSaving(true);
      const validLines = materialLines
        .filter((l) => Boolean(l.material_id))
        .map((l) => ({
          material_id: l.material_id,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0
        }));

      const validCosts = additionalCosts
        .filter((c) => Number(c.amount) > 0)
        .map((c) => ({
          name: c.name.trim() || 'تكلفة إضافية',
          amount: Number(c.amount) || 0
        }));

      await api.createProductionOrder({
        order_number: form.order_number,
        product_id: form.product_id,
        batch_quantity: batchQty,
        start_date: form.start_date,
        materials: validLines,
        additional_costs: validCosts,
        notes: form.notes
      });

      if (onNotify) {
        onNotify('تم إصدار أمر الإنتاج بنجاح، وخصم الخامات من المخزن، واستلام المنتج التام');
      }

      if (onSaved) {
        onSaved();
      } else if (onBack) {
        onBack();
      } else {
        window.location.hash = '#/manufacturing';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إصدار أمر الإنتاج');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.product_id && batchQty > 0 && materialLines.some((l) => Boolean(l.material_id)));

  return (
    <PageContainer
      title="إصدار أمر إنتاج وتصنيع داخلي"
      subtitle="حساب تكلفة الخامات، المصروفات الإضافية، صرف الخامات واستلام المنتج التام بحركة واحدة"
      breadcrumbs={[
        { label: 'التصنيع', href: '#/manufacturing' },
        { label: 'أمر إنتاج جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => {
        if (onBack) onBack();
        else window.location.hash = '#/manufacturing';
      }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار أمر الإنتاج والصرف"
      extraBottomContent={
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
          <span>
            إجمالي تكلفة الخامات: <span className="font-mono text-slate-900">{formatCurrency(totalMaterialsCost)}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            تكاليف إضافية: <span className="font-mono text-indigo-700">{formatCurrency(totalAdditionalCosts)}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            إجمالي تكلفة المنتج: <span className="font-mono text-emerald-700 text-sm">{formatCurrency(totalProductCost)}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span className="bg-emerald-50 px-2 py-0.5 rounded text-emerald-900 border border-emerald-200">
            تكلفة القطعة: <span className="font-mono font-bold">{formatCurrency(unitCost)}</span>
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.stock && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-xs font-bold text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errors.stock}</span>
          </div>
        )}

        {/* Section 1: Target Finished Product */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Cog className="w-5 h-5 text-[#1F3A5F]" />
            المنتج المطلوب تصنيعه وكمية الدفعة
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Left: Product and Batch Details */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اختر المنتج التام <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.product_id}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-bold text-[#1F3A5F] focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  required
                >
                  <option value="">-- اختر المنتج من دليل الأصناف --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code || '---'}] {p.name} {p.category ? `(${p.category})` : ''}
                    </option>
                  ))}
                </select>
                <FieldError error={errors.product_id} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم أمر الإنتاج
                  </label>
                  <input
                    type="text"
                    value={form.order_number}
                    onChange={(e) => setForm((prev) => ({ ...prev, order_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-slate-50 text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كمية الدفعة المنتجة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.batch_quantity}
                    onChange={(e) => setForm((prev) => ({ ...prev, batch_quantity: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                    required
                  />
                  <FieldError error={errors.batch_quantity} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ بدء التشغيل
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات أمر التشغيل
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                />
              </div>
            </div>

            {/* Right: Item Image Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold text-slate-600 mb-2">صورة المنتج المستهدف</span>
              {selectedProduct?.image ? (
                <div className="w-36 h-36 rounded-lg overflow-hidden border border-slate-300 shadow-xs">
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-36 h-36 rounded-lg bg-white border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon className="w-8 h-8 mb-1" />
                  <span className="text-[11px]">لا توجد صورة محملة</span>
                </div>
              )}
              {selectedProduct && (
                <div className="mt-2 text-center">
                  <span className="text-xs font-bold text-[#1F3A5F] block">
                    {selectedProduct.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    كود: {selectedProduct.code}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Raw Material Lines (Requirement C1, C2, C3) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#1F3A5F]" />
                بنود الخامات ومستلزمات الإنتاج
              </h2>
              <span className="text-xs text-slate-500">
                قائمة منسدلة قابلة للبحث تعرض المواد الخام فقط، مع تحميل سعر التكلفة وإمكانية تعديله لأمر الإنتاج فقط.
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddMaterialLine}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1F3A5F] text-white hover:bg-[#162a45] transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة خامة للتشغيل</span>
            </button>
          </div>

          <FieldError error={errors.materials} />

          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-72">الخامة (بحث بالكود والاسم)</th>
                  <th className="p-3 w-28 text-center font-mono">الرصيد المتاح</th>
                  <th className="p-3 w-32 text-center">الكمية المطلوبة</th>
                  <th className="p-3 w-32 text-center">سعر الوحدة (ج.م)</th>
                  <th className="p-3 w-36 text-left font-mono">إجمالي البند (ج.م)</th>
                  <th className="p-3 w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materialLines.map((line, idx) => {
                  const qty = Number(line.quantity) || 0;
                  const price = Number(line.unit_price) || 0;
                  const lineCost = calculateMaterialLineCost(qty, price);
                  const isStockShortage = Boolean(line.material_id && qty > line.current_stock);

                  return (
                    <tr key={line.id || idx} className={`hover:bg-slate-50 ${isStockShortage ? 'bg-red-50/50' : ''}`}>
                      <td className="p-3 font-semibold text-slate-400 text-center">{idx + 1}</td>
                      <td className="p-2">
                        <SearchableMaterialSelect
                          items={rawMaterials}
                          value={line.material_id}
                          onChange={(item) => handleMaterialSelect(idx, item)}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-bold">
                        {line.material_id ? (
                          <span className={line.current_stock > 0 ? 'text-emerald-700' : 'text-red-600'}>
                            {line.current_stock} {line.unit}
                          </span>
                        ) : (
                          <span className="text-slate-300">---</span>
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity}
                          onChange={(e) => handleLineQuantityChange(idx, e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-center focus:outline-hidden focus:ring-2 ${
                            isStockShortage
                              ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-500'
                              : 'border-slate-300 bg-white text-slate-800 focus:ring-[#1F3A5F]'
                          }`}
                        />
                        {isStockShortage && (
                          <span className="block text-[10px] text-red-600 font-bold mt-1 text-center">
                            أكبر من المتاح!
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) => handleLinePriceChange(idx, e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-center bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                        />
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-slate-900">
                        {formatCurrency(lineCost)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterialLine(idx)}
                          disabled={materialLines.length === 1}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                          title="حذف البند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan="5" className="p-3 text-right font-bold text-slate-800 text-xs">
                    إجمالي تكلفة الخامات:
                  </td>
                  <td className="p-3 text-left font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(totalMaterialsCost)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 3: Additional Costs (Requirement C4) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                تكاليف إضافية (أجور عمالة، كهرباء، أخرى)
              </h2>
              <span className="text-xs text-slate-500">
                صفوف ديناميكية للمصروفات المباشرة وغير المباشرة مع إمكانية الإضافة والحذف.
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddCostRow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة بند تكلفة</span>
            </button>
          </div>

          <div className="space-y-3">
            {additionalCosts.map((cost, idx) => (
              <div key={cost.id || idx} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-400 w-6 text-center">{idx + 1}</span>
                <div className="flex-1">
                  <input
                    type="text"
                    value={cost.name}
                    onChange={(e) => handleCostChange(idx, 'name', e.target.value)}
                    aria-label="بيان التكلفة الإضافية"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="w-48">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cost.amount}
                    onChange={(e) => handleCostChange(idx, 'amount', e.target.value)}
                    aria-label="مبلغ التكلفة الإضافية"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-left"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCostRow(idx)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                  title="حذف بند التكلفة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <div className="flex justify-between items-center p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900">
              <span>إجمالي تكاليف إضافية:</span>
              <span className="font-mono text-sm">{formatCurrency(totalAdditionalCosts)}</span>
            </div>
          </div>
        </div>

        {/* Section 4: Comprehensive Cost Summary (Requirement C3, C4, C5) */}
        <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ملخص تكلفة أمر الإنتاج وتكلفة الوحدة
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/80 p-3.5 rounded-lg border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                إجمالي تكلفة الخامات
              </span>
              <span className="text-base font-bold font-mono text-white">
                {formatCurrency(totalMaterialsCost)}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-lg border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                تكاليف إضافية
              </span>
              <span className="text-base font-bold font-mono text-indigo-300">
                {formatCurrency(totalAdditionalCosts)}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-lg border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                إجمالي تكلفة المنتج
              </span>
              <span className="text-lg font-bold font-mono text-emerald-400">
                {formatCurrency(totalProductCost)}
              </span>
            </div>

            <div className="bg-emerald-950/80 p-3.5 rounded-lg border border-emerald-700/60">
              <span className="block text-[11px] font-bold text-emerald-300 mb-1">
                تكلفة الوحدة الواحدة ({batchQty} قطعة)
              </span>
              <span className="text-xl font-bold font-mono text-emerald-300">
                {formatCurrency(unitCost)}
              </span>
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
