import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Edit, CheckCircle2, Building, Store } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { Validators, FieldError } from '../../utils/validation';

export default function StorageLocationsPage({ onNotify }) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    location_type: 'warehouse', // 'warehouse' | 'outlet' | 'fabric' | 'accessories'
    notes: ''
  });

  const [errors, setErrors] = useState({});

  const loadLocations = async () => {
    try {
      setLoading(true);
      const res = await api.getStorageLocations();
      const list = Array.isArray(res.data) ? res.data : [];
      setLocations(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      code: `LOC-${locations.length + 1}`,
      name: '',
      location_type: 'warehouse',
      notes: ''
    });
    setErrors({});
  };

  const handleEdit = (loc) => {
    setEditingId(loc.id);
    setForm({
      code: loc.code || '',
      name: loc.name || '',
      location_type: loc.location_type || 'warehouse',
      notes: loc.notes || ''
    });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'اسم موقع التخزين مطلوب' });
      return;
    }

    try {
      setSaving(true);
      if (editingId) {
        await api.updateStorageLocation(editingId, form);
        if (onNotify) onNotify('تم تحديث موقع التخزين بنجاح ✓');
      } else {
        await api.createStorageLocation(form);
        if (onNotify) onNotify('تم إضافة موقع التخزين بنجاح ✓');
      }
      resetForm();
      loadLocations();
    } catch (err) {
      alert(err.message || 'فشل في حفظ موقع التخزين');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer
      title="أماكن ومواقع التخزين (Storage Locations)"
      subtitle="إدارة مخازن المصنع (مخزن الأقمشة، المستلزمات، الإنتاج التام، ومخازن المعارض والمنافذ)"
      breadcrumbs={[
        { label: 'المخزن', href: '#/inventory' },
        { label: 'أماكن التخزين' }
      ]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Add / Edit Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#1F3A5F]" />
            {editingId ? 'تعديل موقع تخزين' : 'إضافة موقع تخزين جديد'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود الموقع
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))}
                placeholder="مثال: LOC-FAB-01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                اسم موقع التخزين <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="مثال: مخزن الأقمشة الرئيسي أو معرض وسط البلد"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.name} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                نوع موقع التخزين
              </label>
              <select
                value={form.location_type}
                onChange={(e) => setForm(p => ({ ...p, location_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="warehouse">مخزن عام رئيسي (Warehouse)</option>
                <option value="fabric">مخزن خامات وأقمشة (Fabric)</option>
                <option value="accessories">مخزن إكسسوارات ومستلزمات (Accessories)</option>
                <option value="outlet">مخزن فرع ومعرض بيع (Outlet Store)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
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
                {saving ? 'جاري الحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة الموقع'}
              </button>
            </div>
          </form>
        </div>

        {/* Right: Locations List */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">الكود</th>
                  <th className="p-3">اسم الموقع</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3">ملاحظات</th>
                  <th className="p-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locations.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-400">
                      لا توجد مواقع تخزين مسجلة بعد
                    </td>
                  </tr>
                ) : (
                  locations.map((loc, idx) => (
                    <tr key={loc.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{loc.code || loc.id}</td>
                      <td className="p-3 font-bold text-gray-900">{loc.name}</td>
                      <td className="p-3 text-gray-600">
                        <span className="bg-gray-100 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {loc.location_type === 'outlet' ? 'منفذ / معرض' : 'مخزن مصنع'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500">{loc.notes || '-'}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleEdit(loc)}
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
