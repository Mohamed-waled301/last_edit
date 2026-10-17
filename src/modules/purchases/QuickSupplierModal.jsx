import React, { useState, useEffect } from 'react';
import { X, Truck, Save, AlertCircle, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { sanitizeEgyptianPhoneInput, validateEgyptianMobile } from '../../utils/phone';
import { FieldError } from '../../utils/validation';
import { MoneyInput } from '../../components/MoneyInput';

export default function QuickSupplierModal({
  isOpen,
  onClose,
  existingSuppliers = [],
  onSupplierCreated
}) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    tax_number: '',
    supplier_type: '',
    opening_balance: '0',
    opening_balance_type: 'credit',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  const [activityTypes, setActivityTypes] = useState([]);
  const [quickAddActivityOpen, setQuickAddActivityOpen] = useState(false);
  const [newActivityName, setNewActivityName] = useState('');
  const [activityError, setActivityError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    async function loadActivities() {
      try {
        const res = await api.getSupplierActivityTypes();
        const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.types) ? res.types : []);
        if (isMounted) setActivityTypes(list);
      } catch (err) {
        console.warn('Failed to load supplier activity types in modal:', err);
      }
    }
    loadActivities();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errs = {};
    const trimmedName = form.name.trim();

    if (!trimmedName) {
      errs.name = 'اسم المورد مطلوب';
    } else {
      // Prevent duplicate supplier by name
      const duplicate = existingSuppliers.some(
        (s) => s.name && s.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        errs.name = 'يوجد مورد مسجل بهذا الاسم بالفعل';
      }
    }

    if (!form.supplier_type) {
      errs.supplier_type = 'برجاء اختيار نوع نشاط المورد';
    }

    if (form.phone) {
      const phoneErr = validateEgyptianMobile(form.phone, { required: false });
      if (phoneErr) {
        errs.phone = phoneErr;
      }
    }

    if (form.opening_balance !== '') {
      const ob = Number(form.opening_balance);
      if (isNaN(ob) || ob < 0) {
        errs.opening_balance = 'رصيد أول المدة يجب أن يكون رقماً لا يقل عن صفر';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleQuickAddActivity = async () => {
    const name = newActivityName.trim();
    if (!name) {
      setActivityError('اسم نوع النشاط مطلوب');
      return;
    }

    const isDuplicate = activityTypes.some(
      (t) => (t.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
      setActivityError('نوع نشاط المورد مسجل مسبقاً');
      return;
    }

    try {
      setActivityError('');
      const res = await api.createSupplierActivityType({ name });
      const created = res.data || res.activityType || { id: `sat-${Date.now()}`, name };
      setActivityTypes((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, supplier_type: created.name }));
      if (errors.supplier_type) {
        setErrors((prev) => ({ ...prev, supplier_type: null }));
      }
      setNewActivityName('');
      setQuickAddActivityOpen(false);
    } catch (err) {
      setActivityError(err.message || 'تعذر إضافة نوع النشاط');
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setServerError('');

    if (!validate()) {
      return;
    }

    try {
      setSaving(true);
      const supplierData = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        tax_number: form.tax_number.trim(),
        supplier_type: form.supplier_type,
        is_supplier: 1,
        is_customer: 0,
        type: 'supplier',
        supplied_all_items: true,
        opening_balance: Number(form.opening_balance) || 0,
        opening_balance_type: form.opening_balance_type,
        supplier_opening_balance: Number(form.opening_balance) || 0,
        supplier_opening_type: form.opening_balance_type,
        notes: form.notes.trim()
      };

      const res = await api.createParty(supplierData);
      const created = res.data || res.party || res.supplier;

      // Reset form and notify parent
      setForm({
        name: '',
        phone: '',
        address: '',
        tax_number: '',
        supplier_type: '',
        opening_balance: '0',
        opening_balance_type: 'credit',
        notes: ''
      });
      setErrors({});

      if (onSupplierCreated && created) {
        await onSupplierCreated(created);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create supplier:', err);
      setServerError(err.message || 'حدث خطأ أثناء حفظ المورد الجديد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-supplier-modal-title"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-right space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <h3 id="quick-supplier-modal-title" className="text-base font-bold text-slate-900">
              إضافة مورد جديد
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {serverError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              اسم المورد أو الشركة *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, name: e.target.value }));
                if (errors.name) setErrors((prev) => ({ ...prev, name: null }));
              }}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              autoFocus
              required
            />
            <FieldError error={errors.name} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              نوع نشاط المورد *
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={form.supplier_type}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, supplier_type: e.target.value }));
                  if (errors.supplier_type) setErrors((prev) => ({ ...prev, supplier_type: null }));
                }}
                className={`flex-1 px-3.5 py-2 border rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 ${
                  errors.supplier_type ? 'border-rose-500 bg-rose-50/30' : 'border-slate-300'
                }`}
              >
                <option value="">-- اختر نوع نشاط المورد --</option>
                {activityTypes.map((act) => (
                  <option key={act.id || act.name} value={act.name}>
                    {act.name}
                  </option>
                ))}
                {form.supplier_type && !activityTypes.some((act) => act.name === form.supplier_type) && (
                  <option value={form.supplier_type}>
                    {form.supplier_type === 'service'
                      ? 'خدمات تشغيل لدى الغير (سابق)'
                      : form.supplier_type === 'goods'
                        ? 'توريد خامات ومستلزمات إنتاج'
                        : form.supplier_type}
                  </option>
                )}
              </select>
              <button
                type="button"
                onClick={() => {
                  setQuickAddActivityOpen((prev) => !prev);
                  setActivityError('');
                }}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-blue-600 transition-colors shrink-0 cursor-pointer"
                title="إضافة نوع نشاط جديد"
                aria-label="إضافة نوع نشاط جديد"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <FieldError error={errors.supplier_type} />

            {quickAddActivityOpen && (
              <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <label htmlFor="quick-modal-activity-input" className="block text-[11px] font-semibold text-blue-900">
                  اسم نوع النشاط الجديد *
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="quick-modal-activity-input"
                    type="text"
                    value={newActivityName}
                    onChange={(e) => {
                      setNewActivityName(e.target.value);
                      if (activityError) setActivityError('');
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-blue-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-slate-800"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddActivity}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold cursor-pointer"
                  >
                    حفظ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddActivityOpen(false);
                      setNewActivityName('');
                      setActivityError('');
                    }}
                    className="px-2.5 py-1.5 text-xs bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
                {activityError && (
                  <div className="text-[11px] text-rose-600 font-semibold">{activityError}</div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الهاتف (محمول مصري)
              </label>
              <input
                type="text"
                dir="ltr"
                value={form.phone || ''}
                onChange={(e) => {
                  let raw = e?.target?.value ?? '';
                  raw = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
                  const cleaned = raw.replace(/\D/g, '').slice(0, 11);
                  setForm((prev) => ({ ...prev, phone: cleaned }));
                  if (errors.phone) setErrors((prev) => ({ ...prev, phone: null }));
                }}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-left font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
              <FieldError error={errors.phone} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الرقم الضريبي (إن وجد)
              </label>
              <input
                type="text"
                value={form.tax_number}
                onChange={(e) => setForm((prev) => ({ ...prev, tax_number: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              العنوان والمقر
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رصيد أول المدة (ج.م)
              </label>
              <MoneyInput
                value={form.opening_balance}
                onChange={(val) => setForm((prev) => ({ ...prev, opening_balance: val }))}
                aria-label="رصيد أول المدة"
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
              <FieldError error={errors.opening_balance} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                طبيعة رصيد أول المدة
              </label>
              <select
                value={form.opening_balance_type}
                onChange={(e) => setForm((prev) => ({ ...prev, opening_balance_type: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              >
                <option value="credit">دائن — له (مستحق للمورد)</option>
                <option value="debit">مدين — عليه (دفعة مقدمة له)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات إضافية
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ المورد واختياره'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
