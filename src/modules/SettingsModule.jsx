import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  ShieldCheck, 
  Clock, 
  Download, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  Trash2,
  HardDrive
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { backupRepo, settingsRepo, auditRepo } from '../data';
import { formatDate } from '../utils/formatters';

export default function SettingsModule({ onBack, onNavigate, onNotify }) {
  const [settings, setSettings] = useState({
    factory_name: '',
    phone: '',
    address: '',
    vat_enabled: false,
    vat_rate_percent: 14.00,
    currency_symbol: 'ج.م'
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [lastBackup, setLastBackup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [setRes, audRes] = await Promise.all([
        api.getSettings(),
        api.getAuditLogs()
      ]);
      const currentSet = setRes.settings || setRes.data || {};
      setSettings(currentSet);
      setLastBackup(currentSet.last_backup_date);
      setAuditLogs(audRes.audit_logs || audRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.updateSettings(settings);
      onNotify('تم حفظ وتحديث إعدادات المؤسسة بنجاح');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsBackupLoading(true);
      const res = await backupRepo.exportAllData();
      onNotify('تم حفظ وتنزيل النسخة الاحتياطية بنجاح على جهازك', 'success');
      setLastBackup(res.timestamp);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleLoadDemo = async () => {
    if (!window.confirm('هل تريد استبدال البيانات الحالية بالبيانات التجريبية الاسترشادية للمؤسسة (Enterprise ERP Demo)؟')) return;
    try {
      await backupRepo.loadDemoData('usr-owner');
      onNotify('تم تحميل البيانات التجريبية للمؤسسة بنجاح!', 'success');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClearAll = async () => {
    if (clearConfirmationText !== 'مسح كل البيانات') {
      alert('يرجى كتابة العبارة بدقة لتأكيد المسح');
      return;
    }
    try {
      await backupRepo.clearAllData('usr-owner');
      setShowClearModal(false);
      setClearConfirmationText('');
      onNotify('تم مسح جميع البيانات بنجاح', 'success');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
        <BackButton onClick={onBack} />
        <div>
          <h2 className="text-xl font-bold text-gray-900 leading-none">إعدادات النظام والرقابة</h2>
          <span className="text-xs text-gray-500 font-medium">بيانات المنشأة، الضريبة، أمان البيانات، وسجل العمليات</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="bg-white rounded-md p-6 border border-gray-200 space-y-4">
          <div className="border-b border-gray-200 pb-3">
            <h3 className="text-base font-bold text-gray-900">إعدادات المنشأة والضرائب</h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">اسم المنشأة، تفعيل ضريبة القيمة المضافة، والعملة</p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الشركة أو المنشأة</label>
              <input
                type="text"
                required
                value={settings.factory_name || ''}
                onChange={e => setSettings({ ...settings, factory_name: e.target.value })}
                className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">رقم التليفون</label>
                <input
                  type="text"
                  value={settings.phone || ''}
                  onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">رمز العملة</label>
                <input
                  type="text"
                  value={settings.currency_symbol || 'ج.م'}
                  onChange={e => setSettings({ ...settings, currency_symbol: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">عنوان المقر والمصنع الرئيسي</label>
              <input
                type="text"
                value={settings.address || ''}
                onChange={e => setSettings({ ...settings, address: e.target.value })}
                className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>

            {/* VAT Toggle */}
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={!!settings.vat_enabled}
                  onChange={e => setSettings({ ...settings, vat_enabled: e.target.checked })}
                  className="w-4 h-4 cursor-pointer"
                />
                <span>تفعيل ضريبة القيمة المضافة على المبيعات والمشتريات</span>
              </label>

              {settings.vat_enabled && (
                <div className="flex items-center gap-2 pr-6">
                  <span className="text-xs font-semibold text-gray-600">نسبة الضريبة:</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={settings.vat_rate_percent}
                    onChange={e => setSettings({ ...settings, vat_rate_percent: Number(e.target.value) })}
                    className="w-20 h-9 rounded border border-gray-300 px-2 text-xs font-bold text-center"
                  />
                  <span className="text-xs text-gray-500 font-semibold">% (14% في مصر)</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full h-12 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-base cursor-pointer transition-colors"
              >
                حفظ الإعدادات
              </button>
            </div>
          </form>
        </div>

        {/* Backups & Demo Data Management */}
        <div className="bg-white rounded-md p-6 border border-gray-200 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-200 pb-3">
              <h3 className="text-base font-bold text-gray-900">النسخ الاحتياطي وأمان البيانات</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">تصدير واسترجاع بيانات المؤسسة محلياً بدون خادم</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-md border border-gray-200 space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>تاريخ آخر نسخة احتياطية:</span>
                <span className="font-bold text-gray-800">
                  {lastBackup ? formatDate(lastBackup) : 'لم يتم الحفظ مسبقاً'}
                </span>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={isBackupLoading}
                className="w-full h-11 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isBackupLoading ? 'جاري التحميل...' : 'حفظ نسخة احتياطية فوراً (JSON)'}</span>
              </button>

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('backup')}
                  className="w-full h-10 bg-white hover:bg-gray-100 text-[#1F3A5F] border border-[#1F3A5F] rounded-md font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>فتح شاشة النسخ الاحتياطي والاسترجاع المتقدمة</span>
                </button>
              )}
            </div>

            {/* Demo Data & Reset Actions (Prompt Requirement 5) */}
            <div className="p-4 bg-gray-50 rounded-md border border-gray-200 space-y-3">
              <div className="text-xs font-bold text-gray-700">إجراءات البيانات التجريبية والتصفير:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  className="h-10 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#1F3A5F]" />
                  <span>تحميل بيانات تجريبية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearModal(true)}
                  className="h-10 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>مسح كل البيانات</span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 text-center">
            قاعدة البيانات: IndexedDB (Dexie) • جميع البيانات محلية 100%
          </div>
        </div>
      </div>

      {/* Audit Log (مين عمل إيه وإمتى) */}
      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">سجل الرقابة وتتبع الحركات (Audit Log)</h3>
          <p className="text-xs text-gray-500 font-medium">
            يسجل تلقائياً أي عملية إضافة أو تعديل أو إلغاء بواسطة أي مستخدم مع التوقيت والبيانات
          </p>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-gray-100 border-b border-gray-200 text-gray-700 font-bold sticky top-0">
              <tr>
                <th className="py-2.5 px-3">التوقيت</th>
                <th className="py-2.5 px-3">المستخدم</th>
                <th className="py-2.5 px-3">نوع الحركة</th>
                <th className="py-2.5 px-3">الشاشة / الجدول</th>
                <th className="py-2.5 px-3">رقم العملية</th>
                <th className="py-2.5 px-3">البيانات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    لا توجد حركات مسجلة حتى الآن.
                  </td>
                </tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-500 font-mono">{formatDate(log.created_at)}</td>
                    <td className="py-2 px-3 font-bold text-gray-900">{log.user_name || log.user_id || 'النظام'}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold erp-badge-gray">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-gray-700">{log.entity_type}</td>
                    <td className="py-2 px-3 font-mono text-gray-500">{log.entity_id || '-'}</td>
                    <td className="py-2 px-3 text-gray-500 max-w-xs truncate" title={log.new_data || log.old_data}>
                      {log.new_data || log.old_data || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 rounded-md w-full max-w-lg p-6 shadow-none">
            <div className="flex items-start gap-3 pb-4 border-b border-gray-200">
              <div className="p-2 bg-red-50 border border-red-200 rounded-md text-red-700 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-700">تصفير ومسح جميع بيانات النظام</h3>
                <p className="text-xs text-gray-500 mt-0.5">تأكيد مضاعف - لا يمكن التراجع عن هذا الإجراء</p>
              </div>
            </div>

            <div className="my-4 text-sm text-gray-700 leading-relaxed">
              لتأكيد مسح جميع الفواتير والحسابات والخامات، يرجى كتابة:
              <div className="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-center font-bold text-gray-800">
                مسح كل البيانات
              </div>
            </div>

            <input
              type="text"
              value={clearConfirmationText}
              onChange={(e) => setClearConfirmationText(e.target.value)}
              placeholder="اكتب: مسح كل البيانات"
              className="w-full h-11 px-3 border border-gray-300 rounded-md text-center text-sm focus:border-red-500 focus:outline-none mb-4"
            />

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowClearModal(false);
                  setClearConfirmationText('');
                }}
                className="px-4 h-11 border border-gray-300 hover:bg-gray-50 rounded-md text-sm font-semibold text-gray-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearConfirmationText !== 'مسح كل البيانات'}
                className="px-6 h-11 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-bold transition-colors cursor-pointer disabled:opacity-40"
              >
                تأكيد المسح النهائي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
