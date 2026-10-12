import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ShoppingCart, 
  Download, 
  CheckCircle2, 
  Clock, 
  Package,
  Check,
  Ban,
  AlertTriangle,
  X,
  FileText
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function PurchasesListPage({ onNotify, onNavigate }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Full Receipt action modal state
  const [receiveCandidate, setReceiveCandidate] = useState(null);
  const [receiving, setReceiving] = useState(false);

  // Cancel order modal state
  const [cancelCandidate, setCancelCandidate] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await api.getPurchaseOrders();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.purchase_orders) ? res.purchase_orders : []);
      setOrders(list);
    } catch (err) {
      console.error('Failed to load purchase orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleFullReceipt = async () => {
    if (!receiveCandidate) return;
    try {
      setReceiving(true);
      const res = await api.receivePurchaseOrderFull(receiveCandidate.id);
      if (onNotify) onNotify(res.message || 'تم استلام أمر التوريد بالكامل وتحديث أرصدة المخزون وحساب المورد بنجاح');
      setReceiveCandidate(null);
      loadOrders();
    } catch (err) {
      console.error('Full receipt error:', err);
      alert(err.message || 'تعذر استلام أمر التوريد');
    } finally {
      setReceiving(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelCandidate) return;
    try {
      setCancelling(true);
      const res = await api.cancelPurchaseOrder(cancelCandidate.id, cancelReason);
      if (onNotify) onNotify(res.message || 'تم إلغاء أمر التوريد بنجاح');
      setCancelCandidate(null);
      setCancelReason('');
      loadOrders();
    } catch (err) {
      console.error('Cancel order error:', err);
      alert(err.message || 'تعذر إلغاء أمر التوريد');
    } finally {
      setCancelling(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = 
      !term ||
      (o.po_number || '').toLowerCase().includes(term) ||
      (o.supplier_name || '').toLowerCase().includes(term);

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return o.status === statusFilter;
  });

  const handleExport = () => {
    const exportData = filteredOrders.map((o) => ({
      'رقم أمر التوريد': o.po_number,
      'اسم المورد': o.supplier_name,
      'تاريخ الطلب': o.order_date,
      'تاريخ الاستلام المتوقع': o.expected_date || '-',
      'شروط الدفع': o.payment_terms === 'credit' ? 'آجل' : 'نقدي',
      'تاريخ الاستحقاق': o.due_date || '-',
      'عدد البنود': Array.isArray(o.items) ? o.items.length : 0,
      'إجمالي المبلغ (ج.م)': o.total_amount || o.grand_total || 0,
      'الحالة': getStatusLabel(o.status)
    }));
    exportToExcel(exportData, 'أوامر_شراء_وتوريد_الخامات');
    if (onNotify) onNotify('تم تصدير أوامر التوريد إلى ملف إكسيل');
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'received':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>تم الاستلام</span>
          </span>
        );
      case 'partially_received':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>استلام جزئي</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-800 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
            <Ban className="w-3.5 h-3.5 text-red-600" />
            <span>ملغي</span>
          </span>
        );
      case 'ordered':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>تم الطلب</span>
          </span>
        );
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'received': return 'تم الاستلام';
      case 'partially_received': return 'استلام جزئي';
      case 'cancelled': return 'ملغي';
      case 'ordered':
      default: return 'تم الطلب';
    }
  };

  return (
    <PageContainer
      title="المشتريات (أوامر الشراء والتوريد)"
      subtitle="متابعة أوامر توريد الأقمشة ومستلزمات الإنتاج، الاستلام الكامل بنقرة واحدة، والأقساط"
      breadcrumbs={[{ label: 'المشتريات' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (onNavigate) onNavigate('purchases/new');
              else window.location.hash = '#/purchases/new';
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة أمر توريد جديد</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Search & Status Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex-1 min-w-[260px]">
              <label htmlFor="search-po-input" className="block text-xs font-semibold text-slate-700 mb-1">
                بحث في أوامر الشراء (برقم الأمر أو اسم المورد)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                <input
                  id="search-po-input"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">
                تصفية بحالة الأمر
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الكل ({orders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ordered')}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'ordered' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  تم الطلب ({orders.filter((o) => o.status === 'ordered').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('received')}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'received' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  تم الاستلام ({orders.filter((o) => o.status === 'received').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('cancelled')}
                  className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                    statusFilter === 'cancelled' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ملغي ({orders.filter((o) => o.status === 'cancelled').length})
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Orders Table Container */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-800 text-white font-semibold sticky top-0 z-10 select-none">
                <tr>
                  <th className="p-3">رقم الأمر</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3">تاريخ الطلب</th>
                  <th className="p-3">الاستلام المتوقع</th>
                  <th className="p-3 text-center">شروط الدفع</th>
                  <th className="p-3 text-center">الاستحقاق / الأقساط</th>
                  <th className="p-3 text-center">البنود</th>
                  <th className="p-3 text-left font-mono">الإجمالي الصافي</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-10 text-center text-slate-500 font-semibold">
                      جاري تحميل أوامر التوريد...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                          <ShoppingCart className="w-6 h-6" />
                        </div>
                        <p className="text-slate-600 font-semibold text-sm">لا توجد أوامر توريد مسجلة</p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigate) onNavigate('purchases/new');
                            else window.location.hash = '#/purchases/new';
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                        >
                          إنشاء أول أمر توريد الآن
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o, idx) => {
                    const isCredit = o.payment_terms === 'credit';
                    const total = Number(o.total_amount ?? o.grand_total ?? 0);
                    const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
                    const installmentsCount = Array.isArray(o.installments) ? o.installments.length : 0;
                    const canReceive = o.status !== 'received' && o.status !== 'cancelled';
                    const canCancel = o.status !== 'cancelled';

                    return (
                      <tr 
                        key={o.id || idx}
                        className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}`}
                      >
                        <td className="p-3 font-mono font-bold text-slate-900">
                          {o.po_number}
                        </td>

                        <td className="p-3 font-bold text-slate-900">
                          {o.supplier_name}
                        </td>

                        <td className="p-3 text-slate-600 font-mono">
                          {formatDate(o.order_date)}
                        </td>

                        <td className="p-3 text-slate-600 font-mono">
                          {o.expected_date ? formatDate(o.expected_date) : '-'}
                        </td>

                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                            isCredit 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {isCredit ? 'آجل' : 'نقدي'}
                          </span>
                        </td>

                        <td className="p-3 text-center font-mono text-slate-700">
                          {isCredit ? (
                            installmentsCount > 1 ? (
                              <span className="font-semibold text-indigo-700">
                                {installmentsCount} أقساط
                              </span>
                            ) : o.due_date ? (
                              <span className="font-bold text-rose-700">{formatDate(o.due_date)}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )
                          ) : (
                            <span className="text-slate-400">سداد فوري</span>
                          )}
                        </td>

                        <td className="p-3 text-center font-mono font-semibold text-slate-600">
                          {itemsCount} أصناف
                        </td>

                        <td className="p-3 text-left font-mono font-bold text-slate-900">
                          {formatCurrency(total)}
                        </td>

                        <td className="p-3 text-center">
                          {getStatusBadge(o.status)}
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {canReceive && (
                              <button
                                type="button"
                                onClick={() => setReceiveCandidate(o)}
                                className="px-2.5 py-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700 rounded-md font-semibold transition-colors inline-flex items-center gap-1 shadow-2xs"
                                title="استلام كامل البضاعة وتحديث المخزون بنقرة واحدة"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>استلام كامل</span>
                              </button>
                            )}

                            {canCancel && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelCandidate(o);
                                  setCancelReason('');
                                }}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md font-semibold transition-colors inline-flex items-center gap-1 border border-slate-200"
                                title="إلغاء أمر التوريد وعكس الحركات إن وجدت"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>إلغاء</span>
                              </button>
                            )}
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

      {/* Full Goods Receipt Confirmation Modal */}
      {receiveCandidate && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-right space-y-4" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  تأكيد استلام كامل البضاعة
                </h3>
                <p className="text-xs text-slate-500">
                  أمر الشراء رقم {receiveCandidate.po_number} - المورد: {receiveCandidate.supplier_name}
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1.5 border border-slate-200">
              <p className="text-slate-700 font-semibold">
                سيتم تنفيذ العمليات التالية في معاملة واحدة فورية:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-600 mr-2">
                <li>إنشاء إذن استلام مخزني رسمي بكامل الكميات المطلوبة.</li>
                <li>قيد حركات المخزون وزيادة الرصيد الفعلي لكل صنف.</li>
                <li>قيد فاتورة المورد وتحديث رصيد حسابه بدفتر الأستاذ.</li>
                <li>تحديث حالة أمر التوريد إلى &quot;تم الاستلام&quot;.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReceiveCandidate(null)}
                disabled={receiving}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleFullReceipt}
                disabled={receiving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{receiving ? 'جاري الاستلام وتحديث المخزون...' : 'تأكيد الاستلام الكامل الآن'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelCandidate && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-right space-y-4" dir="rtl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  تأكيد إلغاء أمر التوريد
                </h3>
                <p className="text-xs text-slate-500">
                  أمر الشراء رقم {cancelCandidate.po_number}
                </p>
              </div>
            </div>

            {cancelCandidate.status === 'received' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
                تنبيه: هذا الأمر تم استلامه مسبقاً، سيؤدي الإلغاء إلى توليد حركات مخزنية عكسية لإعادة خصم الكميات المستلمة وعكس فاتورة المورد تلقائياً.
              </div>
            )}

            <div>
              <label htmlFor="cancel-reason-input" className="block text-xs font-semibold text-slate-700 mb-1">
                سبب الإلغاء
              </label>
              <textarea
                id="cancel-reason-input"
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelCandidate(null)}
                disabled={cancelling}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleCancelOrder}
                disabled={cancelling}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{cancelling ? 'جاري الإلغاء...' : 'تأكيد إلغاء الأمر'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
