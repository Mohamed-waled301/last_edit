import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Printer, 
  DollarSign, 
  Calendar, 
  User, 
  Store,
  ShieldAlert
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api, getActiveUser } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function SalesInvoiceFormPage({ onSaved, onCancel, onNotify }) {
  const activeUser = getActiveUser();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerBalance, setCustomerBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creditLimitExceeded, setCreditLimitExceeded] = useState(null);

  const [form, setForm] = useState({
    invoice_number: '',
    customer_id: '',
    outlet_id: activeUser.outlet_id || '',
    invoice_date: getTodayDateString(),
    payment_terms: 'cash', // 'cash' | 'credit'
    due_date: '',
    notes: '',
    items: [
      {
        product_id: '',
        variant_id: '',
        quantity: '1',
        price_before_discount: '',
        discount_value: '0',
        unit_selling_price: '',
        available_stock: 0,
        has_variants: false,
        variants_list: []
      }
    ]
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadDependencies() {
      try {
        setLoading(true);
        const [custRes, prodsRes, outRes] = await Promise.all([
          api.getCustomers ? api.getCustomers() : api.getParties(),
          api.getItems(),
          api.getOutlets()
        ]);

        const custs = Array.isArray(custRes.data) ? custRes.data : (Array.isArray(custRes.customers) ? custRes.customers : []);
        const filteredCusts = custs.filter(c => c.is_customer !== 0);
        const prods = Array.isArray(prodsRes.data) ? prodsRes.data : [];
        const outs = Array.isArray(outRes.data) ? outRes.data : [];

        setCustomers(filteredCusts);
        setProducts(prods);
        setOutlets(outs);

        const invNum = `INV-SLS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        setForm(prev => ({
          ...prev,
          invoice_number: invNum,
          outlet_id: activeUser.outlet_id || (outs.length > 0 ? outs[0].id : '')
        }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadDependencies();
  }, []);

  // When customer is selected: immediately show their balance & credit limit
  const handleCustomerChange = async (customerId) => {
    const cust = customers.find(c => String(c.id) === String(customerId));
    setSelectedCustomer(cust || null);
    setForm(prev => ({ ...prev, customer_id: customerId }));

    if (customerId) {
      try {
        const stmt = await api.getCustomerStatement(customerId);
        const bal = stmt?.summary?.remaining_balance ?? stmt?.balance_due ?? cust?.customer_balance ?? 0;
        setCustomerBalance(Number(bal) || 0);
      } catch (e) {
        setCustomerBalance(Number(cust?.customer_balance) || 0);
      }
    } else {
      setCustomerBalance(0);
    }
  };

  // When product is selected in a row
  const handleProductChange = (index, productId) => {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;

    const sellPrice = Number(prod.selling_price) || 0;
    const variants = Array.isArray(prod.variants) ? prod.variants : [];
    const hasVars = variants.length > 0;
    const initialVariant = hasVars ? variants[0] : null;
    const stock = initialVariant ? (Number(initialVariant.current_stock) || 0) : (Number(prod.actual_balance ?? prod.current_stock) || 0);

    setForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        product_id: productId,
        variant_id: initialVariant ? initialVariant.id : '',
        price_before_discount: String(sellPrice),
        discount_value: '0',
        unit_selling_price: String(sellPrice),
        available_stock: stock,
        has_variants: hasVars,
        variants_list: variants
      };
      return { ...prev, items: updated };
    });
  };

  // When variant changes
  const handleVariantChange = (index, variantId) => {
    setForm(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const variant = (cur.variants_list || []).find(v => String(v.id) === String(variantId));
      const stock = variant ? (Number(variant.current_stock) || 0) : cur.available_stock;

      updated[index] = {
        ...cur,
        variant_id: variantId,
        available_stock: stock
      };
      return { ...prev, items: updated };
    });
  };

  // Per line: price before discount -> discount value -> price after discount (Requirement F2)
  const handleLinePriceBeforeDiscountChange = (index, val) => {
    setForm(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const before = Number(val) || 0;
      const discount = Number(cur.discount_value) || 0;
      const after = Math.max(0, before - discount);

      updated[index] = {
        ...cur,
        price_before_discount: val,
        unit_selling_price: String(after)
      };
      return { ...prev, items: updated };
    });
  };

  const handleLineDiscountValueChange = (index, val) => {
    setForm(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const before = Number(cur.price_before_discount) || 0;
      const discount = Number(val) || 0;
      const after = Math.max(0, before - discount);

      updated[index] = {
        ...cur,
        discount_value: val,
        unit_selling_price: String(after)
      };
      return { ...prev, items: updated };
    });
  };

  const handleLineQtyChange = (index, qtyVal) => {
    setForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        quantity: qtyVal
      };
      return { ...prev, items: updated };
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
  const lastLine = form.items[form.items.length - 1];
  const isLastLineComplete = Boolean(
    lastLine &&
    lastLine.product_id &&
    (!lastLine.has_variants || lastLine.variant_id) &&
    Number(lastLine.quantity) > 0 &&
    Number(lastLine.unit_selling_price) >= 0 &&
    lastLine.unit_selling_price !== ''
  );

  const handleAddLine = () => {
    if (!isLastLineComplete) return;
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: '',
          variant_id: '',
          quantity: '1',
          price_before_discount: '',
          discount_value: '0',
          unit_selling_price: '',
          available_stock: 0,
          has_variants: false,
          variants_list: []
        }
      ]
    }));
  };

  // Invoice Subtotal / Total Calculation
  const invoiceTotal = form.items.reduce((sum, it) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_selling_price) || 0;
    return sum + (q * p);
  }, 0);

  // Credit Limit Check (Requirement F3)
  useEffect(() => {
    if (form.payment_terms === 'credit' && selectedCustomer && selectedCustomer.credit_limit > 0) {
      const limit = Number(selectedCustomer.credit_limit) || 0;
      const totalDue = customerBalance + invoiceTotal;
      if (totalDue > limit) {
        const excess = Number((totalDue - limit).toFixed(2));
        setCreditLimitExceeded({
          limit,
          totalDue,
          excess,
          message: `تنبيه: مديونية العميل مع الفاتورة الحالية ستصبح (${formatCurrency(totalDue)}) وتتجاوز الحد الائتماني (${formatCurrency(limit)}) بمقدار (${formatCurrency(excess)}). يمنع الحفظ آجل.`
        });
      } else {
        setCreditLimitExceeded(null);
      }
    } else {
      setCreditLimitExceeded(null);
    }
  }, [form.payment_terms, selectedCustomer, customerBalance, invoiceTotal]);

  const validate = () => {
    const errs = {};
    if (!form.customer_id) errs.customer_id = 'يرجى تحديد العميل';
    if (!form.outlet_id) errs.outlet_id = 'يرجى تحديد الفرع أو المعرض';
    if (!form.invoice_date) errs.invoice_date = 'تاريخ الفاتورة مطلوب';

    if (form.payment_terms === 'credit' && !form.due_date) {
      errs.due_date = 'تاريخ الاستحقاق إلزامي للفواتير الآجلة';
    }

    if (creditLimitExceeded) {
      errs.credit_limit = creditLimitExceeded.message;
    }

    if (form.items.length === 0) {
      errs.items = 'لا يمكن إصدار فاتورة بدون بنود';
    }

    // Check line errors
    const lineErrors = [];
    form.items.forEach((line, idx) => {
      if (!line.product_id || Number(line.quantity) <= 0 || (line.has_variants && !line.variant_id)) {
        lineErrors.push(idx + 1);
      }
      if (Number(line.quantity) > line.available_stock && line.available_stock > 0) {
        errs.stock = `الكمية في البند (${idx + 1}) تتجاوز الرصيد المتاح (${line.available_stock})`;
      }
    });

    if (lineErrors.length > 0) {
      errs.items = `البنود (${lineErrors.join(', ')}) غير مكتملة. حدد الصنف والمقاس/اللون والكمية.`;
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
        invoice_number: form.invoice_number,
        customer_id: form.customer_id,
        outlet_id: form.outlet_id,
        payment_terms: form.payment_terms,
        invoice_date: form.invoice_date,
        due_date: form.payment_terms === 'credit' ? form.due_date : null, // Cash has NO due date
        notes: form.notes,
        items: form.items.map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: Number(it.quantity) || 1,
          price_before_discount: Number(it.price_before_discount) || 0,
          discount_value: Number(it.discount_value) || 0,
          unit_selling_price: Number(it.unit_selling_price) || 0,
          line_total: (Number(it.quantity) || 1) * (Number(it.unit_selling_price) || 0)
        }))
      };

      const res = await api.createSalesInvoice(payload);
      if (onNotify) onNotify('تم إصدار فاتورة المبيعات بنجاح ✓');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/sales';
      }
    } catch (err) {
      alert(err.message || 'فشل في حفظ الفاتورة');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(
    form.customer_id &&
    form.outlet_id &&
    (form.payment_terms === 'cash' || form.due_date) &&
    !creditLimitExceeded &&
    form.items.length > 0 &&
    isLastLineComplete
  );

  return (
    <PageContainer
      title="إصدار فاتورة مبيعات جديدة (Sales Invoice)"
      subtitle="شروط دفع نقدي أو آجل، فحص الحد الائتماني للعميل، وجدول الأسعار قبل وبعد الخصم"
      breadcrumbs={[
        { label: 'المبيعات', href: '#/sales' },
        { label: 'فاتورة جديدة' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/sales'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="اعتماد وإصدار الفاتورة"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>شروط الدفع: <span className="font-bold text-[#1F3A5F]">{form.payment_terms === 'credit' ? 'آجل' : 'نقدي فوري'}</span></span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-900 text-sm">إجمالي الفاتورة: <span className="font-mono text-base font-bold text-green-700">{formatCurrency(invoiceTotal)}</span></span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Balance & Credit Limit Badge Banner (Requirement F3) */}
        {selectedCustomer && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1F3A5F] flex items-center justify-center font-bold">
                <User className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-gray-500 font-semibold block">بيانات العميل المحدد</span>
                <span className="font-bold text-gray-900 text-sm">{selectedCustomer.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div>
                <span className="text-xs text-gray-500 block">المديونية الحالية (عليه):</span>
                <span className={`font-mono text-sm font-bold ${customerBalance > 0 ? 'text-rose-600' : 'text-gray-700'}`}>
                  {formatCurrency(customerBalance)}
                </span>
              </div>

              <div>
                <span className="text-xs text-gray-500 block">الحد الائتماني:</span>
                <span className="font-mono text-sm font-bold text-emerald-700">
                  {selectedCustomer.credit_limit > 0 ? formatCurrency(selectedCustomer.credit_limit) : 'غير مقيد'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Credit Limit Blocker Message (Requirement F3) */}
        {creditLimitExceeded && (
          <div className="p-4 bg-rose-50 border-2 border-rose-400 rounded-lg text-xs font-bold text-rose-900 flex items-start gap-3 animate-fadeIn">
            <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-bold text-rose-700">تجاوز الحد الائتماني المسموح به!</div>
              <p>{creditLimitExceeded.message}</p>
              <div className="text-[11px] text-rose-600 font-semibold">
                يرجى تحصيل دفعة نقدية فورية من العميل أولاً، أو تحويل الفاتورة إلى دفع (نقدي).
              </div>
            </div>
          </div>
        )}

        {/* Invoice Header Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#1F3A5F]" />
            بيانات الفاتورة والعميل
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Invoice Number */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                رقم الفاتورة (آلي)
              </label>
              <input
                type="text"
                value={form.invoice_number}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-mono font-bold text-gray-700"
              />
            </div>

            {/* Customer Selector + Shortcut */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  العميل <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/customers/new'; }}
                  className="text-[11px] font-bold text-[#1F3A5F] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ عميل جديد</span>
                </button>
              </div>
              <select
                value={form.customer_id}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر العميل --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.credit_limit > 0 ? `(حد ائتماني: ${c.credit_limit})` : ''}
                  </option>
                ))}
              </select>
              <FieldError error={errors.customer_id} />
            </div>

            {/* Outlet Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الفرع / المعرض <span className="text-red-500">*</span>
              </label>
              <select
                value={form.outlet_id}
                onChange={(e) => setForm(prev => ({ ...prev, outlet_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر المنفذ --</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <FieldError error={errors.outlet_id} />
            </div>

            {/* Invoice Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ الفاتورة <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
            </div>

            {/* Payment Terms (Requirement F1) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                طريقة الدفع <span className="text-red-500">*</span>
              </label>
              <select
                value={form.payment_terms}
                onChange={(e) => setForm(prev => ({ 
                  ...prev, 
                  payment_terms: e.target.value,
                  due_date: e.target.value === 'cash' ? '' : prev.due_date
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-bold bg-white text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="cash">نقدي (Cash) - لا يشترط تاريخ استحقاق</option>
                <option value="credit">آجل (Credit) - يتطلب تاريخ استحقاق إلزامي</option>
              </select>
            </div>

            {/* Due Date (Credit Only - Requirement F1) */}
            {form.payment_terms === 'credit' ? (
              <div>
                <label className="block text-xs font-bold text-rose-800 mb-1">
                  تاريخ الاستحقاق (إلزامي للآجل) <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm(prev => ({ ...prev, due_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-rose-300 rounded-md text-sm font-mono font-bold bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
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
                  غير مطلوب (تحصيل نقدي فوري)
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات الفاتورة
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="بيانات الاستلام أو بوليصة الشحن..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Line Items with Price Before Discount -> Discount -> Price After Discount (Requirement F2) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                بنود الفاتورة والأسعار والخصومات
              </h2>
              <span className="text-xs text-gray-500 font-medium">
                السعر قبل الخصم ← قيمة الخصم ← السعر بعد الخصم (صافي سعر البيع)
              </span>
            </div>
          </div>

          <FieldError error={errors.items} />
          <FieldError error={errors.stock} />

          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 min-w-[200px]">المنتج</th>
                  <th className="p-3 min-w-[140px]">المقاس واللون</th>
                  <th className="p-3 w-28 text-center font-mono">الرصيد المتاح</th>
                  <th className="p-3 w-28 text-center font-mono">الكمية المباعة</th>
                  <th className="p-3 w-32 text-center font-mono">السعر قبل الخصم</th>
                  <th className="p-3 w-28 text-center font-mono text-red-300">قيمة الخصم</th>
                  <th className="p-3 w-32 text-center font-mono text-emerald-300">السعر بعد الخصم</th>
                  <th className="p-3 w-36 text-left font-mono">إجمالي البند</th>
                  <th className="p-3 w-14 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {form.items.map((line, idx) => {
                  const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_selling_price) || 0);
                  const isStockShortage = Number(line.quantity) > line.available_stock && line.available_stock > 0;
                  return (
                    <tr key={idx} className={`hover:bg-blue-50/30 ${isStockShortage ? 'bg-rose-50/40' : ''}`}>
                      <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>

                      {/* Product Selector */}
                      <td className="p-3">
                        <select
                          value={line.product_id}
                          onChange={(e) => handleProductChange(idx, e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                          required
                        >
                          <option value="">-- اختر المنتج --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} [{p.code}]
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Variant Selector (Size & Color) */}
                      <td className="p-3">
                        {line.has_variants ? (
                          <select
                            value={line.variant_id}
                            onChange={(e) => handleVariantChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                            required
                          >
                            <option value="">-- المقاس واللون --</option>
                            {line.variants_list.map(v => (
                              <option key={v.id} value={v.id}>
                                {v.size} - {v.color} (متاح: {v.current_stock ?? v.opening_balance})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400 font-semibold block text-center">مقاس موحد</span>
                        )}
                      </td>

                      {/* Available Stock */}
                      <td className="p-3 text-center font-mono font-bold text-blue-700">
                        {line.available_stock}
                      </td>

                      {/* Selling Quantity */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="1"
                          max={line.available_stock > 0 ? line.available_stock : undefined}
                          value={line.quantity}
                          onChange={(e) => handleLineQtyChange(idx, e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-md text-xs text-center font-mono font-bold bg-white ${
                            isStockShortage ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300'
                          }`}
                          required
                        />
                      </td>

                      {/* Price Before Discount (Requirement F2) */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.price_before_discount}
                          onChange={(e) => handleLinePriceBeforeDiscountChange(idx, e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs text-center font-mono font-bold bg-white"
                          required
                        />
                      </td>

                      {/* Discount Value (Requirement F2) */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discount_value}
                          onChange={(e) => handleLineDiscountValueChange(idx, e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs text-center font-mono font-bold text-red-600 bg-white"
                        />
                      </td>

                      {/* Price After Discount (Requirement F2) */}
                      <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/40">
                        {formatCurrency(line.unit_selling_price)}
                      </td>

                      {/* Line Total */}
                      <td className="p-3 text-left font-mono font-bold text-gray-900">
                        {formatCurrency(lineTotal)}
                      </td>

                      {/* Remove Button */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          disabled={form.items.length <= 1}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-30 cursor-pointer"
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

          {/* Add Line Button (Strict Line-Item Rule) */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleAddLine}
              disabled={!isLastLineComplete}
              className={`px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                isLastLineComplete
                  ? 'bg-blue-50 text-[#1F3A5F] border border-blue-200 hover:bg-blue-100'
                  : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة صنف جديد للفاتورة</span>
            </button>

            {!isLastLineComplete && (
              <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>أكمل بيانات البند الحالي أولاً لإتاحة إضافة بند جديد</span>
              </span>
            )}
          </div>
        </div>

        {/* Section 3: Bottom Invoice Summary (Requirement F2) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs text-gray-500 font-semibold block">إجمالي عدد القطع بالفاتورة</span>
            <span className="font-mono text-base font-bold text-gray-800">
              {form.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)} قطعة
            </span>
          </div>

          <div className="text-left">
            <span className="text-xs font-semibold text-gray-500 block">إجمالي الفاتورة النهائي</span>
            <div className="text-2xl font-bold font-mono text-green-700">
              {formatCurrency(invoiceTotal)}
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
