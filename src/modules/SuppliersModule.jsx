import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Truck, 
  FileText, 
  DollarSign, 
  AlertTriangle, 
  RotateCcw, 
  Eye, 
  Check, 
  Phone, 
  MapPin,
  Clock,
  Printer, 
  Download,
  Search,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function SuppliersModule({ onBack, onNotify }) {
  const [tab, setTab] = useState('suppliers'); // 'suppliers' | 'orders' | 'grn' | 'invoices'
  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [selectedSupplierForStatement, setSelectedSupplierForStatement] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [showAddPOModal, setShowAddPOModal] = useState(false);
  const [showAddGRNModal, setShowAddGRNModal] = useState(false);
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(null); // invoice or supplier object
  const [showReturnModal, setShowReturnModal] = useState(false);

  // Forms state
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    address: '',
    tax_number: '',
    payment_terms: 'cash',
    credit_limit: '',
    notes: ''
  });

  const [newPO, setNewPO] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_date: '',
    notes: '',
    items: [{ material_id: '', quantity_ordered: '', unit_price: '' }]
  });

  const [newGRN, setNewGRN] = useState({
    supplier_id: '',
    po_id: '',
    receipt_date: new Date().toISOString().split('T')[0],
    receiver_name: 'أمين المخزن',
    notes: '',
    items: [{ material_id: '', quantity_received: '', unit_cost: '' }]
  });

  const [newInvoice, setNewInvoice] = useState({
    supplier_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    subtotal: '',
    tax_amount: '0',
    notes: ''
  });

  const [paymentForm, setPaymentForm] = useState({
    supplier_id: '',
    invoice_id: '',
    account_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    notes: ''
  });

  const [returnForm, setReturnForm] = useState({
    supplier_id: '',
    material_id: '',
    quantity: '',
    unit_cost: '',
    return_date: new Date().toISOString().split('T')[0],
    reason: ''
  });

  // Data lists
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [supRes, matRes, accRes] = await Promise.all([
        api.getSuppliers(),
        api.getRawMaterials(),
        api.getAccounts()
      ]);
      setSuppliers(supRes.data || supRes.suppliers || []);
      setRawMaterials(matRes.data || matRes.materials || []);
      setTreasuryAccounts(accRes.data?.accounts || accRes.data || accRes.accounts || []);

      if (tab === 'orders') {
        const oRes = await api.getPurchaseOrders();
        setOrders(oRes.data || []);
      } else if (tab === 'grn') {
        const gRes = await api.getGoodsReceipts();
        setGrns(gRes.data || []);
      } else if (tab === 'invoices') {
        const iRes = await api.getSupplierInvoices();
        setInvoices(iRes.data || []);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  // Handle Create Supplier
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createSupplier(newSupplier);
      onNotify(res.message);
      setShowAddSupplierModal(false);
      setNewSupplier({ name: '', phone: '', address: '', tax_number: '', payment_terms: 'cash', credit_limit: '', notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // View Statement
  const handleViewStatement = async (supplierId) => {
    try {
      setSelectedSupplierForStatement(supplierId);
      const res = await api.getSupplierStatement(supplierId);
      setStatementData(res.data);
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle PO
  const handleSavePO = async (e) => {
    e.preventDefault();
    const todayStr = new Date().toISOString().split('T')[0];
    if (newPO.order_date && newPO.order_date < todayStr) {
      alert('تاريخ الطلب لا يمكن أن يكون في يوم مضى (تاريخ فات)؛ اختر تاريخ اليوم أو تاريخاً قادماً');
      return;
    }
    if (newPO.expected_date && newPO.expected_date < newPO.order_date) {
      alert('تاريخ التسليم المتوقع لا يمكن أن يكون قبل تاريخ الطلب');
      return;
    }
    try {
      const res = await api.createPurchaseOrder(newPO);
      onNotify(res.message);
      setShowAddPOModal(false);
      setNewPO({ supplier_id: '', order_date: new Date().toISOString().split('T')[0], expected_date: '', notes: '', items: [{ material_id: '', quantity_ordered: '', unit_price: '' }] });
      setTab('orders');
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle GRN
  const handleSaveGRN = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createGoodsReceipt(newGRN);
      onNotify(res.message);
      setShowAddGRNModal(false);
      setNewGRN({ supplier_id: '', po_id: '', receipt_date: new Date().toISOString().split('T')[0], receiver_name: 'أمين المخزن', notes: '', items: [{ material_id: '', quantity_received: '', unit_cost: '' }] });
      setTab('grn');
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Invoice
  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createSupplierInvoice(newInvoice);
      onNotify(res.message);
      setShowAddInvoiceModal(false);
      setNewInvoice({ supplier_id: '', invoice_number: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', subtotal: '', tax_amount: '0', notes: '' });
      setTab('invoices');
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Payment
  const handleSavePayment = async (e) => {
    e.preventDefault();
    try {
      const res = await api.paySupplier(paymentForm);
      onNotify(res.message);
      setShowPayModal(null);
      setPaymentForm({ supplier_id: '', invoice_id: '', account_id: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Return
  const handleSaveReturn = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createSupplierReturn(returnForm);
      onNotify(res.message);
      setShowReturnModal(false);
      setReturnForm({ supplier_id: '', material_id: '', quantity: '', unit_cost: '', return_date: new Date().toISOString().split('T')[0], reason: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filtered suppliers
  const safeSuppliers = Array.isArray(suppliers) ? suppliers : [];
  const filteredSuppliers = safeSuppliers.filter(s =>
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone && s.phone.includes(searchTerm))
  );

  const totalSupplierDebts = safeSuppliers.reduce((sum, s) => sum + (s.outstanding_balance || s.balance_due || 0), 0);
  const exceededCount = safeSuppliers.filter(s => s.is_credit_exceeded).length;

  return (
    <div className="space-y-6">
      {/* Top Bar with Back Button and Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">الموردين والمشتريات</h2>
            <span className="text-xs text-gray-500 font-medium">سجل الموردين، أوامر الشراء، وأذون الاستلام والفواتير</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'suppliers', label: 'سجل الموردين' },
            { id: 'orders', label: 'أوامر الشراء' },
            { id: 'grn', label: 'أذونات الاستلام (GRN)' },
            { id: 'invoices', label: 'فواتير الموردين والسداد' },
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

      {/* TAB 1: SUPPLIERS LIST */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          {/* Summary Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">إجمالي مديونيات الموردين</span>
              <div className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(totalSupplierDebts)}
              </div>
              <span className="text-xs text-gray-400 font-medium">مستحق سداده لجميع الموردين</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">عدد الموردين المسجلين</span>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {suppliers.length} مورد
              </div>
              <span className="text-xs text-gray-400 font-medium">أخشاب، دهانات، إكسسوارات</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">تجاوزوا حد الائتمان</span>
              <div className={`text-2xl font-bold mt-1 ${exceededCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {exceededCount} مورد
              </div>
              <span className="text-xs text-gray-400 font-medium">
                {exceededCount > 0 ? 'يرجى مراجعة شروط السداد' : 'جميع الموردين ضمن الحدود'}
              </span>
            </div>
          </div>

          {/* Action Row: Search + Export + Add */}
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="ابحث باسم المورد أو رقم التليفون..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const headers = ['اسم المورد', 'التليفون', 'طريقة الدفع', 'حد الائتمان', 'إجمالي المشتريات', 'المسدد', 'المتبقي'];
                  const rows = suppliers.map(s => [
                    s.name, s.phone, s.payment_terms, s.credit_limit, s.total_purchases, s.total_paid, s.outstanding_balance
                  ]);
                  exportToExcel('سجل_الموردين', headers, rows);
                }}
                className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-gray-600" />
                <span>تصدير Excel</span>
              </button>

              <button
                onClick={() => setShowAddSupplierModal(true)}
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ ضيف مورد جديد</span>
              </button>
            </div>
          </div>

          {/* Real Data Table for Suppliers */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">اسم المورد</th>
                    <th className="py-3 px-4">رقم التليفون</th>
                    <th className="py-3 px-4">العنوان</th>
                    <th className="py-3 px-4">شروط السداد</th>
                    <th className="py-3 px-4 text-left">حد الائتمان</th>
                    <th className="py-3 px-4 text-left">إجمالي المشتريات</th>
                    <th className="py-3 px-4 text-left">المسدد</th>
                    <th className="py-3 px-4 text-left">المتبقي له</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-500 font-medium">
                        لا يوجد موردين مطابقين للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map(sup => (
                      <tr key={sup.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-900">
                          <div className="flex items-center gap-2">
                            <span>{sup.name}</span>
                            {sup.is_credit_exceeded && (
                              <span className="erp-badge-red text-[11px]" title="تجاوز سقف الائتمان">
                                تجاوز الحد
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600 font-mono" dir="ltr">
                          {sup.phone || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs">
                          {sup.address || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          <span className="erp-badge-gray text-xs">
                            {sup.payment_terms === 'cash' ? 'كاش' : sup.payment_terms.replace('credit_', 'آجل ') + ' يوم'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-left font-medium text-gray-600">
                          {sup.credit_limit ? formatCurrency(sup.credit_limit) : '-'}
                        </td>
                        <td className="py-3 px-4 text-left font-semibold text-gray-800">
                          {formatCurrency(sup.total_purchases)}
                        </td>
                        <td className="py-3 px-4 text-left font-semibold text-gray-700">
                          {formatCurrency(sup.total_paid)}
                        </td>
                        <td className="py-3 px-4 text-left font-bold">
                          <span className={sup.outstanding_balance > 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(sup.outstanding_balance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewStatement(sup.id)}
                              className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 rounded border border-gray-300 text-xs font-semibold cursor-pointer"
                              title="عرض كشف حساب تفصيلي"
                            >
                              كشف حساب
                            </button>
                            <button
                              onClick={() => {
                                setPaymentForm({
                                  supplier_id: sup.id,
                                  invoice_id: '',
                                  account_id: treasuryAccounts[0]?.id || '',
                                  amount: sup.outstanding_balance > 0 ? String(sup.outstanding_balance) : '',
                                  payment_date: new Date().toISOString().split('T')[0],
                                  payment_method: 'cash',
                                  notes: ''
                                });
                                setShowPayModal(sup);
                              }}
                              className="px-2.5 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                              title="سداد دفعة للمورد"
                            >
                              سداد
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

      {/* TAB 2: PURCHASE ORDERS */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">أوامر الشراء الصادرة</h3>
              <p className="text-xs text-gray-500 font-medium">طلبات التوريد الصادرة للموردين قبل استلام الخامات</p>
            </div>
            <button
              onClick={() => setShowAddPOModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ أمر شراء جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم الأمر</th>
                    <th className="py-3 px-4">المورد</th>
                    <th className="py-3 px-4">تاريخ الطلب</th>
                    <th className="py-3 px-4">الأصناف المطلوبة</th>
                    <th className="py-3 px-4 text-left">إجمالي القيمة</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد أوامر شراء مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    orders.map(o => (
                      <tr key={o.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{o.po_number}</td>
                        <td className="py-3 px-4 font-semibold text-gray-800">{o.supplier_name}</td>
                        <td className="py-3 px-4 text-gray-600">{formatDate(o.order_date)}</td>
                        <td className="py-3 px-4">
                          {o.items?.map(it => (
                            <div key={it.id} className="text-xs text-gray-600">
                              • {it.quantity_ordered} {it.material_unit} {it.material_name}
                            </div>
                          ))}
                        </td>
                        <td className="py-3 px-4 text-left font-bold text-gray-900">{formatCurrency(o.total_amount)}</td>
                        <td className="py-3 px-4 text-center">
                          {o.status === 'received' ? (
                            <span className="erp-badge-green text-xs">تم الاستلام بالمخزن ✓</span>
                          ) : (
                            <span className="erp-badge-gray text-xs">بانتظار التوريد</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {o.status !== 'received' && (
                            <button
                              onClick={() => {
                                setNewGRN({
                                  supplier_id: o.supplier_id,
                                  po_id: o.id,
                                  receipt_date: new Date().toISOString().split('T')[0],
                                  receiver_name: 'أمين المخزن',
                                  notes: `استلام لأمر الشراء ${o.po_number}`,
                                  items: o.items.map(it => ({
                                    material_id: it.material_id,
                                    quantity_received: it.quantity_ordered,
                                    unit_cost: it.unit_price
                                  }))
                                });
                                setShowAddGRNModal(true);
                              }}
                              className="px-3 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                            >
                              استلام بالمخزن
                            </button>
                          )}
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

      {/* TAB 3: GOODS RECEIPT (GRN) */}
      {tab === 'grn' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">أذونات استلام الخامات (GRN)</h3>
              <p className="text-xs text-gray-500 font-medium">
                تحديث رصيد المخزن تلقائياً وإعادة حساب متوسط سعر الشراء المرجح
              </p>
            </div>
            <button
              onClick={() => setShowAddGRNModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ إذن استلام خامات جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم الإذن</th>
                    <th className="py-3 px-4">المورد</th>
                    <th className="py-3 px-4">تاريخ الاستلام</th>
                    <th className="py-3 px-4">المستلم</th>
                    <th className="py-3 px-4">الخامات المستلمة والأسعار</th>
                    <th className="py-3 px-4">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {grns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد أذونات استلام مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    grns.map(g => (
                      <tr key={g.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{g.grn_number}</td>
                        <td className="py-3 px-4 font-semibold text-gray-800">{g.supplier_name}</td>
                        <td className="py-3 px-4 text-gray-600">{formatDate(g.receipt_date)}</td>
                        <td className="py-3 px-4 text-gray-700">{g.receiver_name || g.receiver_user}</td>
                        <td className="py-3 px-4">
                          {g.items?.map(it => (
                            <div key={it.id} className="text-xs text-gray-700">
                              ✓ {it.quantity_received} {it.material_unit} {it.material_name} @ {formatCurrency(it.unit_cost)}
                            </div>
                          ))}
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-xs">{g.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SUPPLIER INVOICES */}
      {tab === 'invoices' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">فواتير الموردين وسداد المستحقات</h3>
              <p className="text-xs text-gray-500 font-medium">
                تسجيل الفواتير، تنبيهات مواعيد الاستحقاق، وسداد كاش أو بنك
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowReturnModal(true)}
                className="h-10 px-3.5 bg-white hover:bg-red-50 text-red-600 rounded-md font-semibold text-sm border border-red-200 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>مرتجع للمورد</span>
              </button>
              <button
                onClick={() => setShowAddInvoiceModal(true)}
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ تسجيل فاتورة مورد</span>
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم الفاتورة</th>
                    <th className="py-3 px-4">المورد</th>
                    <th className="py-3 px-4">تاريخ الفاتورة</th>
                    <th className="py-3 px-4">ميعاد السداد</th>
                    <th className="py-3 px-4 text-left">الإجمالي</th>
                    <th className="py-3 px-4 text-left">المسدد</th>
                    <th className="py-3 px-4 text-left">المتبقي</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد فواتير موردين مسجلة.
                      </td>
                    </tr>
                  ) : (
                    invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{inv.invoice_number}</td>
                        <td className="py-3 px-4 font-semibold text-gray-800">{inv.supplier_name}</td>
                        <td className="py-3 px-4 text-gray-600">{formatDate(inv.invoice_date)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-700">{formatDate(inv.due_date)}</span>
                            {inv.is_overdue && (
                              <span className="erp-badge-red text-[10px]">متأخرة!</span>
                            )}
                            {inv.is_due_soon && (
                              <span className="erp-badge-red text-[10px]">قريبة</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-left font-bold text-gray-900">{formatCurrency(inv.total_amount)}</td>
                        <td className="py-3 px-4 text-left font-semibold text-gray-700">{formatCurrency(inv.paid_amount)}</td>
                        <td className="py-3 px-4 text-left font-bold text-red-600">{formatCurrency(inv.remaining_amount)}</td>
                        <td className="py-3 px-4 text-center">
                          {inv.status === 'paid' ? (
                            <span className="erp-badge-green text-xs">مسددة ✓</span>
                          ) : inv.status === 'partially_paid' ? (
                            <span className="erp-badge-gray text-xs">مسددة جزئياً</span>
                          ) : (
                            <span className="erp-badge-red text-xs">غير مسددة</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {inv.status !== 'paid' && (
                            <button
                              onClick={() => {
                                setPaymentForm({
                                  supplier_id: inv.supplier_id,
                                  invoice_id: inv.id,
                                  account_id: treasuryAccounts[0]?.id || '',
                                  amount: String(inv.remaining_amount),
                                  payment_date: new Date().toISOString().split('T')[0],
                                  payment_method: 'cash',
                                  notes: `سداد فاتورة رقم ${inv.invoice_number}`
                                });
                                setShowPayModal(inv);
                              }}
                              className="px-3 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                            >
                              سداد الفاتورة
                            </button>
                          )}
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

      {/* MODAL 1: ADD SUPPLIER */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة مورد جديد</h3>
              <button onClick={() => setShowAddSupplierModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المورد أو الشركة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شركة الأهرام للأخشاب"
                  value={newSupplier.name}
                  onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">رقم التليفون *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 01001234567"
                  value={newSupplier.phone}
                  onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة السداد</label>
                  <select
                    value={newSupplier.payment_terms}
                    onChange={e => setNewSupplier({ ...newSupplier, payment_terms: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="cash">كاش فوري</option>
                    <option value="credit_30">آجل 30 يوم</option>
                    <option value="credit_60">آجل 60 يوم</option>
                    <option value="credit_90">آجل 90 يوم</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">سقف الائتمان (جنيه)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="مثال: 100000"
                    value={newSupplier.credit_limit}
                    onChange={e => setNewSupplier({ ...newSupplier, credit_limit: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">العنوان أو مكان المخزن</label>
                <input
                  type="text"
                  placeholder="مثال: السبتية، القاهرة"
                  value={newSupplier.address}
                  onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ المورد ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SUPPLIER STATEMENT */}
      {selectedSupplierForStatement && statementData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-4xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  كشف حساب: {statementData.supplier.name}
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  تليفون: {statementData.supplier.phone} | شروط الدفع: {statementData.supplier.payment_terms}
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
                  onClick={() => setSelectedSupplierForStatement(null)}
                  className="h-9 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-semibold text-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            {/* Numbers Summary */}
            <div className="grid grid-cols-3 gap-3 my-4">
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200 text-center">
                <span className="text-xs font-semibold text-gray-500">إجمالي المشتريات</span>
                <div className="text-xl font-bold text-gray-900 mt-0.5">
                  {formatCurrency(statementData.summary.total_purchases)}
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded-md border border-green-200 text-center">
                <span className="text-xs font-semibold text-green-700">إجمالي ما تم سداده</span>
                <div className="text-xl font-bold text-green-700 mt-0.5">
                  {formatCurrency(statementData.summary.total_paid)}
                </div>
              </div>
              <div className="bg-red-50 p-3 rounded-md border border-red-200 text-center">
                <span className="text-xs font-semibold text-red-700">المتبقي له حالياً</span>
                <div className="text-xl font-bold text-red-600 mt-0.5">
                  {formatCurrency(statementData.summary.remaining_balance)}
                </div>
              </div>
            </div>

            {/* Invoices List */}
            <h4 className="text-sm font-bold text-gray-800 mb-2">سجل الفواتير</h4>
            <div className="border border-gray-200 rounded-md overflow-hidden mb-5">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2 px-3">رقم الفاتورة</th>
                    <th className="py-2 px-3">التاريخ</th>
                    <th className="py-2 px-3">تاريخ الاستحقاق</th>
                    <th className="py-2 px-3 text-left">الإجمالي</th>
                    <th className="py-2 px-3 text-left">المدفوع</th>
                    <th className="py-2 px-3 text-left">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statementData.invoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="py-2 px-3 font-mono font-bold">{inv.invoice_number}</td>
                      <td className="py-2 px-3 text-gray-600">{formatDate(inv.invoice_date)}</td>
                      <td className="py-2 px-3 text-gray-600">{formatDate(inv.due_date)}</td>
                      <td className="py-2 px-3 text-left font-semibold text-gray-900">{formatCurrency(inv.total_amount)}</td>
                      <td className="py-2 px-3 text-left font-semibold text-gray-700">{formatCurrency(inv.paid_amount)}</td>
                      <td className="py-2 px-3 text-left font-bold text-red-600">{formatCurrency(inv.total_amount - inv.paid_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Payments List */}
            <h4 className="text-sm font-bold text-gray-800 mb-2">سجل السدادات والدفعات</h4>
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2 px-3">رقم السند</th>
                    <th className="py-2 px-3">تاريخ الصرف</th>
                    <th className="py-2 px-3">الخزنة / البنك</th>
                    <th className="py-2 px-3 text-left">المبلغ المسدد</th>
                    <th className="py-2 px-3">البيان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {statementData.payments.map(pay => (
                    <tr key={pay.id}>
                      <td className="py-2 px-3 font-mono font-bold">{pay.payment_number}</td>
                      <td className="py-2 px-3 text-gray-600">{formatDate(pay.payment_date)}</td>
                      <td className="py-2 px-3 text-gray-700">{pay.account_name}</td>
                      <td className="py-2 px-3 text-left font-bold text-green-600">{formatCurrency(pay.amount)}</td>
                      <td className="py-2 px-3 text-gray-500">{pay.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADD PURCHASE ORDER */}
      {showAddPOModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-2xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إنشاء أمر شراء جديد</h3>
              <button onClick={() => setShowAddPOModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePO} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={newPO.supplier_id}
                  onChange={e => setNewPO({ ...newPO, supplier_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الطلب *</label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={newPO.order_date}
                    onChange={e => {
                      const todayStr = new Date().toISOString().split('T')[0];
                      if (e.target.value < todayStr) {
                        alert('تاريخ الطلب لا يمكن أن يكون في يوم مضى (تاريخ فات)؛ اختر تاريخ اليوم أو تاريخاً قادماً');
                        return;
                      }
                      setNewPO({ ...newPO, order_date: e.target.value });
                    }}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                  <span className="text-xs text-gray-500 font-medium">تاريخ اليوم أو تاريخ قادم فقط</span>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ التسليم المتوقع</label>
                  <input
                    type="date"
                    min={newPO.order_date || new Date().toISOString().split('T')[0]}
                    value={newPO.expected_date}
                    onChange={e => {
                      if (newPO.order_date && e.target.value < newPO.order_date) {
                        alert('تاريخ التسليم المتوقع لا يمكن أن يكون قبل تاريخ الطلب');
                        return;
                      }
                      setNewPO({ ...newPO, expected_date: e.target.value });
                    }}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                  <span className="text-xs text-gray-500 font-medium">في نفس اليوم أو بعده</span>
                </div>
              </div>

              {/* Items */}
              <div className="border-t border-gray-200 pt-3">
                <label className="block text-sm font-bold text-gray-800 mb-2">الأصناف المطلوبة</label>
                {newPO.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-3 mb-2 bg-gray-50 p-2.5 rounded-md border border-gray-200">
                    <div>
                      <select
                        required
                        value={item.material_id}
                        onChange={e => {
                          const items = [...newPO.items];
                          items[idx].material_id = e.target.value;
                          setNewPO({ ...newPO, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      >
                        <option value="">اختر الخامة...</option>
                        {rawMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        required
                        placeholder="الكمية المطلوبة"
                        value={item.quantity_ordered}
                        onChange={e => {
                          const items = [...newPO.items];
                          items[idx].quantity_ordered = e.target.value;
                          setNewPO({ ...newPO, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="السعر التقديري"
                        value={item.unit_price}
                        onChange={e => {
                          const items = [...newPO.items];
                          items[idx].unit_price = e.target.value;
                          setNewPO({ ...newPO, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNewPO({ ...newPO, items: [...newPO.items, { material_id: '', quantity_ordered: '', unit_price: '' }] })}
                  className="text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer mt-1"
                >
                  + إضافة صنف آخر
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات الطلب</label>
                <input
                  type="text"
                  placeholder="أي شروط أو تفاصيل إضافية"
                  value={newPO.notes}
                  onChange={e => setNewPO({ ...newPO, notes: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddPOModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ أمر الشراء ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: GOODS RECEIPT (GRN) */}
      {showAddGRNModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-2xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إذن استلام خامات بالمخزن</h3>
              <button onClick={() => setShowAddGRNModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم تحديث رصيد المخزن ومتوسط تكلفة الشراء المرجح تلقائياً
            </p>

            <form onSubmit={handleSaveGRN} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={newGRN.supplier_id}
                  onChange={e => setNewGRN({ ...newGRN, supplier_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الاستلام الفعلي</label>
                  <input
                    type="date"
                    value={newGRN.receipt_date}
                    onChange={e => setNewGRN({ ...newGRN, receipt_date: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">اسم مستلم الشحنة</label>
                  <input
                    type="text"
                    value={newGRN.receiver_name}
                    onChange={e => setNewGRN({ ...newGRN, receiver_name: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              {/* Items */}
              <div className="border-t border-gray-200 pt-3">
                <label className="block text-sm font-bold text-gray-800 mb-2">الخامات المستلمة فعلياً</label>
                {newGRN.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-3 mb-2 bg-gray-50 p-2.5 rounded-md border border-gray-200">
                    <div>
                      <select
                        required
                        value={item.material_id}
                        onChange={e => {
                          const items = [...newGRN.items];
                          items[idx].material_id = e.target.value;
                          setNewGRN({ ...newGRN, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      >
                        <option value="">اختر الخامة...</option>
                        {rawMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        required
                        placeholder="الكمية المستلمة"
                        value={item.quantity_received}
                        onChange={e => {
                          const items = [...newGRN.items];
                          items[idx].quantity_received = e.target.value;
                          setNewGRN({ ...newGRN, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        placeholder="سعر شراء الوحدة"
                        value={item.unit_cost}
                        onChange={e => {
                          const items = [...newGRN.items];
                          items[idx].unit_cost = e.target.value;
                          setNewGRN({ ...newGRN, items });
                        }}
                        className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setNewGRN({ ...newGRN, items: [...newGRN.items, { material_id: '', quantity_received: '', unit_cost: '' }] })}
                  className="text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer mt-1"
                >
                  + إضافة خامة أخرى
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات الفحص</label>
                <input
                  type="text"
                  placeholder="حالة الشحنة ومطابقتها للمواصفات"
                  value={newGRN.notes}
                  onChange={e => setNewGRN({ ...newGRN, notes: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddGRNModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  إثبات الاستلام بالمخزن ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: ADD SUPPLIER INVOICE */}
      {showAddInvoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تسجيل فاتورة مورد</h3>
              <button onClick={() => setShowAddInvoiceModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={newInvoice.supplier_id}
                  onChange={e => setNewInvoice({ ...newInvoice, supplier_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">رقم فاتورة المورد *</label>
                <input
                  type="text"
                  required
                  placeholder="الرقم المسجل على الفاتورة الورقية"
                  value={newInvoice.invoice_number}
                  onChange={e => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الفاتورة</label>
                  <input
                    type="date"
                    value={newInvoice.invoice_date}
                    onChange={e => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ميعاد استحقاق السداد</label>
                  <input
                    type="date"
                    value={newInvoice.due_date}
                    onChange={e => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">قيمة الفاتورة (جنيه) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="المبلغ المطلوب"
                    value={newInvoice.subtotal}
                    onChange={e => setNewInvoice({ ...newInvoice, subtotal: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">ضريبة القيمة المضافة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0 إن لم توجد"
                    value={newInvoice.tax_amount}
                    onChange={e => setNewInvoice({ ...newInvoice, tax_amount: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات الفاتورة</label>
                <input
                  type="text"
                  placeholder="بيان الأصناف أو رقم إذن الاستلام"
                  value={newInvoice.notes}
                  onChange={e => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
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
                  حفظ الفاتورة ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: PAY SUPPLIER */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">سداد دفعة للمورد</h3>
              <button onClick={() => setShowPayModal(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم خصم المبلغ مباشرة من الخزنة أو الحساب البنكي وتسجيل سند صرف
            </p>

            <form onSubmit={handleSavePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">الصرف من خزنة / بنك *</label>
                <select
                  required
                  value={paymentForm.account_id}
                  onChange={e => setPaymentForm({ ...paymentForm, account_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الخزنة...</option>
                  {treasuryAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (المتاح: {formatCurrency(acc.current_balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ المراد سداده (جنيه) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  placeholder="المبلغ المدفوع"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-base font-bold focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الصرف</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">طريقة الدفع</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="cash">كاش نقدية</option>
                    <option value="bank">تحويل بنكي / شيك</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">بيان السند</label>
                <input
                  type="text"
                  placeholder="مثال: دفعة تحت الحساب كاش"
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPayModal(null)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  صرف المبلغ وتأكيد السند ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: RETURN TO SUPPLIER */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">مرتجع خامات للمورد</h3>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم خصم الكمية من رصيد المخزن وتسوية حساب المورد
            </p>

            <form onSubmit={handleSaveReturn} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={returnForm.supplier_id}
                  onChange={e => setReturnForm({ ...returnForm, supplier_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">الخامة المرتجعة *</label>
                <select
                  required
                  value={returnForm.material_id}
                  onChange={e => setReturnForm({ ...returnForm, material_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الخامة...</option>
                  {rawMaterials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} (المتاح: {m.current_stock} {m.unit})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">الكمية المرتجعة *</label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    required
                    placeholder="الكمية"
                    value={returnForm.quantity}
                    onChange={e => setReturnForm({ ...returnForm, quantity: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">سعر الوحدة المرتجع</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="فارغ = متوسط السعر"
                    value={returnForm.unit_cost}
                    onChange={e => setReturnForm({ ...returnForm, unit_cost: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">سبب الإرجاع *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: لوح مكسور / عيب تصنيع"
                  value={returnForm.reason}
                  onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })}
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
                  إثبات المرتجع وخصم المخزن ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
