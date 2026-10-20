import React, { useState, useEffect, useRef } from 'react';
import { Wallet, Search, CheckCircle2, AlertCircle, Building2, Calendar, CreditCard, FileText } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import DocumentConfirmModal from '../../components/DocumentConfirmModal';
import MoneyInput from '../../components/MoneyInput';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString, formatDate } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import { navigationGuard } from '../../utils/navigationGuard';
import { handleFormKeyDown } from '../../utils/formNavigation';

export default function SupplierPaymentFormPage({ onSaved, onNotify, onBack }) {
  const today = getTodayDateString();
  const [suppliers, setSuppliers] = useState([]);
  const [treasuries, setTreasuries] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [supplierBalance, setSupplierBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const isSavedRef = useRef(false);

  const [form, setForm] = useState({
    supplier_id: '',
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
        const [supRes, trRes, pmRes] = await Promise.all([
          api.getParties ? api.getParties() : api.getSuppliers(),
          api.getTreasuries ? api.getTreasuries() : api.getAccounts(),
          api.getPaymentMethods ? api.getPaymentMethods() : Promise.resolve({ data: [] })
        ]);

        const allParties = Array.isArray(supRes.data) ? supRes.data : (supRes.parties || supRes.suppliers || []);
        const sups = allParties.filter(p => p.is_supplier === 1);
        setSuppliers(sups);

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
            { id: 'pm-3', name: 'شيك' }
          ]);
        }
      } catch (err) {
        console.error('Failed to load supplier payment form data:', err);
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
      if (form.supplier_id) return true;
      if (form.amount && Number(form.amount) > 0) return true;
      if (form.notes.trim()) return true;
      return false;
    });
    return unregister;
  }, [form]);

  // When supplier is selected
  const handleSupplierChange = async (supplierId) => {
    setForm(prev => ({ ...prev, supplier_id: supplierId }));
    const sup = suppliers.find(s => String(s.id) === String(supplierId));
    setSelectedSupplier(sup || null);

    if (supplierId) {
      try {
        const stmt = await api.getParty ? api.getParty(supplierId) : api.getSupplierStatement(supplierId);
        const bal = stmt?.data?.supplier_balance ?? stmt?.supplier_balance ?? sup?.supplier_balance ?? 0;
        setSupplierBalance(Number(bal) || 0);
      } catch (e) {
        setSupplierBalance(Number(sup?.supplier_balance) || 0);
      }
    } else {
      setSupplierBalance(0);
    }
  };

  const selectedTreasury = treasuries.find(t => String(t.id) === String(form.account_id));
  const currentTreasuryBal = Number(selectedTreasury?.current_balance) || 0;
  const numAmount = Number(form.amount) || 0;
  const projectedTreasuryBal = Number((currentTreasuryBal - numAmount).toFixed(2));
  const projectedSupplierBal = Math.max(0, Number((supplierBalance - numAmount).toFixed(2)));

  const validate = () => {
    const errs = {};
    if (!form.supplier_id) errs.supplier_id = 'يرجى اختيار المورد';
    if (!numAmount || numAmount <= 0) {
      errs.amount = 'دفعة المورد يجب أن تكون أكبر من صفر';
    } else if (numAmount > supplierBalance) {
      errs.amount = `مبلغ دفعة المورد (${formatCurrency(numAmount)}) لا يمكن أن يتجاوز رصيد المديونية المستحق له (${formatCurrency(supplierBalance)})`;
    }
    if (!form.account_id) errs.account_id = 'يرجى اختيار الخزينة المنصرف منها';
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
      const res = await api.recordSupplierPayment({
        supplier_id: form.supplier_id,
        amount: numAmount,
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        account_id: form.account_id,
        notes: form.notes.trim()
      });

      isSavedRef.current = true;
      navigationGuard.unregister();
      if (onNotify) {
        onNotify(`تم إصدار سند سداد دفعة المورد برقم (${res.paymentNumber}) بنجاح`);
      }

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/disbursements';
      }
    } catch (err) {
      alert(err.message || 'فشل في إصدار سند سداد دفعة المورد');
    } finally {
      setSaving(false);
      setShowConfirmModal(false);
    }
  };

  const handleCancel = () => {
    if (onBack) onBack();
    else window.location.hash = '#/disbursements';
  };

  const isFormValid = Boolean(form.supplier_id && numAmount > 0 && numAmount <= supplierBalance && form.account_id);

  // Filtered suppliers for quick select
  const filteredSuppliers = suppliers.filter(s => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (s.name || '').toLowerCase().includes(q) || (s.code || '').toLowerCase().includes(q);
  });

  return (
    <PageContainer
      title="مدفوعات مورد جديدة"
      subtitle="سداد دفعة نقدية لمورد من الخزينة لتخفيض رصيد المديونية المستحق له في قيد واحد"
      breadcrumbs={[
        { label: 'صرف النقدية', href: '#/disbursements' },
        { label: 'مدفوعات مورد' }
      ]}
      hasBottomBar={true}
      onSave={handleIssueClick}
      onCancel={handleCancel}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>المورد: <strong className="text-[#1F3A5F]">{selectedSupplier?.name || '-'}</strong></span>
          <span className="text-gray-300">|</span>
          <span>المديونية: <span className="font-mono text-blue-700">{formatCurrency(supplierBalance)}</span></span>
          <span className="text-gray-300">|</span>
          <span>الدفعة: <span className="font-mono text-rose-700 text-sm font-bold">{formatCurrency(numAmount)}</span></span>
          <span className="text-gray-300">|</span>
          <span>
            رصيد الخزينة بعدها: 
            <span className={`font-mono mr-1 ${projectedTreasuryBal < 0 ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}`}>
              {formatCurrency(projectedTreasuryBal)}
            </span>
          </span>
        </div>
      }
    >
      <form onSubmit={handleIssueClick} onKeyDown={handleFormKeyDown} className="space-y-6">
        {/* Main Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-5">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2.5 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            بيانات المورد والمبلغ المنصرف
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Choose Supplier */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="payment-supplier-select" className="block text-xs font-bold text-gray-700">
                  اختيار المورد *
                </label>
                {selectedSupplier && (
                  <div className="text-xs font-bold text-blue-800 bg-blue-50 px-2.5 py-1 rounded border border-blue-200 font-mono">
                    كود المورد: [{selectedSupplier.code}]
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <select
                    id="payment-supplier-select"
                    value={form.supplier_id}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                    required
                  >
                    <option value="">-- اختر المورد --</option>
                    {filteredSuppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        [{s.code}] {s.name} (مستحق له: {formatCurrency(s.supplier_balance || 0)})
                      </option>
                    ))}
                  </select>
                  <FieldError error={errors.supplier_id} />
                </div>

                {/* Read-Only Owed Balance beside field */}
                <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-md flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-blue-900 block">
                    الرصيد الحالي المستحق للمورد (له):
                  </span>
                  <span className="text-base font-bold text-blue-700 font-mono">
                    {formatCurrency(supplierBalance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Amount */}
            <div>
              <label htmlFor="supplier-payment-amount" className="block text-xs font-bold text-gray-700 mb-1">
                دفعة المورد (ج.م) *
              </label>
              <MoneyInput
                id="supplier-payment-amount"
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
                اكتب القيمة يدوياً. يجب أن تكون أكبر من 0 ولا تتجاوز الرصيد المستحق ({formatCurrency(supplierBalance)}).
              </span>
              <FieldError error={errors.amount} />
            </div>

            {/* Treasury Selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="payment-treasury-select" className="block text-xs font-bold text-gray-700">
                  الخزينة المنصرف منها *
                </label>
                {selectedTreasury && (
                  <span className={`text-[11px] font-bold font-mono ${currentTreasuryBal < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    رصيد الخزينة: {formatCurrency(currentTreasuryBal)}
                  </span>
                )}
              </div>
              <select
                id="payment-treasury-select"
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
                الافتراضي: الخزينة الرئيسية. يمكن أن يصبح الرصيد سالباً بالأحمر دون حظر الصرف.
              </span>
              <FieldError error={errors.account_id} />
            </div>

            {/* Payment Date */}
            <div>
              <label htmlFor="payment-date-input" className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ السند *
              </label>
              <input
                id="payment-date-input"
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
              <label htmlFor="payment-method-select" className="block text-xs font-bold text-gray-700 mb-1">
                طريقة الدفع *
              </label>
              <select
                id="payment-method-select"
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
              <label htmlFor="payment-notes-input" className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات وبيان الصرف
              </label>
              <input
                id="payment-notes-input"
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>

      {/* Confirmation Summary Modal (Requirement 2.1) */}
      <DocumentConfirmModal
        isOpen={showConfirmModal}
        title="تأكيد إصدار سند سداد دفعة المورد"
        message="يرجى مراجعة ملخص السند قبل الاعتماد النهائي؛ سيتم قيد العملية في المعاملات المالية وحساب المورد فوراً في حركة واحدة."
        confirmLabel="إصدار السند الآن"
        cancelLabel="تعديل البيانات"
        onConfirm={handleConfirmIssue}
        onClose={() => setShowConfirmModal(false)}
        onCancel={() => setShowConfirmModal(false)}
        isSubmitting={saving}
        summaryData={{
          'اسم المورد': selectedSupplier?.name || '-',
          'كود المورد': selectedSupplier?.code || '-',
          'الرصيد المستحق قبل السداد': formatCurrency(supplierBalance),
          'مبلغ دفعة المورد': formatCurrency(numAmount),
          'الرصيد المتبقي للمورد بعد السداد': formatCurrency(projectedSupplierBal),
          'الخزينة المنصرف منها': selectedTreasury?.name || '-',
          'رصيد الخزينة قبل السداد': formatCurrency(currentTreasuryBal),
          'رصيد الخزينة بعد السداد': formatCurrency(projectedTreasuryBal),
          'طريقة الدفع': form.payment_method,
          'تاريخ السند': formatDate(form.payment_date)
        }}
      />
    </PageContainer>
  );
}
