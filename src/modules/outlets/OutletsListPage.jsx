import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Plus,
  Search,
  Edit,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  Wallet,
  Phone,
  MapPin,
  Percent,
  Check,
  ShieldAlert,
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api, getActiveUser } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function OutletsListPage({ onNavigate, onNotify }) {
  const activeUser = getActiveUser();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState(null); // null = create new, object = edit
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    contact_phone: '',
    price_markup_percent: '0',
    initial_balance: '0',
    notes: '',
    is_active: 1,
  });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal States
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadOutlets = async () => {
    try {
      setLoading(true);
      const res = await api.getOutlets();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.outlets) ? res.outlets : []);
      setOutlets(list);
    } catch (err) {
      console.error('Failed to load outlets:', err);
      if (onNotify) onNotify(err.message || 'فشل في تحميل بيانات المعارض', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutlets();
  }, []);

  const filteredOutlets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return outlets;
    return outlets.filter((o) =>
      (o.name || '').toLowerCase().includes(term) ||
      (o.code || '').toLowerCase().includes(term) ||
      (o.location || '').toLowerCase().includes(term) ||
      (o.contact_phone || '').includes(term)
    );
  }, [outlets, searchTerm]);

  // Statistics
  const totalOutletsCount = outlets.length;
  const activeOutletsCount = outlets.filter((o) => o.is_active !== 0).length;
  const totalOutletsCash = outlets.reduce((sum, o) => sum + (Number(o.current_balance) || 0), 0);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingOutlet(null);
    setFormData({
      name: '',
      code: `OUT-${Date.now().toString().slice(-4)}`,
      location: '',
      contact_phone: '',
      price_markup_percent: '0',
      initial_balance: '0',
      notes: '',
      is_active: 1,
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (outlet) => {
    setEditingOutlet(outlet);
    setFormData({
      name: outlet.name || '',
      code: outlet.code || outlet.id,
      location: outlet.location || '',
      contact_phone: outlet.contact_phone || '',
      price_markup_percent: String(outlet.price_markup_percent ?? 0),
      initial_balance: '0', // balance cannot be altered here, managed through cash module
      notes: outlet.notes || '',
      is_active: outlet.is_active !== undefined ? Number(outlet.is_active) : 1,
    });
    setFormErrors({});
    setIsFormModalOpen(true);
  };

  // Handle Form Submit (Create / Edit)
  const handleSaveOutlet = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.name.trim()) errors.name = 'اسم المنفذ مطلوب';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setSaving(true);
      if (editingOutlet) {
        // Edit existing
        await api.updateOutlet(editingOutlet.id, {
          name: formData.name.trim(),
          location: formData.location.trim(),
          contact_phone: formData.contact_phone.trim(),
          price_markup_percent: Number(formData.price_markup_percent) || 0,
          notes: formData.notes.trim(),
          is_active: formData.is_active,
        });
        if (onNotify) onNotify(`تم تحديث بيانات المنفذ "${formData.name}" بنجاح`);
      } else {
        // Create new
        await api.createOutlet({
          name: formData.name.trim(),
          code: formData.code.trim(),
          location: formData.location.trim(),
          contact_phone: formData.contact_phone.trim(),
          price_markup_percent: Number(formData.price_markup_percent) || 0,
          initial_balance: Number(formData.initial_balance) || 0,
          notes: formData.notes.trim(),
          is_active: formData.is_active,
        });
        if (onNotify) onNotify(`تم إضافة المنفذ "${formData.name}" وتجهيز خزينته النقدية بنجاح`);
      }

      setIsFormModalOpen(false);
      loadOutlets();
    } catch (err) {
      console.error('Save outlet failed:', err);
      setFormErrors({ general: err.message || 'فشل في حفظ بيانات المنفذ' });
    } finally {
      setSaving(false);
    }
  };

  // Toggle Active Status directly
  const handleToggleActive = async (outlet) => {
    try {
      const nextStatus = outlet.is_active === 1 ? 0 : 1;
      await api.updateOutlet(outlet.id, { is_active: nextStatus });
      if (onNotify) {
        onNotify(
          nextStatus === 1
            ? `تم تفعيل المنفذ "${outlet.name}" بنجاح`
            : `تم تعطيل المنفذ "${outlet.name}" مؤقتاً`
        );
      }
      loadOutlets();
    } catch (err) {
      console.error('Toggle active failed:', err);
      if (onNotify) onNotify(err.message || 'تعذر تغيير حالة المنفذ', 'error');
    }
  };

  // Execute Delete
  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setDeleting(true);
      setDeleteError('');
      const res = await api.deleteOutlet(deleteCandidate.id);
      if (onNotify) onNotify(res.message || 'تم حذف المنفذ بنجاح');
      setDeleteCandidate(null);
      loadOutlets();
    } catch (err) {
      console.error('Delete outlet error:', err);
      setDeleteError(err.message || 'تعذر حذف المنفذ لوجود ارتباطات بالعمليات');
    } finally {
      setDeleting(false);
    }
  };

  // Export to Excel
  const handleExport = () => {
    const data = filteredOutlets.map((o) => ({
      'كود المنفذ': o.code || o.id,
      'اسم المعرض / المنفذ': o.name,
      'الموقع / العنوان': o.location || '-',
      'هاتف التواصل': o.contact_phone || '-',
      'نسبة الزيادة السعرية (%)': `${o.price_markup_percent || 0}%`,
      'الرصيد النقدي بالخزينة (ج.م)': o.current_balance || 0,
      'الحالة': o.is_active !== 0 ? 'نشط' : 'معطل',
      'تاريخ الإنشاء': formatDate(o.created_at),
    }));
    exportToExcel(data, 'دليل_معارض_ومنافذ_البيع');
    if (onNotify) onNotify('تم تصدير قائمة المعارض والمنافذ إلى ملف إكسيل');
  };

  return (
    <PageContainer
      title="معارض ومنافذ البيع"
      subtitle="إدارة فروع ومعارض البيع، الخزائن النقدية التابعة لكل فرع، أسعار ونسب الزيادة، والصلاحيات"
      breadcrumbs={[{ label: 'المبيعات', href: '#/sales' }, { label: 'الفروع والمعارض' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة معرض / منفذ جديد</span>
          </button>
        </div>
      }
    >
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Outlets */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs border-r-4 border-r-[#1F3A5F]">
          <span className="text-xs font-bold text-gray-500 block">إجمالي منافذ ومعارض البيع</span>
          <div className="text-2xl font-bold font-mono text-[#1F3A5F] mt-1">
            {totalOutletsCount}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">كافة الفروع المسجلة بالنظام</span>
        </div>

        {/* Active Outlets */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs border-r-4 border-r-emerald-600">
          <span className="text-xs font-bold text-gray-500 block">المنافذ النشطة حالياً</span>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            {activeOutletsCount}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">جاهزة لإصدار فواتير واستقبال مبيعات</span>
        </div>

        {/* Total Cash Balance */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs border-r-4 border-r-blue-600">
          <span className="text-xs font-bold text-gray-500 block">إجمالي سيولة خزائن المعارض</span>
          <div className="text-2xl font-bold font-mono text-blue-900 mt-1">
            {formatCurrency(totalOutletsCash)}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">رصيد العهد النقدية في أدراج ونقاط البيع</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            aria-label="البحث باسم المنفذ، الكود، الموقع، أو الهاتف"
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Outlets Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">الكود</th>
                <th className="p-3">اسم المعرض / المنفذ</th>
                <th className="p-3">الموقع / العنوان</th>
                <th className="p-3">هاتف التواصل</th>
                <th className="p-3 text-center">الزيادة السعرية</th>
                <th className="p-3 text-left font-mono">رصيد الخزينة النقدية</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500 font-bold">
                    جاري تحميل منافذ ومعارض البيع...
                  </td>
                </tr>
              ) : filteredOutlets.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-400">
                    <Store className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <div>لا توجد منافذ أو معارض بيع مطابقة للبحث</div>
                    <button
                      type="button"
                      onClick={handleOpenCreate}
                      className="mt-3 px-3 py-1.5 bg-[#1F3A5F] text-white rounded text-xs font-bold hover:bg-[#162a45] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة أول منفذ بيع</span>
                    </button>
                  </td>
                </tr>
              ) : (
                filteredOutlets.map((outlet, idx) => (
                  <tr
                    key={outlet.id}
                    className={`hover:bg-blue-50/40 transition-colors ${
                      idx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'
                    }`}
                  >
                    {/* Code */}
                    <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                      {outlet.code || outlet.id}
                    </td>

                    {/* Name */}
                    <td className="p-3 font-bold text-gray-900">
                      <div className="flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-[#1F3A5F] shrink-0" />
                        <span>{outlet.name}</span>
                      </div>
                      {outlet.notes && (
                        <div className="text-[11px] text-gray-400 mt-0.5 font-normal">
                          {outlet.notes}
                        </div>
                      )}
                    </td>

                    {/* Location */}
                    <td className="p-3 text-gray-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>{outlet.location || 'الفرع الرئيسي'}</span>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="p-3 text-gray-600 font-mono">
                      {outlet.contact_phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{outlet.contact_phone}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Price Markup */}
                    <td className="p-3 text-center">
                      {Number(outlet.price_markup_percent) > 0 ? (
                        <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          +{outlet.price_markup_percent}%
                        </span>
                      ) : (
                        <span className="text-gray-400 font-mono">0% (افتراضي)</span>
                      )}
                    </td>

                    {/* Treasury Cash Balance */}
                    <td className="p-3 text-left font-mono font-bold text-green-700">
                      <div>{formatCurrency(outlet.current_balance || 0)}</div>
                      {outlet.treasury_name && (
                        <div className="text-[10px] text-gray-400 font-sans font-normal">
                          {outlet.treasury_name}
                        </div>
                      )}
                    </td>

                    {/* Active Status Badge + Toggle */}
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(outlet)}
                        title={outlet.is_active !== 0 ? 'انقر للتعطيل' : 'انقر للتفعيل'}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                          outlet.is_active !== 0
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {outlet.is_active !== 0 ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span>نشط</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3 text-gray-500" />
                            <span>معطل</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Action Buttons */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(outlet)}
                          className="p-1.5 rounded-md hover:bg-blue-50 text-[#1F3A5F] border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer"
                          title="تعديل بيانات المنفذ"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDeleteCandidate(outlet);
                            setDeleteError('');
                          }}
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-600 border border-gray-200 hover:border-red-300 transition-colors cursor-pointer"
                          title="حذف المنفذ نهائياً"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="outlet-modal-title"
        >
          <div
            className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden text-right"
            dir="rtl"
          >
            {/* Header */}
            <div className="bg-[#1F3A5F] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-blue-200" />
                <h3 id="outlet-modal-title" className="font-bold text-sm">
                  {editingOutlet ? `تعديل بيانات المنفذ: ${editingOutlet.name}` : 'إضافة معرض / منفذ بيع جديد'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveOutlet} className="p-5 space-y-4 text-xs">
              {formErrors.general && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{formErrors.general}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="outlet-form-name" className="block font-bold text-gray-700 mb-1">
                    اسم المعرض / الفرع <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="outlet-form-name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  />
                  {formErrors.name && (
                    <span className="text-[10px] text-red-600 mt-0.5 block">{formErrors.name}</span>
                  )}
                </div>

                <div>
                  <label htmlFor="outlet-form-code" className="block font-bold text-gray-700 mb-1">
                    كود الفرع
                  </label>
                  <input
                    id="outlet-form-code"
                    type="text"
                    disabled={Boolean(editingOutlet)}
                    value={formData.code}
                    onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="outlet-form-location" className="block font-bold text-gray-700 mb-1">
                    الموقع أو العنوان
                  </label>
                  <input
                    id="outlet-form-location"
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData((p) => ({ ...p, location: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  />
                </div>

                <div>
                  <label htmlFor="outlet-form-phone" className="block font-bold text-gray-700 mb-1">
                    رقم هاتف التواصل
                  </label>
                  <input
                    id="outlet-form-phone"
                    type="text"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData((p) => ({ ...p, contact_phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="outlet-form-markup" className="block font-bold text-gray-700 mb-1">
                    نسبة الزيادة السعرية (%)
                  </label>
                  <input
                    id="outlet-form-markup"
                    type="number"
                    min="0"
                    step="0.5"
                    value={formData.price_markup_percent}
                    onChange={(e) => setFormData((p) => ({ ...p, price_markup_percent: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">زيادة آلية فوق سعر البيع القياسي</span>
                </div>

                {!editingOutlet ? (
                  <div>
                    <label htmlFor="outlet-form-initial-bal" className="block font-bold text-gray-700 mb-1">
                      الرصيد الافتتاحي للخزينة (ج.م)
                    </label>
                    <input
                      id="outlet-form-initial-bal"
                      type="number"
                      min="0"
                      value={formData.initial_balance}
                      onChange={(e) => setFormData((p) => ({ ...p, initial_balance: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono font-bold text-green-700 text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">سيتم إنشاء خزينة نقدية مستقلة بهذا الرصيد</span>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="outlet-form-active" className="block font-bold text-gray-700 mb-1">
                      حالة المنفذ
                    </label>
                    <select
                      id="outlet-form-active"
                      value={formData.is_active}
                      onChange={(e) => setFormData((p) => ({ ...p, is_active: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                    >
                      <option value="1">نشط (جاهز للعمل)</option>
                      <option value="0">معطل مؤقتاً</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="outlet-form-notes" className="block font-bold text-gray-700 mb-1">
                  ملاحظات
                </label>
                <textarea
                  id="outlet-form-notes"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                />
                <p className="text-xs text-gray-500 mt-1">أي ملاحظات حول المنفذ، أمين العهدة، مواعيد العمل</p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white font-bold rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : editingOutlet ? 'تحديث البيانات' : 'حفظ وإنشاء المنفذ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteCandidate && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-outlet-title"
        >
          <div className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-md w-full p-5 text-right space-y-4" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-outlet-title" className="font-bold text-base text-gray-900">
                  تأكيد حذف المنفذ
                </h3>
                <p className="text-xs text-gray-500">
                  هل أنت متأكد من رغبتك في حذف المنفذ "{deleteCandidate.name}"؟
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
              تنبيه: سيتم فحص ارتباطات المنفذ بفواتير المبيعات وتقفيلات الورديات. إذا كانت هناك حركات مسجلة لن يُسمح بالحذف للحفاظ على سلامة الحسابات، ويمكنك بدلاً من ذلك تعطيله.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'جاري الفحص والحذف...' : 'تأكيد الحذف نهائياً'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
