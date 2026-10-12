import React, { useState, useEffect } from 'react';
import { Wallet, Plus, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function CashDisbursementFormPage({ onSaved, onNotify }) {
  const [expenseCodes, setExpenseCodes] = useState([]);
  const [treasuries, setTreasuries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    expense_code_id: '',
    expense_name: '',
    account_id: '',
    amount: '',
    tx_date: getTodayDateString(),
    payment_method: 'نقدية (كاش)',
    notes: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [codesRes, treasRes] = await Promise.all([
          api.getExpenseCodes(),
          api.getTreasuries()
        ]);

        const codes = Array.isArray(codesRes.data) ? codesRes.data : (Array.isArray(codesRes.expense_codes) ? codesRes.expense_codes : []);
        const treasList = Array.isArray(treasRes.treasuries) ? treasRes.treasuries : (Array.isArray(treasRes.data) ? treasRes.data : []);

        setExpenseCodes(codes);
        setTreasuries(treasList);

        if (codes.length > 0) {
          const first = codes[0];
          setForm(prev => ({
            ...prev,
            expense_code_id: first.id,
            expense_name: first.name,
            amount: first.default_amount ? String(first.default_amount) : prev.amount
          }));
        }

        if (treasList.length > 0) {
          setForm(prev => ({
            ...prev,
            account_id: treasList[0].id
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // When picking an expense code: amount auto-fills from code and is editable (Requirement G)
  const handleExpenseCodeChange = (codeId) => {
    const code = expenseCodes.find(c => String(c.id) === String(codeId));
    if (code) {
      setForm(prev => ({
        ...prev,
        expense_code_id: code.id,
        expense_name: code.name,
        amount: code.default_amount ? String(code.default_amount) : prev.amount
      }));
    }
  };

  const selectedTreasury = treasuries.find(t => String(t.id) === String(form.account_id));
  const availableBal = Number(selectedTreasury?.current_balance) || 0;
  const numAmount = Number(form.amount) || 0;
  const isBalanceInsufficient = numAmount > availableBal;

  const validate = () => {
    const errs = {};
    if (!form.expense_code_id) errs.expense_code_id = 'يرجى اختيار كود المصروف';
    if (!form.account_id) errs.account_id = 'يرجى اختيار الخزينة المنصرف منها';
    const amtErr = Validators.positiveNumber(form.amount, 'مبلغ الصرف');
    if (amtErr) errs.amount = amtErr;
    if (isBalanceInsufficient) {
      errs.amount = `الرصيد المتاح في (${selectedTreasury?.name || 'الخزينة'}) هو ${formatCurrency(availableBal)} ولا يكفي لصرف ${formatCurrency(numAmount)}`;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.disburseExpense({
        expense_code_id: form.expense_code_id,
        expense_name: form.expense_name,
        account_id: form.account_id,
        amount: numAmount,
        tx_date: form.tx_date,
        description: form.notes || `صرف مصروف ${form.expense_name}`
      });

      if (onNotify) onNotify('تم صرف النقدية وقيد المعاملة بالخزينة بنجاح');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/disbursements';
      }
    } catch (err) {
      alert(err.message || 'فشل في صرف النقدية');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.expense_code_id && form.account_id && numAmount > 0 && !isBalanceInsufficient);

  return (
    <PageContainer
      title="صرف نقدية جديد"
      subtitle="اختيار كود المصروف، الملء التلقائي للمبلغ، تحديد الخزينة المنصرف منها، وتسجيل حركة نقدية صادرة"
      breadcrumbs={[
        { label: 'صرف النقدية', href: '#/disbursements' },
        { label: 'سند صرف جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/disbursements'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="صرف النقدية وقيد السند"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>الخزينة: <span className="font-bold text-[#1F3A5F]">{selectedTreasury?.name || '-'}</span></span>
          <span className="text-gray-300">|</span>
          <span>الرصيد المتاح: <span className="font-mono text-green-700">{formatCurrency(availableBal)}</span></span>
          <span className="text-gray-300">|</span>
          <span>المبلغ المطلوب: <span className="font-mono text-base font-bold text-rose-700">{formatCurrency(numAmount)}</span></span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-rose-600" />
            بيانات سند صرف النقدية
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Expense Code Selector + Shortcut (Requirement G & B7) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  كود المصروف <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/expense-codes/new'; }}
                  className="text-[11px] font-bold text-[#1F3A5F] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ ضيف كود مصروف</span>
                </button>
              </div>
              <select
                value={form.expense_code_id}
                onChange={(e) => handleExpenseCodeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر كود المصروف --</option>
                {expenseCodes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} [{c.code}] {c.default_amount ? `- المبلغ الافتراضي: ${c.default_amount} ج.م` : ''}
                  </option>
                ))}
              </select>
              <FieldError error={errors.expense_code_id} />
              <span className="text-[11px] text-gray-400 mt-1 block">
                اختيار الكود يملأ المبلغ الافتراضي تلقائياً مع إمكانية تعديله
              </span>
            </div>

            {/* Source Treasury Selector (Requirement G) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الخزينة المنصرف منها <span className="text-red-500">*</span>
              </label>
              <select
                value={form.account_id}
                onChange={(e) => setForm(prev => ({ ...prev, account_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر الخزينة --</option>
                {treasuries.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} (رصيدها: {formatCurrency(t.current_balance)})
                  </option>
                ))}
              </select>
              <FieldError error={errors.account_id} />
            </div>

            {/* Amount (Auto-filled and editable) (Requirement G) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                مبلغ المصروف (ج.م) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 ${
                  isBalanceInsufficient ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              <FieldError error={errors.amount} />
            </div>

            {/* Transaction Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ سند الصرف
              </label>
              <input
                type="date"
                value={form.tx_date}
                onChange={(e) => setForm(prev => ({ ...prev, tx_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Notes / Description */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                البيان / ملاحظات الصرف
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
              <p className="text-xs text-gray-500 mt-1">تفاصيل الفاتورة أو المستفيد أو الإيصال</p>
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
