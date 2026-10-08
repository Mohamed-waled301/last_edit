import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Search, Download, Tag, CreditCard, ArrowDownLeft } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function DisbursementsListPage({ onNotify }) {
  const [transactions, setTransactions] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [txRes, codesRes] = await Promise.all([
        api.getTransactions(),
        api.getExpenseCodes()
      ]);

      const txList = Array.isArray(txRes.data) ? txRes.data : (Array.isArray(txRes.transactions) ? txRes.transactions : []);
      // Filter disbursements / outflows
      const outflows = txList.filter(t => t.tx_type === 'outflow' || t.category === 'operating_expense' || t.reference_type === 'EXPENSE_DISBURSEMENT');
      setTransactions(outflows.length > 0 ? outflows : txList);
      setExpenseCodes(Array.isArray(codesRes.data) ? codesRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = transactions.filter(t => 
    (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.tx_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.account_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDisbursed = filtered.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const handleExport = () => {
    const exportData = filtered.map(t => ({
      'رقم الحركة': t.tx_number,
      'الخزينة': t.account_name,
      'المبلغ (ج.م)': t.amount,
      'البيان': t.description,
      'التاريخ': t.created_at || t.date
    }));
    exportToExcel(exportData, 'سجل_صرف_النقدية_والمصروفات');
    if (onNotify) onNotify('تم تصدير سجل صرف النقدية إلى Excel ✓');
  };

  return (
    <PageContainer
      title="صرف النقدية والمصروفات التشغيلية"
      subtitle="سجل صرف النقدية من الخزائن بأكواد المصروفات والربط مع الحركات المالية"
      breadcrumbs={[{ label: 'صرف النقدية' }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
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
            onClick={() => { window.location.hash = '#/payment-methods'; }}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <CreditCard className="w-4 h-4 text-gray-500" />
            <span>طرق الدفع</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/expense-codes'; }}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Tag className="w-4 h-4 text-gray-500" />
            <span>أكواد المصروفات ({expenseCodes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/disbursements/new'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ صرف نقدية جديد</span>
          </button>
        </div>
      }
    >
      {/* Search Bar & Total Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث بالبيان، رقم السند، أو الخزينة..."
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>

        <div className="text-left font-mono">
          <span className="text-xs text-gray-500 font-bold block">إجمالي المنصرف:</span>
          <span className="text-xl font-bold text-rose-700">{formatCurrency(totalDisbursed)}</span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">رقم السند</th>
                <th className="p-3">الخزينة المنصرف منها</th>
                <th className="p-3">البيان والمصروف</th>
                <th className="p-3 text-left font-mono">المبلغ المنصرف</th>
                <th className="p-3 text-left font-mono">الرصيد بعدها</th>
                <th className="p-3">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل حركات صرف النقدية...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-gray-400">
                    لا توجد حركات صرف نقدية مسجلة
                  </td>
                </tr>
              ) : (
                filtered.map((t, idx) => (
                  <tr key={t.id || idx} className="hover:bg-gray-50">
                    <td className="p-3 font-mono font-bold text-[#1F3A5F]">{t.tx_number}</td>
                    <td className="p-3 font-bold text-gray-900">{t.account_name}</td>
                    <td className="p-3 text-gray-800">{t.description}</td>
                    <td className="p-3 text-left font-mono font-bold text-rose-700">
                      -{formatCurrency(t.amount)}
                    </td>
                    <td className="p-3 text-left font-mono text-gray-600">
                      {formatCurrency(t.balance_after || 0)}
                    </td>
                    <td className="p-3 text-gray-600 font-mono">
                      {formatDate(t.created_at || t.date)}
                    </td>
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
