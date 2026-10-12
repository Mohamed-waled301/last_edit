import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  DollarSign, 
  Calendar, 
  Percent, 
  AlertCircle,
  Truck,
  ArrowRight,
  Save,
  Package,
  Layers,
  FolderTree,
  CheckCircle2,
  Clock,
  Info,
  X,
  Filter
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function PurchaseOrderFormPage({ orderId = null, onSaved, onCancel, onNotify, onBack }) {
  const isEdit = Boolean(orderId);
  const today = getTodayDateString();

  const [suppliers, setSuppliers] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Supplier linking filter toggle: default false (show only linked items), toggle to show all
  const [showAllItems, setShowAllItems] = useState(false);

  // Selected item index for side-panel stock view
  const [focusedLineIndex, setFocusedLineIndex] = useState(0);

  // Quick Add Item inline panel state
  const [showQuickAddItem, setShowQuickAddItem] = useState(false);
  const [quickItemForm, setQuickItemForm] = useState({
    code: '',
    name: '',
    item_group: '',
    item_department: '',
    item_type: 'raw_material',
    unit: 'متر',
    cost_price: ''
  });
  const [quickItemSaving, setQuickItemSaving] = useState(false);
  const [quickItemError, setQuickItemError] = useState('');

  const [form, setForm] = useState({
    po_number: '',
    supplier_id: '',
    order_date: today,
    expected_date: today, // Defaults to today's date
    payment_terms: 'cash', // 'cash' | 'credit'
    receive_now: true, // Default checked for cash, unchecked for credit
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
    ],
    installments: [
      {
        id: `inst-${Date.now()}-0`,
        due_date: today,
        amount: '',
        notes: 'الدفعة الأولى'
      }
    ]
  });

  const [errors, setErrors] = useState({});

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (onCancel) {
      onCancel();
    } else {
      window.location.hash = '#/purchases';
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [supRes, itemsRes, groupsRes, sectionsRes] = await Promise.all([
          api.getSuppliers(),
          api.getItems(),
          api.getItemGroups(),
          api.getItemSections()
        ]);

        const sups = Array.isArray(supRes.data) ? supRes.data : (supRes.suppliers || []);
        const itms = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.items || []);
        const grps = Array.isArray(groupsRes.data) ? groupsRes.data : (groupsRes.groups || []);
        const secs = Array.isArray(sectionsRes.data) ? sectionsRes.data : (sectionsRes.sections || []);

        setSuppliers(sups);
        setItemsList(itms);
        setGroupsList(grps);
        setSectionsList(secs);

        const poNum = `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        const initialSupId = sups.length > 0 ? sups[0].id : '';

        setForm((prev) => ({
          ...prev,
          po_number: poNum,
          supplier_id: initialSupId,
          order_date: today,
          expected_date: today,
          payment_terms: 'cash',
          receive_now: true
        }));

        // Prep quick add defaults
        const nextCodeRes = await api.getNextItemCode();
        setQuickItemForm({
          code: nextCodeRes?.code || '1001',
          name: '',
          item_group: grps[0]?.name || 'خامات ومستلزمات',
          item_department: secs[0]?.name || 'عام',
          item_type: 'raw_material',
          unit: 'متر',
          cost_price: ''
        });
      } catch (err) {
        console.error('Failed to load purchase order dependencies:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Selected supplier details
  const selectedSupplier = suppliers.find((s) => s.id === form.supplier_id);

  // Filter items by supplier links
  const availableItems = itemsList.filter((itm) => {
    if (showAllItems || !selectedSupplier) return true;
    if (selectedSupplier.supplied_all_items !== false && selectedSupplier.supplied_all_items !== 0) {
      return true;
    }
    const linkedItems = Array.isArray(selectedSupplier.supplied_item_ids) ? selectedSupplier.supplied_item_ids : [];
    const linkedGroups = Array.isArray(selectedSupplier.supplied_group_ids) ? selectedSupplier.supplied_group_ids : [];
    const linkedSections = Array.isArray(selectedSupplier.supplied_section_ids) ? selectedSupplier.supplied_section_ids : [];

    if (linkedItems.includes(itm.id)) return true;
    if (linkedGroups.some((g) => itm.item_group === g)) return true;
    if (linkedSections.some((s) => itm.item_department === s)) return true;

    return false;
  });

  // Currently focused item for side panel stock view
  const focusedLine = form.items[focusedLineIndex] || form.items[0];
  const focusedItem = itemsList.find((i) => String(i.id) === String(focusedLine?.material_id));

  // Payment terms change (cash vs credit)
  const handlePaymentTermsChange = (terms) => {
    setForm((prev) => ({
      ...prev,
      payment_terms: terms,
      // Default unchecked for credit, checked for cash
      receive_now: terms === 'cash'
    }));
  };

  // Line item change
  const handleItemChange = (index, itemId) => {
    const itm = itemsList.find((i) => String(i.id) === String(itemId));
    const defaultPrice = itm ? Number(itm.cost_price) || 0 : 0;

    setForm((prev) => {
      const updated = [...prev.items];
      const cur = updated[index];
      const qty = Number(cur.quantity_ordered) || 0;
      const unitPrice = defaultPrice;
      const total = Number((qty * unitPrice).toFixed(2));

      updated[index] = {
        ...cur,
        material_id: itemId,
        unit_price: String(unitPrice),
        total_price: total
      };
      return { ...prev, items: updated };
    });
    setFocusedLineIndex(index);
  };

  const handleLineQtyChange = (index, qtyVal) => {
    setForm((prev) => {
      const updated = [...prev.items];
      const cur = updated[index];
      const qty = Number(qtyVal) || 0;
      const price = Number(cur.unit_price) || 0;
      updated[index] = {
        ...cur,
        quantity_ordered: qtyVal,
        total_price: Number((qty * price).toFixed(2))
      };
      return { ...prev, items: updated };
    });
  };

  const handleLinePriceChange = (index, priceVal) => {
    setForm((prev) => {
      const updated = [...prev.items];
      const cur = updated[index];
      const qty = Number(cur.quantity_ordered) || 0;
      const price = Number(priceVal) || 0;
      updated[index] = {
        ...cur,
        unit_price: priceVal,
        total_price: Number((qty * price).toFixed(2))
      };
      return { ...prev, items: updated };
    });
  };

  const handleRemoveLine = (index) => {
    if (form.items.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
    if (focusedLineIndex >= form.items.length - 1) {
      setFocusedLineIndex(Math.max(0, form.items.length - 2));
    }
  };

  // Strict Line completion rule
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
    setForm((prev) => ({
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
    setFocusedLineIndex(form.items.length);
  };

  // Totals Calculation & Linked Discount
  const subtotal = form.items.reduce((sum, it) => sum + (Number(it.total_price) || 0), 0);

  const handleDiscountPercentChange = (pctVal) => {
    const pct = Number(pctVal) || 0;
    const val = Number(((subtotal * pct) / 100).toFixed(2));
    setForm((prev) => ({
      ...prev,
      discount_percent: pctVal,
      discount_value: String(val)
    }));
  };

  const handleDiscountValueChange = (valVal) => {
    const val = Number(valVal) || 0;
    const pct = subtotal > 0 ? Number(((val / subtotal) * 100).toFixed(2)) : 0;
    setForm((prev) => ({
      ...prev,
      discount_value: valVal,
      discount_percent: String(pct)
    }));
  };

  const discountValue = Number(form.discount_value) || 0;
  const additionalExpenses = Number(form.additional_expenses) || 0;
  const grandTotal = Math.max(0, Number((subtotal - discountValue + additionalExpenses).toFixed(2)));

  // Installments handling for Credit Orders
  const installmentsTotal = form.installments.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
  const installmentsDiff = Number((grandTotal - installmentsTotal).toFixed(2));

  const handleAddInstallment = () => {
    const remaining = Math.max(0, installmentsDiff);
    setForm((prev) => ({
      ...prev,
      installments: [
        ...prev.installments,
        {
          id: `inst-${Date.now()}-${prev.installments.length}`,
          due_date: today,
          amount: remaining > 0 ? String(remaining) : '',
          notes: `الدفعة ${prev.installments.length + 1}`
        }
      ]
    }));
  };

  const handleRemoveInstallment = (index) => {
    if (form.installments.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      installments: prev.installments.filter((_, idx) => idx !== index)
    }));
  };

  const handleInstallmentChange = (index, field, value) => {
    setForm((prev) => {
      const updated = [...prev.installments];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, installments: updated };
    });
  };

  // Quick Add Item Handler
  const handleSaveQuickItem = async (e) => {
    e.preventDefault();
    if (!quickItemForm.name.trim()) {
      setQuickItemError('اسم الصنف مطلوب');
      return;
    }
    try {
      setQuickItemSaving(true);
      setQuickItemError('');
      const res = await api.createItem({
        code: quickItemForm.code.trim(),
        name: quickItemForm.name.trim(),
        item_group: quickItemForm.item_group,
        item_department: quickItemForm.item_department,
        item_type: quickItemForm.item_type,
        unit: quickItemForm.unit,
        cost_price: Number(quickItemForm.cost_price) || 0,
        selling_price: Number(quickItemForm.cost_price) || 0,
        margin_percent: 0,
        min_issue_qty: 1,
        opening_balance: 0,
        location_id: 'loc-main'
      });

      const newItem = res.data || res.item;
      if (onNotify) onNotify(`تم إنشاء الصنف "${newItem.name}" بنجاح وإضافته لبنود أمر التوريد`);

      // Refresh item list
      const itemsRes = await api.getItems();
      const updatedList = Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.items || []);
      setItemsList(updatedList);

      // Auto-add as line in PO
      setForm((prev) => {
        const lines = [...prev.items];
        // If current last line is empty, put it there; else add line
        const last = lines[lines.length - 1];
        if (last && !last.material_id) {
          lines[lines.length - 1] = {
            ...last,
            material_id: newItem.id,
            unit_price: String(newItem.cost_price || 0),
            quantity_ordered: '1',
            total_price: Number(newItem.cost_price || 0)
          };
        } else {
          lines.push({
            material_id: newItem.id,
            unit_price: String(newItem.cost_price || 0),
            quantity_ordered: '1',
            total_price: Number(newItem.cost_price || 0)
          });
        }
        return { ...prev, items: lines };
      });

      setShowQuickAddItem(false);
      // Generate next code for next quick add
      const nextCodeRes = await api.getNextItemCode();
      setQuickItemForm((prev) => ({
        ...prev,
        code: nextCodeRes?.code || '1001',
        name: '',
        cost_price: ''
      }));
    } catch (err) {
      console.error('Quick add item error:', err);
      setQuickItemError(err.message || 'تعذر إضافة الصنف');
    } finally {
      setQuickItemSaving(false);
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.supplier_id) errs.supplier_id = 'يرجى اختيار المورد';
    if (!form.order_date) errs.order_date = 'تاريخ أمر التوريد مطلوب';

    if (form.items.length === 0) {
      errs.items = 'لا يمكن حفظ أمر التوريد بدون بنود أصناف';
    }

    const lineErrors = [];
    form.items.forEach((line, idx) => {
      if (!line.material_id || Number(line.quantity_ordered) <= 0 || Number(line.unit_price) < 0 || line.unit_price === '') {
        lineErrors.push(idx + 1);
      }
    });

    if (lineErrors.length > 0) {
      errs.items = `البنود التالية غير مكتملة: (${lineErrors.join(', ')}). يرجى تحديد الصنف وكمية أكبر من صفر وسعر التكلفة.`;
    }

    if (form.payment_terms === 'credit') {
      if (Math.abs(installmentsDiff) > 0.01) {
        errs.installments = `مجموع الأقساط (${installmentsTotal} ج.م) يجب أن يساوي تماماً إجمالي أمر التوريد (${grandTotal} ج.م). الفارق المتبقي: ${installmentsDiff} ج.م`;
      }
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
        expected_date: form.expected_date,
        payment_terms: form.payment_terms,
        receive_now: form.receive_now,
        subtotal,
        discount_percent: Number(form.discount_percent) || 0,
        discount_value: discountValue,
        additional_expenses: additionalExpenses,
        total_amount: grandTotal,
        installments: form.payment_terms === 'credit'
          ? form.installments.map((inst) => ({
              ...inst,
              amount: Number(inst.amount) || 0
            }))
          : [],
        notes: form.notes,
        items: form.items.map((it) => ({
          material_id: it.material_id,
          quantity_ordered: Number(it.quantity_ordered) || 0,
          unit_price: Number(it.unit_price) || 0,
          total_price: Number(it.total_price) || 0
        }))
      };

      await api.createPurchaseOrder(payload);
      if (onNotify) {
        onNotify(
          form.receive_now
            ? 'تم حفظ أمر الشراء واعتماد استلام المخزون وحساب المورد بنجاح'
            : 'تم إصدار أمر الشراء بنجاح (قيد التوريد - بانتظار الاستلام)'
        );
      }

      if (onSaved) {
        onSaved();
      } else {
        handleBack();
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ أمر التوريد');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="أمر توريد مشتريات">
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          جاري تحميل بيانات أمر التوريد...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="إنشاء أمر شراء وتوريد خامات"
      subtitle="إصدار أوامر التوريد، استلام البضاعة الفوري أو الآجل، إدارة الأقساط وجدول السداد، وفحص رصيد المخزن الحي"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للمشتريات</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ أمر التوريد'}</span>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Order Header & Dates */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            بيانات أمر الشراء والمورد
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <label htmlFor="po-number-input" className="block text-xs font-semibold text-slate-700 mb-1">
                رقم أمر التوريد
              </label>
              <input
                id="po-number-input"
                type="text"
                value={form.po_number}
                onChange={(e) => setForm((prev) => ({ ...prev, po_number: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            <div>
              <label htmlFor="supplier-select" className="block text-xs font-semibold text-slate-700 mb-1">
                المورد المعتمد *
              </label>
              <select
                id="supplier-select"
                value={form.supplier_id}
                onChange={(e) => setForm((prev) => ({ ...prev, supplier_id: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                required
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code || s.id})
                  </option>
                ))}
              </select>
              <FieldError error={errors.supplier_id} />
            </div>

            <div>
              <label htmlFor="order-date-input" className="block text-xs font-semibold text-slate-700 mb-1">
                تاريخ الطلب *
              </label>
              <input
                id="order-date-input"
                type="date"
                value={form.order_date}
                onChange={(e) => setForm((prev) => ({ ...prev, order_date: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                required
              >
              </input>
            </div>

            {/* Expected receipt date: defaults to today, editable */}
            <div>
              <label htmlFor="expected-date-input" className="block text-xs font-semibold text-slate-700 mb-1">
                تاريخ الاستلام المتوقع
              </label>
              <input
                id="expected-date-input"
                type="date"
                value={form.expected_date}
                onChange={(e) => setForm((prev) => ({ ...prev, expected_date: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                تاريخ التوريد المتوقع بالمخازن
              </span>
            </div>
          </div>

          {/* Payment Terms and Immediate Goods Receipt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
            {/* Payment Terms (Cash / Credit) */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="block text-xs font-bold text-slate-800">
                طريقة ونوع السداد
              </span>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="payment_terms"
                    value="cash"
                    checked={form.payment_terms === 'cash'}
                    onChange={() => handlePaymentTermsChange('cash')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>نقدي (سداد فوري بدون أقساط)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="payment_terms"
                    value="credit"
                    checked={form.payment_terms === 'credit'}
                    onChange={() => handlePaymentTermsChange('credit')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>آجل (أقساط وجدول استحقاق)</span>
                </label>
              </div>
            </div>

            {/* Immediate Receipt Option */}
            <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.receive_now}
                  onChange={(e) => setForm((prev) => ({ ...prev, receive_now: e.target.checked }))}
                  className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500"
                />
                <span className="font-bold text-sm text-emerald-950">
                  تم الاستلام الآن (إنشاء إذن استلام فوري)
                </span>
              </label>
              <p className="text-xs text-emerald-800 mr-6.5">
                عند التحديد، يؤدي حفظ أمر التوريد إلى زيادة أرصدة المخزون وقيد فاتورة المورد تلقائياً في معاملة واحدة.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Items Lines Table & Live Stock Side Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                بنود الخامات والأصناف المطلوبة
              </h2>
              <span className="text-xs text-slate-500">
                تحديد الكميات وسعر التكلفة لكل صنف. يتم تحديث سعر التكلفة الأخير ببطاقة الصنف.
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Supplier Filter Toggle */}
              <button
                type="button"
                onClick={() => setShowAllItems((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  showAllItems
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{showAllItems ? 'عرض أصناف المورد فقط' : 'عرض كل الأصناف'}</span>
              </button>

              {/* Quick Add Item Inline trigger */}
              <button
                type="button"
                onClick={() => setShowQuickAddItem((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف جديد سريعاً</span>
              </button>
            </div>
          </div>

          {/* Quick Add Item Inline Panel */}
          {showQuickAddItem && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <span className="font-bold text-xs text-emerald-900">
                  لوحة إضافة صنف جديد وإدراجه مباشرة في أمر التوريد:
                </span>
                <button
                  type="button"
                  onClick={() => setShowQuickAddItem(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {quickItemError && (
                <div className="p-2 text-xs text-red-700 bg-red-100 rounded-md font-medium">
                  {quickItemError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="quick-item-code" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    كود الصنف
                  </label>
                  <input
                    id="quick-item-code"
                    type="text"
                    value={quickItemForm.code}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, code: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="quick-item-name" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    اسم وتوصيف الصنف *
                  </label>
                  <input
                    id="quick-item-name"
                    type="text"
                    value={quickItemForm.name}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  />
                </div>

                <div>
                  <label htmlFor="quick-item-group" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    مجموعة الصنف
                  </label>
                  <select
                    id="quick-item-group"
                    value={quickItemForm.item_group}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, item_group: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    {groupsList.map((g) => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quick-item-dept" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    قسم الصنف
                  </label>
                  <select
                    id="quick-item-dept"
                    value={quickItemForm.item_department}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, item_department: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    {sectionsList.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="quick-item-type" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    نوع الصنف
                  </label>
                  <select
                    id="quick-item-type"
                    value={quickItemForm.item_type}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, item_type: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="raw_material">مادة خام / مستلزم إنتاج</option>
                    <option value="finished">منتج تام ملابس</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="quick-item-unit" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    الوحدة
                  </label>
                  <select
                    id="quick-item-unit"
                    value={quickItemForm.unit}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, unit: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                  >
                    <option value="متر">متر</option>
                    <option value="كجم">كيلوجرام</option>
                    <option value="قطعة">قطعة</option>
                    <option value="بكرة">بكرة</option>
                    <option value="كرتونة">كرتونة</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="quick-item-cost" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    سعر التكلفة (ج.م)
                  </label>
                  <input
                    id="quick-item-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickItemForm.cost_price}
                    onChange={(e) => setQuickItemForm({ ...quickItemForm, cost_price: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowQuickAddItem(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-md"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuickItem}
                  disabled={quickItemSaving}
                  className="px-4 py-1.5 text-xs text-white bg-emerald-600 rounded-md hover:bg-emerald-700 font-semibold"
                >
                  {quickItemSaving ? 'جاري الحفظ...' : 'حفظ وإدراج الصنف'}
                </button>
              </div>
            </div>
          )}

          {/* Grid Layout: Lines Table on Left, Live Stock Side Panel on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            {/* Lines Table */}
            <div className="lg:col-span-3 space-y-3">
              <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-3 w-10">#</th>
                      <th className="p-3">الصنف / الخامة</th>
                      <th className="p-3 w-28">الكمية المطلوبة</th>
                      <th className="p-3 w-28">سعر الوحدة</th>
                      <th className="p-3 w-28 text-left font-mono">الإجمالي</th>
                      <th className="p-3 w-12 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {form.items.map((line, idx) => (
                      <tr
                        key={idx}
                        onClick={() => setFocusedLineIndex(idx)}
                        className={`transition-colors cursor-pointer ${
                          focusedLineIndex === idx ? 'bg-blue-50/60 ring-1 ring-blue-300 inset-0' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="p-3 font-semibold text-slate-400">{idx + 1}</td>
                        <td className="p-2">
                          <label htmlFor={`po-line-item-${idx}`} className="sr-only">اختر الصنف للبند {idx + 1}</label>
                          <select
                            id={`po-line-item-${idx}`}
                            value={line.material_id}
                            onChange={(e) => handleItemChange(idx, e.target.value)}
                            onFocus={() => setFocusedLineIndex(idx)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800"
                          >
                            <option value="">-- اختر الصنف المطلوب --</option>
                            {availableItems.map((itm) => (
                              <option key={itm.id} value={itm.id}>
                                [{itm.code}] {itm.name} ({itm.unit})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <label htmlFor={`po-line-qty-${idx}`} className="sr-only">الكمية للبند {idx + 1}</label>
                          <input
                            id={`po-line-qty-${idx}`}
                            type="number"
                            min="0.001"
                            step="any"
                            value={line.quantity_ordered}
                            onChange={(e) => handleLineQtyChange(idx, e.target.value)}
                            onFocus={() => setFocusedLineIndex(idx)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-800"
                          />
                        </td>
                        <td className="p-2">
                          <label htmlFor={`po-line-price-${idx}`} className="sr-only">السعر للبند {idx + 1}</label>
                          <input
                            id={`po-line-price-${idx}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => handleLinePriceChange(idx, e.target.value)}
                            onFocus={() => setFocusedLineIndex(idx)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-800"
                          />
                        </td>
                        <td className="p-3 text-left font-mono font-bold text-slate-900">
                          {formatCurrency(line.total_price)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={form.items.length <= 1}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-30"
                            title="حذف البند"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={!isLastLineComplete}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>إضافة بند صنف جديد</span>
                </button>
                <span className="text-xs text-slate-500">
                  {form.items.length} بنود مطلوبة
                </span>
              </div>
              <FieldError error={errors.items} />
            </div>

            {/* Side Panel: CURRENT STOCK Information of focused item */}
            <div className="lg:col-span-1">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 sticky top-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-xs text-slate-800">
                    رصيد المخزن الحي للصنف المحدد
                  </span>
                </div>

                {focusedItem ? (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">اسم الصنف:</span>
                      <span className="font-bold text-slate-900 block">{focusedItem.name}</span>
                      <span className="text-slate-400 font-mono text-[11px] block">{focusedItem.code}</span>
                    </div>

                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg">
                      <span className="text-slate-600 block text-[11px]">الرصيد الفعلي الحالي:</span>
                      <span className="text-lg font-bold font-mono text-blue-700">
                        {formatNumber(focusedItem.actual_balance ?? focusedItem.current_stock ?? 0)} {focusedItem.unit}
                      </span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">آخر سعر شراء:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(focusedItem.last_purchase_price || focusedItem.cost_price || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">الحد الأدنى للرصيد:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatNumber(focusedItem.min_issue_qty || 1)} {focusedItem.unit}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-600">موقع التخزين:</span>
                        <span className="font-bold text-slate-800">
                          {focusedItem.location_id || 'المستودع الرئيسي'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-200 leading-relaxed">
                      هذه البيانات استرشادية للعرض فقط، ولا تطبع في أمر التوريد ولا تؤثر على الإجماليات.
                    </p>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    اختر صنفاً من جدول البنود لعرض رصيده الفعلي ومعلومات تخزينه.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Credit Installments Table (Only when payment_terms is credit) */}
        {form.payment_terms === 'credit' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  جدول سداد الأقساط وتواريخ الاستحقاق (آجل)
                </h2>
                <span className="text-xs text-slate-500">
                  تحديد دفعات السداد وتاريخ كل قسط. يمكن سداد كل قسط بشكل منفصل ومتابعته في كشف حساب المورد.
                </span>
              </div>

              {/* Difference Status */}
              <div className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                Math.abs(installmentsDiff) <= 0.01
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}>
                {Math.abs(installmentsDiff) <= 0.01 ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>مجموع الأقساط مطابق للإجمالي ({formatCurrency(grandTotal)})</span>
                  </span>
                ) : (
                  <span>
                    الفارق المتبقي: {formatCurrency(installmentsDiff)} (المجموع: {formatCurrency(installmentsTotal)} من {formatCurrency(grandTotal)})
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-12">#</th>
                    <th className="p-3 w-40">تاريخ الاستحقاق *</th>
                    <th className="p-3 w-40">مبلغ القسط (ج.م) *</th>
                    <th className="p-3">ملاحظات وبيان الدفعة</th>
                    <th className="p-3 w-12 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.installments.map((inst, idx) => (
                    <tr key={inst.id || idx} className="hover:bg-slate-50">
                      <td className="p-3 font-semibold text-slate-400">{idx + 1}</td>
                      <td className="p-2">
                        <label htmlFor={`inst-date-${idx}`} className="sr-only">تاريخ استحقاق القسط {idx + 1}</label>
                        <input
                          id={`inst-date-${idx}`}
                          type="date"
                          value={inst.due_date}
                          onChange={(e) => handleInstallmentChange(idx, 'due_date', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white text-slate-800"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <label htmlFor={`inst-amount-${idx}`} className="sr-only">مبلغ القسط {idx + 1}</label>
                        <input
                          id={`inst-amount-${idx}`}
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={inst.amount}
                          onChange={(e) => handleInstallmentChange(idx, 'amount', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-800"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <label htmlFor={`inst-notes-${idx}`} className="sr-only">ملاحظات القسط {idx + 1}</label>
                        <input
                          id={`inst-notes-${idx}`}
                          type="text"
                          value={inst.notes}
                          onChange={(e) => handleInstallmentChange(idx, 'notes', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveInstallment(idx)}
                          disabled={form.installments.length <= 1}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-30"
                          title="حذف القسط"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleAddInstallment}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة دفعة استحقاق</span>
              </button>
              <FieldError error={errors.installments} />
            </div>
          </div>
        )}

        {/* Section 4: Totals & Expenses */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            الإجماليات والخصومات ومصروفات الشحن
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                إجمالي البنود قبل الخصم
              </span>
              <div className="px-3.5 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm font-mono font-bold text-slate-900">
                {formatCurrency(subtotal)}
              </div>
            </div>

            <div>
              <label htmlFor="discount-pct-input" className="block text-xs font-semibold text-slate-700 mb-1">
                نسبة الخصم (%)
              </label>
              <input
                id="discount-pct-input"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.discount_percent}
                onChange={(e) => handleDiscountPercentChange(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 text-slate-800"
              />
            </div>

            <div>
              <label htmlFor="discount-val-input" className="block text-xs font-semibold text-slate-700 mb-1">
                قيمة الخصم (ج.م)
              </label>
              <input
                id="discount-val-input"
                type="number"
                step="0.01"
                min="0"
                value={form.discount_value}
                onChange={(e) => handleDiscountValueChange(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 text-slate-800"
              />
            </div>

            <div>
              <label htmlFor="additional-exp-input" className="block text-xs font-semibold text-slate-700 mb-1">
                مصروفات إضافية ونولون
              </label>
              <input
                id="additional-exp-input"
                type="number"
                step="0.01"
                min="0"
                value={form.additional_expenses}
                onChange={(e) => setForm((prev) => ({ ...prev, additional_expenses: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 text-slate-800"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
            <span className="text-sm font-bold">صافي إجمالي أمر التوريد:</span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {formatCurrency(grandTotal)}
            </span>
          </div>

          <div>
            <label htmlFor="po-notes-input" className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات أمر التوريد
            </label>
            <textarea
              id="po-notes-input"
              rows={2}
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
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : 'حفظ أمر التوريد'}</span>
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
