import React, { useState, useEffect, useRef } from 'react';
import { Wallet, Search, CheckCircle2, AlertCircle, Users, Calendar, CreditCard, FileText } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import DocumentConfirmModal from '../../components/DocumentConfirmModal';
import MoneyInput from '../../components/MoneyInput';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString, formatDate } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import { navigationGuard } from '../../utils/navigationGuard';

export default function CustomerReceiptFormPage({ onSaved, onNotify, onBack }) {
  const today = getTodayDateString();
  const [customers, setCustomers] = useState([]);
  const [treasuries, setTreasuries] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerBalance, setCustomerBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const isSavedRef = useRef(false);

  const [form, setForm] = useState({
    customer_id: '',
    amount: '',
    payment_date: today,
    payment_method: 'نقداً',
    account_id: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [custRes, trRes, pmRes] = await Promise.all([
          api.getParties ? api.getParties() : api.getCustomers(),
          api.getTreasuries ? api.getTreasuries() : api.getAccounts(),
          api.getPaymentMethods ? api.getPaymentMethods() : Promise.resolve({ data: [] })
        ]);

        const allParties = Array.isArray(custRes.data) ? custRes.data : (custRes.parties || custRes.customers || []);
        const custs = allParties.filter(p => p.is_customer === 1);
        setCustomers(custs);

        const trData = trRes || {};
        const treasList = Array.isArray(trData.treasuries) ? trData.treasuries : (Array.isArray(trData.data) ? trData.data : []);
        setTreasuries(treasList);

        const mainAcc = treasList.find(t => t.is_main === 1) || treasList[0];
        if (mainAcc) {
          setForm(prev => ({ ...prev, account_id: mainAcc.id }));
        }

        const pms = Array.isArray(pmRes.data) ? pmRes.data : (pmRes.payment_methods || []);
        if (pms.length > 0) {
          setPaymentMethods(pms);
          setForm(prev => ({ ...prev, payment_method: pms[0].name }));
        } else {
          setPaymentMethods([
            { id: 'pm-1', name: 'نقداً' },
            { id: 'pm-2', name: 'تحويل بنكي' },
            { id: 'pm-3', name: 'فودافون كاش' },
            { id: 'pm-4', name: 'شيك' }
          ]);
        }
      } catch (err) {
        console.error('Failed to load customer receipt form data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Unsaved changes protection
  useEffect(() => {
    const unregister = navigationGuard.register(() => {
      if (isSavedRef.current) return false;
      if (form.customer_id) return true;
      if (form.amount && Number(form.amount) > 0) return true;
      if (form.notes.trim()) return true;
      return false;
    });
    return unregister;
  }, [form]);

  // When customer is selected
  const handleCustomerChange = async (customerId) => {
    setForm(prev => ({ ...prev, customer_id: customerId }));
    const cust = customers.find(c => String(c.id) === String(customerId));
    setSelectedCustomer(cust || null);

    if (customerId) {
      try {
        const stmt = await api.getParty ? api.getParty(customerId) : api.getCustomerStatement(customerId);
        const bal = stmt?.data?.customer_balance ?? stmt?.customer_balance ?? cust?.customer_balance ?? 0;
        setCustomerBalance(Number(bal) || 0);
      } catch (e) {
        setCustomerBalance(Number(cust?.customer_balance) || 0);
      }
    } else {
      setCustomerBalance(0);
    }
  };

  const selectedTreasury = treasuries.find(t => String(t.id) === String(form.account_id));
  const currentTreasuryBal = Number(selectedTreasury?.current_balance) || 0;
  const numAmount = Number(form.amount) || 0;
  const projectedTreasuryBal = Number((currentTreasuryBal + numAmount).toFixed(2));
  const projectedCustomerBal = Math.max(0, Number((customerBalance - numAmount).toFixed(2)));

  const validate = () => {
    const errs = {};
    if (!form.customer_id) errs.customer_id = 'يرجى اختيار العميل';
    if (!numAmount || numAmount <= 0) {
      errs.amount = 'قيمة الدفعة يجب أن تكون أكبر من صفر';
    } else if (numAmount > customerBalance) {
      errs.amount = `قيمة الدفعة (${formatCurrency(numAmount)}) لا يمكن أن تتجاوز رصيد المديونية المستحق على العميل (${formatCurrency(customerBalance)})`;
    }
    if (!form.account_id) errs.account_id = 'يرجى اختيار الخزينة المودع بها';
    if (!form.payment_date) errs.payment_date = 'تاريخ السند مطلوب';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleIssueClick = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;
    setShowConfirmModal(true);
  };

  const handleConfirmIssue = async () => {
    try {
      setSaving(true);
      const res = await api.recordCustomerReceipt({
        customer_id: form.customer_id,
        amount: numAmount,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        account_id: form.account_id,
        notes: form.notes.trim()
      });

      isSavedRef.current = true;
      if (onNotify) {
        onNotify(`تم إصدار سند استلام نقدية العميل برقم (${res.receiptNumber}) بنجاح`);
      }

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/disbursements';
      }
    } catch (err) {
      alert(err.message || 'فشل في إصدار سند استلام نقدية العميل');
    } finally {
      setSaving(false);
      setShowConfirmModal(false);
    }
  };

  const handleCancel = () => {
    if (onBack) onBack();
    else window.location.hash = '#/disbursements';
  };

  const isFormValid = Boolean(form.customer_id && numAmount > 0 && numAmount <= customerBalance && form.account_id);

  // Filtered customers for quick select
  const filteredCustomers = customers.filter(c => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (c.name || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q);
  });

  return (
    <PageContainer
      title="استلام نقدية من عميل"
      subtitle="تحصيل دفعة نقدية من عميل وتوريدها للخزينة لتخفيض رصيد مديونيته في قيد واحد"
      breadcrumbs={[
        { label: 'صرف النقدية', href: '#/disbursements' },
        { label: 'استلام نقدية' }
      ]}
      hasBottomBar={true}
      onSave={handleIssueClick}
      onCancel={handleCancel}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>العميل: <strong className="text-[#1F3A5F]">{selectedCustomer?.name || '-'}</strong></span>
          <span className="text-gray-300">|</span>
          <span>المديونية: <span className="font-mono text-emerald-700">{formatCurrency(customerBalance)}</span></span>
          <span className="text-gray-300">|</span>
          <span>الدفعة: <span className="font-mono text-blue-700 text-sm font-bold">{formatCurrency(numAmount)}</span></span>
          <span className="text-gray-300">|</span>
          <span>
            رصيد الخزينة بعدها: 
            <span className="font-mono mr-1 text-emerald-700 font-bold">
              {formatCurrency(projectedTreasuryBal)}
            </span>
          </span>
        </div>
      }
    >
      <form onSubmit={handleIssueClick} className="space-y-6">
        {/* Main Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2.5 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            بيانات العميل والمبلغ المحصل
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Choose Customer */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="receipt-customer-select" className="block text-xs font-bold text-gray-700">
                  اختيار العميل *
                </label>
                {selectedCustomer && (
                  <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 font-mono">
                    كود العميل: [{selectedCustomer.code}]
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <select
                    id="receipt-customer-select"
                    value={form.customer_id}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                    required
                  >
                    <option value="">-- اختر العميل --</option>
                    {filteredCustomers.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {c.name} (مستحق عليه: {formatCurrency(c.customer_balance || 0)})
                      </option>
                    ))}
                  </select>
                  <FieldError error={errors.customer_id} />
                </div>

                {/* Read-Only Owed Balance beside field */}
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-md flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-emerald-900 block">
                    الرصيد الحالي المستحق على العميل (عليه):
                  </span>
                  <span className="text-base font-bold text-emerald-700 font-mono">
                    {formatCurrency(customerBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Amount */}
            <div>
              <label htmlFor="customer-receipt-amount" className="block text-xs font-bold text-gray-700 mb-1">
                قيمة الدفعة (ج.م) *
              </label>
              <MoneyInput
                id="customer-receipt-amount"
                dir="ltr"
                value={form.amount}
                onChange={(e) => {
                  setForm(prev => ({ ...prev, amount: e.target.value }));
                  if (errors.amount) setErrors(prev => ({ ...prev, amount: null }));
                }}
                className={`w-full px-3 py-2 border rounded-md text-base font-mono font-bold text-left bg-white ${
                  errors.amount ? 'border-red-500 text-red-700 bg-red-50/20' : 'border-gray-300 text-slate-900'
                }`}
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                اكتب القيمة يدوياً. يجب أن تكون أكبر من 0 ولا تتجاوز الرصيد المستحق ({formatCurrency(customerBalance)}).
              </span>
              <FieldError error={errors.amount} />
            </div>

            {/* Treasury Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="receipt-treasury-select" className="block text-xs font-bold text-gray-700">
                  الخزينة المودع بها *
                </label>
                {selectedTreasury && (
                  <span className={`text-[11px] font-bold font-mono ${currentTreasuryBal < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    رصيد الخزينة: {formatCurrency(currentTreasuryBal)}
                  </span>
                )}
              </div>
              <select
                id="receipt-treasury-select"
                value={form.account_id}
                onChange={(e) => setForm(prev => ({ ...prev, account_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر الخزينة --</option>
                {treasuries.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_main ? '(الرئيسية)' : ''} [الرصيد: {formatCurrency(t.current_balance)}]
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-gray-500 mt-1 block">
                الافتراضي: الخزينة الرئيسية. سيتم زيادة رصيد الخزينة بقيمة الدفعة.
              </span>
              <FieldError error={errors.account_id} />
            </div>

            {/* Payment Date */}
            <div>
              <label htmlFor="receipt-date-input" className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ السند *
              </label>
              <input
                id="receipt-date-input"
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm(prev => ({ ...prev, payment_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.payment_date} />
            </div>

            {/* Payment Method */}
            <div>
              <label htmlFor="receipt-method-select" className="block text-xs font-bold text-gray-700 mb-1">
                طريقة التحصيل *
              </label>
              <select
                id="receipt-method-select"
                value={form.payment_method}
                onChange={(e) => setForm(prev => ({ ...prev, payment_method: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                {paymentMethods.map(pm => (
                  <option key={pm.id} value={pm.name}>{pm.name}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label htmlFor="receipt-notes-input" className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات وبيان التحصيل
              </label>
              <input
                id="receipt-notes-input"
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>

      {/* Confirmation Summary Modal (Requirement 2.2) */}
      <DocumentConfirmModal
        isOpen={showConfirmModal}
        title="تأكيد إصدار سند استلام نقدية العميل"
        message="يرجى مراجعة ملخص السند قبل الاعتماد النهائي؛ سيتم قيد العملية في المعاملات المالية وحساب العميل فوراً في حركة واحدة."
        confirmLabel="إصدار السند الآن"
        cancelLabel="تعديل البيانات"
        onConfirm={handleConfirmIssue}
        onClose={() => setShowConfirmModal(false)}
        onCancel={() => setShowConfirmModal(false)}
        isSubmitting={saving}
        summaryData={{
          'اسم العميل': selectedCustomer?.name || '-',
          'كود العميل': selectedCustomer?.code || '-',
          'الرصيد المستحق قبل الاستلام': formatCurrency(customerBalance),
          'قيمة الدفعة المحصلة': formatCurrency(numAmount),
          'الرصيد المتبقي على العميل بعد السداد': formatCurrency(projectedCustomerBal),
          'الخزينة المودع بها': selectedTreasury?.name || '-',
          'رصيد الخزينة قبل الاستلام': formatCurrency(currentTreasuryBal),
          'رصيد الخزينة بعد الاستلام': formatCurrency(projectedTreasuryBal),
          'طريقة التحصيل': form.payment_method,
          'تاريخ السند': formatDate(form.payment_date)
        }}
      />
    </PageContainer>
  );
}
