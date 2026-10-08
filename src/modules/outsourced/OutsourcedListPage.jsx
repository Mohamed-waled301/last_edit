import React, { useState, useEffect } from 'react';
import { Factory, Plus, Download, CheckCircle2, Clock, Search, Truck } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function OutsourcedListPage({ onNotify }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await api.getFinishingOrders();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.finishing_orders) ? res.finishing_orders : []);
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

  const handleReceiveFromExternal = async (orderId) => {
    try {
      const res = await api.markReadyForSale(orderId);
      if (onNotify) onNotify(res.message || 'تم استلام المنتج واعتماد الجاهزية للبيع بالمخزن ✓');
      loadOrders();
    } catch (err) {
      alert(err.message || 'فشل في استلام الدفعة');
    }
  };

  const filtered = orders.filter(o => 
    (o.finishing_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.external_factory_name || o.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageContainer
      title="التصنيع والتشغيل لدى الغير (Outsourced Manufacturing)"
      subtitle="متابعة عمليات التطريز، الغسيل، والطباعة بالمصانع الخارجية وحساب التكلفة التراكمية"
      breadcrumbs={[{ label: 'التصنيع لدى الغير' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/outsourced/new'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ أمر تشغيل خارجي جديد</span>
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
            placeholder="البحث برقم أمر التشغيل، المصنع الخارجي، أو المنتج..."
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Outsourced Orders Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">رقم الأمر</th>
                <th className="p-3">المصنع الخارجي (مورد الخدمة)</th>
                <th className="p-3">المنتج</th>
                <th className="p-3 text-center font-mono">الكمية</th>
                <th className="p-3 text-left font-mono">تكلفة م1 المنقولة</th>
                <th className="p-3 text-left font-mono">تكلفة التشغيل الخارجي</th>
                <th className="p-3 text-left font-mono text-emerald-300">التكلفة النهائية التراكمية</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل أوامر التشغيل لدى الغير...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-400">
                    لا توجد أوامر تشغيل لدى الغير مسجلة
                  </td>
                </tr>
              ) : (
                filtered.map((o, idx) => {
                  const isReady = o.status === 'ready_for_sale';
                  const internalCost = Number(o.stage1_transferred_cost || 0);
                  const outsourcedCost = Number(o.total_finishing_stage_cost || (Number(o.finishing_labor_fee || 0) + Number(o.transport_cost || 0)));
                  const finalCost = Number(o.final_total_batch_cost || (internalCost + outsourcedCost));

                  return (
                    <tr key={o.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{o.finishing_number}</td>
                      <td className="p-3 font-bold text-gray-900">
                        {o.external_factory_name || o.supplier_name || 'مصنع تشغيل خارجي'}
                      </td>
                      <td className="p-3 text-gray-700">{o.product_name}</td>
                      <td className="p-3 text-center font-mono font-bold text-gray-900">{o.finishing_quantity} قطعة</td>
                      <td className="p-3 text-left font-mono text-gray-700">{formatCurrency(internalCost)}</td>
                      <td className="p-3 text-left font-mono font-bold text-indigo-700">{formatCurrency(outsourcedCost)}</td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(finalCost)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                          isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {isReady ? 'جاهز للبيع بالمخزن' : 'قيد التشغيل بالخارج'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {!isReady ? (
                          <button
                            type="button"
                            onClick={() => handleReceiveFromExternal(o.id)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            استلام بالمعرض / المخزن
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">تم الاستلام ✓</span>
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
