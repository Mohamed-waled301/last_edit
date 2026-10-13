import React, { useState, useEffect } from 'react';
import { Cog, Plus, Download, CheckCircle2, Clock, Image as ImageIcon, Search } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function ManufacturingListPage({ onNotify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await api.getProductionOrders();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.production_orders) ? res.production_orders : []);
      setOrders(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleCompleteStage1 = async (orderId) => {
    try {
      const res = await api.completeStage1(orderId);
      if (onNotify) onNotify(res.message || 'تم إتمام مرحلة التشغيل الأولى بنجاح');
      loadOrders();
    } catch (err) {
      alert(err.message || 'فشل في إتمام المرحلة');
    }
  };

  const filtered = orders.filter(o => 
    (o.order_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageContainer
      title="أوامر الإنتاج والتصنيع الداخلي"
      subtitle="متابعة تشغيل خطوط الإنتاج بالمصنع، تكاليف المراحل، وصرف الخامات"
      breadcrumbs={[{ label: 'التصنيع' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/manufacturing/new'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ أمر تصنيع جديد</span>
          </button>
        </div>
      }
    >
      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            aria-label="البحث برقم أمر الإنتاج أو اسم المنتج"
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Production Orders Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">رقم الأمر</th>
                <th className="p-3">المنتج</th>
                <th className="p-3">تاريخ البدء</th>
                <th className="p-3 text-center font-mono">كمية الدفعة</th>
                <th className="p-3 text-left font-mono">تكلفة الخامات</th>
                <th className="p-3 text-left font-mono">تكاليف إضافية</th>
                <th className="p-3 text-left font-mono">إجمالي تكلفة المنتج</th>
                <th className="p-3 text-left font-mono">تكلفة الوحدة</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="10" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل أوامر الإنتاج...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="10" className="p-10 text-center text-gray-400">
                    لا توجد أوامر تشغيل مسجلة
                  </td>
                </tr>
              ) : (
                filtered.map((o, idx) => {
                  const isCompleted = o.status === 'completed' || o.status === 'ready_for_stage2';
                  const addCost = o.total_additional_cost !== undefined ? o.total_additional_cost : (o.labor_cost || 0);
                  const totalCost = o.total_product_cost !== undefined ? o.total_product_cost : (o.total_stage1_cost || 0);
                  const uCost = o.unit_cost !== undefined ? o.unit_cost : (o.unit_stage1_cost || 0);

                  return (
                    <tr key={o.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{o.order_number}</td>
                      <td className="p-3 font-bold text-gray-900">{o.product_name}</td>
                      <td className="p-3 text-gray-600 font-mono">{formatDate(o.start_date)}</td>
                      <td className="p-3 text-center font-mono font-bold text-gray-900">{o.batch_quantity} قطعة</td>
                      <td className="p-3 text-left font-mono font-bold text-gray-800">{formatCurrency(o.total_material_cost || 0)}</td>
                      <td className="p-3 text-left font-mono font-bold text-indigo-700">{formatCurrency(addCost)}</td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(totalCost)}</td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-800">{formatCurrency(uCost)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          isCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isCompleted ? 'مكتمل' : 'قيد التشغيل'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {!isCompleted ? (
                          <button
                            type="button"
                            onClick={() => handleCompleteStage1(o.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            إتمام المرحلة
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { window.location.hash = '#/outsourced/new'; }}
                            className="px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 font-bold rounded cursor-pointer"
                            title="تحويل للتشغيل الخارجي"
                          >
                            تحويل للغير
                          </button>
                        )}
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
