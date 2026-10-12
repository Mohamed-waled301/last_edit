import React, { useState, useEffect } from 'react';
import { Layers, ArrowRight, Save, AlertCircle } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';

export default function ItemGroupFormPage({ groupId = null, onBack, onNotify }) {
  const isEdit = Boolean(groupId);

  const [form, setForm] = useState({
    code: '',
    name: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (isEdit && groupId) {
      loadGroup();
    } else {
      setForm((prev) => ({
        ...prev,
        code: `GRP-${Date.now().toString().slice(-4)}`
      }));
    }
  }, [groupId, isEdit]);

  const loadGroup = async () => {
    try {
      setLoading(true);
      const res = await api.getItemGroup(groupId);
      const g = res.data || res.group;
      if (g) {
        setForm({
          code: g.code || '',
          name: g.name || '',
          notes: g.notes || ''
        });
      }
    } catch (err) {
      console.error('Failed to load item group:', err);
      setServerError('تعذر تحميل بيانات مجموعة الصنف');
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name || !form.name.trim()) {
      errs.name = 'اسم مجموعة الصنف مطلوب';
    }
    if (!form.code || !form.code.trim()) {
      errs.code = 'كود المجموعة مطلوب';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      setServerError('');

      if (isEdit) {
        await api.updateItemGroup(groupId, form);
        if (onNotify) onNotify('تم تحديث مجموعة الصنف بنجاح');
      } else {
        await api.createItemGroup(form);
        if (onNotify) onNotify('تم إضافة مجموعة الصنف بنجاح');
      }

      if (onBack) onBack();
    } catch (err) {
      console.error('Save item group error:', err);
      setServerError(err.message || 'حدث خطأ أثناء حفظ مجموعة الصنف');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="مجموعة الصنف">
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          جاري تحميل بيانات مجموعة الصنف...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={isEdit ? 'تعديل مجموعة صنف' : 'إضافة مجموعة صنف جديدة'}
      subtitle="تحديد بيانات مجموعة الأصناف للتصنيف والتقارير الرقابية"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للقائمة</span>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {serverError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800 font-medium">{serverError}</div>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-800">بيانات مجموعة الصنف الأساسية</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="group-code" className="block text-xs font-semibold text-slate-700 mb-1">
                كود المجموعة
              </label>
              <input
                id="group-code"
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">كود مميز فريد لتمييز المجموعة</p>
              {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code}</p>}
            </div>

            <div>
              <label htmlFor="group-name" className="block text-xs font-semibold text-slate-700 mb-1">
                اسم مجموعة الصنف *
              </label>
              <input
                id="group-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
              />
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="group-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                بيان وتفاصيل المجموعة
              </label>
              <textarea
                id="group-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
              />
              <p className="text-[11px] text-slate-500 mt-1">ملاحظات توضيحية اختيارية تخص هذه المجموعة</p>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة المجموعة'}</span>
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
