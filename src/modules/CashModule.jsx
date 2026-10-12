import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  Download, 
  Building,
  CheckCircle2, 
  AlertTriangle,
  Receipt,
  Store,
  Clock,
  Layers,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { FieldError, validators } from '../utils/validation';

export default function CashModule({ onBack, onNotify }) {
  const [activeTab, setActiveTab] = useState('disbursements'); // 'disbursements' | 'treasuries' | 'transfer' | 'closing' | 'transactions'
  const [treasuries, setTreasuries] = useState([]);
  const [mainTreasury, setMainTreasury] = useState(null);
  const [expenseCodes, setExpenseCodes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailyClosings, setDailyClosings] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showDisburseModal, setShowDisburseModal] = useState(false);
  const [showOutletTransferModal, setShowOutletTransferModal] = useState(false);
  const [showClosingModal, setShowClosingModal] = useState(false);

  // Cash Disbursement Form (Requirement F)
  const [disburseForm, setDisburseForm] = useState({
    expense_code_id: '',
    expense_name: '',
    account_id: '',
    amount: '',
    tx_date: getTodayDateString(),
    payment_method: 'نقدية (كاش)',
    notes: ''
  });

  // Transfer from Outlet to Main Treasury (Requirement A5)
  const [outletTransferForm, setOutletTransferForm] = useState({
    outlet_id: '',
    amount: '',
    tx_date: getTodayDateString(),
    notes: 'توريد إيراد المنفذ إلى الخزينة الرئيسية المجمعة'
  });

  // Daily Shift Closing Form (Requirement A5)
  const [closingForm, setClosingForm] = useState({
    outlet_id: '',
    closing_date: getTodayDateString(),
    cashier_name: 'كاشير الوردية',
    opening_cash: '500',
    cash_sales: '0',
    cash_expenses: '0',
    actual_cash_counted: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [tRes, ecRes, txRes, dcRes, outRes] = await Promise.all([
        api.getTreasuries ? api.getTreasuries() : api.getAccounts(),
        api.getExpenseCodes ? api.getExpenseCodes() : Promise.resolve({ data: [] }),
        api.getTransactions(),
        api.getDailyClosings ? api.getDailyClosings() : Promise.resolve({ data: [] }),
        api.getOutlets()
      ]);

      const trData = tRes || {};
      const allAccs = Array.isArray(trData.treasuries)
        ? trData.treasuries
        : Array.isArray(trData.data)
          ? trData.data
          : Array.isArray(trData.accounts)
            ? trData.accounts
            : Array.isArray(trData)
              ? trData
              : [];

      const main = trData.mainTreasury || trData.main_treasury || (allAccs.length > 0 ? allAccs.find(a => a?.is_main) : null) || { name: 'الخزينة الرئيسية المجمعة', current_balance: 0 };
      const outletsList = Array.isArray(trData.outletTreasuries)
        ? trData.outletTreasuries
        : Array.isArray(trData.outlet_treasuries)
          ? trData.outlet_treasuries
          : allAccs.filter(a => !a?.is_main);

      setMainTreasury(main);
      setTreasuries(outletsList.length > 0 ? outletsList : allAccs);

      setExpenseCodes(Array.isArray(ecRes?.data) ? ecRes.data : Array.isArray(ecRes?.expense_codes) ? ecRes.expense_codes : []);
      setTransactions(Array.isArray(txRes?.data) ? txRes.data : Array.isArray(txRes?.transactions) ? txRes.transactions : []);
      setDailyClosings(Array.isArray(dcRes?.data) ? dcRes.data : Array.isArray(dcRes?.closings) ? dcRes.closings : []);
      setOutlets(Array.isArray(outRes?.data) ? outRes.data : Array.isArray(outRes?.outlets) ? outRes.outlets : []);

      // Default disburse treasury
      const validTreasuries = outletsList.length > 0 ? outletsList : allAccs;
      if (validTreasuries.length > 0 && !disburseForm.account_id) {
        setDisburseForm(prev => ({ ...prev, account_id: validTreasuries[0].id }));
      }
    } catch (err) {
      console.error('Failed to load cash data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // When picking an expense code, auto-fill default amount
  const handleExpenseCodeChange = (codeId) => {
    const code = expenseCodes.find(c => String(c.id) === String(codeId));
    if (code) {
      setDisburseForm(prev => ({
        ...prev,
        expense_code_id: code.id,
        expense_name: code.name,
        amount: code.default_amount ? String(code.default_amount) : prev.amount
      }));
    } else {
      setDisburseForm(prev => ({
        ...prev,
        expense_code_id: '',
        expense_name: '',
        amount: ''
      }));
    }
  };

  // Handle Cash Disbursement Save (Requirement F)
  const handleSaveDisbursement = async (e) => {
    e.preventDefault();
    if (!disburseForm.expense_code_id || !validators.positiveNumber(disburseForm.amount) || !disburseForm.account_id) {
      return;
    }
    try {
      const payload = {
        ...disburseForm,
        amount: parseFloat(disburseForm.amount)
      };
      const res = await api.disburseExpense(payload);
      onNotify(res.message || 'تم صرف النقدية وتسجيل سند الصرف بنجاح');
      setShowDisburseModal(false);
      setDisburseForm({
        expense_code_id: '',
        expense_name: '',
        account_id: treasuries[0]?.id || '',
        amount: '',
        tx_date: getTodayDateString(),
        payment_method: 'نقدية (كاش)',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Transfer Outlet -> Main (Requirement A5)
  const handleSaveOutletTransfer = async (e) => {
    e.preventDefault();
    if (!outletTransferForm.outlet_id || !validators.positiveNumber(outletTransferForm.amount)) {
      return;
    }
    try {
      const res = await api.transferOutletToMain(
        outletTransferForm.outlet_id,
        parseFloat(outletTransferForm.amount),
        outletTransferForm.notes
      );
      onNotify(res.message || 'تم توريد النقدية من المنفذ إلى الخزينة الرئيسية بنجاح');
      setShowOutletTransferModal(false);
      setOutletTransferForm({
        outlet_id: '',
        amount: '',
        tx_date: getTodayDateString(),
        notes: 'توريد إيراد المنفذ إلى الخزينة الرئيسية المجمعة'
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Handle Daily Shift Closing Save (Requirement A5)
  const handleSaveClosing = async (e) => {
    e.preventDefault();
    if (!closingForm.outlet_id || !validators.positiveNumber(closingForm.actual_cash_counted)) {
      return;
    }
    try {
      const payload = {
        ...closingForm,
        opening_cash: parseFloat(closingForm.opening_cash) || 0,
        cash_sales: parseFloat(closingForm.cash_sales) || 0,
        cash_expenses: parseFloat(closingForm.cash_expenses) || 0,
        actual_cash_counted: parseFloat(closingForm.actual_cash_counted) || 0
      };
      const res = await api.createDailyClosing(payload);
      onNotify(res.message || 'تم اعتماد تقفيل الوردية اليومية بنجاح');
      setShowClosingModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Aggregated total across all outlets + main treasury
  const safeTreasuries = Array.isArray(treasuries) ? treasuries : [];
  const allTreasuriesList = mainTreasury ? [mainTreasury, ...safeTreasuries] : safeTreasuries;
  const aggregatedCashTotal = allTreasuriesList.reduce((sum, t) => sum + (parseFloat(t?.current_balance) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">الخزينة وصرف النقدية ومنافذ البيع</h2>
            <span className="text-xs text-gray-500 font-medium">
              صرف النقدية بأكواد المصروفات، الخزينة المجمعة، توريد المنافذ، وتقفيل الوردية اليومي
            </span>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'disbursements', label: 'صرف النقدية (مصروفات)' },
            { id: 'treasuries', label: 'الخزائن والخزينة المجمعة' },
            { id: 'transfer', label: 'توريد المنفذ للخزينة الرئيسية' },
            { id: 'closing', label: 'تقفيل الوردية اليومي للمنافذ' },
            { id: 'transactions', label: 'سجل حركات النقدية' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-md font-bold text-xs cursor-pointer ${
                activeTab === t.id
                  ? 'bg-[#1F3A5F] text-white shadow-sm'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aggregated Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">الخزينة الرئيسية المجمعة (المركزية)</span>
          <div className="text-2xl font-bold text-[#1F3A5F] mt-1 font-mono">
            {formatCurrency(mainTreasury?.current_balance || 0)}
          </div>
          <span className="text-xs text-gray-400 font-medium">تجمع وتستقبل إيرادات كافة المنافذ</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">إجمالي النقدية بمنافذ البيع ({safeTreasuries.length} خزينة منفذ)</span>
          <div className="text-2xl font-bold text-green-700 mt-1 font-mono">
            {formatCurrency(safeTreasuries.reduce((s, t) => s + (t?.current_balance || 0), 0))}
          </div>
          <span className="text-xs text-gray-400 font-medium">سيولة نقدية في أدراج الكاشير بالمعارض</span>
        </div>
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">إجمالي السيولة النقدية الكلية</span>
          <div className="text-2xl font-bold text-gray-900 mt-1 font-mono">
            {formatCurrency(aggregatedCashTotal)}
          </div>
          <span className="text-xs text-gray-400 font-medium">الرصيد الفعلي المتاح بالشركة</span>
        </div>
      </div>

      {/* TAB 1: CASH DISBURSEMENTS (Requirement F) */}
      {activeTab === 'disbursements' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">سندات صرف النقدية (مصروفات تشغيلية)</h3>
              <p className="text-xs text-gray-500 font-medium">اختيار كود المصروف، إدراج المبلغ الافتراضي وتعديله، واختيار الخزينة المنصرف منها</p>
            </div>
            <button
              onClick={() => setShowDisburseModal(true)}
              className="h-10 px-4 bg-red-600 hover:bg-red-700 text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ صرف نقدية جديد (إذن صرف)</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">رقم السند</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">كود / بند المصروف</th>
                    <th className="py-3 px-4">الخزينة المنصرف منها</th>
                    <th className="py-3 px-4 text-left">المبلغ المنصرف</th>
                    <th className="py-3 px-4 text-left">الرصيد المتبقي</th>
                    <th className="py-3 px-4">البيان والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.filter(t => t.tx_type === 'outflow').length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد سندات صرف مسجلة حتى الآن.
                      </td>
                    </tr>
                  ) : (
                    transactions.filter(t => t.tx_type === 'outflow').map(t => (
                      <tr key={t.id} className="hover:bg-red-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{t.tx_number || `TX-${t.id}`}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{formatDate(t.created_at || t.tx_date)}</td>
                        <td className="py-3 px-4 font-bold text-red-700">{t.category || t.expense_name || 'مصروف تشغيل'}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-gray-700">{t.account_name}</td>
                        <td className="py-3 px-4 text-left font-mono font-black text-red-600">
                          -{formatCurrency(t.amount)}
                        </td>
                        <td className="py-3 px-4 text-left font-mono text-xs text-gray-600">{formatCurrency(t.balance_after || 0)}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{t.description || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TREASURIES SCREEN (Requirement A5) */}
      {activeTab === 'treasuries' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">هيكل الخزائن: خزينة لكل منفذ بيع + الخزينة المركزية المجمعة</h3>
              <p className="text-xs text-gray-500 font-medium">الخزينة الرئيسية تجمع وتراقب حركة كافة خزائن المعارض والفروع</p>
            </div>
            <button
              onClick={() => setShowOutletTransferModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>تحويل من منفذ للخزينة الرئيسية</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Main Treasury Card */}
            {mainTreasury && (
              <div className="bg-gradient-to-br from-[#1F3A5F] to-[#12243d] text-white rounded-md p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-amber-400" />
                    <span className="font-bold text-base">{mainTreasury.name}</span>
                  </div>
                  <span className="bg-amber-400 text-slate-900 text-xs px-2.5 py-0.5 rounded font-black">
                    الخزينة المجمعة المركزية
                  </span>
                </div>
                <div className="text-3xl font-black font-mono tracking-tight text-emerald-400">
                  {formatCurrency(mainTreasury.current_balance || 0)}
                </div>
                <div className="text-xs text-gray-300 pt-2 border-t border-white/10 flex justify-between">
                  <span>تستقبل توريدات نهاية اليوم من كافة المعارض</span>
                  <span className="font-semibold text-white">حساب رقم #1</span>
                </div>
              </div>
            )}

            {/* Outlet Treasuries */}
            {treasuries.map(t => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-md p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-blue-800" />
                    <span className="font-bold text-gray-900 text-sm">{t.name}</span>
                  </div>
                  <span className="bg-blue-50 text-blue-900 text-xs px-2 py-0.5 rounded font-semibold">
                    خزينة منفذ بيع
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono text-gray-900">
                  {formatCurrency(t.current_balance || 0)}
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-100">
                  <span>الفرع / المنفذ: {t.outlet_name || 'معرض الملابس'}</span>
                  <button
                    onClick={() => {
                      setOutletTransferForm(prev => ({ ...prev, outlet_id: t.outlet_id || t.id }));
                      setShowOutletTransferModal(true);
                    }}
                    className="text-[#1F3A5F] font-bold hover:underline cursor-pointer"
                  >
                    توريد للرئيسية
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TRANSFER OUTLET -> MAIN (Requirement A5) */}
      {activeTab === 'transfer' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">توريد نقدية من منافذ البيع إلى الخزينة الرئيسية</h3>
              <p className="text-xs text-gray-500 font-medium">ترحيل متحصلات المبيعات اليومية من خزينة الفرع إلى الخزينة المركزية المجمعة</p>
            </div>
            <button
              onClick={() => setShowOutletTransferModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ إذن توريد جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-right border-collapse text-sm">
              <thead className="bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <th className="py-3 px-4">رقم التحويل</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">منفذ البيع (المصدر)</th>
                  <th className="py-3 px-4">إلى الخزينة (الوجهة)</th>
                  <th className="py-3 px-4 text-left">المبلغ المحول</th>
                  <th className="py-3 px-4">البيان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.filter(t => t.category === 'تحويل من منفذ للخزينة الرئيسية' || t.tx_type === 'transfer').length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500 font-medium">
                      لا توجد حركات توريد مسجلة.
                    </td>
                  </tr>
                ) : (
                  transactions.filter(t => t.category === 'تحويل من منفذ للخزينة الرئيسية' || t.tx_type === 'transfer').map(t => (
                    <tr key={t.id} className="hover:bg-blue-50/20">
                      <td className="py-3 px-4 font-mono font-bold text-gray-900">{t.tx_number || `TR-${t.id}`}</td>
                      <td className="py-3 px-4 text-xs text-gray-600">{formatDate(t.created_at || t.tx_date)}</td>
                      <td className="py-3 px-4 font-semibold text-gray-800">{t.from_account_name || 'منفذ البيع'}</td>
                      <td className="py-3 px-4 font-bold text-[#1F3A5F]">{mainTreasury?.name || 'الخزينة الرئيسية'}</td>
                      <td className="py-3 px-4 text-left font-mono font-bold text-green-700">{formatCurrency(t.amount)}</td>
                      <td className="py-3 px-4 text-xs text-gray-600">{t.description || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: DAILY CLOSING (Requirement A5: Daily closing per outlet) */}
      {activeTab === 'closing' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900">تقفيل الوردية اليومي لمنافذ البيع</h3>
              <p className="text-xs text-gray-500 font-medium">مطابقة الرصيد الدفتري مع النقدية الفعلية بالدرج وتوثيق العجز أو الزيادة</p>
            </div>
            <button
              onClick={() => setShowClosingModal(true)}
              className="h-10 px-4 bg-[#1F3A5F] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>+ تقفيل وردية جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <table className="w-full text-right border-collapse text-sm">
              <thead className="bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <th className="py-3 px-4">رقم التقفيل</th>
                  <th className="py-3 px-4">التاريخ</th>
                  <th className="py-3 px-4">منفذ البيع</th>
                  <th className="py-3 px-4">اسم الكاشير</th>
                  <th className="py-3 px-4 text-center">عهدة البداية</th>
                  <th className="py-3 px-4 text-center">مبيعات نقدية</th>
                  <th className="py-3 px-4 text-center">مصروفات</th>
                  <th className="py-3 px-4 text-left">المعدود بالدرج</th>
                  <th className="py-3 px-4 text-center">الفارق (عجز/زيادة)</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dailyClosings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-gray-500 font-medium">
                      لا توجد تقفيلات وردية مسجلة.
                    </td>
                  </tr>
                ) : (
                  dailyClosings.map(dc => {
                    const variance = parseFloat(dc.variance) || 0;
                    return (
                      <tr key={dc.id} className="hover:bg-blue-50/20">
                        <td className="py-3 px-4 font-mono font-bold text-gray-900">{dc.closing_number || `CLS-${dc.id}`}</td>
                        <td className="py-3 px-4 text-xs text-gray-600">{formatDate(dc.closing_date)}</td>
                        <td className="py-3 px-4 font-bold text-gray-800">{dc.outlet_name}</td>
                        <td className="py-3 px-4 text-xs text-gray-700">{dc.cashier_name}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs">{formatCurrency(dc.opening_cash)}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-green-700">+{formatCurrency(dc.cash_sales)}</td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-red-600">-{formatCurrency(dc.cash_expenses)}</td>
                        <td className="py-3 px-4 text-left font-mono font-bold text-blue-900">{formatCurrency(dc.actual_cash_counted)}</td>
                        <td className="py-3 px-4 text-center font-mono font-bold">
                          {variance === 0 ? (
                            <span className="text-green-700 text-xs">مطابق</span>
                          ) : variance > 0 ? (
                            <span className="text-blue-700 text-xs">+{formatCurrency(variance)} (زيادة)</span>
                          ) : (
                            <span className="text-red-600 text-xs">{formatCurrency(variance)} (عجز!)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="erp-badge-green text-xs">معتمد</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: ALL TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <table className="w-full text-right border-collapse text-sm">
            <thead className="bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700">
              <tr>
                <th className="py-3 px-4">رقم الحركة</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">الحساب / الخزينة</th>
                <th className="py-3 px-4">النوع</th>
                <th className="py-3 px-4 text-left">المبلغ</th>
                <th className="py-3 px-4 text-left">الرصيد بعدها</th>
                <th className="py-3 px-4">البيان</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-blue-50/20">
                  <td className="py-3 px-4 font-mono font-bold text-gray-900">{t.tx_number || `TX-${t.id}`}</td>
                  <td className="py-3 px-4 text-xs text-gray-600">{formatDate(t.created_at || t.tx_date)}</td>
                  <td className="py-3 px-4 text-xs font-semibold text-gray-800">{t.account_name}</td>
                  <td className="py-3 px-4 text-xs">
                    {t.tx_type === 'inflow' ? (
                      <span className="erp-badge-green">قبض وارد</span>
                    ) : (
                      <span className="erp-badge-red">صرف صادر</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-left font-mono font-bold">
                    <span className={t.tx_type === 'inflow' ? 'text-green-700' : 'text-red-600'}>
                      {t.tx_type === 'inflow' ? `+${formatCurrency(t.amount)}` : `-${formatCurrency(t.amount)}`}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-left font-mono text-xs text-gray-700">{formatCurrency(t.balance_after || 0)}</td>
                  <td className="py-3 px-4 text-xs text-gray-600">{t.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: CASH DISBURSEMENT (Requirement F) */}
      {showDisburseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">صرف نقدية (إذن صرف مصروفات)</h3>
              <button onClick={() => setShowDisburseModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              اختر كود المصروف وسيتم تحميل المبلغ الافتراضي تلقائياً مع إمكانية تعديله وخصمه من الخزينة.
            </p>

            <form onSubmit={handleSaveDisbursement} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">كود المصروف *</label>
                <select
                  required
                  value={disburseForm.expense_code_id}
                  onChange={e => handleExpenseCodeChange(e.target.value)}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر كود المصروف من القائمة...</option>
                  {expenseCodes.map(ec => (
                    <option key={ec.id} value={ec.id}>
                      {ec.code || ec.id} - {ec.name} (الافتراضي: {formatCurrency(ec.default_amount || 0)})
                    </option>
                  ))}
                </select>
                {!disburseForm.expense_code_id && <FieldError error="يرجى اختيار كود المصروف" />}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">المبلغ المراد صرفه (جنيه) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={disburseForm.amount}
                  onChange={e => setDisburseForm({ ...disburseForm, amount: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 font-bold text-red-600 text-sm focus:border-[#1F3A5F] focus:outline-none"
                />
                {!validators.positiveNumber(disburseForm.amount) && <FieldError error="أدخل مبلغاً أكبر من الصفر" />}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">الصرف من خزينة *</label>
                  <select
                    required
                    value={disburseForm.account_id}
                    onChange={e => setDisburseForm({ ...disburseForm, account_id: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                  >
                    {allTreasuriesList.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} (المتاح: {formatCurrency(t.current_balance || 0)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">تاريخ الصرف *</label>
                  <input
                    type="date"
                    required
                    value={disburseForm.tx_date}
                    onChange={e => setDisburseForm({ ...disburseForm, tx_date: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات وبيان الصرف</label>
                <input
                  type="text"
                  value={disburseForm.notes}
                  onChange={e => setDisburseForm({ ...disburseForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowDisburseModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!disburseForm.expense_code_id || !validators.positiveNumber(disburseForm.amount)}
                  className="h-10 px-5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded font-bold shadow-sm"
                >
                  صرف المبلغ وخصم الخزينة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OUTLET -> MAIN TRANSFER (Requirement A5) */}
      {showOutletTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">توريد نقدية من منفذ بيع إلى الخزينة الرئيسية</h3>
              <button onClick={() => setShowOutletTransferModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOutletTransfer} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">المنفذ المحول منه (الخزينة المصدر) *</label>
                <select
                  required
                  value={outletTransferForm.outlet_id}
                  onChange={e => setOutletTransferForm({ ...outletTransferForm, outlet_id: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                >
                  <option value="">اختر المنفذ...</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">الخزينة المستلمة (الوجهة)</label>
                <input
                  type="text"
                  disabled
                  value={mainTreasury?.name || 'الخزينة الرئيسية المجمعة'}
                  className="w-full h-10 rounded border border-gray-300 px-3 bg-gray-50 text-gray-700 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">المبلغ المحول (جنيه) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={outletTransferForm.amount}
                  onChange={e => setOutletTransferForm({ ...outletTransferForm, amount: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 font-bold text-green-700 text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">بيان السند</label>
                <input
                  type="text"
                  value={outletTransferForm.notes}
                  onChange={e => setOutletTransferForm({ ...outletTransferForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowOutletTransferModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  تأكيد التوريد للخزينة الرئيسية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DAILY CLOSING (Requirement A5) */}
      {showClosingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">تقفيل وردية يومي لمنفذ بيع</h3>
              <button onClick={() => setShowClosingModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClosing} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">منفذ البيع *</label>
                  <select
                    required
                    value={closingForm.outlet_id}
                    onChange={e => setClosingForm({ ...closingForm, outlet_id: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-2 text-xs"
                  >
                    <option value="">اختر المنفذ...</option>
                    {outlets.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">تاريخ الوردية *</label>
                  <input
                    type="date"
                    required
                    value={closingForm.closing_date}
                    onChange={e => setClosingForm({ ...closingForm, closing_date: e.target.value })}
                    className="w-full h-10 rounded border border-gray-300 px-3 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">اسم الكاشير المستلم للوردية</label>
                <input
                  type="text"
                  value={closingForm.cashier_name}
                  onChange={e => setClosingForm({ ...closingForm, cashier_name: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">عهدة بداية الدرج</label>
                  <input
                    type="number"
                    min="0"
                    value={closingForm.opening_cash}
                    onChange={e => setClosingForm({ ...closingForm, opening_cash: e.target.value })}
                    className="w-full h-9 rounded border border-gray-300 px-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">مبيعات نقدية</label>
                  <input
                    type="number"
                    min="0"
                    value={closingForm.cash_sales}
                    onChange={e => setClosingForm({ ...closingForm, cash_sales: e.target.value })}
                    className="w-full h-9 rounded border border-gray-300 px-2 font-mono text-green-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">مصروفات درج</label>
                  <input
                    type="number"
                    min="0"
                    value={closingForm.cash_expenses}
                    onChange={e => setClosingForm({ ...closingForm, cash_expenses: e.target.value })}
                    className="w-full h-9 rounded border border-gray-300 px-2 font-mono text-red-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">النقدية الفعلية بعد الجرد والعدّ (جنيه) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={closingForm.actual_cash_counted}
                  onChange={e => setClosingForm({ ...closingForm, actual_cash_counted: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3 font-mono font-bold text-sm text-blue-900"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ملاحظات التقفيل</label>
                <input
                  type="text"
                  value={closingForm.notes}
                  onChange={e => setClosingForm({ ...closingForm, notes: e.target.value })}
                  className="w-full h-10 rounded border border-gray-300 px-3"
                />
                <p className="text-xs text-gray-500 mt-1">أسباب العجز أو الزيادة إن وجدت</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowClosingModal(false)}
                  className="h-10 px-4 rounded border border-gray-300 bg-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-10 px-5 bg-[#1F3A5F] text-white rounded font-bold"
                >
                  اعتماد تقفيل الوردية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
