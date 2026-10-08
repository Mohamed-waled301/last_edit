import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Landmark, Store, CheckCircle2, AlertCircle } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function OutletTransferFormPage({ onSaved, onNotify }) {
  const [outletTreasuries, setOutletTreasuries] = useState([]);
  const [mainTreasury, setMainTreasury] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    from_treasury_id: '',
    amount: '',
    transfer_date: getTodayDateString(),
    notes: 'توريد إيراد المنفذ إلى الخزينة المركزية الرئيسية'
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await api.getTreasuries();
        const safeList = Array.isArray(res.treasuries) ? res.treasuries : (Array.isArray(res.data) ? res.data : []);
        const main = res.mainTreasury || res.main_treasury || safeList.find(a => a?.is_main);
        const outlets = Array.isArray(res.outletTreasuries) ? res.outletTreasuries : safeList.filter(a => !a?.is_main);

        setMainTreasury(main);
        setOutletTreasuries(outlets);

        if (outlets.length > 0) {
          setForm(prev => ({
            ...prev,
            from_treasury_id: outlets[0].id
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

  const selectedFromTreasury = outletTreasuries.find(t => String(t.id) === String(form.from_treasury_id));
  const availableBal = Number(selectedFromTreasury?.current_balance) || 0;
  const numAmount = Number(form.amount) || 0;
  const isBalanceInsufficient = numAmount > availableBal;

  const validate = () => {
    const errs = {};
    if (!form.from_treasury_id) errs.from_treasury_id = 'يرجى اختيار خزينة المنفذ المصدر';
    const amtErr = Validators.positiveNumber(form.amount, 'مبلغ التوريد');
    if (amtErr) errs.amount = amtErr;
    if (isBalanceInsufficient) {
      errs.amount = `مبلغ التحويل (${numAmount} ج.م) أكبر من الرصيد المتاح بالخزينة (${availableBal} ج.م)`;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      await api.transferOutletToMain({
        from_treasury_id: form.from_treasury_id,
        amount: numAmount,
        transfer_date: form.transfer_date,
        notes: form.notes
      });

      if (onNotify) onNotify('تم توريد النقدية إلى الخزينة المركزية بنجاح ✓');

      if (onSaved) {
        onSaved();
      } else {
        window.location.hash = '#/treasuries';
      }
    } catch (err) {
      alert(err.message || 'فشل في توريد النقدية');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(form.from_treasury_id && numAmount > 0 && !isBalanceInsufficient);

  return (
    <PageContainer
      title="توريد نقدية من المعرض للخزينة الرئيسية (Outlet -> Main)"
      subtitle="نقل السيولة النقدية من خزينة نقطة البيع بالمعرض إلى الخزينة المركزية المجمعة"
      breadcrumbs={[
        { label: 'الخزائن', href: '#/treasuries' },
        { label: 'توريد للمركزية' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/treasuries'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="تنفيذ التوريد النقدي"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-[#1F3A5F]" />
            بيانات حركة التوريد
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* From Outlet Treasury */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                من خزينة المنفذ / المعرض <span className="text-red-500">*</span>
              </label>
              <select
                value={form.from_treasury_id}
                onChange={(e) => setForm(prev => ({ ...prev, from_treasury_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر خزينة المعرض --</option>
                {outletTreasuries.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.outlet_name}) - الرصيد: {formatCurrency(t.current_balance)}
                  </option>
                ))}
              </select>
              <FieldError error={errors.from_treasury_id} />
              {selectedFromTreasury && (
                <span className="text-xs text-gray-500 mt-1 block font-semibold">
                  الرصيد المتاح للتحويل: <strong className="text-green-700 font-mono">{formatCurrency(availableBal)}</strong>
                </span>
              )}
            </div>

            {/* To Main Treasury (Fixed destination) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                إلى الخزينة المركزية الرئيسية (الوجهة)
              </label>
              <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-bold text-[#1F3A5F] flex items-center justify-between">
                <span>{mainTreasury?.name || 'الخزينة المركزية الرئيسية المجمعة'}</span>
                <span className="font-mono text-xs text-gray-500">رصيدها الحالي: {formatCurrency(mainTreasury?.current_balance || 0)}</span>
              </div>
            </div>

            {/* Transfer Amount */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                مبلغ التوريد (ج.م) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 ${
                  isBalanceInsufficient ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 focus:ring-[#1F3A5F]'
                }`}
                required
              />
              <FieldError error={errors.amount} />
            </div>

            {/* Transfer Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ حركة التوريد
              </label>
              <input
                type="date"
                value={form.transfer_date}
                onChange={(e) => setForm(prev => ({ ...prev, transfer_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات أو بيان السند
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
