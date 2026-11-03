import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, CheckCircle2 } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { handleFormKeyDown } from '../../utils/formNavigation';

export default function PaymentMethodsPage({ onNotify }) {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: '',
    name: ''
  });

  const loadMethods = async () => {
    try {
      setLoading(true);
      const res = await api.getPaymentMethods();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.payment_methods) ? res.payment_methods : []);
      setMethods(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMethods();
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) return;

    try {
      setSaving(true);
      await api.createPaymentMethod({
        code: form.code.trim() || `PM-${methods.length + 1}`,
        name: form.name.trim()
      });

      if (onNotify) onNotify('تم إضافة طريقة الدفع بنجاح');
      setForm({ code: '', name: '' });
      loadMethods();
    } catch (err) {
      alert(err.message || 'فشل في حفظ طريقة الدفع');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="طرق دفع وسداد الموردين"
      subtitle="إدارة قائمة طرق السداد المتاحة (نقدية، تحويل بنكي، شيكات، إيداع) لاختيارها عند السداد"
      breadcrumbs={[
        { label: 'صرف النقدية', href: '#/disbursements' },
        { label: 'طرق الدفع' }
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#1F3A5F]" />
            إضافة طريقة دفع جديدة
          </h2>

          <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                اسم طريقة الدفع <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الكود التعريفي
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="w-full px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50 mt-2"
            >
              {saving ? 'جاري الإضافة...' : '+ إضافة طريقة الدفع'}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">الكود</th>
                  <th className="p-3">اسم طريقة الدفع</th>
                  <th className="p-3 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {methods.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="p-8 text-center text-gray-400">
                      لا توجد طرق دفع مسجلة
                    </td>
                  </tr>
                ) : (
                  methods.map((m, idx) => (
                    <tr key={m.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{m.code || `PM-${idx + 1}`}</td>
                      <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-600" />
                        <span>{m.name}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          متاحة للاستخدام
                        </span>
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
