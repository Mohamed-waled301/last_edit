import React, { useState, useEffect } from 'react';
import { Search, Download, Tag, CreditCard, Plus, Building2, Users, Printer, RotateCcw } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function DisbursementsListPage({ onNotify }) {
  const [activeTab, setActiveTab] = useState('all'); // all, expenses, supplier_payments, customer_receipts
  const [expenseTxs, setExpenseTxs] = useState([]);
  const [supplierPayments, setSupplierPayments] = useState([]);
  const [customerReceipts, setCustomerReceipts] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [txRes, supPayRes, custRecRes, codesRes] = await Promise.all([
        api.getTransactions(),
        api.getSupplierPayments(),
        api.getCustomerReceipts(),
        api.getExpenseCodes()
      ]);

      const txList = Array.isArray(txRes.data) ? txRes.data : (Array.isArray(txRes.transactions) ? txRes.transactions : []);
      // Filter real operating expenses ONLY (أذون صرف المصروفات التشغيلية الحقيقية فقط)
      const realExpenses = txList.filter(t => 
        (t.category === 'operating_expense' || t.reference_type === 'EXPENSE_DISBURSEMENT') &&
        t.category !== 'supplier_payment' &&
        t.reference_type !== 'SUPPLIER_PAYMENT' &&
        t.category !== 'customer_payment' &&
        t.reference_type !== 'CUSTOMER_RECEIPT' &&
        t.category !== 'purchase_orders' &&
        t.category !== 'sales_invoices'
      );
      setExpenseTxs(realExpenses);

      const sPays = Array.isArray(supPayRes.data) ? supPayRes.data : (supPayRes.payments || []);
      setSupplierPayments(sPays);

      const cRecs = Array.isArray(custRecRes.data) ? custRecRes.data : (custRecRes.receipts || []);
      setCustomerReceipts(cRecs);

      setExpenseCodes(Array.isArray(codesRes.data) ? codesRes.data : []);
    } catch (err) {
      console.error('Failed to load cash transactions data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Standardize records for unified list
  const unifiedRecords = [
    ...expenseTxs.map(t => ({
      id: t.id,
      docType: 'expense',
      typeLabel: 'سند صرف مصروفات',
      docNumber: t.tx_number,
      partyOrDesc: t.description || 'مصروفات تشغيلية',
      partyCode: '',
      accountName: t.account_name,
      amount: Number(t.amount) || 0,
      direction: 'outflow',
      status: 'active',
      date: t.created_at || t.date,
      notes: t.description || '',
      canCancel: false,
      canPrint: false
    })),
    ...supplierPayments.map(p => ({
      id: p.id,
      docType: 'supplier_payment',
      typeLabel: 'سداد دفعة مورد',
      docNumber: p.payment_number,
      partyOrDesc: p.supplier_name || 'مورد',
      partyCode: p.supplier_code ? `[${p.supplier_code}]` : '',
      accountName: p.account_name,
      amount: Number(p.amount) || 0,
      direction: 'outflow',
      status: p.status || 'issued',
      statusLabel: p.status === 'cancelled' ? 'ملغي' : 'معتمد',
      cancellationReason: p.cancellation_reason || '',
      date: p.payment_date || p.created_at,
      notes: p.notes || '',
      canCancel: p.status !== 'cancelled',
      canPrint: true,
      printUrl: `#/disbursements/print-payment/${p.id}`
    })),
    ...customerReceipts.map(r => ({
      id: r.id,
      docType: 'customer_receipt',
      typeLabel: 'استلام نقدية عميل',
      docNumber: r.receipt_number,
      partyOrDesc: r.customer_name || 'عميل',
      partyCode: r.customer_code ? `[${r.customer_code}]` : '',
      accountName: r.account_name,
      amount: Number(r.amount) || 0,
      direction: 'inflow',
      status: r.status || 'issued',
      statusLabel: r.status === 'cancelled' ? 'ملغي' : 'معتمد',
      cancellationReason: r.cancellation_reason || '',
      date: r.payment_date || r.created_at,
      notes: r.notes || '',
      canCancel: r.status !== 'cancelled',
      canPrint: true,
      printUrl: `#/disbursements/print-receipt/${r.id}`
    }))
  ];

  // Sort by date descending
  unifiedRecords.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Filter by Tab
  const tabFiltered = unifiedRecords.filter(r => {
    if (activeTab === 'all') return true;
    if (activeTab === 'expenses') return r.docType === 'expense';
    if (activeTab === 'supplier_payments') return r.docType === 'supplier_payment';
    if (activeTab === 'customer_receipts') return r.docType === 'customer_receipt';
    return true;
  });

  // Filter by Search
  const filtered = tabFiltered.filter(r => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      (r.docNumber || '').toLowerCase().includes(q) ||
      (r.partyOrDesc || '').toLowerCase().includes(q) ||
      (r.partyCode || '').toLowerCase().includes(q) ||
      (r.accountName || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q)
    );
  });

  // Financial Summaries
  let totalDisbursed = 0;
  let totalReceived = 0;
  filtered.forEach(r => {
    if (r.status === 'cancelled') return;
    if (r.direction === 'outflow') totalDisbursed += r.amount;
    else if (r.direction === 'inflow') totalReceived += r.amount;
  });
  const netFlow = totalReceived - totalDisbursed;

  // Handle Cancellation via Reversing Entry (Requirement 2.3)
  const handleCancelVoucher = async (record) => {
    const promptMsg = record.docType === 'supplier_payment'
      ? `هل أنت متأكد من إلغاء سند صرف المورد (${record.docNumber})؟\nسيتم قيد حركة عكسية فوراً بالخزينة وإعادة المبلغ إلى حساب المورد. اكتب سبب الإلغاء:`
      : `هل أنت متأكد من إلغاء سند استلام نقدية العميل (${record.docNumber})؟\nسيتم قيد حركة عكسية فوراً بالخزينة وإعادة المبلغ لمديونية العميل. اكتب سبب الإلغاء:`;

    const reason = window.prompt(promptMsg, 'إلغاء بناء على طلب الإدارة');
    if (reason === null) return; // user cancelled prompt

    try {
      setCancellingId(record.id);
      if (record.docType === 'supplier_payment') {
        await api.cancelSupplierPayment(record.id, reason);
        if (onNotify) onNotify(`تم إلغاء سند صرف المورد (${record.docNumber}) وقيد المعاملة العكسية بنجاح`);
      } else if (record.docType === 'customer_receipt') {
        await api.cancelCustomerReceipt(record.id, reason);
        if (onNotify) onNotify(`تم إلغاء سند استلام نقدية العميل (${record.docNumber}) وقيد المعاملة العكسية بنجاح`);
      }
      await loadData();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إلغاء السند');
    } finally {
      setCancellingId(null);
    }
  };

  const handleExport = () => {
    const exportData = filtered.map(r => ({
      'رقم السند': r.docNumber,
      'نوع السند': r.typeLabel,
      'الطرف / البيان': `${r.partyCode} ${r.partyOrDesc}`.trim(),
      'الخزينة': r.accountName,
      'المبلغ (ج.م)': r.direction === 'inflow' ? r.amount : -r.amount,
      'الحالة': r.status === 'cancelled' ? `ملغي (${r.cancellationReason || 'بدون سبب'})` : 'معتمد',
      'التاريخ': formatDate(r.date),
      'الملاحظات': r.notes
    }));
    exportToExcel(exportData, 'سجل_حركات_النقدية_والمصروفات_والمقبوضات');
    if (onNotify) onNotify('تم تصدير سجل حركات النقدية إلى ملف إكسيل بنجاح');
  };

  return (
    <PageContainer
      title="صرف النقدية والمقبوضات والمصروفات"
      subtitle="سجل صرف المصروفات ومدفوعات الموردين واستلام نقدية العملاء والربط مع الخزائن"
      breadcrumbs={[{ label: 'صرف النقدية' }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/payment-methods'; }}
            className="px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <CreditCard className="w-4 h-4 text-gray-500" />
            <span>طرق الدفع</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/expense-codes'; }}
            className="px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Tag className="w-4 h-4 text-gray-500" />
            <span>أكواد المصروفات ({expenseCodes.length})</span>
          </button>

          {/* Customer Receipt Button (Requirement 2.2) */}
          <button
            type="button"
            onClick={() => { window.location.hash = '#/disbursements/customer-receipt'; }}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>استلام نقدية</span>
          </button>

          {/* Supplier Payment Button (Requirement 2.1) */}
          <button
            type="button"
            onClick={() => { window.location.hash = '#/disbursements/supplier-payment'; }}
            className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Building2 className="w-4 h-4" />
            <span>مدفوعات مورد</span>
          </button>

          {/* Regular Expense Disbursement */}
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
      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 pt-3 rounded-t-lg gap-4 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`pb-3 px-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'border-[#1F3A5F] text-[#1F3A5F]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          الكل ({unifiedRecords.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('supplier_payments')}
          className={`pb-3 px-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'supplier_payments'
              ? 'border-blue-700 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          مدفوعات الموردين ({supplierPayments.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('customer_receipts')}
          className={`pb-3 px-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'customer_receipts'
              ? 'border-emerald-700 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          استلام نقدية العملاء ({customerReceipts.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`pb-3 px-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'expenses'
              ? 'border-amber-700 text-amber-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          سندات المصروفات ({expenseTxs.length})
        </button>
      </div>

      {/* Search Bar & Summary Cards */}
      <div className="bg-white border-x border-b border-gray-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            aria-label="البحث برقم السند أو اسم الطرف أو الخزينة أو البيان"
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>

        <div className="flex items-center gap-6 text-left font-mono">
          <div>
            <span className="text-[11px] text-gray-500 font-bold block">إجمالي المنصرف:</span>
            <span className="text-base font-bold text-rose-700">-{formatCurrency(totalDisbursed)}</span>
          </div>

          <div>
            <span className="text-[11px] text-gray-500 font-bold block">إجمالي المقبوض:</span>
            <span className="text-base font-bold text-emerald-700">+{formatCurrency(totalReceived)}</span>
          </div>

          <div className="border-r border-gray-200 pr-4">
            <span className="text-[11px] text-gray-500 font-bold block">صافي الحركة:</span>
            <span className={`text-base font-bold ${netFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatCurrency(netFlow)}
            </span>
          </div>
        </div>
      </div>

      {/* Unified Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
              <tr>
                <th className="p-3">رقم السند</th>
                <th className="p-3">نوع الحركة</th>
                <th className="p-3">الطرف / البيان</th>
                <th className="p-3">الخزينة</th>
                <th className="p-3 text-left font-mono min-w-[130px] whitespace-nowrap">المبلغ</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-10 text-center text-gray-500 font-bold">
                    جاري تحميل حركات وسندات النقدية...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-10 text-center text-gray-400">
                    لا توجد حركات نقدية مطابقة
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => (
                  <tr key={r.id || idx} className={`hover:bg-gray-50 ${r.status === 'cancelled' ? 'bg-red-50/40 opacity-75' : ''}`}>
                    <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                      {r.docNumber}
                    </td>

                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        r.docType === 'supplier_payment'
                          ? 'bg-blue-100 text-blue-800'
                          : r.docType === 'customer_receipt'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {r.typeLabel}
                      </span>
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-gray-900">
                        {r.partyCode && <span className="font-mono text-gray-500 ml-1.5">{r.partyCode}</span>}
                        <span>{r.partyOrDesc}</span>
                      </div>
                      {r.notes && r.notes !== r.partyOrDesc && (
                        <div className="text-[11px] text-gray-500 mt-0.5">{r.notes}</div>
                      )}
                      {r.cancellationReason && (
                        <div className="text-[11px] text-red-600 font-bold mt-0.5">
                          سبب الإلغاء: {r.cancellationReason}
                        </div>
                      )}
                    </td>

                    <td className="p-3 font-semibold text-gray-800">
                      {r.accountName}
                    </td>

                    <td className="p-3 text-left font-mono font-bold whitespace-nowrap min-w-[130px]">
                      {r.direction === 'inflow' ? (
                        <span className="text-emerald-700">+{formatCurrency(r.amount)}</span>
                      ) : (
                        <span className="text-rose-700">-{formatCurrency(r.amount)}</span>
                      )}
                    </td>

                    <td className="p-3">
                      {r.status === 'cancelled' ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-bold text-[11px]">
                          ملغي
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded font-bold text-[11px]">
                          معتمد
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-gray-600 font-mono">
                      {formatDate(r.date)}
                    </td>

                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {r.canPrint && (
                          <button
                            type="button"
                            onClick={() => { window.location.hash = r.printUrl; }}
                            className="p-1 text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded cursor-pointer"
                            title="طباعة السند"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        )}

                        {r.canCancel && (
                          <button
                            type="button"
                            disabled={cancellingId === r.id}
                            onClick={() => handleCancelVoucher(r)}
                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-bold border border-red-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            title="إلغاء السند وعكس القيد بالخزينة والحساب"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>إلغاء</span>
                          </button>
                        )}
                      </div>
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
