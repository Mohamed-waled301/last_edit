import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  ExternalLink, 
  DollarSign, 
  Calendar, 
  Percent, 
  AlertCircle,
  Truck
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function PurchaseOrderFormPage({ onSaved, onCancel, onNotify }) {
  const [suppliers, setSuppliers] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    po_number: '',
    supplier_id: '',
    order_date: getTodayDateString(),
    payment_terms: 'cash', // 'cash' | 'credit'
    due_date: '',
    expected_date: '',
    discount_percent: '0',
    discount_value: '0',
    additional_expenses: '0',
    notes: '',
    items: [
      {
        material_id: '',
        quantity_ordered: '',
        unit_price: '',
        total_price: 0
      }
    ]
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [supRes, itemsRes] = await Promise.all([
          api.getSuppliers(),
          api.getItems()
        ]);

        const sups = Array.isArray(supRes.data) ? supRes.data : (Array.isArray(supRes.suppliers) ? supRes.suppliers : []);
        const itms = Array.isArray(itemsRes.data) ? itemsRes.data : (Array.isArray(itemsRes.items) ? itemsRes.items : []);

        setSuppliers(sups);
        setItemsList(itms);

        const poNum = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        setForm(prev => ({
          ...prev,
          po_number: poNum,
          supplier_id: sups.length > 0 ? sups[0].id : ''
        }));
      } catch (err) {
        console.error('Failed to load purchase order dependencies:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // When an item is chosen in a line: load cost price from item master
  const handleItemChange = (index, itemId) => {
    const selectedItem = itemsList.find(i => String(i.id) === String(itemId));
    const defaultPrice = selectedItem ? Number(selectedItem.cost_price) || 0 : 0;

    setForm(prev => {
      const updatedItems = [...prev.items];
      const cur = updatedItems[index];
      const qty = Number(cur.quantity_ordered) || 0;
      const unitPrice = defaultPrice;
      const total = Number((qty * unitPrice).toFixed(2));

      updatedItems[index] = {
        ...cur,
        material_id: itemId,
        unit_price: String(unitPrice),
        total_price: total
      };
      return { ...prev, items: updatedItems };
    });
  };

  const handleLineQtyChange = (index, qtyVal) => {
    setForm(prev => {
      const updatedItems = [...prev.items];
      const cur = updatedItems[index];
      const qty = Number(qtyVal) || 0;
      const price = Number(cur.unit_price) || 0;
      updatedItems[index] = {
        ...cur,
        quantity_ordered: qtyVal,
        total_price: Number((qty * price).toFixed(2))
      };
      return { ...prev, items: updatedItems };
    });
  };

  const handleLinePriceChange = (index, priceVal) => {
    setForm(prev => {
      const updatedItems = [...prev.items];
      const cur = updatedItems[index];
      const qty = Number(cur.quantity_ordered) || 0;
      const price = Number(priceVal) || 0;
      updatedItems[index] = {
        ...cur,
        unit_price: priceVal,
        total_price: Number((qty * price).toFixed(2))
      };
      return { ...prev, items: updatedItems };
    });
  };

  const handleRemoveLine = (index) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  // Requirement L2: Strict Line-Item Rule
  // User cannot add a new line or save while previous line is incomplete!
  const lastLine = form.items[form.items.length - 1];
  const isLastLineComplete = Boolean(
    lastLine &&
    lastLine.material_id &&
    Number(lastLine.quantity_ordered) > 0 &&
    Number(lastLine.unit_price) >= 0 &&
    lastLine.unit_price !== ''
  );

  const handleAddLine = () => {
    if (!isLastLineComplete) return;
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          material_id: '',
          quantity_ordered: '',
          unit_price: '',
          total_price: 0
        }
      ]
    }));
  };

  // Totals Calculation & Linked Discount (% and Value)
  const subtotal = form.items.reduce((sum, it) => sum + (Number(it.total_price) || 0), 0);

  const handleDiscountPercentChange = (pctVal) => {
    const pct = Number(pctVal) || 0;
    const val = Number(((subtotal * pct) / 100).toFixed(2));
    setForm(prev => ({
      ...prev,
      discount_percent: pctVal,
      discount_value: String(val)
    }));
  };

  const handleDiscountValueChange = (valVal) => {
    const val = Number(valVal) || 0;
    const pct = subtotal > 0 ? Number(((val / subtotal) * 100).toFixed(2)) : 0;
    setForm(prev => ({
      ...prev,
      discount_value: valVal,
      discount_percent: String(pct)
    }));
  };

  const discountValue = Number(form.discount_value) || 0;
  const additionalExpenses = Number(form.additional_expenses) || 0;
  const grandTotal = Math.max(0, Number((subtotal - discountValue + additionalExpenses).toFixed(2)));

  const validate = () => {
    const errs = {};
    if (!form.supplier_id) errs.supplier_id = 'يرجى اختيار المورد';
    if (!form.order_date) errs.order_date = 'تاريخ أمر التوريد مطلوب';

    if (form.payment_terms === 'credit' && !form.due_date) {
      errs.due_date = 'تاريخ الاستحقاق مطلوب للفواتير الآجلة';
    }

    if (form.items.length === 0) {
      errs.items = 'لا يمكن حفظ أمر التوريد بدون بنود أصناف';
    }

    // Check all lines
    const lineErrors = [];
    form.items.forEach((line, idx) => {
      if (!line.material_id || Number(line.quantity_ordered) <= 0 || Number(line.unit_price) < 0 || line.unit_price === '') {
        lineErrors.push(idx + 1);
      }
    });

    if (lineErrors.length > 0) {
      errs.items = `البنود التالية غير مكتملة: (${lineErrors.join(', ')}). يرجى تحديد الصنف وكمية أكبر من صفر وسعر التكلفة.`;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const payload = {
        po_number: form.po_number,
        supplier_id: form.supplier_id,
        order_date: form.order_date,
        payment_terms: form.payment_terms,
        due_date: form.payment_terms === 'credit' ? form.due_date : null,
        expected_date: form.expected_date || null,
        subtotal,
        discount_percent: Number(form.discount_percent) || 0,
        discount_value: discountValue,
        additional_expenses: additionalExpenses,
        total_amount: grandTotal,
        notes: form.notes,
        items: form.items.map(it => ({
          material_id: it.material_id,
          quantity_ordered: Number(it.quantity_ordered) || 0,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0
        }))
      };

      await api.createPurchaseOrder(payload);
      if (onNotify) onNotify('تم إصدار أمر التوريد وتحديث أسعار التكلفة بنجاح');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/purchases';
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ أمر التوريد');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(
    form.supplier_id &&
    form.order_date &&
    (form.payment_terms === 'cash' || form.due_date) &&
    form.items.length > 0 &&
    isLastLineComplete
  );

  return (
    <PageContainer
      title="إصدار أمر توريد مشتريات جديد"
      subtitle="شروط سداد نقدي أو آجل، تحديث تلقائي لسعر التكلفة بدليل الأصناف، واحتساب الخصومات والمصاريف"
      breadcrumbs={[
        { label: 'المشتريات', href: '#/purchases' },
        { label: 'أمر توريد جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/purchases'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="اعتماد وحفظ أمر التوريد"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>إجمالي البنود: <span className="font-mono text-gray-900">{formatCurrency(subtotal)}</span></span>
          <span className="text-gray-300">|</span>
          <span>الخصم: <span className="font-mono text-red-600">-{formatCurrency(discountValue)}</span></span>
          <span className="text-gray-300">|</span>
          <span>مصاريف: <span className="font-mono text-blue-600">+{formatCurrency(additionalExpenses)}</span></span>
          <span className="text-gray-300">|</span>
          <span className="text-[#1F3A5F]">الصافي النهائي: <span className="font-mono text-base font-bold">{formatCurrency(grandTotal)}</span></span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#1F3A5F]" />
            بيانات أمر التوريد وشروط الدفع
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* PO Number */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                رقم أمر التوريد
              </label>
              <input
                type="text"
                value={form.po_number}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-mono font-bold text-gray-700"
              />
            </div>

            {/* Supplier Selector + Shortcut Button */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  المورد <span className="text-red-500">*</span>
                </label>
                {/* Shortcut to add supplier (Requirement B7) */}
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/suppliers/new'; }}
                  className="text-[11px] font-bold text-[#1F3A5F] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  title="إضافة مورد جديد في الماستر داتا"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ مورد جديد</span>
                </button>
              </div>
              <select
                value={form.supplier_id}
                onChange={(e) => setForm(prev => ({ ...prev, supplier_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر المورد --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code || s.id})
                  </option>
                ))}
              </select>
              <FieldError error={errors.supplier_id} />
            </div>

            {/* Order Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ أمر التوريد <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.order_date}
                onChange={(e) => setForm(prev => ({ ...prev, order_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.order_date} />
            </div>

            {/* Payment Terms (Cash / Credit) - Requirement C1 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                طريقة وشروط الدفع <span className="text-red-500">*</span>
              </label>
              <select
                value={form.payment_terms}
                onChange={(e) => setForm(prev => ({ ...prev, payment_terms: e.target.value, due_date: e.target.value === 'cash' ? '' : prev.due_date }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="cash">نقدي - لا يشترط تاريخ استحقاق</option>
                <option value="credit">آجل - يتطلب تاريخ استحقاق إلزامي</option>
              </select>
            </div>

            {/* Due Date: Cash has NO due date, Credit requires due date (Requirement C1) */}
            {form.payment_terms === 'credit' ? (
              <div>
                <label className="block text-xs font-bold text-rose-800 mb-1">
                  تاريخ الاستحقاق (إلزامي للآجل) <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold bg-white focus:outline-none focus:ring-1 ${
                    errors.due_date ? 'border-red-500 focus:ring-red-500 bg-red-50/40' : 'border-rose-300 focus:ring-rose-500'
                  }`}
                  required
                />
                <FieldError error={errors.due_date} />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">
                  تاريخ الاستحقاق
                </label>
                <div className="px-3 py-2 border border-dashed border-gray-200 bg-gray-50 rounded-md text-xs text-gray-400">
                  غير مطلوب (سداد نقدي فوري)
                </div>
              </div>
            )}

            {/* Expected Delivery Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ الاستلام المتوقع
              </label>
              <input
                type="date"
                value={form.expected_date}
                onChange={(e) => setForm(prev => ({ ...prev, expected_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات التوريد
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="شروط التسليم أو النقل أو الجودة..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Line Items with Strict Line-Item Validation Rule */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                بنود الخامات والأصناف المطلوبة
              </h2>
              <span className="text-xs text-gray-500 font-medium">
                تحميل تلقائي لسعر التكلفة من قاعدة البيانات مع إمكانية التعديل وتحديث الماستر داتا
              </span>
            </div>

            {/* Shortcut to create new item (Requirement B7) */}
            <button
              type="button"
              onClick={() => { window.location.hash = '#/items/new'; }}
              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة صنف بالماستر داتا</span>
            </button>
          </div>

          <FieldError error={errors.items} />

          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 min-w-[260px]">الصنف / الخامة المطلوبة</th>
                  <th className="p-3 w-32 text-center">الكمية المطلوبة</th>
                  <th className="p-3 w-36 text-center">سعر التكلفة للوحدة (ج.م)</th>
                  <th className="p-3 w-36 text-left font-mono">الإجمالي (ج.م)</th>
                  <th className="p-3 w-14 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {form.items.map((line, idx) => {
                  const isLineIncomplete = !line.material_id || Number(line.quantity_ordered) <= 0 || Number(line.unit_price) < 0 || line.unit_price === '';
                  return (
                    <tr key={idx} className={`hover:bg-blue-50/30 ${isLineIncomplete ? 'bg-amber-50/30' : ''}`}>
                      <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>

                      {/* Item Selector */}
                      <td className="p-3">
                        <select
                          value={line.material_id}
                          onChange={(e) => handleItemChange(idx, e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-md text-xs font-bold bg-white focus:outline-none focus:ring-1 ${
                            !line.material_id ? 'border-amber-400 focus:ring-amber-500' : 'border-gray-300 focus:ring-[#1F3A5F]'
                          }`}
                          required
                        >
                          <option value="">-- اختر الصنف / الخامة --</option>
                          {itemsList.map(it => (
                            <option key={it.id} value={it.id}>
                              {it.name} [{it.code}] - التكلفة الحالية: {it.cost_price} ج.م ({it.unit})
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Quantity */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={line.quantity_ordered}
                          onChange={(e) => handleLineQtyChange(idx, e.target.value)}
                          placeholder="0.0"
                          className={`w-full px-2.5 py-1.5 border rounded-md text-xs text-center font-mono font-bold bg-white focus:outline-none focus:ring-1 ${
                            Number(line.quantity_ordered) <= 0 ? 'border-amber-400 focus:ring-amber-500' : 'border-gray-300 focus:ring-[#1F3A5F]'
                          }`}
                          required
                        />
                      </td>

                      {/* Unit Price (Cost Price) - Auto loaded & syncs to DB */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) => handleLinePriceChange(idx, e.target.value)}
                          placeholder="0.00"
                          className={`w-full px-2.5 py-1.5 border rounded-md text-xs text-center font-mono font-bold text-[#1F3A5F] bg-white focus:outline-none focus:ring-1 ${
                            line.unit_price === '' || Number(line.unit_price) < 0 ? 'border-amber-400 focus:ring-amber-500' : 'border-gray-300 focus:ring-[#1F3A5F]'
                          }`}
                          required
                        />
                      </td>

                      {/* Line Total */}
                      <td className="p-3 text-left font-mono font-bold text-gray-900">
                        {formatCurrency(line.total_price)}
                      </td>

                      {/* Remove Button */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          disabled={form.items.length <= 1}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-30 cursor-pointer"
                          title="حذف البند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Line Button - Strictly Disabled until last line is complete (Requirement L2) */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleAddLine}
              disabled={!isLastLineComplete}
              className={`px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isLastLineComplete
                  ? 'bg-blue-50 text-[#1F3A5F] border border-blue-200 hover:bg-blue-100 shadow-2xs'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة صنف جديد للطلب</span>
            </button>

            {!isLastLineComplete && (
              <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>أكمل بيانات البند الحالي أولاً لإتاحة إضافة بند جديد</span>
              </span>
            )}
          </div>
        </div>

        {/* Section 3: Financial Totals, Linked Discounts & Expenses */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            الإجماليات والخصومات والمصاريف الإضافية
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Subtotal */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                إجمالي الأصناف (الإجمالي)
              </label>
              <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-mono font-bold text-gray-900">
                {formatCurrency(subtotal)}
              </div>
            </div>

            {/* Discount Percent (Linked) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                نسبة الخصم (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.discount_percent}
                  onChange={(e) => handleDiscountPercentChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                />
                <Percent className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              </div>
            </div>

            {/* Discount Value (Linked) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                قيمة الخصم (ج.م)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.discount_value}
                onChange={(e) => handleDiscountValueChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold text-red-600 focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Additional Expenses */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                مصاريف إضافية (شحن / نقل)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.additional_expenses}
                onChange={(e) => setForm(prev => ({ ...prev, additional_expenses: e.target.value }))}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold text-blue-700 focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
