import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ShoppingCart, 
  Download, 
  Truck, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Package
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function PurchasesListPage({ onNotify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredOrders = orders.filter(o => 
    (o.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExport = () => {
    const exportData = filteredOrders.map(o => ({
      'رقم أمر التوريد': o.po_number,
      'اسم المورد': o.supplier_name,
      'تاريخ الطلب': o.order_date,
      'شروط الدفع': o.payment_terms === 'credit' ? 'آجل' : 'نقدي',
      'تاريخ الاستحقاق': o.due_date || '-',
      'عدد البنود': Array.isArray(o.items) ? o.items.length : 0,
      'إجمالي المبلغ (ج.م)': o.total_amount || o.grand_total || 0,
      'الحالة': o.status === 'received' ? 'تم الاستلام' : 'قيد التوريد'
    }));
    exportToExcel(exportData, 'أوامر_شراء_وتوريد_الخامات');
    if (onNotify) onNotify('تم تصدير أوامر التوريد إلى Excel');
  };

  return (
    <PageContainer
      title="المشتريات (أوامر الشراء والتوريد)"
      subtitle="متابعة أوامر توريد الأقمشة ومستلزمات الإنتاج، شروط الدفع، وتواريخ الاستحقاق"
      breadcrumbs={[{ label: 'المشتريات' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/purchases/new'; }}
            className="px-4 py-2 rounded-md bg-[#1F3A5F] hover:bg-[#162a45] text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة أمر توريد جديد</span>
          </button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث برقم أمر التوريد أو اسم المورد..."
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Orders Table Container */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10 select-none">
              <tr>
                <th className="p-3">رقم الأمر</th>
                <th className="p-3">المورد</th>
                <th className="p-3">تاريخ الطلب</th>
                <th className="p-3 text-center">شروط الدفع</th>
                <th className="p-3 text-center">تاريخ الاستحقاق</th>
                <th className="p-3 text-center">البنود</th>
                <th className="p-3 text-left font-mono">الإجمالي الصافي</th>
                <th className="p-3 text-center">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل أوامر التوريد...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                        <ShoppingCart className="w-6 h-6" />
                      </div>
                      <p className="text-gray-600 font-bold text-sm">لا توجد أوامر توريد مسجلة</p>
                      <button
                        onClick={() => { window.location.hash = '#/purchases/new'; }}
                        className="px-4 py-2 bg-[#1F3A5F] text-white rounded-md text-xs font-bold hover:bg-[#162a45]"
                      >
                        + إنشاء أول أمر توريد الآن
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o, idx) => {
                  const isCredit = o.payment_terms === 'credit';
                  const total = Number(o.total_amount ?? o.grand_total ?? 0);
                  const itemsCount = Array.isArray(o.items) ? o.items.length : 0;

                  return (
                    <tr 
                      key={o.id || idx}
                      className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                    >
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                        {o.po_number}
                      </td>

                      <td className="p-3 font-bold text-gray-900">
                        {o.supplier_name}
                      </td>

                      <td className="p-3 text-gray-600 font-mono">
                        {formatDate(o.order_date)}
                      </td>

                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          isCredit 
                            ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {isCredit ? 'آجل' : 'نقدي'}
                        </span>
                      </td>

                      <td className="p-3 text-center font-mono text-gray-700">
                        {isCredit && o.due_date ? (
                          <span className="font-bold text-rose-700">{formatDate(o.due_date)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      <td className="p-3 text-center font-mono font-semibold text-gray-600">
                        {itemsCount} خامات
                      </td>

                      <td className="p-3 text-left font-mono font-bold text-gray-900">
                        {formatCurrency(total)}
                      </td>

                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Clock className="w-3 h-3" />
                          <span>قيد التوريد</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
