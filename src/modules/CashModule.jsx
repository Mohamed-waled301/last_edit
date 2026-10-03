import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  Download, 
  Building,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber, formatDate, getTodayDateString, isPastDate } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function CashModule({ onBack, onNotify }) {
  const [accountData, setAccountData] = useState({ accounts: [], totalCash: 0, totalBank: 0, grandTotal: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Form State
  const [newAccount, setNewAccount] = useState({
    name: '',
    account_type: 'treasury',
    initial_balance: '',
    bank_account_number: '',
    bank_name: ''
  });

  const [txForm, setTxForm] = useState({
    account_id: '',
    tx_type: 'inflow', // 'inflow' | 'outflow'
    category: 'other',
    amount: '',
    description: '',
    tx_date: getTodayDateString()
  });

  const [transferForm, setTransferForm] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [accRes, txRes] = await Promise.all([
        api.getAccounts(),
        api.getTransactions()
      ]);
      setAccountData(accRes.data || { accounts: [], totalCash: 0, totalBank: 0, grandTotal: 0 });
      setTransactions(txRes.data || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createAccount(newAccount);
      onNotify(res.message);
      setShowAddAccountModal(false);
      setNewAccount({ name: '', account_type: 'treasury', initial_balance: '', bank_account_number: '', bank_name: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveTx = async (e) => {
    e.preventDefault();
    if (txForm.tx_date && isPastDate(txForm.tx_date)) {
      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
      return;
    }
    try {
      const res = await api.recordCashTransaction(txForm);
      onNotify(res.message);
      setShowTxModal(false);
      setTxForm({ account_id: '', tx_type: 'inflow', category: 'other', amount: '', description: '', tx_date: getTodayDateString() });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.transferCash(transferForm);
      onNotify(res.message);
      setShowTransferModal(false);
      setTransferForm({ from_account_id: '', to_account_id: '', amount: '', notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">الخزينة والأرصدة النقدية</h2>
            <span className="text-xs text-gray-500 font-medium">حسابات الخزائن، البنوك، أذون القبض والصرف، والتحويلات</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['رقم الإذن', 'التاريخ', 'الحساب', 'نوع الحركة', 'المبلغ', 'الرصيد بعد الحركة', 'البيان'];
              const rows = transactions.map(t => [
                t.tx_number, t.created_at, t.account_name, t.tx_type === 'inflow' ? 'وارد قبض' : 'صادر صرف', t.amount, t.balance_after, t.description
              ]);
              exportToExcel('حركة_الخزنة_والنقدية', headers, rows);
            }}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={() => setShowTransferModal(true)}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4 text-gray-600" />
            <span>تحويل بين الخزائن</span>
          </button>
          <button
            onClick={() => setShowTxModal(true)}
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ إذن قبض أو صرف</span>
          </button>
        </div>
      </div>

      {/* Live Balances Summary Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">إجمالي النقدية بالخزائن</span>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(accountData.totalCash)}
          </div>
          <span className="text-xs text-gray-400 font-medium">الخزينة النقدية ومنافذ التوزيع</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">إجمالي الأرصدة البنكية</span>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(accountData.totalBank)}
          </div>
          <span className="text-xs text-gray-400 font-medium">الحسابات والتحويلات الرسمية</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-md p-4">
          <span className="text-xs font-semibold text-gray-500">إجمالي السيولة المتاحة</span>
          <div className="text-2xl font-bold text-green-700 mt-1">
            {formatCurrency(accountData.grandTotal)}
          </div>
          <span className="text-xs text-gray-400 font-medium">رصيد حي لحظي</span>
        </div>
      </div>

      {/* Accounts List Bar */}
      <div className="bg-white border border-gray-200 rounded-md p-4">
        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
          <h3 className="text-base font-bold text-gray-900">تفاصيل الخزائن والحسابات</h3>
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer"
          >
            + إضافة خزنة أو حساب بنكي
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {accountData.accounts.map(acc => (
            <div key={acc.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 flex justify-between items-center">
              <div>
                <span className="text-sm font-bold text-gray-900 block">{acc.name}</span>
                <span className="text-xs text-gray-500">
                  {acc.account_type === 'treasury' ? 'خزنة نقدية' : `بنكي (${acc.bank_name || ''})`}
                </span>
              </div>
              <div className="text-left font-bold text-base text-gray-900">
                {formatCurrency(acc.current_balance)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cash Transactions Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-900">سجل حركة المقبوضات والمصروفات</h3>
          <span className="text-xs text-gray-500 font-medium">آخر 200 حركة نقدية وبنكية</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <th className="py-3 px-4">رقم الإذن</th>
                <th className="py-3 px-4">التاريخ</th>
                <th className="py-3 px-4">الخزنة / البنك</th>
                <th className="py-3 px-4 text-center">نوع الحركة</th>
                <th className="py-3 px-4 text-left">المبلغ</th>
                <th className="py-3 px-4 text-left">الرصيد بعد الحركة</th>
                <th className="py-3 px-4">البيان والشرح</th>
                <th className="py-3 px-4">المسؤول</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    لا توجد حركات نقدية مسجلة.
                  </td>
                </tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-700">{t.tx_number}</td>
                    <td className="py-3 px-4 text-gray-600 text-xs">{formatDate(t.created_at)}</td>
                    <td className="py-3 px-4 text-gray-800 font-medium">{t.account_name}</td>
                    <td className="py-3 px-4 text-center">
                      {t.tx_type === 'inflow' ? (
                        <span className="erp-badge-green text-xs">وارد / قبض (+)</span>
                      ) : (
                        <span className="erp-badge-red text-xs">صادر / صرف (-)</span>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-left font-bold ${t.tx_type === 'inflow' ? 'text-green-700' : 'text-red-600'}`}>
                      {t.tx_type === 'inflow' ? `+${formatCurrency(t.amount)}` : `-${formatCurrency(t.amount)}`}
                    </td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-900">{formatCurrency(t.balance_after)}</td>
                    <td className="py-3 px-4 text-gray-700 text-xs">{t.description}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{t.user_name || 'النظام'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD ACCOUNT */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة خزنة أو حساب بنكي جديد</h3>
              <button onClick={() => setShowAddAccountModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الحساب *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: خزنة المعرض / حساب بنك مصر"
                  value={newAccount.name}
                  onChange={e => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">نوع الحساب</label>
                  <select
                    value={newAccount.account_type}
                    onChange={e => setNewAccount({ ...newAccount, account_type: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="treasury">خزنة كاش</option>
                    <option value="bank">حساب بنكي</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newAccount.initial_balance}
                    onChange={e => setNewAccount({ ...newAccount, initial_balance: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              {newAccount.account_type === 'bank' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">اسم البنك</label>
                    <input
                      type="text"
                      placeholder="البنك الأهلي / بنك مصر"
                      value={newAccount.bank_name}
                      onChange={e => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                      className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">رقم الحساب</label>
                    <input
                      type="text"
                      value={newAccount.bank_account_number}
                      onChange={e => setNewAccount({ ...newAccount, bank_account_number: e.target.value })}
                      className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ الحساب ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RECORD TRANSACTION */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إذن قبض أو صرف مباشر</h3>
              <button onClick={() => setShowTxModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              تسجيل مصروفات النثرية، البوفيه، الصيانة، أو إيداعات وسحوبات صاحب العمل
            </p>

            <form onSubmit={handleSaveTx} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">الخزنة / الحساب البنكي *</label>
                <select
                  required
                  value={txForm.account_id}
                  onChange={e => setTxForm({ ...txForm, account_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الخزنة...</option>
                  {accountData.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} (المتاح: {formatCurrency(acc.current_balance)})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">نوع الحركة *</label>
                  <select
                    value={txForm.tx_type}
                    onChange={e => setTxForm({ ...txForm, tx_type: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="inflow">إذن قبض (وارد للخزنة +)</option>
                    <option value="outflow">إذن صرف (صادر من الخزنة -)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ (جنيه) *</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={txForm.amount}
                    onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-base font-bold focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">تاريخ الحركة</label>
                <input
                  type="date"
                  min={getTodayDateString()}
                  value={txForm.tx_date}
                  onChange={e => {
                    if (isPastDate(e.target.value)) {
                      alert('ممنوع اعتماد تاريخ في الماضي! يجب اختيار تاريخ اليوم أو تاريخ مستقبلي.');
                      return;
                    }
                    setTxForm({ ...txForm, tx_date: e.target.value });
                  }}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">بيان وشرح الحركة *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: صيانة ومعايرة دورية لخطوط الإنتاج ومختبر الجودة"
                  value={txForm.description}
                  onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ الحركة ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TRANSFER BETWEEN ACCOUNTS */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-lg w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">تحويل نقدية بين الخزائن والبنوك</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يتم خصم المبلغ من الحساب الأول وإيداعه فوراً في الحساب الثاني مع تسجيل القيود
            </p>

            <form onSubmit={handleSaveTransfer} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">التحويل من (الخصم) *</label>
                <select
                  required
                  value={transferForm.from_account_id}
                  onChange={e => setTransferForm({ ...transferForm, from_account_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الحساب...</option>
                  {accountData.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} (المتاح: {formatCurrency(acc.current_balance)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">التحويل إلى (الإيداع) *</label>
                <select
                  required
                  value={transferForm.to_account_id}
                  onChange={e => setTransferForm({ ...transferForm, to_account_id: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                >
                  <option value="">اختر الحساب...</option>
                  {accountData.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">مبلغ التحويل (جنيه) *</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={transferForm.amount}
                  onChange={e => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-base font-bold focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  تنفيذ التحويل بنجاح ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
