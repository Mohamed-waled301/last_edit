import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Layers, 
  Edit, 
  Trash2, 
  AlertTriangle, 
  X, 
  ArrowRight,
  FolderTree
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';

export default function ItemGroupsListPage({ onNavigate, onNotify }) {
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [resGroups, resItems] = await Promise.all([
        api.getItemGroups(),
        api.getItems()
      ]);
      setGroups(Array.isArray(resGroups.data) ? resGroups.data : (resGroups.groups || []));
      setItems(Array.isArray(resItems.data) ? resItems.data : (resItems.items || []));
    } catch (err) {
      console.error('Failed to load item groups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setDeleting(true);
      setDeleteError('');
      const res = await api.deleteItemGroup(deleteCandidate.id);
      if (onNotify) onNotify(res.message || 'تم حذف مجموعة الصنف بنجاح');
      setDeleteCandidate(null);
      loadData();
    } catch (err) {
      console.error('Delete item group error:', err);
      setDeleteError(err.message || 'تعذر حذف مجموعة الصنف');
    } finally {
      setDeleting(false);
    }
  };

  const getItemCount = (group) => {
    return items.filter(
      (item) => item.item_group === group.name || item.item_group === group.id
    ).length;
  };

  const filteredGroups = groups.filter((g) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const matchName = (g.name || '').toLowerCase().includes(term);
    const matchCode = (g.code || '').toLowerCase().includes(term);
    return matchName || matchCode;
  });

  return (
    <PageContainer
      title="مجموعات الأصناف"
      subtitle="إدارة وتبويب مجموعات الأصناف وخطوط الإنتاج في المصنع"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('items')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة للأصناف</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('item-groups/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مجموعة جديدة</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="max-w-md">
            <label htmlFor="search-group-input" className="block text-xs font-medium text-slate-700 mb-1">
              بحث في المجموعات (بالاسم أو الكود)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                id="search-group-input"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Delete Confirmation Alert */}
        {deleteCandidate && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-red-900">تأكيد حذف مجموعة الصنف</h4>
                <p className="text-sm text-red-700 mt-1">
                  هل أنت متأكد من رغبتك في حذف المجموعة &quot;{deleteCandidate.name}&quot; ({deleteCandidate.code})؟
                </p>
                {deleteError && (
                  <p className="text-sm text-red-700 font-medium mt-2 bg-red-100 p-2 rounded-lg border border-red-200">
                    {deleteError}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setDeleteCandidate(null); setDeleteError(''); }}
                className="text-red-500 hover:text-red-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-red-200">
              <button
                type="button"
                onClick={() => { setDeleteCandidate(null); setDeleteError(''); }}
                disabled={deleting}
                className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {deleting ? 'جاري الحذف...' : 'نعم، حذف المجموعة'}
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <th className="py-3 px-4">كود المجموعة</th>
                  <th className="py-3 px-4">اسم مجموعة الصنف</th>
                  <th className="py-3 px-4">عدد الأصناف المسجلة</th>
                  <th className="py-3 px-4">ملاحظات</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500">
                      جاري تحميل بيانات مجموعات الأصناف...
                    </td>
                  </tr>
                ) : filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-500">
                      <FolderTree className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-medium">لا توجد مجموعات أصناف مطابقة للبحث</p>
                      <button
                        type="button"
                        onClick={() => onNavigate && onNavigate('item-groups/new')}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة أول مجموعة صنف</span>
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((group) => {
                    const count = getItemCount(group);
                    return (
                      <tr key={group.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">
                          {group.code || '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                            <span>{group.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {count} صنف
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                          {group.notes || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onNavigate && onNavigate(`item-groups/${group.id}/edit`)}
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="تعديل"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setDeleteCandidate(group); setDeleteError(''); }}
                              className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
