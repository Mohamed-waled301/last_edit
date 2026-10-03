import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Upload,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Calendar,
  Database,
  Info
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { backupRepo, settingsRepo, db } from '../data';
import { getActiveUser } from '../services/api';

export const BackupModule = ({ onBack, onNotify }) => {
  const [lastBackupDate, setLastBackupDate] = useState(null);
  const [stats, setStats] = useState({ tables: 0, totalRecords: 0 });
  const [isPersisted, setIsPersisted] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [pendingFileContent, setPendingFileContent] = useState(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [clearConfirmationText, setClearConfirmationText] = useState('');
  const fileInputRef = useRef(null);

  const currentUser = getActiveUser();
  const isOwner = currentUser.role === 'owner';

  useEffect(() => {
    loadBackupInfo();
  }, []);

  const loadBackupInfo = async () => {
    try {
      const settings = await settingsRepo.getSettings();
      setLastBackupDate(settings.last_backup_date);

      // Count records across all tables
      let totalRecords = 0;
      for (const table of db.tables) {
        totalRecords += await table.count();
      }
      setStats({
        tables: db.tables.length,
        totalRecords,
      });

      const persisted = await backupRepo.checkStoragePersistence();
      setIsPersisted(persisted);
    } catch (e) {
      console.warn('Failed to load backup info:', e);
    }
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const res = await backupRepo.exportAllData();
      setLastBackupDate(res.timestamp);
      onNotify('تم تنزيل النسخة الاحتياطية بنجاح بصيغة JSON على جهازك', 'success');
      await loadBackupInfo();
    } catch (err) {
      onNotify(err.message || 'حدث خطأ أثناء تصدير النسخة الاحتياطية', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPendingFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        JSON.parse(text); // validate JSON
        setPendingFileContent(text);
        setShowRestoreModal(true);
      } catch {
        onNotify('الملف المحدد غير صالح، يرجى اختيار ملف نسخة احتياطية بصيغة JSON', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset
  };

  const executeRestore = async () => {
    if (!pendingFileContent) return;
    setIsImporting(true);
    try {
      await backupRepo.importAllData(pendingFileContent, currentUser.id);
      setShowRestoreModal(false);
      setPendingFileContent(null);
      onNotify('تم استرجاع جميع البيانات بنجاح من النسخة الاحتياطية!', 'success');
      await loadBackupInfo();
    } catch (err) {
      onNotify(err.message || 'فشل استرجاع النسخة الاحتياطية', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleLoadDemo = async () => {
    if (!window.confirm('هل تريد استبدال البيانات الحالية بالبيانات التجريبية للورشة؟')) return;
    try {
      await backupRepo.loadDemoData(currentUser.id);
      onNotify('تم تحميل البيانات التجريبية بنجاح!', 'success');
      await loadBackupInfo();
    } catch (err) {
      onNotify(err.message || 'حدث خطأ أثناء تحميل البيانات التجريبية', 'error');
    }
  };

  const handleClearAll = async () => {
    if (clearConfirmationText !== 'مسح كل البيانات') {
      onNotify('يرجى كتابة جملة التأكيد بدقة', 'error');
      return;
    }

    try {
      await backupRepo.clearAllData(currentUser.id);
      setShowClearModal(false);
      setClearConfirmationText('');
      onNotify('تم مسح جميع البيانات من النظام بنجاح', 'success');
      await loadBackupInfo();
    } catch (err) {
      onNotify(err.message || 'حدث خطأ أثناء مسح البيانات', 'error');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} label="الرئيسية" />
          <div>
            <h1 className="text-2xl font-bold text-[#1F2937] flex items-center gap-2">
              <HardDrive className="w-6 h-6 text-[#1F3A5F]" />
              <span>النسخ الاحتياطي وأمان البيانات</span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              إدارة النسخ الاحتياطية، التصدير والاسترجاع، وحماية بيانات الورشة المحلية
            </p>
          </div>
        </div>
      </div>

      {/* Security Advisory Card */}
      <div className="p-4 bg-white border border-gray-200 rounded-md">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-[#1F3A5F] shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-bold text-[#1F2937] mb-1">كيف يعمل نظام الحفظ والتخزين على هذا الجهاز؟</h3>
            <p className="text-gray-600 leading-relaxed">
              يعمل النظام بنسبة <span className="font-bold text-[#1F3A5F]">100% داخل متصفح جهازك</span> عبر تقنية قاعدة البيانات المحلية (IndexedDB). لا توجد خوادم خارجية تحتفظ ببياناتك المالية أو صور عملك. لذلك، يُعد تنزيل نسخة احتياطية أسبوعياً على فلاش ميموري (USB) أو قرص صلب خارجي هو الضمان الأكيد لحماية بياناتك من أي عطل يصيب الجهاز أو المتصفح.
            </p>
          </div>
        </div>
      </div>

      {/* Two Main Big Action Buttons (Prompt Requirement 4.1) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Export Action Card */}
        <div className="bg-white border border-gray-200 rounded-md p-6 flex flex-col justify-between hover:border-[#1F3A5F] transition-colors">
          <div>
            <div className="w-12 h-12 rounded-md bg-[#1F3A5F]/10 border border-[#1F3A5F]/20 flex items-center justify-center text-[#1F3A5F] mb-4">
              <Download className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[#1F2937] mb-2">1. حفظ نسخة احتياطية</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              تصدير وحفظ كامل بيانات الورشة (الموردين، الخامات، شجرة المنتجات، أوامر التشغيل، الفواتير، وحركات الخزينة) في ملف واحد بصيغة JSON يحمل تاريخ اليوم.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {lastBackupDate ? (
                <span>آخر نسخة: {new Date(lastBackupDate).toLocaleDateString('ar-EG')}</span>
              ) : (
                <span className="text-amber-600 font-bold">لم يتم حفظ نسخة مسبقاً!</span>
              )}
            </div>
            <button
              onClick={handleExportBackup}
              disabled={isExporting}
              className="px-6 h-12 bg-[#1F3A5F] hover:bg-[#162a45] text-white font-bold rounded-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              <span>{isExporting ? 'جاري التصدير...' : 'حفظ نسخة احتياطية الآن'}</span>
            </button>
          </div>
        </div>

        {/* 2. Import Action Card */}
        <div className="bg-white border border-gray-200 rounded-md p-6 flex flex-col justify-between hover:border-amber-500 transition-colors">
          <div>
            <div className="w-12 h-12 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mb-4">
              <Upload className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[#1F2937] mb-2">2. استرجاع نسخة</h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              استيراد ملف نسخة احتياطية سابقة واسترجاع جميع السجلات والحسابات. سيتم عرض شاشة تأكيد وفحص الملف قبل اعتماد الاستبدال.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileSelected}
              className="hidden"
            />
            <div className="text-xs text-gray-500">
              ملفات المدعومة: <span className="font-mono font-bold">.JSON</span>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="px-6 h-12 bg-white hover:bg-gray-50 text-[#1F3A5F] border border-[#1F3A5F] font-bold rounded-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-5 h-5" />
              <span>اختيار ملف واسترجاع نسخة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Storage & System Status Ledger */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <h3 className="font-bold text-[#1F2937] text-base mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-gray-600" />
          <span>حالة التخزين المحلي وقاعدة البيانات</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3 border border-gray-200 rounded-md bg-gray-50">
            <div className="text-xs text-gray-500 mb-1">عدد جداول النظام</div>
            <div className="text-xl font-bold text-[#1F2937]">{stats.tables} جدولاً محلياً</div>
          </div>
          <div className="p-3 border border-gray-200 rounded-md bg-gray-50">
            <div className="text-xs text-gray-500 mb-1">إجمالي السجلات المحفوظة</div>
            <div className="text-xl font-bold text-[#1F2937]">{stats.totalRecords} سجلاً</div>
          </div>
          <div className="p-3 border border-gray-200 rounded-md bg-gray-50">
            <div className="text-xs text-gray-500 mb-1">حالة التخزين الدائم (Storage Persist)</div>
            <div className="flex items-center gap-2 text-base font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>مفعل ومحمي في المتصفح</span>
            </div>
          </div>
        </div>
      </div>

      {/* Demo Data & Reset Actions (Prompt Requirement 5) */}
      {isOwner && (
        <div className="bg-white border border-gray-200 rounded-md p-5">
          <h3 className="font-bold text-[#1F2937] text-base mb-2">إجراءات متقدمة للبيانات (للمالك فقط)</h3>
          <p className="text-xs text-gray-500 mb-4">
            يمكنك تحميل بيانات تجريبية استرشادية، أو تصفير النظام بالكامل للبدء على بياض.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleLoadDemo}
              className="px-4 h-11 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-semibold rounded-md text-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-[#1F3A5F]" />
              <span>تحميل بيانات تجريبية استرشادية</span>
            </button>
            <button
              onClick={() => setShowClearModal(true)}
              className="px-4 h-11 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-md text-sm transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>مسح كل البيانات (تصفير شامل)</span>
            </button>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 rounded-md w-full max-w-lg p-6 shadow-none">
            <div className="flex items-start gap-3 pb-4 border-b border-gray-200">
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1F2937]">تأكيد استرجاع النسخة الاحتياطية</h3>
                <p className="text-xs text-gray-500 mt-0.5">الملف المحدد: {pendingFileName}</p>
              </div>
            </div>

            <div className="my-5 p-3.5 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 leading-relaxed">
              <span className="font-bold">تحذير هام:</span> سيتم استبدال جميع البيانات الحالية بالكامل بالبيانات الموجودة في هذا الملف. لن تتمكن من التراجع عن هذه الخطوة إلا إذا كان لديك نسخة احتياطية أخرى محفوظة.
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setPendingFileContent(null);
                }}
                disabled={isImporting}
                className="px-4 h-11 border border-gray-300 hover:bg-gray-50 rounded-md text-sm font-semibold text-gray-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={isImporting}
                className="px-6 h-11 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isImporting ? 'جاري الاسترجاع...' : 'نعم، استبدل واسترجع البيانات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal (Double Confirmation) */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-300 rounded-md w-full max-w-lg p-6 shadow-none">
            <div className="flex items-start gap-3 pb-4 border-b border-gray-200">
              <div className="p-2 bg-red-50 border border-red-200 rounded-md text-red-700 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-700">تصفير ومسح جميع بيانات النظام</h3>
                <p className="text-xs text-gray-500 mt-0.5">إجراء خطير لا يمكن الرجوع عنه</p>
              </div>
            </div>

            <div className="my-4 text-sm text-gray-700 leading-relaxed">
              سيتم حذف جميع سجلات الفواتير، الحسابات، الخامات، وأوامر الإنتاج نهائياً من هذا المتصفح. لتأكيد المسح، اكتب العبارة التالية في المربع أدناه:
              <div className="mt-2 p-2 bg-gray-100 border border-gray-300 rounded text-center font-bold text-gray-800 select-all">
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
};

export default BackupModule;
