import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Users, 
  Truck, 
  ArrowLeftRight, 
  Download, 
  Edit, 
  CheckCircle2, 
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  X
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function PartiesListPage({ mode = 'suppliers', defaultTab = null, onNotify }) {
  const effectiveMode = defaultTab || mode;
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState(effectiveMode === 'customers' ? 'customers' : 'suppliers'); // 'all' | 'suppliers' | 'customers' | 'both'
  const [offsetModalParty, setOffsetModalParty] = useState(null);
  const [offsetAmount, setOffsetAmount] = useState('');
  const [offsetNotes, setOffsetNotes] = useState('');
  const [offsetExecuting, setOffsetExecuting] = useState(false);

  const loadParties = async () => {
    try {
      setLoading(true);
      const res = await api.getParties();
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.parties) ? res.parties : []);
      setParties(list);
    } catch (err) {
      console.error('Failed to load parties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadParties();
  }, []);

  const filteredParties = parties.filter(p => {
    const matchesSearch = 
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.phone || '').includes(searchTerm);

    if (!matchesSearch) return false;

    if (filterRole === 'suppliers') return Boolean(p.is_supplier);
    if (filterRole === 'customers') return Boolean(p.is_customer);
    if (filterRole === 'both') return Boolean(p.is_supplier && p.is_customer);
    return true;
  });

  const handleOpenOffset = (party) => {
    setOffsetModalParty(party);
    setOffsetAmount(String(party.max_offset_amount || Math.min(party.supplier_balance || 0, party.customer_balance || 0)));
    setOffsetNotes(`تسوية مقاصة متبادلة لحساب ${party.name}`);
  };

  const handleExecuteOffset = async () => {
    if (!offsetModalParty) return;
    const num = Number(offsetAmount) || 0;
    if (num <= 0) {
      alert('مبلغ المقاصة يجب أن يكون أكبر من صفر');
      return;
    }

    try {
      setOffsetExecuting(true);
      const res = await api.executePartyOffset(offsetModalParty.id, num, offsetNotes);
      if (onNotify) onNotify(res.message || 'تم اعتماد المقاصة وتسوية الأرصدة بنجاح');
      setOffsetModalParty(null);
      loadParties();
    } catch (err) {
      alert(err.message || 'فشل في تنفيذ المقاصة');
    } finally {
      setOffsetExecuting(false);
    }
  };

  const handleExport = () => {
    const exportData = filteredParties.map(p => ({
      'الكود': p.code,
      'الاسم': p.name,
      'الهاتف': p.phone || '-',
      'مورد': p.is_supplier ? 'نعم' : 'لا',
      'عميل': p.is_customer ? 'نعم' : 'لا',
      'رصيد أول المدة (مورد)': p.supplier_opening_balance ?? p.opening_balance ?? 0,
      'طبيعة حساب المورد': (p.supplier_opening_type || p.opening_balance_type || 'credit') === 'credit' ? 'دائن' : 'مدين',
      'رصيد أول المدة (عميل)': p.customer_opening_balance ?? p.opening_balance ?? 0,
      'طبيعة حساب العميل': (p.customer_opening_type || p.opening_balance_type || 'debit') === 'credit' ? 'دائن' : 'مدين',
      'مديونية المورد (مستحق له)': p.supplier_balance || 0,
      'مديونية العميل (مستحق عليه)': p.customer_balance || 0,
      'صافي الرصيد': p.net_balance || 0,
      'الحد الائتماني (عميل)': p.credit_limit || 0
    }));
    exportToExcel(exportData, effectiveMode === 'customers' ? 'دليل_العملاء' : 'دليل_الموردين');
    if (onNotify) onNotify('تم تصدير البيانات إلى ملف إكسيل بنجاح');
  };

  const pageTitle = effectiveMode === 'customers' ? 'دليل العملاء' : 'دليل الموردين وجهات التعامل';
  const pageSubtitle = effectiveMode === 'customers' 
    ? 'إدارة حسابات العملاء، الحدود الائتمانية، وأرصدة المديونية'
    : 'إدارة الموردين، حسابات التشغيل الخارجي، المقاصة وتسوية الأرصدة المشتركة';

  return (
    <PageContainer
      title={pageTitle}
      subtitle={pageSubtitle}
      breadcrumbs={[{ label: effectiveMode === 'customers' ? 'العملاء' : 'الموردين' }]}
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
            onClick={() => {
              window.location.hash = effectiveMode === 'customers' ? '#/customers/new' : '#/suppliers/new';
            }}
            className="px-4 py-2 rounded-md bg-[#1F3A5F] hover:bg-[#162a45] text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{effectiveMode === 'customers' ? '+ إضافة عميل جديد' : '+ إضافة مورد / جهة تعامل'}</span>
          </button>
        </div>
      }
    >
      {/* Search and Role Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث بالاسم، الكود، أو رقم الهاتف..."
              className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md text-xs font-bold">
            <button
              onClick={() => setFilterRole('all')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterRole === 'all' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              الكل ({parties.length})
            </button>
            <button
              onClick={() => setFilterRole('suppliers')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterRole === 'suppliers' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              الموردين ({parties.filter(p => p.is_supplier).length})
            </button>
            <button
              onClick={() => setFilterRole('customers')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterRole === 'customers' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              العملاء ({parties.filter(p => p.is_customer).length})
            </button>
            <button
              onClick={() => setFilterRole('both')}
              className={`px-3 py-1.5 rounded-sm transition-colors cursor-pointer ${
                filterRole === 'both' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              مورد وعميل معاً ({parties.filter(p => p.is_supplier && p.is_customer).length})
            </button>
          </div>
        </div>
      </div>

      {/* Parties Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10 select-none">
              <tr>
                <th className="p-3">الكود</th>
                <th className="p-3">الاسم / الشركة</th>
                <th className="p-3">الهاتف</th>
                <th className="p-3 text-center">الصفة</th>
                <th className="p-3 text-left font-mono">رصيد المورد (له)</th>
                <th className="p-3 text-left font-mono">رصيد العميل (عليه)</th>
                <th className="p-3 text-center">صافي الرصيد</th>
                <th className="p-3 text-left font-mono">الحد الائتماني</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل بيانات جهات التعامل...
                  </td>
                </tr>
              ) : filteredParties.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="text-gray-600 font-bold text-sm">لا توجد جهات تعامل مسجلة تطابق البحث</p>
                      <button
                        onClick={() => { window.location.hash = mode === 'customers' ? '#/customers/new' : '#/suppliers/new'; }}
                        className="px-4 py-2 bg-[#1F3A5F] text-white rounded-md text-xs font-bold hover:bg-[#162a45]"
                      >
                        + إضافة جهة تعامل الآن
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredParties.map((p, idx) => {
                  const isBoth = Boolean(p.is_supplier && p.is_customer);
                  const supBal = Number(p.supplier_balance) || 0;
                  const custBal = Number(p.customer_balance) || 0;
                  const netBal = Number(p.net_balance) || 0;
                  const maxOffset = Number(p.max_offset_amount) || Math.min(supBal, custBal);

                  return (
                    <tr 
                      key={p.id || idx}
                      className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                    >
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                        {p.code}
                      </td>

                      <td className="p-3 font-bold text-gray-900">
                        <div>{p.name}</div>
                        {p.supplier_type === 'service' && (
                          <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                            مصنع تشغيل خارجي لدى الغير
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-gray-600 font-mono">
                        {p.phone || '-'}
                      </td>

                      {/* Role Badges */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {p.is_supplier && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[10px]">
                              مورد
                            </span>
                          )}
                          {p.is_customer && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                              عميل
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Supplier Balance */}
                      <td className="p-3 text-left font-mono font-bold text-gray-800">
                        {p.is_supplier ? formatCurrency(supBal) : '-'}
                      </td>

                      {/* Customer Balance */}
                      <td className="p-3 text-left font-mono font-bold text-gray-800">
                        {p.is_customer ? formatCurrency(custBal) : '-'}
                      </td>

                      {/* Net Balance & Offset Button */}
                      <td className="p-3 text-center">
                        {isBoth ? (
                          <div className="space-y-1">
                            <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                              netBal > 0 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                : netBal < 0 
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                                  : 'bg-gray-100 text-gray-700'
                            }`}>
                              {netBal === 0 ? 'رصيد متوازن (0)' : netBal > 0 ? `لنا: ${formatCurrency(netBal)}` : `علينا: ${formatCurrency(Math.abs(netBal))}`}
                            </span>
                            {maxOffset > 0 && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenOffset(p)}
                                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                                  title="إجراء مقاصة بين رصيد التوريد ورصيد البيع"
                                >
                                  <ArrowLeftRight className="w-3 h-3" />
                                  <span>مقاصة ({formatCurrency(maxOffset)})</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 font-mono text-[11px]">
                            {p.is_customer ? formatCurrency(custBal) : formatCurrency(supBal)}
                          </span>
                        )}
                      </td>

                      {/* Customer Credit Limit */}
                      <td className="p-3 text-left font-mono font-bold text-emerald-800">
                        {p.is_customer && p.credit_limit > 0 ? formatCurrency(p.credit_limit) : (
                          p.is_customer ? <span className="text-gray-400">غير محدد</span> : '-'
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            window.location.hash = `#/suppliers/${p.id}/edit`;
                          }}
                          className="px-2.5 py-1 text-xs text-[#1F3A5F] hover:bg-blue-50 rounded-md font-bold transition-colors inline-flex items-center gap-1 border border-gray-200 cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>تعديل</span>
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

      {/* تأكيد إجراء المقاصة */}
      {offsetModalParty && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-amber-600" />
                إجراء تسوية مقاصة مالية
              </h3>
              <button 
                onClick={() => setOffsetModalParty(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              تسوية وتصفية الأرصدة المتبادلة لجهة التعامل <strong className="text-gray-900">({offsetModalParty.name})</strong>:
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs space-y-1.5 font-semibold">
              <div className="flex justify-between">
                <span className="text-gray-500">مستحق للمورد (مديونيتنا له):</span>
                <span className="font-mono text-gray-800">{formatCurrency(offsetModalParty.supplier_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">مستحق على العميل (مديونيته لنا):</span>
                <span className="font-mono text-gray-800">{formatCurrency(offsetModalParty.customer_balance)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200 text-amber-800 font-bold">
                <span>الحد الأقصى للمقاصة الفورية:</span>
                <span className="font-mono">{formatCurrency(offsetModalParty.max_offset_amount)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                المبلغ المراد مقاصته (ج.م)
              </label>
              <input
                type="number"
                min="1"
                max={offsetModalParty.max_offset_amount}
                value={offsetAmount}
                onChange={(e) => setOffsetAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات سند المقاصة
              </label>
              <input
                type="text"
                value={offsetNotes}
                onChange={(e) => setOffsetNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setOffsetModalParty(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-md cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteOffset}
                disabled={offsetExecuting}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-md cursor-pointer disabled:opacity-50"
              >
                {offsetExecuting ? 'جاري التنفيذ...' : 'اعتماد المقاصة الآن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
