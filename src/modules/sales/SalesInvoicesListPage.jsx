import React, { useState, useEffect } from 'react';
import { Plus, Search, Receipt, Printer, Download, User, Store } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api, getActiveUser } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function SalesInvoicesListPage({ onNotify }) {
  const activeUser = getActiveUser();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const res = await api.getSalesInvoices();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.invoices) ? res.invoices : []);
      setInvoices(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const filtered = invoices.filter(i => {
    if (activeUser?.role === 'cashier' && activeUser?.outlet_id && i.outlet_id && i.outlet_id !== activeUser.outlet_id) {
      return false;
    }
    return (
      (i.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.outlet_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleExport = () => {
    const exportData = filtered.map(i => ({
      'رقم الفاتورة': i.invoice_number,
      'اسم العميل': i.customer_name,
      'المنفذ / المعرض': i.outlet_name,
      'تاريخ الفاتورة': i.invoice_date,
      'طريقة الدفع': i.payment_terms === 'credit' ? 'آجل' : 'نقدي',
      'تاريخ الاستحقاق': i.due_date || '-',
      'إجمالي الفاتورة': i.total_amount ?? i.subtotal ?? 0,
      'الحالة': i.status === 'paid' ? 'مدفوعة بالكامل' : i.status === 'partially_paid' ? 'مدفوعة جزئياً' : 'غير مدفوعة'
    }));
    exportToExcel(exportData, 'سجل_فواتير_المبيعات');
    if (onNotify) onNotify('تم تصدير فواتير المبيعات إلى ملف إكسيل');
  };

  return (
    <PageContainer
      title="فواتير المبيعات"
      subtitle="إدارة فواتير المبيعات النقدية والآجلة، البحث برقم الفاتورة، والطباعة الحرارية والورقية الكاملة"
      breadcrumbs={[{ label: 'المبيعات' }]}
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
            onClick={() => { window.location.hash = '#/outlets'; }}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="إدارة وتعديل وحذف فروع ومعارض البيع"
          >
            <Store className="w-4 h-4 text-[#1F3A5F]" />
            <span>الفروع والمعارض</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/sales/new'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ فاتورة مبيعات جديدة</span>
          </button>
        </div>
      }
    >
      {/* Search by Invoice Number & Customer (Requirement F4) */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            aria-label="البحث برقم الفاتورة الآلي أو اسم العميل"
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الفرع / المعرض</th>
                <th className="p-3">تاريخ الفاتورة</th>
                <th className="p-3 text-center">طريقة الدفع</th>
                <th className="p-3 text-center">تاريخ الاستحقاق</th>
                <th className="p-3 text-left font-mono">إجمالي الفاتورة</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">طباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل فواتير المبيعات...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-400">
                    لا توجد فواتير مبيعات مسجلة تطابق البحث
                  </td>
                </tr>
              ) : (
                filtered.map((inv, idx) => {
                  const isCredit = inv.payment_terms === 'credit';
                  const total = Number(inv.total_amount ?? inv.subtotal ?? 0);

                  return (
                    <tr key={inv.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{inv.invoice_number}</td>
                      <td className="p-3 font-bold text-gray-900">{inv.customer_name || 'عميل نقدي'}</td>
                      <td className="p-3 text-gray-600">{inv.outlet_name || 'الفرع الرئيسي'}</td>
                      <td className="p-3 text-gray-600 font-mono">{formatDate(inv.invoice_date)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          isCredit ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isCredit ? 'آجل' : 'نقدي'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">
                        {isCredit && inv.due_date ? (
                          <span className="font-bold text-rose-700">{formatDate(inv.due_date)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-green-700">{formatCurrency(total)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {inv.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => { window.location.hash = `#/sales/${inv.id}/print`; }}
                          className="px-2.5 py-1 text-xs text-[#1F3A5F] hover:bg-blue-50 border border-gray-200 rounded font-bold cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                          title="معاينة وطباعة الفاتورة قياس كامل وحراري"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>طباعة</span>
                        </button>
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
