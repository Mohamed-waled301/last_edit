import React, { useState, useEffect } from 'react';
import { FolderTree, ArrowRight, Save, AlertCircle } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';

export default function ItemSectionFormPage({ sectionId = null, onBack, onNotify }) {
  const isEdit = Boolean(sectionId);

  const [form, setForm] = useState({
    code: '',
    name: '',
    group_id: '',
    notes: ''
  });

  const [groups, setGroups] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    loadData();
  }, [sectionId, isEdit]);

  const loadData = async () => {
    try {
      setLoading(true);
      const resGroups = await api.getItemGroups();
      const grpList = Array.isArray(resGroups.data) ? resGroups.data : (resGroups.groups || []);
      setGroups(grpList);

      if (isEdit && sectionId) {
        const res = await api.getItemSection(sectionId);
        const s = res.data || res.section;
        if (s) {
          setForm({
            code: s.code || '',
            name: s.name || '',
            group_id: s.group_id || (grpList.length > 0 ? grpList[0].id : ''),
            notes: s.notes || ''
          });
        }
      } else {
        setForm((prev) => ({
          ...prev,
          code: `SEC-${Date.now().toString().slice(-4)}`,
          group_id: prev.group_id || (grpList.length > 0 ? grpList[0].id : '')
        }));
      }
    } catch (err) {
      console.error('Failed to load item section data:', err);
      setServerError('تعذر تحميل بيانات قسم الصنف');
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const errs = {};
    if (!form.name || !form.name.trim()) {
      errs.name = 'اسم قسم الصنف مطلوب';
    }
    if (!form.code || !form.code.trim()) {
      errs.code = 'كود القسم مطلوب';
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
        await api.updateItemSection(sectionId, form);
        if (onNotify) onNotify('تم تحديث قسم الصنف بنجاح');
      } else {
        await api.createItemSection(form);
        if (onNotify) onNotify('تم إضافة قسم الصنف بنجاح');
      }

      if (onBack) onBack();
    } catch (err) {
      console.error('Save item section error:', err);
      setServerError(err.message || 'حدث خطأ أثناء حفظ قسم الصنف');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer title="قسم الصنف">
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          جاري تحميل بيانات قسم الصنف...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={isEdit ? 'تعديل قسم صنف' : 'إضافة قسم صنف جديد'}
      subtitle="تحديد بيانات القسم النوعي وتنسيقه مع مجموعة الأصناف الأم"
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
            <FolderTree className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-800">بيانات قسم الصنف الأساسية</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="section-code" className="block text-xs font-semibold text-slate-700 mb-1">
                كود القسم
              </label>
              <input
                id="section-code"
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">كود تسلسلي مميز للقسم</p>
              {errors.code && <p className="text-xs text-red-600 mt-1">{errors.code}</p>}
            </div>

            <div>
              <label htmlFor="section-name" className="block text-xs font-semibold text-slate-700 mb-1">
                اسم قسم الصنف *
              </label>
              <input
                id="section-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
              />
              <p className="text-[11px] text-slate-500 mt-1">مثال: قسم البنطلون الجينز، قسم التيشيرتات والبولو</p>
              {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="section-group" className="block text-xs font-semibold text-slate-700 mb-1">
                مجموعة الصنف الأم التابع لها
              </label>
              <select
                id="section-group"
                value={form.group_id}
                onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
              >
                <option value="">بدون مجموعة محددة (عام)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">ربط القسم بالمجموعة الأم لتحسين التنظيم والتقارير</p>
            </div>

            <div>
              <label htmlFor="section-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                ملاحظات وتفاصيل إضافية
              </label>
              <textarea
                id="section-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800"
              />
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
            <span>{saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة القسم'}</span>
          </button>
        </div>
      </form>
    </PageContainer>
  );
}
