import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, AlertTriangle, Store, DollarSign, Plus } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api, getActiveUser } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import QuickOutletModal from '../outlets/QuickOutletModal';
import { MoneyInput } from '../../components/MoneyInput';

export default function DailyClosingFormPage({ onSaved, onNotify }) {
  const activeUser = getActiveUser();
  const [outlets, setOutlets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showQuickOutletModal, setShowQuickOutletModal] = useState(false);

  const [form, setForm] = useState({
    outlet_id: activeUser.outlet_id || '',
    closing_date: getTodayDateString(),
    cashier_name: activeUser.full_name || '',
    opening_cash: '0',
    cash_sales: '0',
    cash_expenses: '0',
    actual_cash_counted: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const outRes = await api.getOutlets();
        const list = Array.isArray(outRes.data) ? outRes.data : [];
        setOutlets(list);
        if (list.length > 0 && !form.outlet_id) {
          setForm(prev => ({ ...prev, outlet_id: list[0].id }));
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, []);

  const handleOutletCreated = async (newOutlet) => {
    try {
      const outRes = await api.getOutlets();
      const list = Array.isArray(outRes.data) ? outRes.data : [];
      setOutlets(list);
      if (newOutlet?.id) {
        setForm(p => ({ ...p, outlet_id: newOutlet.id }));
      }
    } catch (err) {
      console.error('Failed to reload outlets:', err);
    }
  };

  const openCash = Number(form.opening_cash) || 0;
  const sales = Number(form.cash_sales) || 0;
  const expenses = Number(form.cash_expenses) || 0;
  const systemExpected = openCash + sales - expenses;
  const counted = Number(form.actual_cash_counted) || 0;
  const diff = counted - systemExpected;

  const validate = () => {
    const errs = {};
    if (!form.outlet_id) errs.outlet_id = 'يرجى اختيار المنفذ / المعرض';
    if (!form.actual_cash_counted || isNaN(counted) || counted < 0) {
      errs.actual_cash_counted = 'يرجى إدخال النقدية الفعلية المحصورة بالدرج';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.performDailyClosing({
        outlet_id: form.outlet_id,
        closing_date: form.closing_date,
        cashier_name: form.cashier_name,
        opening_cash: openCash,
        cash_sales: sales,
        cash_expenses: expenses,
        actual_cash_counted: counted,
        notes: form.notes
      });

      if (onNotify) onNotify('تم اعتماد تقفيل الوردية اليومية بنجاح');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/treasuries';
      }
    } catch (err) {
      alert(err.message || 'فشل في تقفيل الوردية');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="تقفيل الوردية اليومية للكاشير"
      subtitle="حصر النقدية الفعلية ومطابقتها مع مبيعات المنفذ والمصروفات، واحتساب العجز أو الزيادة"
      breadcrumbs={[
        { label: 'الخزائن', href: '#/treasuries' },
        { label: 'تقفيل الوردية' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/treasuries'; }}
      isSaving={saving}
      saveDisabled={!form.actual_cash_counted || saving}
      saveText="اعتماد تقفيل الوردية"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>المتوقع دفترياً: <span className="font-mono">{formatCurrency(systemExpected)}</span></span>
          <span className="text-gray-300">|</span>
          <span>الفعلي بالدرج: <span className="font-mono text-green-700">{formatCurrency(counted)}</span></span>
          <span className="text-gray-300">|</span>
          <span className={diff === 0 ? 'text-gray-600' : diff > 0 ? 'text-emerald-700' : 'text-rose-700'}>
            الفارق: <span className="font-mono font-bold">{diff === 0 ? 'مطابق تماماً (0)' : diff > 0 ? `+${formatCurrency(diff)} (فائض)` : `${formatCurrency(diff)} (عجز)`}</span>
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#1F3A5F]" />
            بيانات الوردية والكاشير
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="daily-closing-outlet-select" className="block text-xs font-bold text-gray-700">
                  المنفذ / المعرض <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickOutletModal(true)}
                  className="text-[11px] font-bold text-[#1F3A5F] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  title="إضافة فرع أو معرض جديد سريعاً"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ فرع جديد</span>
                </button>
              </div>
              <select
                id="daily-closing-outlet-select"
                aria-required="true"
                aria-invalid={Boolean(errors.outlet_id)}
                value={form.outlet_id}
                onChange={(e) => setForm(p => ({ ...p, outlet_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر المنفذ --</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <FieldError error={errors.outlet_id} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                اسم الكاشير / المسؤول
              </label>
              <input
                type="text"
                value={form.cashier_name}
                onChange={(e) => setForm(p => ({ ...p, cashier_name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ تقفيل الوردية
              </label>
              <input
                type="date"
                value={form.closing_date}
                onChange={(e) => setForm(p => ({ ...p, closing_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
              />
            </div>
          </div>
        </div>

        {/* Financial Counts Grid */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            حصر المبيعات والنقدية المحسوبة
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">عهدة بداية الوردية (ج.م)</label>
              <MoneyInput
                value={form.opening_cash}
                onChange={(val) => setForm(p => ({ ...p, opening_cash: val }))}
                aria-label="عهدة بداية الوردية"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">مبيعات نقدية خلال الوردية (ج.م)</label>
              <MoneyInput
                value={form.cash_sales}
                onChange={(val) => setForm(p => ({ ...p, cash_sales: val }))}
                aria-label="مبيعات نقدية خلال الوردية"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold text-green-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">مصروفات نقدية بالمعرض (ج.م)</label>
              <MoneyInput
                value={form.cash_expenses}
                onChange={(val) => setForm(p => ({ ...p, cash_expenses: val }))}
                aria-label="مصروفات نقدية بالمعرض"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold text-rose-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">النقدية الفعلية بالدرج (ج.م) <span className="text-red-500">*</span></label>
              <MoneyInput
                value={form.actual_cash_counted}
                onChange={(val) => setForm(p => ({ ...p, actual_cash_counted: val }))}
                aria-label="النقدية الفعلية بالدرج"
                className="w-full px-3 py-2 border border-emerald-400 rounded-md text-sm font-mono font-bold text-emerald-800 bg-emerald-50/20"
                required
              />
              <FieldError error={errors.actual_cash_counted} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات التقفيل</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">أي فروقات أو ملاحظات استلام</p>
          </div>
        </div>
      </form>

      {/* Quick Outlet Modal */}
      <QuickOutletModal
        isOpen={showQuickOutletModal}
        onClose={() => setShowQuickOutletModal(false)}
        onCreated={handleOutletCreated}
        onNotify={onNotify}
      />
    </PageContainer>
  );
}
