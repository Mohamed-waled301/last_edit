import React, { useState, useEffect } from 'react';
import { RotateCcw, Search, CheckCircle2, AlertCircle, DollarSign, Package } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function SalesReturnFormPage({ onSaved, onNotify }) {
  const [returnMode, setReturnMode] = useState('against_invoice'); // 'against_invoice' | 'free_return'
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    invoice_id: '',
    customer_id: '',
    product_id: '',
    quantity: '1',
    refund_amount: '',
    refund_method: 'deduct_balance', // 'deduct_balance' | 'cash_refund'
    reason: '',
    return_date: getTodayDateString()
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [invRes, prodRes, custRes] = await Promise.all([
          api.getSalesInvoices(),
          api.getItems(),
          api.getCustomers ? api.getCustomers() : api.getParties()
        ]);

        setInvoices(Array.isArray(invRes.data) ? invRes.data : []);
        setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
        const custs = Array.isArray(custRes.data) ? custRes.data : [];
        setCustomers(custs.filter(c => c.is_customer !== 0));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // When an invoice is selected
  const handleInvoiceSelect = (invId) => {
    const inv = invoices.find(i => String(i.id) === String(invId));
    setSelectedInvoice(inv || null);
    const items = inv && Array.isArray(inv.items) ? inv.items : [];
    setInvoiceItems(items);

    const firstItem = items.length > 0 ? items[0] : null;
    setForm(prev => ({
      ...prev,
      invoice_id: invId,
      customer_id: inv ? inv.customer_id : prev.customer_id,
      product_id: firstItem ? (firstItem.product_id || firstItem.id) : prev.product_id,
      refund_method: inv && inv.payment_terms === 'cash' ? 'cash_refund' : 'deduct_balance',
      refund_amount: firstItem ? String(firstItem.unit_selling_price || 0) : ''
    }));
  };

  const handleItemSelect = (prodId) => {
    const itm = invoiceItems.find(i => String(i.product_id) === String(prodId) || String(i.id) === String(prodId));
    const price = itm ? Number(itm.unit_selling_price) || 0 : 0;
    const q = Number(form.quantity) || 1;
    setForm(prev => ({
      ...prev,
      product_id: prodId,
      refund_amount: String((price * q).toFixed(2))
    }));
  };

  const handleQtyChange = (qtyVal) => {
    const q = Number(qtyVal) || 0;
    const itm = invoiceItems.find(i => String(i.product_id) === String(form.product_id) || String(i.id) === String(form.product_id));
    const unitPrice = itm ? (Number(itm.unit_selling_price) || 0) : (Number(form.refund_amount) / (Number(form.quantity) || 1));
    setForm(prev => ({
      ...prev,
      quantity: qtyVal,
      refund_amount: unitPrice > 0 ? String((unitPrice * q).toFixed(2)) : prev.refund_amount
    }));
  };

  // Check max returnable qty from invoice
  const currentInvoiceItem = invoiceItems.find(i => String(i.product_id) === String(form.product_id) || String(i.id) === String(form.product_id));
  const maxSoldQty = currentInvoiceItem ? Number(currentInvoiceItem.quantity) || 1 : 999;
  const isQtyExcess = returnMode === 'against_invoice' && Number(form.quantity) > maxSoldQty;

  const validate = () => {
    const errs = {};
    if (returnMode === 'against_invoice' && !form.invoice_id) {
      errs.invoice_id = 'يرجى تحديد الفاتورة الأصلية للمرتجع';
    }
    if (!form.customer_id) errs.customer_id = 'يرجى تحديد العميل';
    if (!form.product_id) errs.product_id = 'يرجى تحديد الصنف المرتجع';

    const qty = Number(form.quantity) || 0;
    if (qty <= 0) errs.quantity = 'الكمية المرتجعة يجب أن تكون أكبر من صفر';
    if (returnMode === 'against_invoice' && qty > maxSoldQty) {
      errs.quantity = `الكمية المرتجعة (${qty}) تتجاوز الكمية المباعة بالفاتورة الأصلية (${maxSoldQty} قطعة)`;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.createCustomerReturn({
        return_mode: returnMode,
        invoice_id: returnMode === 'against_invoice' ? form.invoice_id : null,
        customer_id: form.customer_id,
        product_id: form.product_id,
        quantity: Number(form.quantity) || 1,
        refund_amount: Number(form.refund_amount) || 0,
        refund_method: form.refund_method,
        reason: form.reason || (returnMode === 'against_invoice' ? 'مرتجع مرتبط بالفاتورة' : 'مرتجع حر'),
        return_date: form.return_date
      });

      if (onNotify) onNotify('تم تسجيل مرتجع المبيعات واسترجاع البضاعة للمخزن بنجاح');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/returns';
      }
    } catch (err) {
      alert(err.message || 'فشل في حفظ المرتجع');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(
    (!returnMode.includes('invoice') || form.invoice_id) &&
    form.customer_id &&
    form.product_id &&
    Number(form.quantity) > 0 &&
    !isQtyExcess
  );

  return (
    <PageContainer
      title="تسجيل مرتجع مبيعات (Sales Return)"
      subtitle="مرتجع حر (بدون أصل) أو مرتجع مرتبط بفاتورة مبيعات مع حصر الكمية المباعة واسترجاع الرصيد"
      breadcrumbs={[
        { label: 'المرتجعات', href: '#/returns' },
        { label: 'مرتجع مبيعات جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/returns'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="اعتماد وتأكيد المرتجع"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>نوع المرتجع: <span className="font-bold text-[#1F3A5F]">{returnMode === 'against_invoice' ? 'مرتبط بفاتورة' : 'مرتجع حر'}</span></span>
          <span className="text-gray-300">|</span>
          <span>طريقة الرد: <span className="font-bold text-indigo-700">{form.refund_method === 'cash_refund' ? 'صرف نقدي من الخزينة' : 'خصم من رصيد العميل'}</span></span>
          <span className="text-gray-300">|</span>
          <span className="text-emerald-700">قيمة المرتجع: <span className="font-mono text-base font-bold">{formatCurrency(form.refund_amount || 0)}</span></span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode Selector (Requirement F5) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-indigo-600" />
            تحديد نوع المرتجع (مرتجع حر / مرتبط بفاتورة مبيعات)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setReturnMode('against_invoice')}
              className={`p-4 rounded-lg border-2 text-right transition-all cursor-pointer ${
                returnMode === 'against_invoice'
                  ? 'border-[#1F3A5F] bg-blue-50/40 shadow-xs'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="font-bold text-sm text-[#1F3A5F] mb-1">مرتجع مرتبط بفاتورة مبيعات (Invoice Return)</div>
              <p className="text-xs text-gray-500">
                البحث برقم الفاتورة الأصلية، التحقق الصارم من عدم تجاوز الكمية المباعة، والرد حسب طريقة سداد الفاتورة.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setReturnMode('free_return')}
              className={`p-4 rounded-lg border-2 text-right transition-all cursor-pointer ${
                returnMode === 'free_return'
                  ? 'border-[#1F3A5F] bg-blue-50/40 shadow-xs'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="font-bold text-sm text-[#1F3A5F] mb-1">مرتجع حر (Free Return)</div>
              <p className="text-xs text-gray-500">
                تسجيل مرتجع بدون ربط بفاتورة مبيعات سابقة مع استرجاع القطع لرصيد المخزن وتسوية الحساب.
              </p>
            </button>
          </div>
        </div>

        {/* Form Fields */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
            بيانات الفاتورة والصنف المسترجع
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* If against invoice: Choose invoice */}
            {returnMode === 'against_invoice' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  اختر الفاتورة الأصلية (البحث برقم الفاتورة) <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.invoice_id}
                  onChange={(e) => handleInvoiceSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-mono font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  required
                >
                  <option value="">-- اختر الفاتورة الأصلية --</option>
                  {invoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} - العميل: {inv.customer_name} ({inv.invoice_date}) - الإجمالي: {inv.total_amount} ج.م ({inv.payment_terms === 'credit' ? 'آجل' : 'نقدي'})
                    </option>
                  ))}
                </select>
                <FieldError error={errors.invoice_id} />
              </div>
            )}

            {/* Customer */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                العميل <span className="text-red-500">*</span>
              </label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm(prev => ({ ...prev, customer_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر العميل --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <FieldError error={errors.customer_id} />
            </div>

            {/* Product Selector */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الصنف المسترجع <span className="text-red-500">*</span>
              </label>
              <select
                value={form.product_id}
                onChange={(e) => handleItemSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر الصنف المسترجع --</option>
                {returnMode === 'against_invoice' && invoiceItems.length > 0 ? (
                  invoiceItems.map(it => (
                    <option key={it.product_id || it.id} value={it.product_id || it.id}>
                      {it.product_name || it.name} (الكمية المباعة بالفاتورة: {it.quantity} قطعة - السعر: {it.unit_selling_price} ج.م)
                    </option>
                  ))
                ) : (
                  products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.code}]
                    </option>
                  ))
                )}
              </select>
              <FieldError error={errors.product_id} />
            </div>

            {/* Returned Quantity with Validation */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الكمية المرتجعة <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={returnMode === 'against_invoice' ? maxSoldQty : undefined}
                value={form.quantity}
                onChange={(e) => handleQtyChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 ${
                  isQtyExcess ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              {returnMode === 'against_invoice' && (
                <span className="text-[11px] text-gray-500 mt-0.5 block">
                  الحد الأقصى المسموح برده: {maxSoldQty} قطعة
                </span>
              )}
              <FieldError error={errors.quantity} />
            </div>

            {/* Refund Amount */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                قيمة المرتجع المستحقة (ج.م)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.refund_amount}
                onChange={(e) => setForm(prev => ({ ...prev, refund_amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Refund Method (Requirement F5) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                طريقة تسوية المبلغ
              </label>
              <select
                value={form.refund_method}
                onChange={(e) => setForm(prev => ({ ...prev, refund_method: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="deduct_balance">خصم من رصيد مديونية العميل (للفواتير الآجلة)</option>
                <option value="cash_refund">صرف نقدي فوري من خزينة المنفذ (للفواتير النقدية)</option>
              </select>
            </div>

            {/* Return Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ المرتجع
              </label>
              <input
                type="date"
                value={form.return_date}
                onChange={(e) => setForm(prev => ({ ...prev, return_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Reason */}
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                سبب الإرجاع
              </label>
              <input
                type="text"
                value={form.reason}
                onChange={(e) => setForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="مثال: مقاس غير مناسب للعميل، عيب نسج أو خياطة..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
