import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Receipt, 
  DollarSign, 
  Users, 
  Store, 
  Globe, 
  RotateCcw, 
  Download, 
  Printer,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Search,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString, isPastDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function SalesModule({ onBack, onNotify }) {
  const [tab, setTab] = useState('invoices'); // 'invoices' | 'customers' | 'outlets'
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [products, setProducts] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showAddOutletModal, setShowAddOutletModal] = useState(false);
  const [showCollectModal, setShowCollectModal] = useState(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedCustomerStatement, setSelectedCustomerStatement] = useState(null);
  const [statementData, setStatementData] = useState(null);

  // Forms
  const [newInvoice, setNewInvoice] = useState({
    customer_id: '',
    outlet_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    is_export: false,
    currency: 'EGP',
    exchange_rate: 1.0,
    shipping_expense: '0',
    customs_expense: '0',
    commission_expense: '0',
    items: [{ product_id: '', quantity: '1', unit_selling_price: '' }],
    notes: ''
  });

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    address: '',
    tax_number: '',
    customer_type: 'local',
    payment_terms: 'cash',
    credit_limit: '',
    notes: ''
  });

  const [newOutlet, setNewOutlet] = useState({
    name: '',
    location: '',
    contact_phone: '',
    price_markup_percent: 0,
    notes: ''
  });

  const [collectForm, setCollectForm] = useState({
    customer_id: '',
    invoice_id: '',
    account_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: ''
  });

  const [returnForm, setReturnForm] = useState({
    customer_id: '',
    invoice_id: '',
    product_id: '',
    quantity: '1',
    refund_amount: '0',
    refund_method: 'deduct_balance',
    return_date: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, custRes, outRes, prodRes, accRes, setRes] = await Promise.all([
        api.getSalesInvoices(),
        api.getCustomers(),
        api.getOutlets(),
        api.getProducts(),
        api.getAccounts(),
        api.getSettings()
      ]);
      setInvoices(invRes.data || []);
      setCustomers(custRes.data || []);
      setOutlets(outRes.data || []);
      setProducts(prodRes.data || []);
      setTreasuryAccounts(accRes.data?.accounts || accRes.data || accRes.accounts || []);
      setSettings(setRes.data || null);
    } catch (err) {
      console.error('Failed to load sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    if (!newInvoice.customer_id) {
      alert('يرجى اختيار العميل');
      return;
    }
    if (newInvoice.invoice_date && isPastDate(newInvoice.invoice_date)) {
      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
      return;
    }
    if (newInvoice.due_date && newInvoice.due_date < (newInvoice.invoice_date || getTodayDateString())) {
      alert('تاريخ استحقاق الفاتورة لا يمكن أن يكون قبل تاريخ الفاتورة');
      return;
    }
    const validItems = newInvoice.items.filter(it => it.product_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      alert('يرجى إضافة صنف مباع واحد على الأقل مع الكمية وسعر البيع');
      return;
    }
    try {
      const res = await api.createSalesInvoice({
        ...newInvoice,
        items: validItems
      });
      onNotify(res.message);
      setShowAddInvoiceModal(false);
      setNewInvoice({
        customer_id: '',
        outlet_id: '',
        invoice_date: getTodayDateString(),
        due_date: '',
        is_export: false,
        currency: 'EGP',
        exchange_rate: 1.0,
        shipping_expense: '0',
        customs_expense: '0',
        commission_expense: '0',
        items: [{ product_id: '', quantity: '1', unit_selling_price: '' }],
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createCustomer(newCustomer);
      onNotify(res.message);
      setShowAddCustomerModal(false);
      setNewCustomer({ name: '', phone: '', address: '', tax_number: '', customer_type: 'local', payment_terms: 'cash', credit_limit: '', notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveOutlet = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createOutlet(newOutlet);
      onNotify(res.message);
      setShowAddOutletModal(false);
      setNewOutlet({ name: '', location: '', contact_phone: '', price_markup_percent: 0, notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveCollection = async (e) => {
    e.preventDefault();
    if (collectForm.payment_date && isPastDate(collectForm.payment_date)) {
      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
      return;
    }
    try {
      const res = await api.collectCustomerPayment(collectForm);
      onNotify(res.message);
      setShowCollectModal(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveReturn = async (e) => {
    e.preventDefault();
    if (returnForm.return_date && isPastDate(returnForm.return_date)) {
      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
      return;
    }
    try {
      const res = await api.createCustomerReturn(returnForm);
      onNotify(res.message);
      setShowReturnModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleViewStatement = async (customerId) => {
    try {
      setSelectedCustomerStatement(customerId);
      const res = await api.getCustomerStatement(customerId);
      setStatementData(res.data);
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredInvoices = invoices.filter(inv =>
    (inv.customer_name && inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (inv.invoice_number && inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      {/* Top Bar with Back Button and Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">المبيعات والعملاء</h2>
            <span className="text-xs text-gray-500 font-medium">فواتير البيع والتصدير، حسابات المعارض، والتحصيل</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'invoices', label: 'فواتير المبيعات' },
            { id: 'customers', label: 'سجل العملاء والمعارض' },
            { id: 'outlets', label: 'منافذ البيع' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md font-bold text-sm transition-colors cursor-pointer ${
                tab === t.id
                  ? 'bg-[#1F3A5F] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: SALES INVOICES */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="ابحث برقم الفاتورة أو اسم العميل..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReturnModal(true)}
                className="h-10 px-3.5 bg-white hover:bg-red-50 text-red-600 rounded-md font-semibold text-sm border border-red-200 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>مرتجع مبيعات</span>
              </button>
              <button
                onClick={() => setShowAddInvoiceModal(true)}
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ فاتورة بيع جديدة</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم الفاتورة</th>
                    <th className="py-3 px-4">العميل</th>
                    <th className="py-3 px-4">منفذ البيع</th>
                    <th className="py-3 px-4">تاريخ البيع</th>
                    <th className="py-3 px-4 text-left">إجمالي المطلوب</th>
                    <th className="py-3 px-4 text-left">المحصل</th>
                    <th className="py-3 px-4 text-left">المتبقي</th>
                    <th className="py-3 px-4 text-left font-bold text-green-700">صافي الربح</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد فواتير مبيعات مسجلة.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map(inv => {
                      const remaining = inv.total_invoice_amount - inv.paid_amount;
                      return (
                        <tr key={inv.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-gray-900">{inv.invoice_number}</td>
                          <td className="py-3 px-4 font-semibold text-gray-800">
                            {inv.customer_name}
                            {inv.is_export === 1 && (
                              <span className="mr-1.5 erp-badge-gray text-[10px]">تصدير</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-xs">{inv.outlet_name || 'المستودع الرئيسي'}</td>
                          <td className="py-3 px-4 text-gray-600">{formatDate(inv.invoice_date)}</td>
                          <td className="py-3 px-4 text-left font-bold text-gray-900">{formatCurrency(inv.total_invoice_amount)}</td>
                          <td className="py-3 px-4 text-left font-semibold text-green-700">{formatCurrency(inv.paid_amount)}</td>
                          <td className="py-3 px-4 text-left font-bold text-red-600">
                            {remaining > 0 ? formatCurrency(remaining) : '0 ج.م'}
                          </td>
                          <td className="py-3 px-4 text-left font-bold text-green-700">
                            +{formatCurrency(inv.net_profit)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {inv.status === 'paid' ? (
                              <span className="erp-badge-green text-xs">محصلة بالكامل ✓</span>
                            ) : inv.status === 'partially_paid' ? (
                              <span className="erp-badge-gray text-xs">محصلة جزئياً</span>
                            ) : (
                              <span className="erp-badge-red text-xs">آجل غير محصل</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {inv.status !== 'paid' && (
                              <button
                                onClick={() => {
                                  setCollectForm({
                                    customer_id: inv.customer_id,
                                    invoice_id: inv.id,
                                    account_id: treasuryAccounts[0]?.id || '',
                                    amount: String(remaining),
                                    payment_date: new Date().toISOString().split('T')[0],
                                    payment_method: 'cash',
                                    notes: `تحصيل فاتورة ${inv.invoice_number}`
                                  });
                                  setShowCollectModal(inv);
                                }}
                                className="px-3 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                              >
                                تحصيل
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
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
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="ابحث باسم العميل أو المعرض..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            <button
              onClick={() => setShowAddCustomerModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ ضيف عميل جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">اسم العميل</th>
                    <th className="py-3 px-4">رقم التليفون</th>
                    <th className="py-3 px-4">العنوان</th>
                    <th className="py-3 px-4">النوع</th>
                    <th className="py-3 px-4 text-left">إجمالي المبيعات</th>
                    <th className="py-3 px-4 text-left">المحصل منه</th>
                    <th className="py-3 px-4 text-left">المتبقي عليه</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                        لا يوجد عملاء مطابقين للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map(cust => (
                      <tr key={cust.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-900">{cust.name}</td>
                        <td className="py-3 px-4 font-mono text-gray-600" dir="ltr">{cust.phone || '-'}</td>
                        <td className="py-3 px-4 text-gray-500 text-xs">{cust.address || '-'}</td>
                        <td className="py-3 px-4">
                          <span className="erp-badge-gray text-xs">
                            {cust.customer_type === 'export' ? 'عميل تصدير' : 'محلي'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-left font-semibold text-gray-800">{formatCurrency(cust.total_sales)}</td>
                        <td className="py-3 px-4 text-left font-semibold text-green-700">{formatCurrency(cust.total_collected)}</td>
                        <td className="py-3 px-4 text-left font-bold">
                          <span className={cust.outstanding_balance > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(cust.outstanding_balance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewStatement(cust.id)}
                              className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 rounded border border-gray-300 text-xs font-semibold cursor-pointer"
                            >
                              كشف حساب
                            </button>
                            <button
                              onClick={() => {
                                setCollectForm({
                                  customer_id: cust.id,
                                  invoice_id: '',
                                  account_id: treasuryAccounts[0]?.id || '',
                                  amount: cust.outstanding_balance > 0 ? String(cust.outstanding_balance) : '',
                                  payment_date: new Date().toISOString().split('T')[0],
                                  payment_method: 'cash',
                                  notes: ''
                                });
                                setShowCollectModal(cust);
                              }}
                              className="px-2.5 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                            >
                              تحصيل
                            </button>
                          </div>
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

      {/* TAB 3: OUTLETS */}
      {tab === 'outlets' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">معارض ومنافذ البيع</h3>
              <p className="text-xs text-gray-500 font-medium">متابعة مبيعات كل فرع ونسبة زيادة الأسعار</p>
            </div>
            <button
              onClick={() => setShowAddOutletModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة معرض جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">اسم المعرض / المنفذ</th>
                    <th className="py-3 px-4">الموقع</th>
                    <th className="py-3 px-4">رقم التليفون</th>
                    <th className="py-3 px-4 text-center">زيادة السعر %</th>
                    <th className="py-3 px-4 text-left">إجمالي المبيعات</th>
                    <th className="py-3 px-4 text-left font-bold text-green-700">صافي الأرباح</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {outlets.map(out => (
                    <tr key={out.id} className="hover:bg-blue-50/20 transition-colors">
                      <td className="py-3 px-4 font-bold text-gray-900">{out.name}</td>
                      <td className="py-3 px-4 text-gray-600">{out.location || 'الفرع الرئيسي'}</td>
                      <td className="py-3 px-4 font-mono text-gray-600" dir="ltr">{out.contact_phone || '-'}</td>
                      <td className="py-3 px-4 text-center font-bold text-gray-800">
                        {out.price_markup_percent > 0 ? `+${out.price_markup_percent}%` : '0%'}
                      </td>
                      <td className="py-3 px-4 text-left font-semibold text-gray-800">{formatCurrency(out.total_revenue)}</td>
                      <td className="py-3 px-4 text-left font-bold text-green-700">+{formatCurrency(out.total_profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD SALES INVOICE */}
      {showAddInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-3xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تسجيل فاتورة بيع جديدة</h3>
              <button onClick={() => setShowAddInvoiceModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم التحقق من رصيد البضاعة الجاهزة للبيع وخصمها واحتساب تكلفة الخامات والأرباح تلقائياً
            </p>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">العميل *</label>
                  <select
                    required
                    value={newInvoice.customer_id}
                    onChange={e => setNewInvoice({ ...newInvoice, customer_id: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="">اختر العميل...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">المعرض أو منفذ البيع</label>
                  <select
                    value={newInvoice.outlet_id}
                    onChange={e => setNewInvoice({ ...newInvoice, outlet_id: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="">المنفذ المركزي / المستودع الرئيسي</option>
                    {outlets.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الفاتورة</label>
                  <input
                    type="date"
                    min={getTodayDateString()}
                    value={newInvoice.invoice_date}
                    onChange={e => {
                      if (isPastDate(e.target.value)) {
                        alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
                        return;
                      }
                      setNewInvoice({ ...newInvoice, invoice_date: e.target.value });
                    }}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ميعاد الاستحقاق</label>
                  <input
                    type="date"
                    min={newInvoice.invoice_date || getTodayDateString()}
                    value={newInvoice.due_date}
                    onChange={e => {
                      if (newInvoice.invoice_date && e.target.value < newInvoice.invoice_date) {
                        alert('تاريخ استحقاق الفاتورة لا يمكن أن يكون قبل تاريخ الفاتورة');
                        return;
                      }
                      setNewInvoice({ ...newInvoice, due_date: e.target.value });
                    }}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="border-t border-gray-200 pt-3">
                <label className="block text-sm font-bold text-gray-800 mb-2">الأصناف المباعة *</label>
                {newInvoice.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-3 mb-2 bg-gray-50 p-2.5 rounded-md border border-gray-200">
                    <div>
                      <select
                        required
                        value={item.product_id}
                        onChange={e => {
                          const items = [...newInvoice.items];
                          items[idx].product_id = e.target.value;
                          const p = products.find(prod => prod.id === e.target.value);
                          if (p && !items[idx].unit_selling_price) {
                            items[idx].unit_selling_price = String(p.suggested_selling_price || '');
                          }
                          setNewInvoice({ ...newInvoice, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      >
                        <option value="">اختر المنتج المباع...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} (المتاح: {p.current_finished_stock} {p.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="الكمية المباعة"
                        value={item.quantity}
                        onChange={e => {
                          const items = [...newInvoice.items];
                          items[idx].quantity = e.target.value;
                          setNewInvoice({ ...newInvoice, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="سعر بيع القطعة (جنيه)"
                        value={item.unit_selling_price}
                        onChange={e => {
                          const items = [...newInvoice.items];
                          items[idx].unit_selling_price = e.target.value;
                          setNewInvoice({ ...newInvoice, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNewInvoice({ ...newInvoice, items: [...newInvoice.items, { product_id: '', quantity: '1', unit_selling_price: '' }] })}
                  className="text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer"
                >
                  + إضافة صنف آخر
                </button>
              </div>

              {/* Selling Expenses */}
              <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                <h4 className="font-bold text-xs text-gray-800 mb-2">مصاريف البيع والتوصيل (تخصم من صافي الربح)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">مصاريف الشحن</label>
                    <input
                      type="number"
                      min="0"
                      value={newInvoice.shipping_expense}
                      onChange={e => setNewInvoice({ ...newInvoice, shipping_expense: e.target.value })}
                      className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">جمارك (للتصدير)</label>
                    <input
                      type="number"
                      min="0"
                      value={newInvoice.customs_expense}
                      onChange={e => setNewInvoice({ ...newInvoice, customs_expense: e.target.value })}
                      className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">عمولة بيع وسيط</label>
                    <input
                      type="number"
                      min="0"
                      value={newInvoice.commission_expense}
                      onChange={e => setNewInvoice({ ...newInvoice, commission_expense: e.target.value })}
                      className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Export details */}
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-xs text-gray-800">
                  <input
                    type="checkbox"
                    checked={newInvoice.is_export}
                    onChange={e => setNewInvoice({ ...newInvoice, is_export: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span>فاتورة تصدير للخارج (معفاة من الضريبة المحلية)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddInvoiceModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ الفاتورة واحتساب الربح ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD CUSTOMER */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة عميل أو معرض جديد</h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">اسم العميل أو المعرض *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: معرض قصر الموبيليا"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">رقم التليفون *</label>
                <input
                  type="text"
                  required
                  placeholder="01011223344"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">نوع العميل</label>
                  <select
                    value={newCustomer.customer_type}
                    onChange={e => setNewCustomer({ ...newCustomer, customer_type: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="local">محلي</option>
                    <option value="export">تصدير خارجي</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة التعامل</label>
                  <select
                    value={newCustomer.payment_terms}
                    onChange={e => setNewCustomer({ ...newCustomer, payment_terms: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="cash">كاش فوري</option>
                    <option value="credit">آجل</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ العميل ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: COLLECT PAYMENT */}
      {showCollectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تحصيل نقدية من العميل</h3>
              <button onClick={() => setShowCollectModal(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم إضافة المبلغ فوراً إلى الخزنة أو الحساب البنكي وتسجيل سند قبض
            </p>

            <form onSubmit={handleSaveCollection} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">الإيداع في خزنة / بنك *</label>
                <select
                  required
                  value={collectForm.account_id}
                  onChange={e => setCollectForm({ ...collectForm, account_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الخزنة...</option>
                  {treasuryAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المحصل (جنيه) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={collectForm.amount}
                  onChange={e => setCollectForm({ ...collectForm, amount: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-base font-bold text-green-700 focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ التحصيل</label>
                <input
                  type="date"
                  min={getTodayDateString()}
                  value={collectForm.payment_date}
                  onChange={e => {
                    if (isPastDate(e.target.value)) {
                      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
                      return;
                    }
                    setCollectForm({ ...collectForm, payment_date: e.target.value });
                  }}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(null)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  إثبات القبض وزيادة الخزنة ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: SALES RETURN */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">مرتجع مبيعات من العميل</h3>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              إعادة القطع الجاهزة للمخزن وتسوية حساب العميل
            </p>

            <form onSubmit={handleSaveReturn} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">العميل *</label>
                <select
                  required
                  value={returnForm.customer_id}
                  onChange={e => setReturnForm({ ...returnForm, customer_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر العميل...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المنتج المرتجع *</label>
                <select
                  required
                  value={returnForm.product_id}
                  onChange={e => setReturnForm({ ...returnForm, product_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المنتج...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">الكمية المرتجعة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={returnForm.quantity}
                    onChange={e => setReturnForm({ ...returnForm, quantity: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المردود (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={returnForm.refund_amount}
                    onChange={e => setReturnForm({ ...returnForm, refund_amount: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">سبب المرتجع</label>
                <input
                  type="text"
                  placeholder="مثال: تبديل مقاس أو عيب تشطيب"
                  value={returnForm.reason}
                  onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ المرتجع</label>
                <input
                  type="date"
                  min={getTodayDateString()}
                  value={returnForm.return_date}
                  onChange={e => {
                    if (isPastDate(e.target.value)) {
                      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
                      return;
                    }
                    setReturnForm({ ...returnForm, return_date: e.target.value });
                  }}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  تسجيل المرتجع ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: CUSTOMER STATEMENT */}
      {selectedCustomerStatement && statementData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-4xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  كشف حساب: {statementData.customer?.name || 'العميل'}
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  تليفون: {statementData.customer?.phone || '-'} | النوع: {statementData.customer?.customer_type || '-'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="h-9 px-3 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-xs border border-gray-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  onClick={() => setSelectedCustomerStatement(null)}
                  className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-semibold text-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Numbers Summary */}
            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200 text-center">
                <span className="text-xs font-semibold text-gray-500">إجمالي المبيعات</span>
                <div className="text-xl font-bold text-gray-900 mt-0.5">
                  {formatCurrency(statementData.summary?.total_sales || 0)}
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded-md border border-green-200 text-center">
                <span className="text-xs font-semibold text-green-700">إجمالي المحصل</span>
                <div className="text-xl font-bold text-green-700 mt-0.5">
                  {formatCurrency(statementData.summary?.total_collected || 0)}
                </div>
              </div>
              <div className="bg-red-50 p-3 rounded-md border border-red-200 text-center">
                <span className="text-xs font-semibold text-red-700">المتبقي عليه طرفنا</span>
                <div className="text-xl font-bold text-red-600 mt-0.5">
                  {formatCurrency(statementData.summary?.remaining_balance || 0)}
                </div>
              </div>
            </div>

            {/* Invoices List */}
            <h4 className="text-sm font-bold text-gray-800 mb-2">سجل الفواتير الصادرة</h4>
            <div className="border border-gray-200 rounded-md overflow-hidden mb-5">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2 px-3">رقم الفاتورة</th>
                    <th className="py-2 px-3">التاريخ</th>
                    <th className="py-2 px-3 text-left">الإجمالي</th>
                    <th className="py-2 px-3 text-left">المحصل</th>
                    <th className="py-2 px-3 text-left">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(!statementData.invoices || statementData.invoices.length === 0) ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-400">لا توجد فواتير مسجلة</td>
                    </tr>
                  ) : (
                    statementData.invoices.map(inv => (
                      <tr key={inv.id}>
                        <td className="py-2 px-3 font-mono font-bold">{inv.invoice_number}</td>
                        <td className="py-2 px-3 text-gray-600">{formatDate(inv.invoice_date)}</td>
                        <td className="py-2 px-3 text-left font-semibold text-gray-900">{formatCurrency(inv.total_invoice_amount)}</td>
                        <td className="py-2 px-3 text-left font-semibold text-green-700">{formatCurrency(inv.paid_amount)}</td>
                        <td className="py-2 px-3 text-left font-bold text-red-600">{formatCurrency(inv.total_invoice_amount - inv.paid_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
