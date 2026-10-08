import React, { useState, useEffect } from 'react';
import { RotateCcw, Plus, Search, Download, CheckCircle2, Clock } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { db } from '../../data/db';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function SalesReturnsListPage({ onNotify }) {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadReturns = async () => {
    try {
      setLoading(true);
      const returnsList = await db.customer_returns.reverse().sortBy('created_at');
      const custs = await db.customers.toArray();
      const custMap = new Map(custs.map(c => [c.id, c.name]));
      const prods = await db.items.toArray();
      const prodMap = new Map(prods.map(p => [p.id, p.name]));

      const formatted = returnsList.map(r => ({
        ...r,
        customer_name: custMap.get(r.customer_id) || r.customer_id,
        product_name: prodMap.get(r.product_id) || r.product_id
      }));

      setReturns(formatted);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReturns();
  }, []);

  const filtered = returns.filter(r => 
    (r.return_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageContainer
      title="المرتجعات (مرتجع مبيعات)"
      subtitle="سجل المرتجعات الحرة والمرتجع المرتبط بفواتير المبيعات مع استرجاع البضاعة للمخزن"
      breadcrumbs={[{ label: 'المرتجعات' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/returns/new'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ تسجيل مرتجع مبيعات</span>
          </button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث برقم المرتجع أو اسم العميل..."
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">رقم المرتجع</th>
                <th className="p-3">نوع المرتجع</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الصنف المسترجع</th>
                <th className="p-3 text-center font-mono">الكمية</th>
                <th className="p-3 text-left font-mono">مبلغ الرد</th>
                <th className="p-3">طريقة الرد</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">السبب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل المرتجعات...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-400">
                    لا توجد مرتجعات مبيعات مسجلة
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={r.id || idx} className="hover:bg-gray-50">
                    <td className="p-3 font-mono font-bold text-[#1F3A5F]">{r.return_number}</td>
                    <td className="p-3 font-semibold">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        r.return_mode === 'against_invoice' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {r.return_mode === 'against_invoice' ? 'مرتبط بفاتورة' : 'مرتجع حر'}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-gray-900">{r.customer_name}</td>
                    <td className="p-3 text-gray-800 font-semibold">{r.product_name}</td>
                    <td className="p-3 text-center font-mono font-bold text-gray-900">{r.quantity} قطعة</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(r.refund_amount || 0)}</td>
                    <td className="p-3 text-gray-600">
                      {r.refund_method === 'cash_refund' ? 'صرف نقدي من الخزينة' : 'خصم من رصيد العميل'}
                    </td>
                    <td className="p-3 text-gray-600 font-mono">{formatDate(r.return_date)}</td>
                    <td className="p-3 text-gray-500">{r.reason || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
