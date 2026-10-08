import React, { useState, useEffect } from 'react';
import { Landmark, ArrowRightLeft, Plus, Download, Store, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api, getActiveUser } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function TreasuriesListPage({ onNotify }) {
  const activeUser = getActiveUser();
  const [treasuries, setTreasuries] = useState([]);
  const [mainTreasury, setMainTreasury] = useState(null);
  const [closings, setClosings] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tRes, cRes] = await Promise.all([
        api.getTreasuries(),
        api.getDailyClosings ? api.getDailyClosings() : Promise.resolve({ data: [] })
      ]);

      const safeList = Array.isArray(tRes.treasuries) ? tRes.treasuries : (Array.isArray(tRes.data) ? tRes.data : []);
      const main = tRes.mainTreasury || tRes.main_treasury || safeList.find(a => a?.is_main) || { name: 'الخزينة المركزية الرئيسية', current_balance: 0 };
      const outlets = Array.isArray(tRes.outletTreasuries) ? tRes.outletTreasuries : safeList.filter(a => !a?.is_main);

      setMainTreasury(main);
      // For cashier: show only cashier's outlet treasury (Requirement I1)
      if (activeUser.role === 'cashier' && activeUser.outlet_id) {
        setTreasuries(outlets.filter(a => a.outlet_id === activeUser.outlet_id));
      } else {
        setTreasuries(outlets);
      }

      setClosings(Array.isArray(cRes.data) ? cRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalOutletsBalance = treasuries.reduce((sum, t) => sum + (Number(t.current_balance) || 0), 0);
  const mainBalance = Number(mainTreasury?.current_balance) || 0;
  const grandTotal = mainBalance + totalOutletsBalance;

  return (
    <PageContainer
      title="الخزائن والخزينة المركزية المجمعة"
      subtitle="لكل منفذ بيع خزينته المستقلة + خزينة مركزية رئيسية مجمعة تستقبل التوريدات وتقفيل الورديات"
      breadcrumbs={[{ label: 'الخزائن' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/treasuries/closing'; }}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-gray-500" />
            <span>+ تقفيل وردية كاشير</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/treasuries/transfer'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>+ توريد نقدية للمركزية</span>
          </button>
        </div>
      }
    >
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Main Treasury */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs border-r-4 border-r-[#1F3A5F]">
          <span className="text-xs font-bold text-gray-500 block">الخزينة المركزية الرئيسية (المجمعة)</span>
          <div className="text-2xl font-bold font-mono text-[#1F3A5F] mt-1">
            {formatCurrency(mainBalance)}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">تستقبل وتجمع توريدات كافة منافذ البيع</span>
        </div>

        {/* Outlets Treasuries */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs border-r-4 border-r-green-600">
          <span className="text-xs font-bold text-gray-500 block">إجمالي خزائن منافذ البيع ({treasuries.length} خزينة)</span>
          <div className="text-2xl font-bold font-mono text-green-700 mt-1">
            {formatCurrency(totalOutletsBalance)}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">سيولة حالية في أدراج ونقاط بيع المعارض</span>
        </div>

        {/* Grand Total Cash */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs border-r-4 border-r-blue-600">
          <span className="text-xs font-bold text-gray-500 block">إجمالي السيولة النقدية الكلية للمؤسسة</span>
          <div className="text-2xl font-bold font-mono text-gray-900 mt-1">
            {formatCurrency(grandTotal)}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">مجموع الخزينة الرئيسية + خزائن المعارض</span>
        </div>
      </div>

      {/* Outlets Treasuries Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-[#1F3A5F]" />
            أرصدة خزائن منافذ البيع والمعارض
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">اسم الخزينة</th>
                <th className="p-3">المنفذ / المعرض التابع</th>
                <th className="p-3 text-left font-mono">الرصيد النقدي الحالي</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إجراء توريد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500 font-bold">
                    جاري تحميل الخزائن...
                  </td>
                </tr>
              ) : treasuries.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-400">
                    لا توجد خزائن منافذ مسجلة
                  </td>
                </tr>
              ) : (
                treasuries.map((t, idx) => (
                  <tr key={t.id || idx} className="hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#1F3A5F]" />
                      <span>{t.name}</span>
                    </td>
                    <td className="p-3 text-gray-700 font-semibold">{t.outlet_name || 'معرض مبيعات'}</td>
                    <td className="p-3 text-left font-mono font-bold text-green-700">{formatCurrency(t.current_balance)}</td>
                    <td className="p-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                        نشطة
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => { window.location.hash = '#/treasuries/transfer'; }}
                        className="px-2.5 py-1 text-xs text-[#1F3A5F] hover:bg-blue-50 border border-gray-200 rounded font-bold cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>توريد للمركزية</span>
                      </button>
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
