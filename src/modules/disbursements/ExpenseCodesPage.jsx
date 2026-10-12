import React, { useState, useEffect } from 'react';
import { Tag, Plus, Edit, CheckCircle2 } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

export default function ExpenseCodesPage({ onNotify }) {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    default_amount: ''
  });

  const [errors, setErrors] = useState({});

  const loadCodes = async () => {
    try {
      setLoading(true);
      const res = await api.getExpenseCodes();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.expense_codes) ? res.expense_codes : []);
      setCodes(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCodes();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      code: `EXP-${codes.length + 1}`,
      name: '',
      default_amount: ''
    });
    setErrors({});
  };

  const handleEdit = (c) => {
    setEditingId(c.id);
    setForm({
      code: c.code || '',
      name: c.name || '',
      default_amount: c.default_amount ? String(c.default_amount) : ''
    });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'اسم كود المصروف مطلوب' });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        default_amount: Number(form.default_amount) || 0
      };

      if (editingId) {
        await api.updateExpenseCode(editingId, payload);
        if (onNotify) onNotify('تم تحديث كود المصروف بنجاح');
      } else {
        await api.createExpenseCode(payload);
        if (onNotify) onNotify('تم إضافة كود المصروف بنجاح');
      }

      resetForm();
      loadCodes();
    } catch (err) {
      alert(err.message || 'فشل في حفظ كود المصروف');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="شاشة تكويد المصروفات"
      subtitle="إدارة أكواد المصروفات التشغيلية والمبالغ الافتراضية للتعبئة الآلية في سندات الصرف"
      breadcrumbs={[
        { label: 'صرف النقدية', href: '#/disbursements' },
        { label: 'أكواد المصروفات' }
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form: "ضيف كود مصروف" (Requirement B6) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#1F3A5F]" />
            {editingId ? 'تعديل كود مصروف' : 'ضيف كود مصروف جديد'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود المصروف
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                اسم المصروف <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.name} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                المبلغ الافتراضي (ج.م)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.default_amount}
                onChange={(e) => setForm(p => ({ ...p, default_amount: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
              <span className="text-[11px] text-gray-400 mt-1 block">
                يمكّن الشاشة من ملء المبلغ تلقائياً فور اختيار الكود
              </span>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3.5 py-2 rounded-md border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء التعديل
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : editingId ? 'حفظ التعديلات' : 'ضيف كود مصروف'}
              </button>
            </div>
          </form>
        </div>

        {/* Expense Codes List */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">الكود</th>
                  <th className="p-3">اسم المصروف</th>
                  <th className="p-3 text-left font-mono">المبلغ الافتراضي</th>
                  <th className="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {codes.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center text-gray-400">
                      لا توجد أكواد مصروفات مسجلة بعد
                    </td>
                  </tr>
                ) : (
                  codes.map((c, idx) => (
                    <tr key={c.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{c.code}</td>
                      <td className="p-3 font-bold text-gray-900">{c.name}</td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-700">
                        {c.default_amount ? formatCurrency(c.default_amount) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleEdit(c)}
                          className="px-2 py-1 text-xs text-[#1F3A5F] hover:bg-blue-50 rounded font-bold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
