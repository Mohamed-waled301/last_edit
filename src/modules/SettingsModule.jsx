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
  HardDrive,
  Key,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { NumberInput } from '../components/MoneyInput';
import { api } from '../services/api';
import { backupRepo, settingsRepo, auditRepo } from '../data';
import { formatDate } from '../utils/formatters';

export default function SettingsModule({ onBack, onNavigate, onNotify }) {
  const [settings, setSettings] = useState({
    factory_name: '',
    phone: '',
    address: '',
    company_logo: '',
    default_credit_days: 30,
    vat_enabled: false,
    vat_rate_percent: 14.00,
    currency_symbol: 'ج.م',
    default_profit_margin_percent: 0
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [lastBackup, setLastBackup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState('');
  const [licenseInfo, setLicenseInfo] = useState(null);
  const [logoError, setLogoError] = useState('');
  const fileInputRef = React.useRef(null);

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

    async function loadLicense() {
      if (typeof window !== 'undefined' && window.electronAPI?.getLicenseStatus) {
        try {
          const status = await window.electronAPI.getLicenseStatus();
          setLicenseInfo(status);
        } catch (err) {
          console.warn('Failed to load license in settings:', err);
        }
      }
    }
    loadLicense();
  }, []);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setLogoError('حجم ملف الشعار يتجاوز الحد الأقصى المسموح (2 ميجابايت)');
      return;
    }

    setLogoError('');

    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSettings(prev => ({ ...prev, company_logo: event.target.result }));
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
        setSettings(prev => ({ ...prev, company_logo: compressedDataUrl }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setSettings(prev => ({ ...prev, company_logo: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
            {/* Company Logo Upload (Requirement 5) */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <label className="block text-sm font-bold text-gray-800">
                شعار المنشأة
              </label>
              <p className="text-xs text-gray-500">
                يظهر الشعار بجوار اسم المصنع في الشريط العلوي وعلى جميع المطبوعات والتقارير والفواتير تلقائياً.
              </p>

              {settings.company_logo ? (
                <div className="flex items-center gap-4 bg-white p-3 rounded-md border border-gray-200">
                  <img
                    src={settings.company_logo}
                    alt="شعار المنشأة المعين"
                    className="h-16 w-auto max-w-[120px] object-contain rounded border border-gray-200 bg-gray-50 p-1"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>تغيير الشعار</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded text-xs font-bold transition-colors border border-red-200 cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الشعار</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 border-2 border-dashed border-gray-300 hover:border-[#1F3A5F] bg-white rounded-lg flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-gray-600 hover:text-[#1F3A5F]"
                  >
                    <Upload className="w-6 h-6 text-gray-400" />
                    <span className="text-xs font-bold">انقر لاختيار شعار المنشأة (PNG, JPG, SVG - بحد أقصى 2MB)</span>
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
                aria-label="رفع شعار المنشأة"
              />
              {logoError && (
                <p className="text-xs text-red-600 font-bold mt-1">{logoError}</p>
              )}
            </div>

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

            {/* Default Credit Days for Sales Invoices (Requirement 3) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                فترة الائتمان الافتراضية للفواتير الآجلة (بالأيام)
              </label>
              <NumberInput
                value={settings.default_credit_days !== undefined ? settings.default_credit_days : 30}
                onChange={e => setSettings({ ...settings, default_credit_days: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
              <span className="text-[11px] text-gray-500 mt-1 block">
                تضاف هذه الأيام تلقائياً إلى تاريخ فاتورة المبيعات الآجلة لتحديد تاريخ الاستحقاق.
              </span>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">نسبة هامش الربح الافتراضية (%)</label>
              <NumberInput
                value={settings.default_profit_margin_percent !== undefined ? settings.default_profit_margin_percent : 0}
                onChange={e => setSettings({ ...settings, default_profit_margin_percent: Number(e.target.value) || 0 })}
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
                  <NumberInput
                    value={settings.vat_rate_percent}
                    onChange={e => setSettings({ ...settings, vat_rate_percent: Number(e.target.value) })}
                    className="w-24 h-9 rounded border border-gray-300 px-2 text-xs font-bold text-center"
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
                <span>{isBackupLoading ? 'جاري التحميل...' : 'حفظ نسخة احتياطية فوراً'}</span>
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

            {/* Recompute Stock Balances Tool */}
            <div className="p-4 bg-indigo-50/60 rounded-md border border-indigo-200 space-y-3">
              <div className="text-xs font-bold text-indigo-900">أداة تدقيق وإعادة احتساب أرصدة المخزون:</div>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                تقوم هذه الأداة بإعادة احتساب جميع أرصدة الأصناف والخامات والمنتجات من واقع حركات التوريد والصرف الفعلية ومعالجة أي فروق تلقائياً.
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsBackupLoading(true);
                    const res = await api.recomputeStockBalances();
                    onNotify(res.message || 'تم إعادة احتساب أرصدة المخزون بنجاح ومطابقتها', 'success');
                  } catch (e) {
                    alert(e.message || 'فشل في إعادة احتساب الأرصدة');
                  } finally {
                    setIsBackupLoading(false);
                  }
                }}
                disabled={isBackupLoading}
                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBackupLoading ? 'animate-spin' : ''}`} />
                <span>إعادة احتساب أرصدة المخزون الآن</span>
              </button>
            </div>

            {/* Clear All Data */}
            <div className="p-4 bg-gray-50 rounded-md border border-gray-200 space-y-3">
              <div className="text-xs font-bold text-gray-700">تصفير النظام والبدء من الصفر:</div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowClearModal(true)}
                  className="w-full h-10 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  <span>تصفير ومسح كافة البيانات (بدء نظيف من الصفر)</span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-400 text-center">
            قاعدة البيانات متصلة ومحدثة • حفظ آمن للبيانات
          </div>
        </div>
      </div>

      {/* License Section (الترخيص) - Readonly */}
      <div className="bg-white rounded-md p-6 border border-gray-200 space-y-4">
        <div className="border-b border-gray-200 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-[#1F3A5F]">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">الترخيص</h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                بيانات ترخيص النسخة وتوثيق ربط الجهاز الحالي
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>{licenseInfo?.isValid ? 'مرخص ومفعل' : (licenseInfo ? 'غير مفعل' : 'وضع المتصفح')}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">حالة الترخيص</label>
            <div className="w-full h-11 rounded-md bg-gray-50 border border-gray-200 px-3 flex items-center font-bold text-gray-800">
              {licenseInfo?.isValid ? 'النسخة مفعلة ومربوطة بهذا الجهاز' : 'النسخة غير مفعلة'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">اسم العميل والمؤسسة</label>
            <div className="w-full h-11 rounded-md bg-gray-50 border border-gray-200 px-3 flex items-center font-bold text-gray-800">
              {licenseInfo?.customerName || 'غير محدد'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">كود الجهاز</label>
            <div className="w-full h-11 rounded-md bg-gray-50 border border-gray-200 px-3 flex items-center font-mono font-bold text-[#1F3A5F]">
              {licenseInfo?.machineCode || '—'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">تاريخ انتهاء الترخيص</label>
            <div className="w-full h-11 rounded-md bg-gray-50 border border-gray-200 px-3 flex items-center font-bold text-gray-800">
              {licenseInfo?.expiresAt ? formatDate(licenseInfo.expiresAt) : 'ترخيص دائم (غير محدد بأجل)'}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1">نوع الإصدار</label>
            <div className="w-full h-11 rounded-md bg-gray-50 border border-gray-200 px-3 flex items-center font-bold text-gray-800">
              {licenseInfo?.edition || 'code systems Enterprise'}
            </div>
          </div>
        </div>

        {licenseInfo?.isExpiringSoon && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              تنبيه: سينتهي هذا الترخيص بعد {licenseInfo.daysRemaining} {licenseInfo.daysRemaining === 1 ? 'يوم' : 'أيام'}. يرجى التواصل مع المطور لتجديده.
            </span>
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">سجل الرقابة وتتبع الحركات</h3>
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
              aria-label="عبارة تأكيد مسح كل البيانات"
              value={clearConfirmationText}
              onChange={(e) => setClearConfirmationText(e.target.value)}
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
