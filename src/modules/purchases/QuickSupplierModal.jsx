import React, { useState } from 'react';
import { X, Truck, Save, AlertCircle } from 'lucide-react';
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
    supplier_type: 'goods',
    opening_balance: '0',
    opening_balance_type: 'credit',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

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
        supplier_type: 'goods',
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
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم الهاتف (محمول مصري)
              </label>
              <input
                type="text"
                dir="ltr"
                value={form.phone}
                onChange={(e) => {
                  const cleaned = sanitizeEgyptianPhoneInput(e.target.value);
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
