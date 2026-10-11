import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Layers, 
  Edit, 
  Trash2,
  AlertTriangle,
  X,
  Download, 
  Image as ImageIcon,
  CheckCircle2,
  Package,
  SlidersHorizontal
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function ItemsListPage({ onNotify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'finished' | 'raw_material'
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    try {
      setDeleting(true);
      setDeleteError('');
      const res = await api.deleteItem(deleteCandidate.id);
      if (onNotify) onNotify(res.message || 'تم حذف الصنف بنجاح');
      setDeleteCandidate(null);
      loadItems();
    } catch (err) {
      console.error('Delete item error:', err);
      setDeleteError(err.message || 'تعذر حذف الصنف لوجود ارتباطات بالعمليات');
    } finally {
      setDeleting(false);
    }
  };

  const loadItems = async () => {
    try {
      setLoading(true);
      const res = await api.getItems();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.items) ? res.items : []);
      setItems(list);
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.item_group || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterType === 'all') return matchesSearch;
    return matchesSearch && item.item_type === filterType;
  });

  const handleExport = () => {
    const exportData = filteredItems.map(it => {
      const cost = Number(it.cost_price) || 0;
      const sell = Number(it.selling_price) || 0;
      const marginVal = sell > cost ? sell - cost : 0;
      const marginPct = cost > 0 ? ((marginVal / cost) * 100).toFixed(1) : '0';
      return {
        'كود الصنف': it.code,
        'اسم وتوصيف الصنف': it.name,
        'مجموعة الصنف': it.item_group,
        'قسم الصنف': it.item_department,
        'نوع الصنف': it.item_type === 'finished' ? 'منتج تام' : 'مادة خام',
        'الوحدة': it.unit,
        'سعر التكلفة (ج.م)': cost,
        'سعر البيع (ج.م)': sell,
        'هامش الربح (%)': `${marginPct}%`,
        'الرصيد الافتتاحي': it.opening_balance || 0,
        'الرصيد الفعلي': it.actual_balance ?? it.current_stock ?? 0,
        'الحد الأدنى للصرف': it.min_issue_qty || 1
      };
    });
    exportToExcel(exportData, 'دليل_أصناف_المصنع');
    if (onNotify) onNotify('تم تصدير دليل الأصناف إلى ملف إكسيل');
  };

  return (
    <PageContainer
      title="دليل الأصناف والمنتجات"
      subtitle="إدارة بيانات الأصناف وتوصيفها، أسعار التكلفة، هوامش الربح، ومتغيرات المقاس واللون لمصنع الملابس"
      breadcrumbs={[{ label: 'الأصناف' }]}
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
            onClick={() => { window.location.hash = '#/items/new'; }}
            className="px-4 py-2 rounded-md bg-[#1F3A5F] hover:bg-[#162a45] text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة صنف جديد</span>
          </button>
        </div>
      }
    >
      {/* Top Filter and Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث باسم الصنف، الكود، أو المجموعة..."
              className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
            />
          </div>

          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md text-xs font-bold">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterType === 'all' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              الكل ({items.length})
            </button>
            <button
              onClick={() => setFilterType('finished')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterType === 'finished' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              منتجات تامة ({items.filter(i => i.item_type === 'finished').length})
            </button>
            <button
              onClick={() => setFilterType('raw_material')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterType === 'raw_material' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              خامات ومستلزمات ({items.filter(i => i.item_type === 'raw_material').length})
            </button>
          </div>
        </div>
      </div>

      {/* Items Table Container */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10 select-none">
              <tr>
                <th className="p-3 w-14 text-center">الصورة</th>
                <th className="p-3">الكود</th>
                <th className="p-3">اسم الصنف - التوصيف</th>
                <th className="p-3">المجموعة والقسم</th>
                <th className="p-3 text-center">النوع</th>
                <th className="p-3 text-center">الوحدة</th>
                <th className="p-3 text-left font-mono">سعر التكلفة</th>
                <th className="p-3 text-left font-mono">سعر البيع</th>
                <th className="p-3 text-center">هامش الربح</th>
                <th className="p-3 text-center font-mono">الرصيد الفعلي</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="11" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل بيانات الأصناف...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="11" className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                        <Package className="w-6 h-6" />
                      </div>
                      <p className="text-gray-600 font-bold text-sm">لا توجد أصناف مسجلة تطابق البحث</p>
                      <button
                        onClick={() => { window.location.hash = '#/items/new'; }}
                        className="px-4 py-2 bg-[#1F3A5F] text-white rounded-md text-xs font-bold hover:bg-[#162a45] transition-colors"
                      >
                        + إضافة أول صنف الآن
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const cost = Number(item.cost_price) || 0;
                  const sell = Number(item.selling_price) || 0;
                  const marginVal = sell > cost ? sell - cost : 0;
                  const marginPct = cost > 0 ? ((marginVal / cost) * 100).toFixed(1) : 0;
                  const actualStock = Number(item.actual_balance ?? item.current_stock ?? 0);
                  const isLow = actualStock <= (Number(item.min_issue_qty) || 1);

                  return (
                    <tr 
                      key={item.id || idx} 
                      className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                    >
                      {/* Image Thumbnail */}
                      <td className="p-2.5 text-center">
                        {item.image ? (
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            className="w-10 h-10 object-cover rounded-md mx-auto border border-gray-200 shadow-2xs" 
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center mx-auto text-gray-300">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                      </td>

                      {/* Code */}
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                        {item.code}
                      </td>

                      {/* Name */}
                      <td className="p-3 font-bold text-gray-900">
                        <div>{item.name}</div>
                        {Array.isArray(item.variants) && item.variants.length > 0 && (
                          <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                            {item.variants.length} متغيرات (مقاسات وألوان)
                          </div>
                        )}
                      </td>

                      {/* Group & Dept */}
                      <td className="p-3 text-gray-600">
                        <span className="font-semibold block">{item.item_group}</span>
                        <span className="text-[11px] text-gray-400 block">{item.item_department}</span>
                      </td>

                      {/* Type Badge */}
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          item.item_type === 'finished' 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {item.item_type === 'finished' ? 'تام' : 'مادة خام'}
                        </span>
                      </td>

                      {/* Unit */}
                      <td className="p-3 text-center text-gray-700 font-semibold">
                        {item.unit}
                      </td>

                      {/* Cost Price */}
                      <td className="p-3 text-left font-mono font-bold text-gray-900">
                        {formatCurrency(cost)}
                      </td>

                      {/* Selling Price */}
                      <td className="p-3 text-left font-mono font-bold text-green-700">
                        {item.item_type === 'finished' ? formatCurrency(sell) : '-'}
                      </td>

                      {/* Margin */}
                      <td className="p-3 text-center">
                        {item.item_type === 'finished' && cost > 0 ? (
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {marginPct}%
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* Actual Stock Balance */}
                      <td className="p-3 text-center">
                        <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-xs ${
                          isLow 
                            ? 'bg-red-100 text-red-700 border border-red-200' 
                            : 'bg-blue-50 text-[#1F3A5F] border border-blue-200'
                        }`}>
                          {formatNumber(actualStock)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => { window.location.hash = `#/items/${item.id}/edit`; }}
                            className="px-2.5 py-1 text-xs text-[#1F3A5F] hover:bg-blue-50 rounded-md font-bold transition-colors inline-flex items-center gap-1 border border-gray-200 cursor-pointer"
                            title="تعديل بيانات الصنف"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteCandidate(item);
                              setDeleteError('');
                            }}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md font-bold transition-colors inline-flex items-center gap-1 border border-gray-200 cursor-pointer"
                            title="حذف الصنف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
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

      {/* Delete Item Confirmation Modal */}
      {deleteCandidate && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-item-title"
        >
          <div className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-md w-full p-5 text-right space-y-4" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="delete-item-title" className="font-bold text-base text-gray-900">
                  تأكيد حذف الصنف
                </h3>
                <p className="text-xs text-gray-500">
                  هل أنت متأكد من رغبتك في حذف الصنف "{deleteCandidate.name}"؟
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs font-semibold flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
              تنبيه: سيتم فحص ارتباطات الصنف بفواتير المبيعات، أوامر الشراء، بطاقات المقادير، وحركات المخزون التشغيلية لمنع الإخلال بتكامل البيانات.
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
