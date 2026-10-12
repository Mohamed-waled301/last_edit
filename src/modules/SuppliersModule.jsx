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
  X,
  ExternalLink,
  RefreshCw,
  Scale
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString, isPastDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { FieldError, validators, Validators } from '../utils/validation';
import {
  DEFAULT_PHONE_VALUE,
  sanitizeEgyptianPhoneInput,
  normalizePhoneForSave,
  validateEgyptianMobile,
} from '../utils/phone';

export default function SuppliersModule({ onBack, onNotify }) {
  const [tab, setTab] = useState('suppliers'); // 'suppliers' | 'orders' | 'grn' | 'invoices'
  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showAddMaterialQuickModal, setShowAddMaterialQuickModal] = useState(false);
  const [selectedSupplierForStatement, setSelectedSupplierForStatement] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [showAddPOModal, setShowAddPOModal] = useState(false);
  const [showAddGRNModal, setShowAddGRNModal] = useState(false);
  const [showAddInvoiceModal, setShowAddInvoiceModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showOffsetModal, setShowOffsetModal] = useState(null); // Party with offset data

  // Forms state
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: DEFAULT_PHONE_VALUE,
    address: '',
    tax_number: '',
    payment_terms: 'credit',
    opening_balance: '0',
    opening_balance_type: 'credit', // المورد دائن افتراضياً
    notes: ''
  });
  const [supplierFormErrors, setSupplierFormErrors] = useState({});

  const [newQuickMaterial, setNewQuickMaterial] = useState({
    name: '',
    code: '',
    group: 'خامات أقمشة',
    type: 'raw',
    unit: 'متر',
    cost_price: 50,
    selling_price: 0
  });

  const [newPO, setNewPO] = useState({
    supplier_id: '',
    order_date: getTodayDateString(),
    payment_terms: 'credit', // 'cash' | 'credit'
    credit_days: 30,
    expected_date: '',
    notes: '',
    items: [{ material_id: '', quantity_ordered: '', unit_price: '', material_name: '', material_unit: '' }],
    discount_percent: 0,
    discount_amount: 0,
    additional_expenses: 0
  });

  const [newGRN, setNewGRN] = useState({
    supplier_id: '',
    po_id: '',
    receipt_date: getTodayDateString(),
    receiver_name: 'أمين مخزن الخامات',
    notes: '',
    items: [{ material_id: '', quantity_received: '', unit_cost: '' }]
  });

  const [newInvoice, setNewInvoice] = useState({
    supplier_id: '',
    invoice_number: '',
    invoice_date: getTodayDateString(),
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
    payment_date: getTodayDateString(),
    payment_method: 'نقدية (كاش)',
    notes: ''
  });

  const [returnForm, setReturnForm] = useState({
    supplier_id: '',
    material_id: '',
    quantity: '',
    unit_cost: '',
    return_date: getTodayDateString(),
    reason: ''
  });

  const [offsetForm, setOffsetForm] = useState({
    amount: 0,
    notes: 'إجراء مقاصة بين حساب المورد والعميل'
  });

  // Data lists
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [supRes, matRes, accRes, pmRes] = await Promise.all([
        api.getSuppliers(),
        api.getRawMaterials(),
        api.getAccounts(),
        api.getPaymentMethods ? api.getPaymentMethods() : Promise.resolve({ data: [] })
      ]);
      setSuppliers(supRes.data || supRes.suppliers || []);
      setRawMaterials(matRes.data || matRes.materials || []);
      setTreasuryAccounts(accRes.data?.accounts || accRes.data || accRes.accounts || []);
      setPaymentMethods(pmRes.data || [
        { id: 1, name: 'نقدية (كاش)' },
        { id: 2, name: 'تحويل بنكي' },
        { id: 3, name: 'شيك بنكي' }
      ]);

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
      console.error('Failed to load suppliers data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tab]);

  // Calculate PO Totals
  const poSubtotal = newPO.items.reduce((sum, item) => {
    const q = parseFloat(item.quantity_ordered) || 0;
    const p = parseFloat(item.unit_price) || 0;
    return sum + (q * p);
  }, 0);

  const poGrandTotal = Math.max(0, poSubtotal - (parseFloat(newPO.discount_amount) || 0) + (parseFloat(newPO.additional_expenses) || 0));

  // Handle PO Discount Sync
  const handleDiscountPercentChange = (percentVal) => {
    const pct = parseFloat(percentVal) || 0;
    const val = (pct / 100) * poSubtotal;
    setNewPO(prev => ({
      ...prev,
      discount_percent: percentVal,
      discount_amount: val.toFixed(2)
    }));
  };

  const handleDiscountAmountChange = (amountVal) => {
    const amt = parseFloat(amountVal) || 0;
    const pct = poSubtotal > 0 ? ((amt / poSubtotal) * 100).toFixed(2) : 0;
    setNewPO(prev => ({
      ...prev,
      discount_amount: amountVal,
      discount_percent: pct
    }));
  };

  // When selecting material in PO, auto load cost price
  const handlePOMaterialSelect = (idx, materialId) => {
    const mat = rawMaterials.find(m => String(m.id) === String(materialId));
    const updated = [...newPO.items];
    if (mat) {
      updated[idx] = {
        ...updated[idx],
        material_id: mat.id,
        material_name: mat.name,
        material_unit: mat.unit || 'متر',
        unit_price: mat.cost_price || mat.estimated_price || 0
      };
    } else {
      updated[idx] = {
        ...updated[idx],
        material_id: '',
        material_name: '',
        material_unit: '',
        unit_price: ''
      };
    }
    setNewPO(prev => ({ ...prev, items: updated }));
  };

  // Handle PO Save
  const handleSavePO = async (e) => {
    e.preventDefault();
    if (!newPO.supplier_id) {
      alert('يجب اختيار المورد أولاً');
      return;
    }
    if (newPO.payment_terms === 'credit' && !newPO.expected_date && !newPO.credit_days) {
      alert('في حالة الشراء الآجل يجب تحديد ميعاد الاستحقاق أو عدد أيام الآجل');
      return;
    }
    const hasValidItem = newPO.items.some(it => it.material_id && parseFloat(it.quantity_ordered) > 0);
    if (!hasValidItem) {
      alert('يجب إضافة صنف واحد على الأقل بكمية صالحة');
      return;
    }

    try {
      const payload = {
        ...newPO,
        subtotal: poSubtotal,
        total_amount: poGrandTotal,
        discount_amount: parseFloat(newPO.discount_amount) || 0,
        discount_percent: parseFloat(newPO.discount_percent) || 0,
        additional_expenses: parseFloat(newPO.additional_expenses) || 0
      };
      const res = await api.createPurchaseOrder(payload);
      onNotify(res.message || 'تم إنشاء أمر الشراء وتحديث أسعار تكلفة الأصناف بنجاح');
      setShowAddPOModal(false);
      setNewPO({
        supplier_id: '',
        order_date: getTodayDateString(),
        payment_terms: 'credit',
        credit_days: 30,
        expected_date: '',
        notes: '',
        items: [{ material_id: '', quantity_ordered: '', unit_price: '', material_name: '', material_unit: '' }],
        discount_percent: 0,
        discount_amount: 0,
        additional_expenses: 0
      });
      loadData();
      setTab('orders');
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Save Quick Supplier
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    const errs = {};
    const nameErr = Validators.required(newSupplier.name, 'اسم المورد');
    if (nameErr) errs.name = nameErr;
    const phoneErr = validateEgyptianMobile(newSupplier.phone, { required: false });
    if (phoneErr) errs.phone = phoneErr;
    const openNum = Number(newSupplier.opening_balance);
    if (newSupplier.opening_balance === '' || isNaN(openNum) || openNum < 0) {
      errs.opening_balance = 'رصيد أول المدة يجب أن يكون رقماً لا يقل عن صفر';
    }
    setSupplierFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    try {
      const payload = {
        ...newSupplier,
        phone: normalizePhoneForSave(newSupplier.phone),
        opening_balance: Math.max(0, Number(newSupplier.opening_balance) || 0),
        opening_balance_type: newSupplier.opening_balance_type === 'debit' ? 'debit' : 'credit',
      };
      const res = await api.createSupplier ? await api.createSupplier(payload) : await api.createUnifiedParty({ ...payload, is_supplier: true, is_customer: false });
      onNotify(res.message || 'تمت إضافة المورد بنجاح');
      setShowAddSupplierModal(false);
      setNewSupplier({ name: '', phone: DEFAULT_PHONE_VALUE, address: '', tax_number: '', payment_terms: 'credit', opening_balance: '0', opening_balance_type: 'credit', notes: '' });
      setSupplierFormErrors({});
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Save Quick Material
  const handleSaveQuickMaterial = async (e) => {
    e.preventDefault();
    if (!validators.required(newQuickMaterial.name)) return;
    try {
      const res = await api.createRawMaterial(newQuickMaterial);
      onNotify(res.message || 'تمت إضافة الخامة بنجاح');
      setShowAddMaterialQuickModal(false);
      setNewQuickMaterial({
        name: '',
        code: '',
        group: 'خامات أقمشة',
        type: 'raw',
        unit: 'متر',
        cost_price: 50,
        selling_price: 0
      });
      loadData();
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
      setNewGRN({
        supplier_id: '',
        po_id: '',
        receipt_date: getTodayDateString(),
        receiver_name: 'أمين مخزن الخامات',
        notes: '',
        items: [{ material_id: '', quantity_received: '', unit_cost: '' }]
      });
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
      setNewInvoice({
        supplier_id: '',
        invoice_number: '',
        invoice_date: getTodayDateString(),
        due_date: '',
        subtotal: '',
        tax_amount: '0',
        notes: ''
      });
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
      setPaymentForm({
        supplier_id: '',
        invoice_id: '',
        account_id: '',
        amount: '',
        payment_date: getTodayDateString(),
        payment_method: paymentMethods[0]?.name || 'نقدية (كاش)',
        notes: ''
      });
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
      setReturnForm({
        supplier_id: '',
        material_id: '',
        quantity: '',
        unit_cost: '',
        return_date: getTodayDateString(),
        reason: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle View Statement
  const handleViewStatement = async (supplierId) => {
    try {
      setSelectedSupplierForStatement(supplierId);
      const res = await api.getSupplierStatement(supplierId);
      setStatementData(res.data);
    } catch (err) {
      alert(err.message);
    }
  };

  // Open Offset Modal
  const handleOpenOffset = async (supplier) => {
    try {
      if (api.getPartyBalances) {
        const balRes = await api.getPartyBalances(supplier.id);
        const data = balRes.data;
        setShowOffsetModal({
          supplier,
          ...data
        });
        setOffsetForm({
          amount: data.max_offset || 0,
          notes: `إجراء مقاصة متبادلة لحساب ${supplier.name}`
        });
      } else {
        alert('ميزة المقاصة مفعلة في شاشة الأطراف الموحدة');
      }
    } catch (err) {
      alert('تعذر جلب أرصدة المقاصة: ' + err.message);
    }
  };

  // Execute Offset
  const handleExecuteOffset = async (e) => {
    e.preventDefault();
    try {
      if (api.executeOffset && showOffsetModal) {
        const res = await api.executeOffset(showOffsetModal.supplier.id, parseFloat(offsetForm.amount), offsetForm.notes);
        onNotify(res.message || 'تمت تسوية المقاصة بنجاح');
        setShowOffsetModal(null);
        loadData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const safeSuppliers = Array.isArray(suppliers) ? suppliers : [];
  const filteredSuppliers = safeSuppliers.filter(s =>
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.phone && s.phone.includes(searchTerm))
  );

  const totalSupplierDebts = safeSuppliers.reduce((sum, s) => sum + (s.outstanding_balance || s.balance_due || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Bar with Back Button and Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">إدارة المشتريات والموردين (مصنع ملابس)</h2>
            <span className="text-xs text-gray-500 font-medium">توريد أقمشة، خيوط، أزرار، سست، كشوف حسابات والمقاصة</span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'suppliers', label: 'سجل الموردين' },
            { id: 'orders', label: 'أوامر الشراء' },
            { id: 'grn', label: 'أذونات الاستلام' },
            { id: 'invoices', label: 'فواتير الموردين والسداد' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md font-bold text-sm transition-colors cursor-pointer ${
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

      {/* TAB 1: SUPPLIERS LIST */}
      {tab === 'suppliers' && (
        <div className="space-y-4">
          {/* Summary Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">إجمالي مستحقات الموردين (مديونيات)</span>
              <div className="text-2xl font-bold text-red-600 mt-1">
                {formatCurrency(totalSupplierDebts)}
              </div>
              <span className="text-xs text-gray-400 font-medium">مستحق سداده لموردي الأقمشة ومستلزمات الإنتاج</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">عدد الموردين المسجلين</span>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {formatNumber(safeSuppliers.length)} مورد
              </div>
              <span className="text-xs text-gray-400 font-medium">موردي خامات وخدمات تشغيل خارجي</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-md p-4">
              <span className="text-xs font-semibold text-gray-500">موردون عملاء (أطراف مشتركة)</span>
              <div className="text-2xl font-bold text-indigo-700 mt-1">
                {formatNumber(safeSuppliers.filter(s => s.is_customer).length)} طرف
              </div>
              <span className="text-xs text-gray-400 font-medium">متاح إجراء مقاصة حسابية فورية</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="بحث باسم المورد أو رقم الهاتف"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-10 pr-9 pl-3 rounded-md border border-gray-300 text-sm focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddPOModal(true)}
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>+ أمر شراء جديد</span>
              </button>
              <button
                onClick={() => setShowAddSupplierModal(true)}
                className="h-10 px-4 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ مورد جديد</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">اسم المورد</th>
                    <th className="py-3 px-4">نوع الطرف</th>
                    <th className="py-3 px-4">الهاتف والعنوان</th>
                    <th className="py-3 px-4">شروط الدفع</th>
                    <th className="py-3 px-4 text-left">الرصيد الدائن المستحق</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 font-medium">
                        لا يوجد موردين مطابقين للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map(s => {
                      const bal = s.outstanding_balance || s.balance_due || 0;
                      return (
                        <tr key={s.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-gray-900">{s.name}</div>
                            {s.tax_number && (
                              <div className="text-xs text-gray-400 font-mono">س.ض: {s.tax_number}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              <span className="erp-badge-blue text-[11px]">مورد</span>
                              {s.is_customer && (
                                <span className="erp-badge-green text-[11px]">عميل أيضاً</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-600">
                            <div className="font-mono">{s.phone || '-'}</div>
                            <div className="text-gray-400">{s.address || '-'}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-gray-700 font-medium">
                            {s.payment_terms === 'cash' ? 'نقدي (كاش)' : 'آجل بالاتفاق'}
                          </td>
                          <td className="py-3 px-4 text-left font-bold text-red-600">
                            {formatCurrency(bal)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleViewStatement(s.id)}
                                className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-300 rounded text-xs text-gray-700 font-medium cursor-pointer"
                                title="كشف الحساب"
                              >
                                كشف حساب
                              </button>
                              {s.is_customer && (
                                <button
                                  onClick={() => handleOpenOffset(s)}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded text-xs text-amber-900 font-bold cursor-pointer flex items-center gap-1"
                                  title="مقاصة مع حساب العميل"
                                >
                                  <Scale className="w-3 h-3" />
                                  <span>مقاصة</span>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setPaymentForm(prev => ({
                                    ...prev,
                                    supplier_id: s.id,
                                    amount: bal > 0 ? bal : ''
                                  }));
                                  setShowPayModal(s);
                                }}
                                className="px-2.5 py-1 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded text-xs font-semibold cursor-pointer"
                              >
                                سداد دفعة
                              </button>
                            </div>
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

      {/* TAB 2: PURCHASE ORDERS */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">أوامر شراء الخامات</h3>
              <p className="text-xs text-gray-500 font-medium">
                تحديد شروط الدفع، الخصومات ومصاريف الشحن، وتحديث سعر التكلفة تلقائياً
              </p>
            </div>
            <button
              onClick={() => setShowAddPOModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
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
                    <th className="py-3 px-4">طريقة الدفع</th>
                    <th className="py-3 px-4">الخامات وأسعار التكلفة</th>
                    <th className="py-3 px-4 text-left">إجمالي القيمة</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد أوامر شراء مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    orders.map(o => (
                      <tr key={o.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{o.po_number}</td>
                        <td className="py-3 px-4 font-semibold text-gray-800">{o.supplier_name}</td>
                        <td className="py-3 px-4 text-gray-600">{formatDate(o.order_date)}</td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          {o.payment_terms === 'cash' ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">نقدي (كاش)</span>
                          ) : (
                            <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded">آجل ({o.credit_days || 30} يوم)</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {o.items?.map((it, idx) => (
                            <div key={idx} className="text-xs text-gray-700">
                              • {it.quantity_ordered} {it.material_unit} {it.material_name} @ {formatCurrency(it.unit_price)}
                            </div>
                          ))}
                        </td>
                        <td className="py-3 px-4 text-left font-bold text-gray-900">
                          {formatCurrency(o.total_amount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {o.status === 'received' ? (
                            <span className="erp-badge-green text-xs">تم الاستلام</span>
                          ) : (
                            <span className="erp-badge-gray text-xs">قيد التوريد</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {o.status !== 'received' && (
                            <button
                              onClick={() => {
                                setNewGRN({
                                  supplier_id: o.supplier_id,
                                  po_id: o.id,
                                  receipt_date: getTodayDateString(),
                                  receiver_name: 'أمين مخزن الخامات',
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
              <h3 className="text-base font-bold text-gray-900">أذونات استلام الخامات</h3>
              <p className="text-xs text-gray-500 font-medium">
                إضافة رصيد الخامات للمخزن وتحديث متوسط التكلفة المرجح تلقائياً
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
                    <th className="py-3 px-4">الخامات المستلمة وسعر التكلفة</th>
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
                              {it.quantity_received} {it.material_unit} {it.material_name} @ {formatCurrency(it.unit_cost)}
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
                متابعة تواريخ الاستحقاق وطرق الدفع (نقدية، تحويل، شيك)
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
                className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
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
                          </div>
                        </td>
                        <td className="py-3 px-4 text-left font-bold text-gray-900">{formatCurrency(inv.total_amount)}</td>
                        <td className="py-3 px-4 text-left text-green-700 font-medium">{formatCurrency(inv.paid_amount || 0)}</td>
                        <td className="py-3 px-4 text-left font-bold text-red-600">{formatCurrency(inv.remaining_amount || (inv.total_amount - (inv.paid_amount || 0)))}</td>
                        <td className="py-3 px-4 text-center">
                          {inv.payment_status === 'paid' ? (
                            <span className="erp-badge-green text-xs">مسددة بالكامل</span>
                          ) : (
                            <span className="erp-badge-red text-xs">مستحقة</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {inv.payment_status !== 'paid' && (
                            <button
                              onClick={() => {
                                setPaymentForm(prev => ({
                                  ...prev,
                                  supplier_id: inv.supplier_id,
                                  invoice_id: inv.id,
                                  amount: inv.remaining_amount || (inv.total_amount - (inv.paid_amount || 0))
                                }));
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

      {/* MODAL 1: ADD SUPPLIER (Customer ceiling removed as requested) */}
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
                  value={newSupplier.name}
                  onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: مصنع النصر للغزل والنسيج</p>
                <FieldError error={supplierFormErrors.name} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={11}
                    value={newSupplier.phone}
                    onChange={e => {
                      const digits = sanitizeEgyptianPhoneInput(e.target.value);
                      setNewSupplier({ ...newSupplier, phone: digits === '' ? DEFAULT_PHONE_VALUE : digits });
                    }}
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-mono text-left focus:border-[#1F3A5F] focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">مثال: 01012345678</p>
                  <FieldError error={supplierFormErrors.phone} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">السجل الضريبي</label>
                  <input
                    type="text"
                    value={newSupplier.tax_number}
                    onChange={e => setNewSupplier({ ...newSupplier, tax_number: e.target.value })}
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-mono focus:border-[#1F3A5F] focus:outline-none"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">رقم التسجيل الضريبي</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">العنوان أو موقع المستودع</label>
                <input
                  type="text"
                  value={newSupplier.address}
                  onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: المحلة الكبرى، المنطقة الصناعية</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">شروط الدفع الافتراضية</label>
                <select
                  value={newSupplier.payment_terms}
                  onChange={e => setNewSupplier({ ...newSupplier, payment_terms: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="credit">آجل بالاتفاق (موصى به)</option>
                  <option value="cash">نقدي (كاش فور التسليم)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 bg-blue-50/50 border border-blue-200 rounded-md">
                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-1">رصيد أول المدة (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    dir="ltr"
                    value={newSupplier.opening_balance}
                    onChange={e => setNewSupplier({ ...newSupplier, opening_balance: e.target.value })}
                    className="w-full h-11 rounded-md border border-blue-300 px-3 text-sm font-mono font-bold text-left bg-white focus:border-[#1F3A5F] focus:outline-none"
                  />
                  <p className="text-[11px] text-blue-800 mt-1">القيمة الافتراضية: 0</p>
                  <FieldError error={supplierFormErrors.opening_balance} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-1">طبيعة الحساب</label>
                  <select
                    value={newSupplier.opening_balance_type}
                    onChange={e => setNewSupplier({ ...newSupplier, opening_balance_type: e.target.value })}
                    className="w-full h-11 rounded-md border border-blue-300 px-3 text-sm font-medium bg-white focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="credit">دائن (مستحق له)</option>
                    <option value="debit">مدين (دفعة مقدمة له)</option>
                  </select>
                </div>
                <p className="col-span-2 text-[11px] text-blue-700 font-medium">
                  الرصيد الحالي = رصيد أول المدة + فواتير الشراء الآجلة − سندات الصرف النقدية.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="h-11 px-5 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!newSupplier.name.trim()}
                  className="h-11 px-6 bg-[#1F3A5F] hover:bg-[#172c48] disabled:opacity-50 text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK MATERIAL MODAL */}
      {showAddMaterialQuickModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-md w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">إضافة خامة جديدة سريعة</h3>
              <button onClick={() => setShowAddMaterialQuickModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveQuickMaterial} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">اسم الخامة *</label>
                <input
                  type="text"
                  required
                  value={newQuickMaterial.name}
                  onChange={e => setNewQuickMaterial({ ...newQuickMaterial, name: e.target.value })}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: قماش جبردين قطن أسود</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">الوحدة</label>
                  <select
                    value={newQuickMaterial.unit}
                    onChange={e => setNewQuickMaterial({ ...newQuickMaterial, unit: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-2 text-xs"
                  >
                    <option value="متر">متر</option>
                    <option value="كجم">كجم</option>
                    <option value="بكرة">بكرة</option>
                    <option value="قطعة">قطعة</option>
                    <option value="دزينة">دزينة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">سعر التكلفة الافتراضي</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newQuickMaterial.cost_price}
                    onChange={e => setNewQuickMaterial({ ...newQuickMaterial, cost_price: parseFloat(e.target.value) || 0 })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddMaterialQuickModal(false)}
                  className="h-10 px-4 rounded-md text-xs border border-gray-300 bg-white text-gray-700"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-4 bg-[#1F3A5F] text-white rounded-md font-bold text-xs"
                >
                  حفظ وإدراج بالطلب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD PURCHASE ORDER (Item B Requirements) */}
      {showAddPOModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-3xl w-full border border-gray-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">إنشاء أمر شراء خامات</h3>
                <p className="text-xs text-gray-500 font-medium">سعر التكلفة يُجلب تلقائياً من بطاقة الصنف وتعديله يحدّث قاعدة البيانات</p>
              </div>
              <button onClick={() => setShowAddPOModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePO} className="space-y-4">
              {/* Supplier Selection with Quick Add Shortcut */}
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700">المورد *</label>
                  <button
                    type="button"
                    onClick={() => setShowAddSupplierModal(true)}
                    className="text-xs font-bold text-[#1F3A5F] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إضافة مورد جديد</span>
                  </button>
                </div>
                <select
                  required
                  value={newPO.supplier_id}
                  onChange={e => setNewPO({ ...newPO, supplier_id: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none bg-white"
                >
                  <option value="">اختر المورد من القائمة...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone || 'بدون هاتف'})</option>
                  ))}
                </select>
                {!newPO.supplier_id && <FieldError error="يرجى اختيار المورد" />}
              </div>

              {/* Order Date & Payment Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ أمر الشراء *</label>
                  <input
                    type="date"
                    required
                    value={newPO.order_date}
                    onChange={e => setNewPO({ ...newPO, order_date: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">شروط الدفع *</label>
                  <div className="flex items-center gap-2 h-10">
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="po_payment_terms"
                        checked={newPO.payment_terms === 'credit'}
                        onChange={() => setNewPO({ ...newPO, payment_terms: 'credit' })}
                        className="text-[#1F3A5F]"
                      />
                      <span>آجل</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="radio"
                        name="po_payment_terms"
                        checked={newPO.payment_terms === 'cash'}
                        onChange={() => setNewPO({ ...newPO, payment_terms: 'cash', expected_date: '' })}
                        className="text-[#1F3A5F]"
                      />
                      <span>نقدي</span>
                    </label>
                  </div>
                </div>

                {/* Conditional Due Date based on Terms */}
                {newPO.payment_terms === 'credit' ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">ميعاد استحقاق الآجل / تاريخ التوريد *</label>
                    <input
                      type="date"
                      required
                      min={newPO.order_date}
                      value={newPO.expected_date}
                      onChange={e => setNewPO({ ...newPO, expected_date: e.target.value })}
                      className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs font-medium focus:border-[#1F3A5F] focus:outline-none"
                    />
                    {!newPO.expected_date && <FieldError error="أمر الشراء الآجل يتطلب تحديد تاريخ استحقاق" />}
                  </div>
                ) : (
                  <div className="bg-emerald-50 rounded-md border border-emerald-200 p-2 text-center flex flex-col justify-center">
                    <span className="text-[11px] font-bold text-emerald-800">الدفع نقدي فوري</span>
                    <span className="text-[10px] text-emerald-600">لا يوجد تاريخ استحقاق آجل</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="border border-gray-200 rounded-md p-3 bg-gray-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-800">الخامات والمستلزمات المطلوبة</span>
                  <button
                    type="button"
                    onClick={() => setShowAddMaterialQuickModal(true)}
                    className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ إضافة خامة غير مسجلة</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {newPO.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-white p-2.5 rounded border border-gray-200 items-end">
                      <div className="col-span-5">
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">الخامة</label>
                        <select
                          required
                          value={item.material_id}
                          onChange={e => handlePOMaterialSelect(idx, e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-medium"
                        >
                          <option value="">اختر الخامة / المادة...</option>
                          {rawMaterials.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unit || 'متر'}) - التكلفة الحالية: {m.cost_price || m.estimated_price || 0} ج
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">الكمية المطلوبة ({item.material_unit || 'الوحدة'})</label>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          aria-label="الكمية المطلوبة"
                          value={item.quantity_ordered}
                          onChange={e => {
                            const updated = [...newPO.items];
                            updated[idx].quantity_ordered = e.target.value;
                            setNewPO({ ...newPO, items: updated });
                          }}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">سعر التكلفة (جنيه)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          required
                          aria-label="سعر التكلفة"
                          value={item.unit_price}
                          onChange={e => {
                            const updated = [...newPO.items];
                            updated[idx].unit_price = e.target.value;
                            setNewPO({ ...newPO, items: updated });
                          }}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-bold text-blue-900 bg-blue-50/30"
                        />
                      </div>

                      <div className="col-span-1 text-center pb-1">
                        {newPO.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = newPO.items.filter((_, i) => i !== idx);
                              setNewPO({ ...newPO, items: updated });
                            }}
                            className="text-red-500 hover:text-red-700 text-sm font-bold cursor-pointer"
                            title="حذف السطر"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setNewPO({
                    ...newPO,
                    items: [...newPO.items, { material_id: '', quantity_ordered: '', unit_price: '', material_name: '', material_unit: '' }]
                  })}
                  className="mt-2 text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة سطر صنف آخر</span>
                </button>
              </div>

              {/* Totals Section: Subtotal, Linked Discount, Additional Expenses, Grand Total */}
              <div className="bg-gray-100 p-3 rounded-md border border-gray-300 space-y-2 text-xs">
                <div className="flex justify-between items-center font-semibold text-gray-700">
                  <span>المجموع الفرعي للأصناف:</span>
                  <span className="text-sm font-bold font-mono">{formatCurrency(poSubtotal)}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">نسبة الخصم (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      aria-label="نسبة الخصم"
                      value={newPO.discount_percent}
                      onChange={e => handleDiscountPercentChange(e.target.value)}
                      className="w-full h-8 rounded border border-gray-300 px-2 text-xs font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">قيمة الخصم (جنيه)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="قيمة الخصم بالجنيه"
                      value={newPO.discount_amount}
                      onChange={e => handleDiscountAmountChange(e.target.value)}
                      className="w-full h-8 rounded border border-gray-300 px-2 text-xs font-bold bg-white text-green-700"
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <label className="block font-semibold text-gray-700 mb-1">مصاريف إضافية (شحن، مشال، تحميل بالجنيه):</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="مصاريف إضافية بالجنيه"
                    value={newPO.additional_expenses}
                    onChange={e => setNewPO({ ...newPO, additional_expenses: parseFloat(e.target.value) || 0 })}
                    className="w-full h-8 rounded border border-gray-300 px-2 text-xs font-bold bg-white"
                  />
                </div>

                <div className="flex justify-between items-center pt-2 border-t-2 border-gray-300 font-bold text-gray-900 text-sm">
                  <span>الإجمالي النهائي لأمر الشراء:</span>
                  <span className="text-base text-[#1F3A5F] font-mono font-black">{formatCurrency(poGrandTotal)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات وشروط التوريد</label>
                <input
                  type="text"
                  value={newPO.notes}
                  onChange={e => setNewPO({ ...newPO, notes: e.target.value })}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs focus:border-[#1F3A5F] focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: الاستلام بمخزن المصنع بعد فحص عينات الأقمشة</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddPOModal(false)}
                  className="h-11 px-5 rounded-md font-medium text-xs border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!newPO.supplier_id || poGrandTotal <= 0}
                  className="h-11 px-6 bg-[#1F3A5F] hover:bg-[#172c48] disabled:opacity-50 text-white rounded-md font-bold text-sm cursor-pointer shadow-sm"
                >
                  اعتماد وحفظ أمر الشراء وتحديث التكلفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GOODS RECEIPT (GRN) */}
      {showAddGRNModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إثبات استلام خامات بالمخزن</h3>
              <button onClick={() => setShowAddGRNModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGRN} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={newGRN.supplier_id}
                  onChange={e => setNewGRN({ ...newGRN, supplier_id: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ الاستلام *</label>
                  <input
                    type="date"
                    required
                    value={newGRN.receipt_date}
                    onChange={e => setNewGRN({ ...newGRN, receipt_date: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">اسم أمين المخزن المستلم</label>
                  <input
                    type="text"
                    value={newGRN.receiver_name}
                    onChange={e => setNewGRN({ ...newGRN, receiver_name: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
              </div>

              {/* Received Items */}
              <div className="border border-gray-200 rounded p-3 bg-gray-50">
                <label className="block text-xs font-bold text-gray-800 mb-2">الخامات المستلمة فعلياً</label>
                {newGRN.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-3 gap-2 mb-2 bg-white p-2 rounded border border-gray-200">
                    <div>
                      <select
                        required
                        value={item.material_id}
                        onChange={e => {
                          const items = [...newGRN.items];
                          items[idx].material_id = e.target.value;
                          setNewGRN({ ...newGRN, items });
                        }}
                        className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
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
                        min="0.01"
                        step="any"
                        required
                        aria-label="الكمية المستلمة"
                        value={item.quantity_received}
                        onChange={e => {
                          const items = [...newGRN.items];
                          items[idx].quantity_received = e.target.value;
                          setNewGRN({ ...newGRN, items });
                        }}
                        className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        aria-label="سعر التكلفة بالجنيه"
                        value={item.unit_cost}
                        onChange={e => {
                          const items = [...newGRN.items];
                          items[idx].unit_cost = e.target.value;
                          setNewGRN({ ...newGRN, items });
                        }}
                        className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">ملاحظات الفحص والاستلام</label>
                <input
                  type="text"
                  value={newGRN.notes}
                  onChange={e => setNewGRN({ ...newGRN, notes: e.target.value })}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: مطابقة العينة ومستوى الجودة</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddGRNModal(false)}
                  className="h-10 px-4 rounded-md text-xs border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded-md font-bold text-xs"
                >
                  تأكيد الإذن وإضافة المخزون
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD SUPPLIER INVOICE */}
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
                <label className="block text-xs font-bold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={newInvoice.supplier_id}
                  onChange={e => setNewInvoice({ ...newInvoice, supplier_id: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">رقم الفاتورة الورقية *</label>
                <input
                  type="text"
                  required
                  value={newInvoice.invoice_number}
                  onChange={e => setNewInvoice({ ...newInvoice, invoice_number: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-mono focus:border-[#1F3A5F] focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">الرقم المطبوع على أصل فاتورة المورد</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ الفاتورة *</label>
                  <input
                    type="date"
                    required
                    value={newInvoice.invoice_date}
                    onChange={e => setNewInvoice({ ...newInvoice, invoice_date: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">ميعاد استحقاق السداد</label>
                  <input
                    type="date"
                    value={newInvoice.due_date}
                    onChange={e => setNewInvoice({ ...newInvoice, due_date: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">المبلغ المطلوب (جنيه) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    aria-label="المبلغ المطلوب بالجنيه"
                    value={newInvoice.subtotal}
                    onChange={e => setNewInvoice({ ...newInvoice, subtotal: e.target.value })}
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">ضريبة القيمة المضافة</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="ضريبة القيمة المضافة"
                    value={newInvoice.tax_amount}
                    onChange={e => setNewInvoice({ ...newInvoice, tax_amount: e.target.value })}
                    className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddInvoiceModal(false)}
                  className="h-10 px-4 rounded-md text-xs border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded-md font-bold text-xs"
                >
                  حفظ الفاتورة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PAY SUPPLIER (Item A3: Payment Methods List) */}
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
              يتم خصم المبلغ من الخزينة أو البنك وتسجيل حركة صرف نقدية
            </p>

            <form onSubmit={handleSavePayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الصرف من خزينة / حساب بنكي *</label>
                <select
                  required
                  value={paymentForm.account_id}
                  onChange={e => setPaymentForm({ ...paymentForm, account_id: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الخزينة أو الحساب البنكي...</option>
                  {treasuryAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (المتاح: {formatCurrency(acc.current_balance || 0)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">المبلغ المراد سداده (جنيه) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  aria-label="المبلغ المراد سداده بالجنيه"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-base font-bold text-green-700 focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ الصرف</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">طريقة الدفع (قائمة الطرق) *</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={e => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-2 text-xs font-medium"
                  >
                    {paymentMethods.map(pm => (
                      <option key={pm.id} value={pm.name}>{pm.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">البيان / ملاحظات السند</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: دفعة تحت الحساب توريد خامات جبردين</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPayModal(null)}
                  className="h-10 px-4 rounded-md text-xs border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-11 px-6 bg-[#1F3A5F] text-white rounded-md font-bold text-xs"
                >
                  صرف المبلغ وتأكيد السند
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OFFSET (مقاصة حسابية) - Item A2 */}
      {showOffsetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-700" />
                <span>إجراء تسوية ومقاصة: {showOffsetModal.supplier?.name}</span>
              </h3>
              <button onClick={() => setShowOffsetModal(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-600 mb-3">
              الطرف مسجل كمورد وعميل في نفس الوقت. يمكن تسوية الرصيد الدائن بالرصيد المدين دون الحاجة لدفع نقدي.
            </p>

            <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded border border-gray-200 text-center mb-4 text-xs">
              <div>
                <span className="text-gray-500 font-semibold block">مستحقاته كمورد</span>
                <span className="font-bold text-red-600 text-sm mt-0.5 block">{formatCurrency(showOffsetModal.supplier_balance || 0)}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block">مديونيته كعميل</span>
                <span className="font-bold text-blue-700 text-sm mt-0.5 block">{formatCurrency(showOffsetModal.customer_balance || 0)}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block">أقصى مبلغ للمقاصة</span>
                <span className="font-bold text-emerald-700 text-sm mt-0.5 block">{formatCurrency(showOffsetModal.max_offset || 0)}</span>
              </div>
            </div>

            <form onSubmit={handleExecuteOffset} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">مبلغ المقاصة المراد تسويته (جنيه) *</label>
                <input
                  type="number"
                  min="0.01"
                  max={showOffsetModal.max_offset}
                  step="any"
                  required
                  value={offsetForm.amount}
                  onChange={e => setOffsetForm({ ...offsetForm, amount: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-sm font-bold text-indigo-700"
                />
                <span className="text-[11px] text-gray-500">الحد الأقصى المتاح للتسوية هو {formatCurrency(showOffsetModal.max_offset || 0)}</span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">بيان حركة المقاصة</label>
                <input
                  type="text"
                  value={offsetForm.notes}
                  onChange={e => setOffsetForm({ ...offsetForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowOffsetModal(null)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={parseFloat(offsetForm.amount) <= 0 || parseFloat(offsetForm.amount) > showOffsetModal.max_offset}
                  className="h-10 px-5 bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded font-bold"
                >
                  تنفيذ المقاصة وتخفيض الأرصدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RETURN TO SUPPLIER */}
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
                <label className="block text-xs font-bold text-gray-700 mb-1">المورد *</label>
                <select
                  required
                  value={returnForm.supplier_id}
                  onChange={e => setReturnForm({ ...returnForm, supplier_id: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر المورد...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">الخامة المرتجعة *</label>
                <select
                  required
                  value={returnForm.material_id}
                  onChange={e => setReturnForm({ ...returnForm, material_id: e.target.value })}
                  className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الخامة...</option>
                  {rawMaterials.map(m => (
                    <option key={m.id} value={m.id}>{m.name} (الرصيد: {m.current_stock || 0} {m.unit})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">الكمية المرتجعة *</label>
                  <input
                    type="number"
                    min="0.1"
                    step="any"
                    required
                    aria-label="الكمية المرتجعة"
                    value={returnForm.quantity}
                    onChange={e => setReturnForm({ ...returnForm, quantity: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">سعر التكلفة المرتجع</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="سعر التكلفة المرتجع"
                    value={returnForm.unit_cost}
                    onChange={e => setReturnForm({ ...returnForm, unit_cost: e.target.value })}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">اتركه فارغاً لاعتماد متوسط التكلفة الحالي</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">سبب المرتجع *</label>
                <input
                  type="text"
                  required
                  value={returnForm.reason}
                  onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                />
                <p className="text-[11px] text-gray-500 mt-1">مثال: عيوب صباغة في القماش أو عدم مطابقة العينة</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="h-10 px-4 rounded-md text-xs border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-xs"
                >
                  إثبات المرتجع وخصم المخزن
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STATEMENT */}
      {selectedSupplierForStatement && statementData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-4xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  كشف حساب مورد: {statementData.supplier?.name || 'المورد'}
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  تليفون: {statementData.supplier?.phone || '-'} | شروط الدفع: {statementData.supplier?.payment_terms || '-'}
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
              <div className="bg-blue-50 p-3 rounded-md border border-blue-200 text-center">
                <span className="text-xs font-semibold text-blue-700">رصيد أول المدة ({statementData.summary?.opening_balance_type === 'debit' ? 'مدين' : 'دائن'})</span>
                <div className="text-xl font-bold text-blue-900 mt-0.5">
                  {formatCurrency(statementData.summary?.opening_balance || statementData.supplier?.opening_balance || 0)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-md border border-gray-200 text-center">
                <span className="text-xs font-semibold text-gray-500">إجمالي المشتريات</span>
                <div className="text-xl font-bold text-gray-900 mt-0.5">
                  {formatCurrency(statementData.summary?.total_purchases || 0)}
                </div>
              </div>
              <div className="bg-green-50 p-3 rounded-md border border-green-200 text-center">
                <span className="text-xs font-semibold text-green-700">إجمالي ما تم سداده</span>
                <div className="text-xl font-bold text-green-700 mt-0.5">
                  {formatCurrency(statementData.summary?.total_paid || 0)}
                </div>
              </div>
              <div className="bg-red-50 p-3 rounded-md border border-red-200 text-center">
                <span className="text-xs font-semibold text-red-700">المتبقي له حالياً</span>
                <div className="text-xl font-bold text-red-600 mt-0.5">
                  {formatCurrency(statementData.summary?.remaining_balance || 0)}
                </div>
              </div>
            </div>

            {/* Combined ledger (كشف الحساب التفصيلي) with running balance */}
            {Array.isArray(statementData.statement) && statementData.statement.length > 0 && (
              <>
                <h4 className="text-sm font-bold text-gray-800 mb-2">كشف الحساب التفصيلي (رصيد أول المدة + الحركات)</h4>
                <div className="border border-gray-200 rounded-md overflow-hidden mb-5">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                      <tr>
                        <th className="py-2 px-3">التاريخ</th>
                        <th className="py-2 px-3">البيان</th>
                        <th className="py-2 px-3">المرجع</th>
                        <th className="py-2 px-3 text-left">مدين (مسدد)</th>
                        <th className="py-2 px-3 text-left">دائن (مشتريات)</th>
                        <th className="py-2 px-3 text-left">الرصيد بعد الحركة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statementData.statement.map((tx, idx) => (
                        <tr key={idx} className={tx.is_opening ? 'bg-blue-50/60 font-bold' : ''}>
                          <td className="py-2 px-3 text-gray-600">{tx.is_opening ? '-' : formatDate(tx.date)}</td>
                          <td className="py-2 px-3 text-gray-800">{tx.type}{tx.description ? ` - ${tx.description}` : ''}</td>
                          <td className="py-2 px-3 font-mono text-gray-600">{tx.reference || '-'}</td>
                          <td className="py-2 px-3 text-left font-semibold text-green-700">{tx.debit ? formatCurrency(tx.debit) : '-'}</td>
                          <td className="py-2 px-3 text-left font-semibold text-gray-900">{tx.credit ? formatCurrency(tx.credit) : '-'}</td>
                          <td className="py-2 px-3 text-left font-bold text-red-600">{formatCurrency(tx.balance_after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Invoices */}
            <h4 className="text-sm font-bold text-gray-800 mb-2">سجل الفواتير</h4>
            <div className="border border-gray-200 rounded-md overflow-hidden mb-5">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2 px-3">رقم الفاتورة</th>
                    <th className="py-2 px-3">التاريخ</th>
                    <th className="py-2 px-3 text-left">الإجمالي</th>
                    <th className="py-2 px-3 text-left">المدفوع</th>
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
                        <td className="py-2 px-3 text-left font-semibold text-gray-900">{formatCurrency(inv.total_amount)}</td>
                        <td className="py-2 px-3 text-left font-semibold text-gray-700">{formatCurrency(inv.paid_amount)}</td>
                        <td className="py-2 px-3 text-left font-bold text-red-600">{formatCurrency(inv.total_amount - inv.paid_amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Payments */}
            <h4 className="text-sm font-bold text-gray-800 mb-2">سجل السدادات والدفعات</h4>
            <div className="border border-gray-200 rounded-md overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 border-b border-gray-200 font-bold text-gray-700">
                  <tr>
                    <th className="py-2 px-3">رقم السند</th>
                    <th className="py-2 px-3">تاريخ الصرف</th>
                    <th className="py-2 px-3">الخزينة / الحساب</th>
                    <th className="py-2 px-3">طريقة الدفع</th>
                    <th className="py-2 px-3 text-left">المبلغ المسدد</th>
                    <th className="py-2 px-3">البيان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(!statementData.payments || statementData.payments.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-gray-400">لا توجد سندات سداد مسجلة</td>
                    </tr>
                  ) : (
                    statementData.payments.map(pay => (
                      <tr key={pay.id}>
                        <td className="py-2 px-3 font-mono font-bold">{pay.payment_number}</td>
                        <td className="py-2 px-3 text-gray-600">{formatDate(pay.payment_date)}</td>
                        <td className="py-2 px-3 text-gray-700">{pay.account_name}</td>
                        <td className="py-2 px-3 text-gray-700">{pay.payment_method || 'كاش'}</td>
                        <td className="py-2 px-3 text-left font-bold text-green-600">{formatCurrency(pay.amount)}</td>
                        <td className="py-2 px-3 text-gray-500">{pay.notes || '-'}</td>
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
