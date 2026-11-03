import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Receipt, 
  DollarSign, 
  Users, 
  Store, 
  RotateCcw, 
  Download, 
  Printer, 
  AlertTriangle, 
  CheckCircle2, 
  Phone, 
  Search, 
  X,
  FileText,
  CreditCard,
  Building,
  Layers
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { triggerPrint } from '../utils/print';
import { FieldError, validators, Validators } from '../utils/validation';
import {
  DEFAULT_PHONE_VALUE,
  sanitizeEgyptianPhoneInput,
  normalizePhoneForSave,
  validateEgyptianMobile,
} from '../utils/phone';

export default function SalesModule({ onBack, onNotify }) {
  const [tab, setTab] = useState('invoices'); // 'invoices' | 'customers' | 'returns' | 'outlets'
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [products, setProducts] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Cashier role & outlet permissions
  const [userRole, setUserRole] = useState(localStorage.getItem('apex_user_role') || 'manager');
  const [userOutletId, setUserOutletId] = useState(localStorage.getItem('apex_user_outlet_id') || '1');

  // Modals
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(null); // Selected invoice
  const [printLayout, setPrintLayout] = useState('a4'); // 'a4' | 'thermal'

  // Forms State
  const [newInvoice, setNewInvoice] = useState({
    customer_id: '',
    outlet_id: '1',
    invoice_date: getTodayDateString(),
    payment_terms: 'cash', // 'cash' | 'credit'
    due_date: '',
    credit_days: 30,
    items: [{
      product_id: '',
      quantity: '1',
      unit_price_before_discount: '',
      discount_amount: '0',
      price_after_discount: '',
      product_name: ''
    }],
    notes: ''
  });

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: DEFAULT_PHONE_VALUE,
    address: '',
    tax_number: '',
    credit_limit: '15000',
    opening_balance: '0',
    opening_balance_type: 'debit', // العميل مدين افتراضياً
    notes: ''
  });
  const [customerFormErrors, setCustomerFormErrors] = useState({});

  const [newQuickProduct, setNewQuickProduct] = useState({
    name: '',
    code: '',
    group: '',
    type: 'finished',
    unit: 'قطعة',
    selling_price: 0,
    cost_price: 0
  });

  const [returnForm, setReturnForm] = useState({
    return_type: 'invoice', // 'invoice' | 'free'
    invoice_id: '',
    customer_id: '',
    outlet_id: '1',
    product_id: '',
    quantity: '1',
    max_return_qty: 999,
    unit_price: '0',
    refund_method: 'deduct_balance', // 'deduct_balance' | 'cash_out'
    notes: '',
    reason: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, custRes, outRes, prodRes, accRes] = await Promise.all([
        api.getSalesInvoices(),
        api.getCustomers(),
        api.getOutlets(),
        api.getProducts(),
        api.getAccounts()
      ]);
      setInvoices(invRes.data || []);
      setCustomers(custRes.data || []);
      setOutlets(outRes.data || []);
      setProducts(prodRes.data || []);
      setTreasuryAccounts(accRes.data?.accounts || accRes.data || accRes.accounts || []);
    } catch (err) {
      console.error('Failed to load sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  // Selected customer for credit limit checks
  const selectedCustomer = customers.find(c => String(c.id) === String(newInvoice.customer_id));
  const customerBalance = selectedCustomer?.current_balance || selectedCustomer?.outstanding_balance || 0;
  const customerCreditLimit = parseFloat(selectedCustomer?.credit_limit) || 0;

  // Invoice calculations: price before discount, discount value, price after discount, line total
  const calculatedItems = newInvoice.items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const priceBefore = parseFloat(item.unit_price_before_discount) || 0;
    const discountVal = parseFloat(item.discount_amount) || 0;
    const priceAfter = Math.max(0, priceBefore - discountVal);
    const lineTotal = qty * priceAfter;
    return {
      ...item,
      price_after_discount: priceAfter,
      line_total: lineTotal
    };
  });

  const invoiceGrandTotal = calculatedItems.reduce((sum, item) => sum + item.line_total, 0);
  const totalBalanceAfterInvoice = customerBalance + invoiceGrandTotal;
  const isCreditExceeded = newInvoice.payment_terms === 'credit' && customerCreditLimit > 0 && totalBalanceAfterInvoice > customerCreditLimit;

  // When picking a product in invoice, load selling price
  const handleProductSelect = (idx, productId) => {
    const prod = products.find(p => String(p.id) === String(productId));
    const updated = [...newInvoice.items];
    if (prod) {
      const sp = prod.selling_price || 0;
      updated[idx] = {
        ...updated[idx],
        product_id: prod.id,
        product_name: prod.name,
        unit_price_before_discount: sp,
        discount_amount: '0',
        price_after_discount: sp
      };
    } else {
      updated[idx] = {
        ...updated[idx],
        product_id: '',
        product_name: '',
        unit_price_before_discount: '',
        discount_amount: '0',
        price_after_discount: ''
      };
    }
    setNewInvoice({ ...newInvoice, items: updated });
  };

  // Handle Save Sales Invoice
  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!newInvoice.customer_id) {
      alert('يرجى اختيار العميل');
      return;
    }
    if (isCreditExceeded) {
      alert(`عفواً! لا يمكن حفظ الفاتورة: إجمالي مديونية العميل (${formatCurrency(totalBalanceAfterInvoice)}) ستتجاوز الحد الائتماني المسموح به (${formatCurrency(customerCreditLimit)})!`);
      return;
    }
    const validItems = calculatedItems.filter(it => it.product_id && it.quantity > 0);
    if (validItems.length === 0) {
      alert('يرجى إضافة صنف مباع واحد على الأقل مع الكمية وسعر البيع');
      return;
    }

    try {
      const payload = {
        ...newInvoice,
        items: validItems,
        total_amount: invoiceGrandTotal,
        payment_status: newInvoice.payment_terms === 'cash' ? 'paid' : 'pending'
      };
      const res = await api.createSalesInvoice(payload);
      onNotify(res.message || 'تم إصدار وحفظ فاتورة المبيعات بنجاح');
      setShowAddInvoiceModal(false);
      setNewInvoice({
        customer_id: '',
        outlet_id: userRole === 'cashier' ? userOutletId : '1',
        invoice_date: getTodayDateString(),
        payment_terms: 'cash',
        due_date: '',
        credit_days: 30,
        items: [{
          product_id: '',
          quantity: '1',
          unit_price_before_discount: '',
          discount_amount: '0',
          price_after_discount: '',
          product_name: ''
        }],
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Customer Save
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    const errs = {};
    const nameErr = Validators.required(newCustomer.name, 'اسم العميل');
    if (nameErr) errs.name = nameErr;
    const phoneErr = validateEgyptianMobile(newCustomer.phone, { required: false });
    if (phoneErr) errs.phone = phoneErr;
    const openNum = Number(newCustomer.opening_balance);
    if (newCustomer.opening_balance === '' || isNaN(openNum) || openNum < 0) {
      errs.opening_balance = 'رصيد أول المدة يجب أن يكون رقماً لا يقل عن صفر';
    }
    setCustomerFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      const payload = {
        ...newCustomer,
        phone: normalizePhoneForSave(newCustomer.phone),
        opening_balance: Math.max(0, Number(newCustomer.opening_balance) || 0),
        opening_balance_type: newCustomer.opening_balance_type === 'credit' ? 'credit' : 'debit',
      };
      const res = await api.createUnifiedParty ? await api.createUnifiedParty({ ...payload, is_customer: true, is_supplier: false }) : await api.createCustomer(payload);
      onNotify(res.message || 'تمت إضافة العميل بنجاح');
      setShowAddCustomerModal(false);
      setNewCustomer({ name: '', phone: DEFAULT_PHONE_VALUE, address: '', tax_number: '', credit_limit: '15000', opening_balance: '0', opening_balance_type: 'debit', notes: '' });
      setCustomerFormErrors({});
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Product Save
  const handleSaveQuickProduct = async (e) => {
    e.preventDefault();
    if (!validators.required(newQuickProduct.name)) return;
    try {
      const res = await api.createItem ? await api.createItem(newQuickProduct) : await api.createProduct(newQuickProduct);
      onNotify(res.message || 'تمت إضافة الموديل بنجاح');
      setShowAddProductModal(false);
      setNewQuickProduct({ name: '', code: '', group: '', type: 'finished', unit: 'قطعة', selling_price: 0, cost_price: 0 });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Returns Save (Free or Against Invoice)
  const handleSaveReturn = async (e) => {
    e.preventDefault();
    if (!returnForm.customer_id || !returnForm.product_id || !validators.positiveNumber(returnForm.quantity)) {
      alert('يرجى ملء جميع الحقول المطلوبة للمرتجع');
      return;
    }
    if (returnForm.return_type === 'invoice' && parseFloat(returnForm.quantity) > returnForm.max_return_qty) {
      alert(`الكمية المرتجعة لا يمكن أن تزيد عن الكمية المباعة في الفاتورة (${returnForm.max_return_qty} قطعة)!`);
      return;
    }

    try {
      const payload = {
        ...returnForm,
        quantity: parseFloat(returnForm.quantity),
        unit_price: parseFloat(returnForm.unit_price) || 0,
        refund_amount: (parseFloat(returnForm.quantity) || 1) * (parseFloat(returnForm.unit_price) || 0)
      };
      const res = await api.createCustomerReturn(payload);
      onNotify(res.message || 'تم تسجيل المرتجع واستعادة الرصيد للمخزن بنجاح');
      setShowReturnModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter invoices for Cashier Permissions & Search
  let visibleInvoices = invoices;
  if (userRole === 'cashier') {
    visibleInvoices = visibleInvoices.filter(inv => String(inv.outlet_id) === String(userOutletId));
  }
  const filteredInvoices = visibleInvoices.filter(inv => 
    (inv.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inv.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900 leading-none">إدارة المبيعات والفواتير (مصنع ملابس)</h2>
              {userRole === 'cashier' && (
                <span className="erp-badge-amber text-xs">صلاحية كاشير: منفذ {userOutletId}</span>
              )}
            </div>
            <span className="text-xs text-gray-500 font-medium">فواتير نقدية وآجلة، فحص الحد الائتماني، المرتجع الحر والمرتجع بفاتورة، وطباعة الفاتورة</span>
          </div>
        </div>

        {/* Tab Buttons & Role Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md text-xs font-semibold">
            <span className="text-gray-500 px-1">الدور:</span>
            <button
              onClick={() => { setUserRole('manager'); localStorage.setItem('apex_user_role', 'manager'); }}
              className={`px-2 py-1 rounded cursor-pointer ${userRole === 'manager' ? 'bg-[#1F3A5F] text-white' : 'text-gray-700'}`}
            >
              مدير
            </button>
            <button
              onClick={() => { setUserRole('cashier'); localStorage.setItem('apex_user_role', 'cashier'); }}
              className={`px-2 py-1 rounded cursor-pointer ${userRole === 'cashier' ? 'bg-amber-600 text-white' : 'text-gray-700'}`}
            >
              كاشير منفذ
            </button>
          </div>

          <div className="flex items-center gap-1">
            {[
              { id: 'invoices', label: 'فواتير المبيعات' },
              { id: 'customers', label: 'سجل العملاء' },
              { id: 'outlets', label: 'معارض ومنافذ البيع' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-md font-bold text-xs cursor-pointer ${
                  tab === t.id
                    ? 'bg-[#1F3A5F] text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 1: INVOICES */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          {/* Action Row */}
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                aria-label="بحث برقم الفاتورة التلقائي أو اسم العميل"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 pr-9 pl-3 rounded-md border border-gray-300 text-sm focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReturnModal(true)}
                className="h-10 px-3.5 bg-white hover:bg-red-50 text-red-600 rounded-md font-semibold text-xs border border-red-300 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>+ تسجيل مرتجع مبيعات</span>
              </button>
              <button
                onClick={() => setShowAddInvoiceModal(true)}
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>+ إنشاء فاتورة بيع جديدة</span>
              </button>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم الفاتورة</th>
                    <th className="py-3 px-4">العميل</th>
                    <th className="py-3 px-4">المنفذ / المعرض</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">شروط السداد</th>
                    <th className="py-3 px-4 text-left">إجمالي الفاتورة</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراءات وطباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد فواتير مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{inv.invoice_number}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">{inv.customer_name}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{inv.outlet_name || 'المنفذ الرئيسي'}</td>
                        <td className="py-3 px-4 text-gray-600 text-xs">{formatDate(inv.invoice_date)}</td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          {inv.payment_terms === 'cash' ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">نقدي (كاش)</span>
                          ) : (
                            <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-bold">آجل (استحقاق: {formatDate(inv.due_date)})</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-left font-mono font-bold text-gray-900">
                          {formatCurrency(inv.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {inv.payment_status === 'paid' ? (
                            <span className="erp-badge-green text-xs">مسددة</span>
                          ) : (
                            <span className="erp-badge-amber text-xs">آجل مستحق</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => { setShowPrintModal(inv); setPrintLayout('a4'); }}
                            className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 rounded text-xs font-semibold text-gray-700 cursor-pointer flex items-center gap-1 mx-auto"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>طباعة ومعاينة</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMERS */}
      {tab === 'customers' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">سجل العملاء والحدود الائتمانية</h3>
            <button
              onClick={() => setShowAddCustomerModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة عميل جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-right border-collapse text-sm">
              <thead className="bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <th className="py-3 px-4">اسم العميل</th>
                  <th className="py-3 px-4">الهاتف والعنوان</th>
                  <th className="py-3 px-4 text-left">الحد الائتماني ("الحد الائتماني")</th>
                  <th className="py-3 px-4 text-left">الرصيد المدين الحالي</th>
                  <th className="py-3 px-4 text-center">حالة السداد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map(c => {
                  const bal = c.current_balance || c.outstanding_balance || 0;
                  const limit = parseFloat(c.credit_limit) || 0;
                  const isClose = limit > 0 && bal >= (limit * 0.85);

                  return (
                    <tr key={c.id} className="hover:bg-blue-50/20">
                      <td className="py-3 px-4 font-bold text-gray-900">{c.name}</td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        <div>{c.phone || '-'}</div>
                        <div className="text-gray-400">{c.address || '-'}</div>
                      </td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-blue-900">
                        {limit > 0 ? formatCurrency(limit) : 'غير محدد'}
                      </td>
                      <td className="py-3 px-4 text-left font-mono font-bold">
                        <span className={bal > 0 ? 'text-red-600' : 'text-green-700'}>
                          {formatCurrency(bal)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isClose ? (
                          <span className="erp-badge-red text-xs">قريب من الحد!</span>
                        ) : bal > 0 ? (
                          <span className="erp-badge-amber text-xs">عليه مديونية</span>
                        ) : (
                          <span className="erp-badge-green text-xs">خالص</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: OUTLETS */}
      {tab === 'outlets' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">معارض ومنافذ بيع الملابس</h3>
              <p className="text-xs text-gray-500 font-medium">لكل منفذ خزينة خاصة ومبيعات مستقلة لصلاحيات الكاشير</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {outlets.map(o => (
              <div key={o.id} className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-gray-900 flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#1F3A5F]" />
                    <span>{o.name}</span>
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-900 px-2 py-0.5 rounded font-bold">
                    منفذ #{o.id}
                  </span>
                </div>
                <div className="text-xs text-gray-600">الموقع: {o.location || 'الفرع الرئيسي'}</div>
                <div className="text-xs text-gray-500">هاتف التواصل: {o.contact_phone || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD SALES INVOICE (Requirements B & E) */}
      {showAddInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-3xl w-full border border-gray-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">إنشاء فاتورة مبيعات ملابس</h3>
                <p className="text-xs text-gray-500 font-medium">حساب فوري للأرصدة، فحص الحد الائتماني، وسعر القطعة بعد الخصم</p>
              </div>
              <button onClick={() => setShowAddInvoiceModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4 text-xs">
              {/* Customer Selector with Shortcut Button */}
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-gray-800">العميل *</label>
                  <button
                    type="button"
                    onClick={() => setShowAddCustomerModal(true)}
                    className="text-xs font-bold text-[#1F3A5F] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إضافة عميل جديد</span>
                  </button>
                </div>
                <select
                  required
                  value={newInvoice.customer_id}
                  onChange={e => setNewInvoice({ ...newInvoice, customer_id: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs bg-white focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر العميل من القائمة...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || 'بدون هاتف'}) - الرصيد: {formatCurrency(c.current_balance || c.outstanding_balance || 0)}
                    </option>
                  ))}
                </select>
                {!newInvoice.customer_id && <FieldError error="يرجى اختيار العميل" />}

                {/* Requirement E: Customer Balance Badge immediately */}
                {selectedCustomer && (
                  <div className="mt-2.5 p-2 bg-white rounded border border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">الرصيد الحالي للعميل: </span>
                      <strong className={customerBalance > 0 ? 'text-red-600' : 'text-green-700'}>
                        {formatCurrency(customerBalance)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500">الحد الائتماني: </span>
                      <strong className="text-blue-900 font-mono">
                        {customerCreditLimit > 0 ? formatCurrency(customerCreditLimit) : 'غير محدد'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-gray-500">الرصيد بعد هذه الفاتورة: </span>
                      <strong className={isCreditExceeded ? 'text-red-700 font-black' : 'text-gray-900'}>
                        {formatCurrency(totalBalanceAfterInvoice)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Outlet, Date, Payment Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">المنفذ / المعرض *</label>
                  <select
                    disabled={userRole === 'cashier'}
                    value={newInvoice.outlet_id}
                    onChange={e => setNewInvoice({ ...newInvoice, outlet_id: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs bg-white"
                  >
                    {outlets.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">تاريخ الفاتورة *</label>
                  <input
                    type="date"
                    required
                    value={newInvoice.invoice_date}
                    onChange={e => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">طريقة السداد *</label>
                  <div className="flex items-center gap-3 h-10">
                    <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                      <input
                        type="radio"
                        name="payment_terms"
                        checked={newInvoice.payment_terms === 'cash'}
                        onChange={() => setNewInvoice({ ...newInvoice, payment_terms: 'cash', due_date: '' })}
                      />
                      <span>نقدي</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                      <input
                        type="radio"
                        name="payment_terms"
                        checked={newInvoice.payment_terms === 'credit'}
                        onChange={() => setNewInvoice({ ...newInvoice, payment_terms: 'credit' })}
                      />
                      <span>آجل</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Conditional Credit Due Date (Cash has NO due date) */}
              {newInvoice.payment_terms === 'credit' && (
                <div className="grid grid-cols-2 gap-3 bg-amber-50/60 p-2.5 rounded border border-amber-200">
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">تاريخ استحقاق الآجل *</label>
                    <input
                      type="date"
                      required
                      min={newInvoice.invoice_date}
                      value={newInvoice.due_date}
                      onChange={e => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                      className="w-full h-9 rounded border border-gray-300 px-3 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">عدد أيام الائتمان</label>
                    <input
                      type="number"
                      min="1"
                      value={newInvoice.credit_days}
                      onChange={e => setNewInvoice({ ...newInvoice, credit_days: e.target.value })}
                      className="w-full h-9 rounded border border-gray-300 px-3 text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Requirement E: Block saving if Credit + Balance > Credit Limit */}
              {isCreditExceeded && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-md text-red-900 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">تم إيقاف الحفظ: تجاوز الحد الائتماني للعميل!</strong>
                    <span>
                      إجمالي مديونية العميل مع هذه الفاتورة ({formatCurrency(totalBalanceAfterInvoice)}) 
                      تتجاوز الحد الائتماني المصرح به ({formatCurrency(customerCreditLimit)}) 
                      بمقدار ({formatCurrency(totalBalanceAfterInvoice - customerCreditLimit)}). 
                      يرجى تغيير طريقة السداد إلى نقدي أو تخفيض قيمة الفاتورة.
                    </span>
                  </div>
                </div>
              )}

              {/* Line Items */}
              <div className="border border-gray-200 rounded-md p-3 bg-gray-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-gray-800">أصناف الفاتورة (الملابس الجاهزة)</span>
                  <button
                    type="button"
                    onClick={() => setShowAddProductModal(true)}
                    className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ موديل غير مسجل</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {newInvoice.items.map((item, idx) => {
                    const priceBefore = parseFloat(item.unit_price_before_discount) || 0;
                    const discountVal = parseFloat(item.discount_amount) || 0;
                    const priceAfter = Math.max(0, priceBefore - discountVal);
                    const lineTotal = (parseFloat(item.quantity) || 0) * priceAfter;

                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 bg-white p-2 rounded border border-gray-200 items-end">
                        <div className="col-span-4">
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">الموديل / المنتج</label>
                          <select
                            required
                            value={item.product_id}
                            onChange={e => handleProductSelect(idx, e.target.value)}
                            className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                          >
                            <option value="">اختر الموديل...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} - السعر: {formatCurrency(p.selling_price || 0)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">الكمية</label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.quantity}
                            onChange={e => {
                              const updated = [...newInvoice.items];
                              updated[idx].quantity = e.target.value;
                              setNewInvoice({ ...newInvoice, items: updated });
                            }}
                            className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold"
                          />
                        </div>

                        {/* Price before discount */}
                        <div className="col-span-2">
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">السعر قبل الخصم</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            required
                            value={item.unit_price_before_discount}
                            onChange={e => {
                              const updated = [...newInvoice.items];
                              updated[idx].unit_price_before_discount = e.target.value;
                              setNewInvoice({ ...newInvoice, items: updated });
                            }}
                            className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold"
                          />
                        </div>

                        {/* Discount Value */}
                        <div className="col-span-1">
                          <label className="block text-[11px] font-semibold text-gray-600 mb-1">الخصم</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.discount_amount}
                            onChange={e => {
                              const updated = [...newInvoice.items];
                              updated[idx].discount_amount = e.target.value;
                              setNewInvoice({ ...newInvoice, items: updated });
                            }}
                            className="w-full h-9 rounded border border-gray-300 px-1 text-xs font-bold text-red-600"
                          />
                        </div>

                        {/* Price after discount */}
                        <div className="col-span-2 text-left">
                          <span className="block text-[10px] text-gray-400">بعد الخصم: {formatCurrency(priceAfter)}</span>
                          <span className="block text-xs font-mono font-bold text-blue-900">{formatCurrency(lineTotal)}</span>
                        </div>

                        <div className="col-span-1 text-center pb-1">
                          {newInvoice.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = newInvoice.items.filter((_, i) => i !== idx);
                                setNewInvoice({ ...newInvoice, items: updated });
                              }}
                              className="text-red-500 font-bold hover:text-red-700 text-xs"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setNewInvoice({
                    ...newInvoice,
                    items: [...newInvoice.items, { product_id: '', quantity: '1', unit_price_before_discount: '', discount_amount: '0', price_after_discount: '', product_name: '' }]
                  })}
                  className="mt-2 text-xs text-[#1F3A5F] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ إضافة صنف آخر</span>
                </button>
              </div>

              {/* Bottom Totals */}
              <div className="bg-gray-100 p-3 rounded-md border border-gray-300 flex justify-between items-center text-sm font-bold">
                <span className="text-gray-800">إجمالي قيمة الفاتورة النهائي:</span>
                <span className="text-lg text-[#1F3A5F] font-mono font-black">{formatCurrency(invoiceGrandTotal)}</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddInvoiceModal(false)}
                  className="h-11 px-5 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!newInvoice.customer_id || invoiceGrandTotal <= 0 || isCreditExceeded}
                  className="h-11 px-6 bg-[#1F3A5F] hover:bg-[#172c48] disabled:opacity-50 text-white rounded font-bold text-sm shadow-sm"
                >
                  حفظ واعتماد الفاتورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK CUSTOMER MODAL */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-md w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">إضافة عميل جديد</h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
                <FieldError error={customerFormErrors.name} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">الهاتف</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={11}
                    value={newCustomer.phone}
                    onChange={e => {
                      const digits = sanitizeEgyptianPhoneInput(e.target.value);
                      setNewCustomer({ ...newCustomer, phone: digits === '' ? DEFAULT_PHONE_VALUE : digits });
                    }}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-mono text-left"
                  />
                  <FieldError error={customerFormErrors.phone} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">الحد الائتماني (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newCustomer.credit_limit}
                    onChange={e => setNewCustomer({ ...newCustomer, credit_limit: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold text-blue-900"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 p-3 bg-emerald-50/60 border border-emerald-200 rounded">
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">رصيد أول المدة (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    dir="ltr"
                    value={newCustomer.opening_balance}
                    onChange={e => setNewCustomer({ ...newCustomer, opening_balance: e.target.value })}
                    className="w-full h-10 rounded border border-emerald-300 px-3 font-bold text-left bg-white"
                  />
                  <FieldError error={customerFormErrors.opening_balance} />
                </div>
                <div>
                  <label className="block font-bold text-emerald-900 mb-1">طبيعة الحساب</label>
                  <select
                    value={newCustomer.opening_balance_type}
                    onChange={e => setNewCustomer({ ...newCustomer, opening_balance_type: e.target.value })}
                    className="w-full h-10 rounded border border-emerald-300 px-2 bg-white font-bold"
                  >
                    <option value="debit">مدين (مستحق عليه)</option>
                    <option value="credit">دائن (دفعة مقدمة منه)</option>
                  </select>
                </div>
                <p className="col-span-2 text-[11px] text-emerald-700 font-medium">
                  الرصيد الحالي = رصيد أول المدة + فواتير البيع الآجلة − سندات القبض النقدية.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  حفظ العميل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK PRODUCT MODAL */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-md w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">إضافة موديل ملابس جديد</h3>
              <button onClick={() => setShowAddProductModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveQuickProduct} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">اسم الموديل *</label>
                <input
                  type="text"
                  required
                  value={newQuickProduct.name}
                  onChange={e => setNewQuickProduct({ ...newQuickProduct, name: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">سعر البيع الافتراضي</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newQuickProduct.selling_price}
                    onChange={e => setNewQuickProduct({ ...newQuickProduct, selling_price: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">سعر التكلفة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newQuickProduct.cost_price}
                    onChange={e => setNewQuickProduct({ ...newQuickProduct, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  حفظ الموديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CUSTOMER RETURNS (Requirement E: Free Return vs Return against original invoice) */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-xl w-full border border-gray-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تسجيل مرتجع مبيعات ملابس</h3>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              إرجاع البضاعة يعيد الكميات لرصيد المخزن تلقائياً، ويخصم القيمة من حساب العميل (آجل) أو يصرفها كاش من خزينة المنفذ (نقدي).
            </p>

            <form onSubmit={handleSaveReturn} className="space-y-3.5 text-xs">
              {/* Return Type: Against Invoice vs Free */}
              <div className="p-3 bg-gray-50 rounded border border-gray-200">
                <label className="block font-bold text-gray-800 mb-2">نوع المرتجع *</label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-900">
                    <input
                      type="radio"
                      name="return_type"
                      checked={returnForm.return_type === 'invoice'}
                      onChange={() => setReturnForm({ ...returnForm, return_type: 'invoice' })}
                    />
                    <span>مرتجع مرتبط بفاتورة مبيعات أصلية</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-gray-900">
                    <input
                      type="radio"
                      name="return_type"
                      checked={returnForm.return_type === 'free'}
                      onChange={() => setReturnForm({ ...returnForm, return_type: 'free', invoice_id: '', max_return_qty: 999 })}
                    />
                    <span>مرتجع حر (بدون فاتورة أصلية)</span>
                  </label>
                </div>
              </div>

              {/* If Against Invoice: Invoice selector */}
              {returnForm.return_type === 'invoice' && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">اختر الفاتورة الأصلية (البحث برقم الفاتورة) *</label>
                  <select
                    required
                    value={returnForm.invoice_id}
                    onChange={e => {
                      const inv = invoices.find(i => String(i.id) === String(e.target.value));
                      if (inv) {
                        const firstItem = inv.items?.[0];
                        setReturnForm({
                          ...returnForm,
                          invoice_id: inv.id,
                          customer_id: inv.customer_id,
                          outlet_id: inv.outlet_id || '1',
                          product_id: firstItem ? firstItem.product_id : '',
                          unit_price: firstItem ? (firstItem.price_after_discount || firstItem.unit_selling_price || 0) : '0',
                          max_return_qty: firstItem ? parseFloat(firstItem.quantity) : 999,
                          refund_method: inv.payment_terms === 'cash' ? 'cash_out' : 'deduct_balance'
                        });
                      }
                    }}
                    className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                  >
                    <option value="">اختر الفاتورة...</option>
                    {invoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} - {inv.customer_name} ({formatDate(inv.invoice_date)}) - {formatCurrency(inv.total_amount)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Customer Selector */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">العميل *</label>
                <select
                  required
                  value={returnForm.customer_id}
                  onChange={e => setReturnForm({ ...returnForm, customer_id: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                >
                  <option value="">اختر العميل...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Product Selector */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">الصنف المرتجع *</label>
                <select
                  required
                  value={returnForm.product_id}
                  onChange={e => {
                    const prod = products.find(p => String(p.id) === String(e.target.value));
                    setReturnForm({
                      ...returnForm,
                      product_id: e.target.value,
                      unit_price: prod ? prod.selling_price : returnForm.unit_price
                    });
                  }}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                >
                  <option value="">اختر الموديل المراد إرجاعه...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    الكمية المرتجعة * {returnForm.return_type === 'invoice' && `(الحد الأقصى: ${returnForm.max_return_qty})`}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={returnForm.max_return_qty}
                    required
                    value={returnForm.quantity}
                    onChange={e => setReturnForm({ ...returnForm, quantity: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">سعر الوحدة المرتجعة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={returnForm.unit_price}
                    onChange={e => setReturnForm({ ...returnForm, unit_price: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 font-bold"
                  />
                </div>
              </div>

              {/* Refund Method */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">طريقة التسوية المالية *</label>
                <select
                  value={returnForm.refund_method}
                  onChange={e => setReturnForm({ ...returnForm, refund_method: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                >
                  <option value="deduct_balance">خصم من رصيد ومديونية العميل (فاتورة آجلة)</option>
                  <option value="cash_out">رد نقدي فوري من خزينة منفذ البيع (فاتورة نقدية)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">سبب المرتجع *</label>
                <input
                  type="text"
                  required
                  value={returnForm.reason}
                  onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white rounded font-bold"
                >
                  إثبات المرتجع واستعادة المخزون
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINTABLE INVOICE (A4 & Thermal Receipt 80mm Layouts) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-3xl w-full border border-gray-300 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-gray-900">معاينة وطباعة الفاتورة</h3>
                {/* Layout Switcher */}
                <div className="flex items-center bg-gray-100 p-1 rounded-md text-xs font-semibold">
                  <button
                    onClick={() => setPrintLayout('a4')}
                    className={`px-3 py-1 rounded cursor-pointer ${printLayout === 'a4' ? 'bg-[#1F3A5F] text-white' : 'text-gray-700'}`}
                  >
                    نموذج ورقي كامل
                  </button>
                  <button
                    onClick={() => setPrintLayout('thermal')}
                    className={`px-3 py-1 rounded cursor-pointer ${printLayout === 'thermal' ? 'bg-[#1F3A5F] text-white' : 'text-gray-700'}`}
                  >
                    إيصال حراري
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => triggerPrint()}
                  className="h-9 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الآن</span>
                </button>
                <button
                  onClick={() => setShowPrintModal(null)}
                  className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-semibold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* A4 INVOICE LAYOUT */}
            {printLayout === 'a4' && (
              <div className="p-6 bg-white border border-gray-300 rounded shadow-sm space-y-5 text-sm" id="printable-invoice-a4">
                <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-4">
                  <div>
                    <h1 className="text-2xl font-black text-[#1F3A5F]">مصنع ومتاجر الملابس الجاهزة</h1>
                    <p className="text-xs text-gray-500 mt-1">سجل تجاري: 94821 • بطاقة ضريبية: 391-482-109</p>
                    <p className="text-xs text-gray-500">القاهرة - المنطقة الصناعية • تليفون: 01000000000</p>
                  </div>
                  <div className="text-left font-mono">
                    <div className="text-lg font-bold text-gray-900">فاتورة مبيعات ضريبية</div>
                    <div className="text-sm font-black text-[#1F3A5F]">{showPrintModal.invoice_number}</div>
                    <div className="text-xs text-gray-500 mt-1">التاريخ: {formatDate(showPrintModal.invoice_date)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded border border-gray-200 text-xs">
                  <div>
                    <span className="text-gray-500 block">بيانات العميل:</span>
                    <strong className="text-sm text-gray-900 block mt-0.5">{showPrintModal.customer_name}</strong>
                    <span className="text-gray-600 block">{showPrintModal.customer_phone || ''}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-gray-500 block">شروط الدفع والمنفذ:</span>
                    <strong className="text-sm text-gray-900 block mt-0.5">
                      {showPrintModal.payment_terms === 'cash' ? 'نقدي فوري' : `آجل (استحقاق: ${formatDate(showPrintModal.due_date)})`}
                    </strong>
                    <span className="text-gray-600 block">المنفذ: {showPrintModal.outlet_name || 'الرئيسي'}</span>
                  </div>
                </div>

                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-[#1F3A5F] text-white font-bold">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">الموديل / البيان</th>
                      <th className="py-2.5 px-3 text-center">الكمية</th>
                      <th className="py-2.5 px-3 text-left">السعر قبل الخصم</th>
                      <th className="py-2.5 px-3 text-left">الخصم</th>
                      <th className="py-2.5 px-3 text-left">السعر الصافي</th>
                      <th className="py-2.5 px-3 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 border-b border-gray-200">
                    {(showPrintModal.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3 font-bold">{it.product_name}</td>
                        <td className="py-2 px-3 text-center font-bold">{it.quantity}</td>
                        <td className="py-2 px-3 text-left font-mono">{formatCurrency(it.unit_price_before_discount || it.unit_selling_price || 0)}</td>
                        <td className="py-2 px-3 text-left font-mono text-red-600">{formatCurrency(it.discount_amount || 0)}</td>
                        <td className="py-2 px-3 text-left font-mono">{formatCurrency(it.price_after_discount || it.unit_selling_price || 0)}</td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-gray-900">{formatCurrency(it.line_total || (it.quantity * (it.price_after_discount || it.unit_selling_price || 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end">
                  <div className="w-64 bg-gray-50 p-3 rounded border border-gray-200 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-sm font-black text-[#1F3A5F] pt-1">
                      <span>إجمالي الفاتورة:</span>
                      <span className="font-mono">{formatCurrency(showPrintModal.total_amount)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-3 text-center text-[11px] text-gray-500">
                  البضاعة المباعة ترد وتستبدل خلال 14 يوماً بالفاتورة الأصلية وبحالتها الأصلية. شكراً لتعاملكم معنا!
                </div>
              </div>
            )}

            {/* THERMAL RECEIPT (80mm) LAYOUT */}
            {printLayout === 'thermal' && (
              <div className="max-w-[320px] mx-auto p-4 bg-white border border-dashed border-gray-400 rounded font-mono text-xs space-y-3" id="printable-thermal">
                <div className="text-center border-b border-dashed border-gray-400 pb-2">
                  <div className="font-bold text-sm">مصنع ومتاجر الملابس</div>
                  <div className="text-[10px] text-gray-600">إيصال كاشير معتمد</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{formatDate(showPrintModal.invoice_date)}</div>
                  <div className="font-bold text-xs mt-1">فاتورة: {showPrintModal.invoice_number}</div>
                </div>

                <div className="text-[10px] border-b border-dashed border-gray-400 pb-2 space-y-0.5">
                  <div>العميل: {showPrintModal.customer_name}</div>
                  <div>الدفع: {showPrintModal.payment_terms === 'cash' ? 'نقدي' : 'آجل'}</div>
                  <div>الفرع: {showPrintModal.outlet_name || 'المنفذ 1'}</div>
                </div>

                <div className="space-y-1.5 border-b border-dashed border-gray-400 pb-2">
                  {(showPrintModal.items || []).map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <div>
                        <div>{it.product_name}</div>
                        <div className="text-[9px] text-gray-500">{it.quantity} × {it.price_after_discount || it.unit_selling_price} ج.م</div>
                      </div>
                      <div className="font-bold">
                        {it.line_total || (it.quantity * (it.price_after_discount || it.unit_selling_price || 0))} ج.م
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center text-xs font-black pt-1">
                  <span>الإجمالي:</span>
                  <span>{formatCurrency(showPrintModal.total_amount)}</span>
                </div>

                <div className="text-center text-[9px] text-gray-500 border-t border-dashed border-gray-400 pt-2">
                  *** يسعدنا زيارتكم دائماً ***
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
