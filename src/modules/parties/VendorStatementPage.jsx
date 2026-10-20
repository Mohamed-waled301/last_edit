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
import {
  calculateStatementSummaryCards,
  computeMovementsWithRunningBalance
} from '../../logic/statementSummaryCards';

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
  const [txTypeFilter, setTxTypeFilter] = useState('all');
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
        const isCustomer = Boolean(vData?.is_customer);
        const isSupplier = Boolean(vData?.is_supplier !== 0);
        const isCustomerOnly = Boolean(isCustomer && !isSupplier);

        let openBal = Number(
          isCustomerOnly
            ? (vData?.customer_opening_balance ?? vData?.opening_balance ?? 0)
            : (vData?.supplier_opening_balance ?? vData?.opening_balance ?? 0)
        );
        let openType = isCustomerOnly
          ? (vData?.customer_opening_type || vData?.opening_balance_type || 'debit')
          : (vData?.supplier_opening_type || vData?.opening_balance_type || 'credit');

        // 1. Fetch Customer movements if party has customer role
        if (isCustomer) {
          try {
            const stmtRes = await api.getCustomerStatement(vendorId);
            if (stmtRes?.data || stmtRes?.statement || stmtRes?.movements) {
              const d = stmtRes.data || stmtRes;
              if (isCustomerOnly && d.summary) {
                openBal = Number(d.summary.opening_balance || openBal);
                openType = d.summary.opening_balance_type || openType;
              }
              const list = Array.isArray(d.statement) ? d.statement : (Array.isArray(d.movements) ? d.movements : []);
              for (const m of list) {
                if (m.is_opening || m.reference === 'OPENING') continue;
                const isReceipt = m.type === 'سند تحصيل' || m.credit > 0;
                const isRet = m.type === 'مرتجع مبيعات';
                statementMovements.push({
                  id: m.id || `cust-${m.date}-${m.reference}`,
                  date: m.date,
                  doc_number: m.reference || m.doc_number || '---',
                  stage: m.type || (isReceipt ? 'سند تحصيل' : isRet ? 'مرتجع مبيعات' : 'فاتورة مبيعات'),
                  category: isReceipt ? 'receipts' : isRet ? 'returns' : 'sales',
                  description: m.description || (isReceipt ? 'سداد دفعة نقدية' : isRet ? 'رد بضاعة' : 'فاتورة مبيعات'),
                  debit: Number(m.debit || 0), // Customer owes us (increases balance)
                  credit: Number(m.credit || 0), // Customer paid us (decreases balance)
                  cut_order_id: null,
                  po_id: null
                });
              }
            }
          } catch (e) {
            console.warn('Customer statement fetch warning:', e);
          }
        }

        // 2. Fetch Supplier movements if party has supplier role
        if (isSupplier) {
          try {
            const stmtRes = await api.getSupplierStatement(vendorId);
            if (stmtRes?.data || stmtRes?.statement || stmtRes?.movements) {
              const d = stmtRes.data || stmtRes;
              if (!isCustomerOnly && d.summary) {
                openBal = Number(d.summary.opening_balance || openBal);
                openType = d.summary.opening_balance_type || openType;
              }
              const list = Array.isArray(d.statement) ? d.statement : (Array.isArray(d.movements) ? d.movements : []);
              for (const m of list) {
                if (m.is_opening || m.reference === 'OPENING') continue;
                const isPay = m.type === 'سند صرف' || m.reference?.startsWith('PAY-');
                const isSet = m.type === 'تسوية مقاصة' || m.reference?.startsWith('SET-');
                const isRet = m.type === 'مرتجع خامات' || m.reference?.startsWith('RET-');
                const isCut = m.reference_type === 'CUTTING_ORDER' || m.reference?.startsWith('INV-CUT-') || String(m.type).includes('تشغيل');
                const isInv = m.type === 'فاتورة توريد' || m.reference?.startsWith('INV-') || isCut;

                const owedAmount = isInv ? Number(m.credit || m.amount || 0) : 0;
                const paidAmount = (isPay || isSet || isRet) ? Number(m.debit || m.amount || 0) : 0;

                statementMovements.push({
                  id: m.id || `sup-${m.date}-${m.reference}`,
                  date: m.date,
                  doc_number: m.reference || m.doc_number || '---',
                  stage: isCut ? (m.type || 'تشغيل') : (m.type || (isInv ? 'فاتورة توريد' : isPay ? 'سند صرف' : isSet ? 'تسوية مقاصة' : 'مرتجع خامات')),
                  category: isCut ? 'manufacturing' : (isInv ? 'purchases' : isPay ? 'payments' : isSet ? 'settlements' : isRet ? 'returns' : 'purchases'),
                  description: m.description || (isCut ? 'تشغيل مرحلة أمر قص' : (isInv ? 'فاتورة توريد خامات' : isPay ? 'سداد دفعة نقدية' : isSet ? 'تسوية مقاصة' : 'رد خامات')),
                  debit: owedAmount,
                  credit: paidAmount,
                  cut_order_id: m.cut_order_id || null,
                  po_id: m.po_id || null
                });
              }
            }
          } catch (e) {
            console.warn('Supplier statement fetch warning:', e);
          }
        }

        // 3. Also check production order stage allocations for workshops (fallback/deduplicated)
        try {
          const prodRes = await api.getProductionOrders().catch(() => ({ data: [] }));
          const pOrders = Array.isArray(prodRes.data) ? prodRes.data : (prodRes.production_orders || []);
          const safeStmtMovements = Array.isArray(statementMovements) ? statementMovements : [];
          const existingCutKeys = new Set(safeStmtMovements.filter(m => m && m.cut_order_id).map(m => `${m.cut_order_id}`));

          for (const order of pOrders) {
            if (existingCutKeys.has(String(order.id))) continue;
            const stagesObj = order.stages || {};
            const stageKeys = Object.keys(stagesObj);
            for (const sKey of stageKeys) {
              const stg = stagesObj[sKey];
              if (!stg) continue;
              const vId = stg.vendor_id || stg.workshop_id || stg.party_id;
              if (String(vId) === String(vendorId)) {
                const stageName = sKey === 'printing' ? 'طباعة' : sKey === 'embroidery' ? 'تطريز' : sKey === 'sewing' ? 'حياكة' : 'تشغيل';
                const cost = Number(stg.stage_cost || stg.total_cost || 0);
                if (cost > 0) {
                  statementMovements.push({
                    id: `stg-${order.id}-${sKey}`,
                    date: order.created_at || order.start_date || new Date().toISOString(),
                    doc_number: order.cutting_number || order.order_number || `قصة #${order.id}`,
                    stage: `تشغيل ${stageName}`,
                    category: 'manufacturing',
                    description: `تشغيل مرحلة ${stageName} لأمر القص [${order.cutting_number || order.order_number}]`,
                    debit: cost,
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

  // Compute movements with exact cumulative running balance
  const computedMovements = useMemo(() => {
    const isCust = Boolean(vendor?.is_customer && !vendor?.is_supplier);
    const openBal = Math.abs(Number(summary.opening_balance) || 0);
    const resolvedType = summary.opening_type || (isCust ? 'debit' : 'credit');
    const signedOpening = isCust
      ? (resolvedType === 'credit' ? -openBal : openBal)
      : (resolvedType === 'debit' ? -openBal : openBal);

    return computeMovementsWithRunningBalance(rawMovements, signedOpening);
  }, [rawMovements, summary.opening_balance, summary.opening_type, vendor]);

  // Helper to parse dd/mm/yyyy or yyyy-mm-dd to comparable YYYY-MM-DD
  const parseToIso = (val) => {
    if (!val) return '';
    const clean = String(val).trim();
    const dmy = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return clean.slice(0, 10);
    return clean;
  };

  // Filtered rows by user criteria (preserving authentic running balances)
  const filteredRows = useMemo(() => {
    if (txTypeFilter === 'opening') return [];
    const startIso = parseToIso(startDate);
    const endIso = parseToIso(endDate);

    const items = Array.isArray(computedMovements?.items) ? computedMovements.items : [];
    return items.filter((row) => {
      const rowIso = row.date ? String(row.date).slice(0, 10) : '';
      if (startIso && rowIso && rowIso < startIso) return false;
      if (endIso && rowIso && rowIso > endIso) return false;
      if (searchDoc) {
        const term = searchDoc.trim().toLowerCase();
        const matchesDoc = (row.doc_number || '').toLowerCase().includes(term);
        const matchesDesc = (row.description || '').toLowerCase().includes(term);
        if (!matchesDoc && !matchesDesc) return false;
      }
      if (txTypeFilter !== 'all') {
        if (row.category !== txTypeFilter) return false;
      }
      if (stageFilter !== 'all') {
        if (!row.stage || !row.stage.includes(stageFilter)) return false;
      }
      return true;
    });
  }, [computedMovements, startDate, endDate, searchDoc, txTypeFilter, stageFilter]);

  // Calculate the 4 summary cards dynamically based on active filters and party nature
  const cardSummary = useMemo(() => {
    return calculateStatementSummaryCards({
      party: vendor,
      openingBalance: summary.opening_balance,
      openingType: summary.opening_type,
      filteredRows,
      allMovements: computedMovements.items,
      txTypeFilter
    });
  }, [vendor, summary.opening_balance, summary.opening_type, filteredRows, computedMovements.items, txTypeFilter]);

  const handleExportExcel = () => {
    if (!vendor) return;
    const isCust = Boolean(vendor?.is_customer && !vendor?.is_supplier);
    const exportData = filteredRows.map((r, idx) => ({
      'م': idx + 1,
      'التاريخ': formatDate(r.date),
      'رقم المستند / أمر القص': r.doc_number,
      'المرحلة': r.stage,
      'البيان': r.description,
      [isCust ? 'المستحق (عليه)' : 'المستحق (له)']: r.debit,
      'المسدد (منه)': r.credit,
      'الرصيد التراكمي': r.running_balance
    }));
    exportToExcel(exportData, `كشف_حساب_${vendor.name || 'جهة_التعامل'}`);
    if (onNotify) onNotify('تم تصدير كشف الحساب إلى إكسيل بنجاح');
  };

  const handleOpenPrintPreview = () => {
    try {
      sessionStorage.setItem('print_preview_payload', JSON.stringify({
        type: 'statement',
        id: vendorId,
        party: vendor,
        statementData: {
          statement: filteredRows,
          movements: filteredRows,
          transactions: filteredRows,
          balance_due: cardSummary.finalBalance,
          remaining_balance: cardSummary.finalBalance,
          summary: {
            opening_balance: cardSummary.openingBalance,
            opening_balance_type: cardSummary.openingNature,
            period_invoices: cardSummary.periodInvoices,
            period_paid: cardSummary.periodPaid,
            balance_due: cardSummary.finalBalance
          }
        }
      }));
    } catch {}
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
            <span>تصدير إكسيل</span>
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
                      onClick={() => openWhatsAppChat(vendor.phone, `السلام عليكم ورحمة الله، مرفق كشف حسابكم طرفنا برصيد: ${formatCurrency(cardSummary.finalBalance)}.`)}
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

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
            {/* Card #1: Opening Balance */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-xs font-bold text-slate-500 block mb-1">رصيد أول المدة</span>
              <span className="text-lg font-bold font-mono text-slate-800 block">
                {formatCurrency(cardSummary.openingBalance)}
              </span>
              <span className="text-[11px] text-slate-500 font-semibold block mt-1">
                الطبيعة: {cardSummary.openingNatureText}
              </span>
            </div>

            {/* Card #2: Period Invoices & Services */}
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4">
              <span className="text-xs font-bold text-blue-700 block mb-1">إجمالي الفواتير والتوريدات</span>
              <span className="text-lg font-bold font-mono text-blue-900 block">
                {formatCurrency(cardSummary.periodInvoices)}
              </span>
              <span className="text-[11px] text-blue-600 block mt-1">الفواتير وتكلفة المراحل للفترة</span>
            </div>

            {/* Card #3: Total Paid / Settled */}
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
              <span className="text-xs font-bold text-emerald-700 block mb-1">إجمالي المسدد</span>
              <span className="text-lg font-bold font-mono text-emerald-900 block">
                {formatCurrency(cardSummary.periodPaid)}
              </span>
              <span className="text-[11px] text-emerald-600 block mt-1">سندات الصرف والدفعات المعتمدة</span>
            </div>

            {/* Card #4: Final Remaining Cumulative Balance */}
            <div className="bg-slate-900 text-white rounded-xl p-4">
              <span className="text-xs font-bold text-slate-300 block mb-1">الرصيد المتبقي الحالي</span>
              <span className={`text-xl font-bold font-mono block ${cardSummary.valueClass}`}>
                {formatCurrency(cardSummary.finalBalance)}
              </span>
              <span className={`text-[11px] block mt-1 font-medium ${cardSummary.subtitleClass}`}>
                {cardSummary.subtitle}
              </span>
            </div>
          </div>
        </div>

        {/* Filters Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
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

            {/* Transaction Type Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع الحركة المالية</label>
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-bold focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
              >
                <option value="all">كافة الحركات المالية</option>
                <option value="opening">رصيد أول المدة فقط</option>
                <option value="sales">فواتير المبيعات</option>
                <option value="purchases">فواتير المشتريات والتوريد</option>
                <option value="receipts">سندات التحصيل والقبض</option>
                <option value="payments">سندات الصرف والدفع</option>
                <option value="returns">المرتجعات (مبيعات ومشتريات)</option>
                <option value="manufacturing">مراحل تشغيل الإنتاج والقص</option>
                <option value="settlements">تسويات ومقاصات</option>
              </select>
            </div>

            {/* Stage filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">تصفية مرحلة التشغيل</label>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-bold focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
              >
                <option value="all">كافة المراحل والتوريدات</option>
                <option value="طباعة">طباعة</option>
                <option value="تطريز">تطريز</option>
                <option value="حياكة">حياكة</option>
                <option value="توريد">توريد خامات</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">من تاريخ (يوم/شهر/سنة)</label>
              <input
                type="text"
                title="dd/mm/yyyy"
                aria-label="من تاريخ يوم شهر سنة"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-mono text-center"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">إلى تاريخ (يوم/شهر/سنة)</label>
              <input
                type="text"
                title="dd/mm/yyyy"
                aria-label="إلى تاريخ يوم شهر سنة"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 font-mono text-center"
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
                  <th className="p-3 w-28 text-left font-mono">
                    {vendor?.is_customer && !vendor?.is_supplier ? 'المستحق (عليه)' : 'المستحق (له)'}
                  </th>
                  <th className="p-3 w-28 text-left font-mono">المسدد (منه)</th>
                  <th className="p-3 w-32 text-left font-mono">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Initial opening balance row */}
                {(txTypeFilter === 'all' || txTypeFilter === 'opening') && (
                  <tr className="bg-slate-50/80 font-bold text-slate-800">
                    <td className="p-3 text-center text-slate-400">-</td>
                    <td className="p-3 font-mono text-slate-500">رصيد أول المدة</td>
                    <td className="p-3 font-mono text-slate-400">---</td>
                    <td className="p-3 text-slate-500">افتتاحي</td>
                    <td className="p-3">
                      رصيد افتتاحي مسجل بدفتر الأستاذ ({cardSummary.openingNatureText})
                    </td>
                    <td className="p-3 text-left font-mono">
                      {vendor?.is_customer && !vendor?.is_supplier
                        ? (summary.opening_type === 'debit' ? formatCurrency(summary.opening_balance) : '-')
                        : (summary.opening_type === 'credit' ? formatCurrency(summary.opening_balance) : '-')}
                    </td>
                    <td className="p-3 text-left font-mono">
                      {vendor?.is_customer && !vendor?.is_supplier
                        ? (summary.opening_type === 'credit' ? formatCurrency(summary.opening_balance) : '-')
                        : (summary.opening_type === 'debit' ? formatCurrency(summary.opening_balance) : '-')}
                    </td>
                    <td className="p-3 text-left font-mono text-[#1F3A5F]">
                      {formatCurrency(cardSummary.signedOpening)}
                    </td>
                  </tr>
                )}

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
