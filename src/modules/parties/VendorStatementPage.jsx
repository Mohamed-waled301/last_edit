import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowRight, 
  Printer, 
  Download, 
  Calendar, 
  Search, 
  FileText, 
  Phone, 
  Building2, 
  Filter, 
  CheckCircle2, 
  Layers,
  Scissors,
  ExternalLink,
  Edit
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';
import { isValidPhoneForWhatsApp, openWhatsAppChat } from '../../utils/phone';

export default function VendorStatementPage({ vendorId = null, onBack, onNotify }) {
  const [vendor, setVendor] = useState(null);
  const [rawMovements, setRawMovements] = useState([]);
  const [summary, setSummary] = useState({
    opening_balance: 0,
    opening_type: 'credit',
    total_debit: 0,
    total_credit: 0,
    remaining_balance: 0
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchDoc, setSearchDoc] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  useEffect(() => {
    async function loadStatement() {
      if (!vendorId) return;
      try {
        setLoading(true);

        // Fetch party details
        let pRes = null;
        try {
          pRes = await api.getParty(vendorId);
        } catch {
          // Fallback
          const allP = await api.getParties().catch(() => ({ data: [] }));
          const list = Array.isArray(allP.data) ? allP.data : (allP.parties || []);
          pRes = { data: list.find(x => String(x.id) === String(vendorId)) };
        }
        const vData = pRes?.data || null;
        setVendor(vData);

        // Fetch statement data
        let statementMovements = [];
        let openBal = Number(vData?.supplier_opening_balance ?? vData?.opening_balance ?? 0);
        let openType = vData?.supplier_opening_type || vData?.opening_balance_type || 'credit';

        try {
          const stmtRes = await api.getSupplierStatement(vendorId);
          if (stmtRes?.data) {
            const d = stmtRes.data;
            if (d.summary) {
              openBal = Number(d.summary.opening_balance || openBal);
              openType = d.summary.opening_balance_type || openType;
            }
            if (Array.isArray(d.statement)) {
              statementMovements = d.statement.map(m => ({
                id: m.id || `${m.date}-${m.ref_number}`,
                date: m.date,
                doc_number: m.doc_number || m.invoice_number || m.ref_number || '---',
                stage: m.stage || (m.type === 'invoice' ? 'فاتورة توريد' : 'صرف نقدية'),
                description: m.description || m.notes || (m.type === 'invoice' ? 'فاتورة شراء خامات' : 'سند صرف دفعة'),
                debit: Number(m.debit || (m.type === 'invoice' ? m.amount : 0) || 0),
                credit: Number(m.credit || (m.type === 'payment' ? m.amount : 0) || 0),
                cut_order_id: m.cut_order_id || null,
                po_id: m.po_id || null
              }));
            }
          }
        } catch (err) {
          console.warn('Failed to load supplier statement movements:', err);
        }

        // Also check production order stage allocations for workshops
        try {
          const prodRes = await api.getProductionOrders().catch(() => ({ data: [] }));
          const pOrders = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.production_orders || []);
          for (const order of pOrders) {
            if (Array.isArray(order.stages)) {
              for (const stg of order.stages) {
                if (String(stg.workshop_id || stg.party_id) === String(vendorId)) {
                  // Stage movement
                  const stageName = stg.stage_name || (stg.stage_key === 'printing' ? 'طباعة' : stg.stage_key === 'embroidery' ? 'تطريز' : stg.stage_key === 'sewing' ? 'حياكة' : 'تشغيل');
                  statementMovements.push({
                    id: `stg-${order.id}-${stg.stage_key}`,
                    date: order.created_at || new Date().toISOString(),
                    doc_number: order.cutting_number || order.order_number || `قصة #${order.id}`,
                    stage: stageName,
                    description: `تشغيل مرحلة ${stageName} لأمر القص [${order.cutting_number || order.order_number}]`,
                    debit: Number(stg.stage_cost || stg.total_cost || 0),
                    credit: 0,
                    cut_order_id: order.id
                  });
                }
              }
            }
          }
        } catch (err) {
          console.warn('Failed to load related workshop stages:', err);
        }

        // Sort movements chronologically
        statementMovements.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

        setSummary({
          opening_balance: openBal,
          opening_type: openType,
          total_debit: 0,
          total_credit: 0,
          remaining_balance: 0
        });
        setRawMovements(statementMovements);
      } catch (err) {
        console.error('Failed to load vendor statement:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStatement();
  }, [vendorId]);

  // Compute filtered movements with exact running balance
  const computedMovements = useMemo(() => {
    let running = summary.opening_type === 'debit' ? -summary.opening_balance : summary.opening_balance;
    let totDebit = 0;
    let totCredit = 0;

    const listWithBal = rawMovements.map((m) => {
      // In supplier ledger: Debit (له / المستحق له) increases balance; Credit (المسدد له) decreases balance
      running = running + m.debit - m.credit;
      totDebit += m.debit;
      totCredit += m.credit;
      return {
        ...m,
        running_balance: running
      };
    });

    return {
      items: listWithBal,
      total_debit: totDebit,
      total_credit: totCredit,
      closing_balance: running
    };
  }, [rawMovements, summary.opening_balance, summary.opening_type]);

  // Filtered rows by user criteria
  const filteredRows = useMemo(() => {
    return computedMovements.items.filter((row) => {
      if (startDate && row.date && row.date.slice(0, 10) < startDate) return false;
      if (endDate && row.date && row.date.slice(0, 10) > endDate) return false;
      if (searchDoc) {
        const term = searchDoc.trim().toLowerCase();
        const matchesDoc = (row.doc_number || '').toLowerCase().includes(term);
        const matchesDesc = (row.description || '').toLowerCase().includes(term);
        if (!matchesDoc && !matchesDesc) return false;
      }
      if (stageFilter !== 'all') {
        if (!row.stage || !row.stage.includes(stageFilter)) return false;
      }
      return true;
    });
  }, [computedMovements, startDate, endDate, searchDoc, stageFilter]);

  const handleExportExcel = () => {
    if (!vendor) return;
    const exportData = filteredRows.map((r, idx) => ({
      'م': idx + 1,
      'التاريخ': formatDate(r.date),
      'رقم المستند / أمر القص': r.doc_number,
      'المرحلة': r.stage,
      'البيان': r.description,
      'المستحق (له)': r.debit,
      'المسدد (منه)': r.credit,
      'الرصيد التراكمي': r.running_balance
    }));
    exportToExcel(exportData, `كشف_حساب_${vendor.name || 'جهة_التعامل'}`);
    if (onNotify) onNotify('تم تصدير كشف الحساب إلى إكسيل بنجاح');
  };

  const handleOpenPrintPreview = () => {
    window.location.hash = `#/print-preview?type=statement&id=${vendorId}`;
  };

  const getActivityLabel = () => {
    if (!vendor) return 'مورد';
    if (vendor.supplier_type === 'service') return 'خدمات تشغيل لدى الغير';
    if (vendor.supplier_type === 'goods') return 'توريد خامات ومستلزمات إنتاج';
    if (vendor.supplier_type) return vendor.supplier_type;
    if (vendor.is_customer && !vendor.is_supplier) return 'عميل توزيع';
    if (vendor.is_supplier && vendor.is_customer) return 'مورد وعميل مشترك';
    return 'مورد';
  };

  if (loading) {
    return (
      <PageContainer title="كشف حساب جهة التعامل">
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">
          جاري تحميل بيانات كشف الحساب والأستاذ المالي...
        </div>
      </PageContainer>
    );
  }

  if (!vendor) {
    return (
      <PageContainer title="كشف الحساب">
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
          <p className="text-slate-700 font-bold">لم يتم العثور على سجل جهة التعامل المطلوبة.</p>
          <button
            type="button"
            onClick={onBack || (() => { window.location.hash = '#/suppliers'; })}
            className="px-4 py-2 bg-[#1F3A5F] text-white rounded-lg text-xs font-bold"
          >
            العودة للقائمة
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={`كشف حساب: ${vendor.name}`}
      subtitle="سجل حركات الحساب التفصيلي، أوامر الشغل والقص، والمطابقات المالية"
      breadcrumbs={[
        { label: vendor.is_customer && !vendor.is_supplier ? 'العملاء' : 'الموردين والورش', href: vendor.is_customer && !vendor.is_supplier ? '#/customers' : '#/suppliers' },
        { label: 'كشف الحساب' }
      ]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack || (() => { window.location.hash = vendor.is_customer && !vendor.is_supplier ? '#/customers' : '#/suppliers'; })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const target = vendor.is_customer && !vendor.is_supplier ? 'customers' : 'suppliers';
              window.location.hash = `#/${target}/${vendor.id}/edit`;
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Edit className="w-4 h-4" />
            <span>تعديل البيانات</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            type="button"
            onClick={handleOpenPrintPreview}
            className="flex items-center gap-2 px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>معاينة وطباعة</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6" dir="rtl">
        {/* Vendor Header Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-[#1F3A5F] flex items-center justify-center font-bold">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{vendor.name}</h1>
                  <span className="text-xs font-mono font-semibold text-slate-500">الكود: {vendor.code}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold border border-slate-200">
                {getActivityLabel()}
              </span>
              {vendor.phone && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-bold text-slate-800">{vendor.phone}</span>
                  {isValidPhoneForWhatsApp(vendor.phone) && (
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(vendor.phone, `السلام عليكم ورحمة الله، مرفق كشف حسابكم طرفنا برصيد: ${formatCurrency(computedMovements.closing_balance)}.`)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 cursor-pointer"
                      title="مراسلة عبر واتساب"
                    >
                      واتساب
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-xs font-bold text-slate-500 block mb-1">رصيد أول المدة</span>
              <span className="text-lg font-bold font-mono text-slate-800 block">
                {formatCurrency(summary.opening_balance)}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold block mt-1">
                الطبيعة: {summary.opening_type === 'credit' ? 'دائن (مستحق له)' : 'مدين (دفعة مقدمة)'}
              </span>
            </div>

            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4">
              <span className="text-xs font-bold text-blue-700 block mb-1">إجمالي المستحق / التكلفة</span>
              <span className="text-lg font-bold font-mono text-blue-900 block">
                {formatCurrency(computedMovements.total_debit)}
              </span>
              <span className="text-[11px] text-blue-600 block mt-1">إجمالي التوريدات ومراحل الشغل</span>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
              <span className="text-xs font-bold text-emerald-700 block mb-1">إجمالي المسدد</span>
              <span className="text-lg font-bold font-mono text-emerald-900 block">
                {formatCurrency(computedMovements.total_credit)}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-1">سندات الصرف والدفعات المعتمدة</span>
            </div>

            <div className="bg-slate-900 text-white rounded-xl p-4">
              <span className="text-xs font-bold text-slate-300 block mb-1">الرصيد المتبقي الحالي</span>
              <span className="text-xl font-bold font-mono text-emerald-400 block">
                {formatCurrency(computedMovements.closing_balance)}
              </span>
              <span className="text-[11px] text-slate-400 block mt-1">
                {computedMovements.closing_balance > 0 ? 'مستحق للجهة (له)' : computedMovements.closing_balance < 0 ? 'مستحق على الجهة (لنا)' : 'حساب مسوى بالكامل'}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
            {/* Search by doc or cut order */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">بحث برقم المستند أو القصة</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchDoc}
                  onChange={(e) => setSearchDoc(e.target.value)}
                  aria-label="البحث برقم الإذن أو أمر القص"
                  className="w-full pl-3 pr-8 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
              </div>
            </div>

            {/* Stage filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">تصفية حسب المرحلة</label>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-bold focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
              >
                <option value="all">جميع المراحل والتوريدات</option>
                <option value="طباعة">طباعة</option>
                <option value="تطريز">تطريز</option>
                <option value="حياكة">حياكة</option>
                <option value="توريد">توريد خامات</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-mono"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold select-none sticky top-0">
                <tr>
                  <th className="p-3 w-12 text-center">م</th>
                  <th className="p-3 w-28">التاريخ</th>
                  <th className="p-3 w-36 font-mono">رقم المستند / أمر القص</th>
                  <th className="p-3 w-28">المرحلة</th>
                  <th className="p-3">البيان والتفاصيل</th>
                  <th className="p-3 w-28 text-left font-mono">المستحق (له)</th>
                  <th className="p-3 w-28 text-left font-mono">المسدد (منه)</th>
                  <th className="p-3 w-32 text-left font-mono">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Initial opening balance row */}
                <tr className="bg-slate-50/80 font-bold text-slate-800">
                  <td className="p-3 text-center text-slate-400">-</td>
                  <td className="p-3 font-mono text-slate-500">رصيد أول المدة</td>
                  <td className="p-3 font-mono text-slate-400">---</td>
                  <td className="p-3 text-slate-500">افتتاحي</td>
                  <td className="p-3">رصيد افتتاحي مسجل بدفتر الأستاذ ({summary.opening_type === 'credit' ? 'دائن' : 'مدين'})</td>
                  <td className="p-3 text-left font-mono">{summary.opening_type === 'credit' ? formatCurrency(summary.opening_balance) : '-'}</td>
                  <td className="p-3 text-left font-mono">{summary.opening_type === 'debit' ? formatCurrency(summary.opening_balance) : '-'}</td>
                  <td className="p-3 text-left font-mono text-[#1F3A5F]">
                    {formatCurrency(summary.opening_type === 'debit' ? -summary.opening_balance : summary.opening_balance)}
                  </td>
                </tr>

                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-10 text-center text-slate-400 font-bold">
                      لا توجد حركات مالية مسجلة تطابق محددات البحث
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.id || idx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 text-center text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-mono text-slate-600">{formatDate(row.date)}</td>
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                        {row.cut_order_id ? (
                          <a
                            href={`#/manufacturing/${row.cut_order_id}/edit`}
                            className="inline-flex items-center gap-1 hover:underline text-blue-700"
                            title="الانتقال إلى أمر القص"
                          >
                            <span>{row.doc_number}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span>{row.doc_number}</span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-bold">
                          {row.stage}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800 font-medium">{row.description}</td>
                      <td className="p-3 text-left font-mono font-bold text-blue-900">
                        {row.debit > 0 ? formatCurrency(row.debit) : '-'}
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-700">
                        {row.credit > 0 ? formatCurrency(row.credit) : '-'}
                      </td>
                      <td className={`p-3 text-left font-mono font-bold ${row.running_balance >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                        {formatCurrency(row.running_balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
