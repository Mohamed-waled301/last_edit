import React, { useState, useEffect, useRef } from 'react';
import { 
  Key, 
  Copy, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  HardDrive,
  RefreshCw,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { backupRepo } from '../data';

export default function ActivationScreen({ initialMachineCode = '', initialStatus = null, onActivated, onSkip }) {
  const [machineCode, setMachineCode] = useState(initialMachineCode);
  const [licenseInput, setLicenseInput] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialStatus?.error || '');
  const [successData, setSuccessData] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState('');
  const fileInputRef = useRef(null);

  // Load machine code if not provided
  useEffect(() => {
    async function fetchMachineCode() {
      if (!machineCode && typeof window !== 'undefined' && window.electronAPI?.getMachineCode) {
        try {
          const code = await window.electronAPI.getMachineCode();
          if (code) setMachineCode(code);
        } catch (err) {
          console.error('Failed to get machine code:', err);
        }
      }
    }
    fetchMachineCode();
  }, [machineCode]);

  // Set initial error if any
  useEffect(() => {
    if (initialStatus?.error && !errorMessage) {
      setErrorMessage(initialStatus.error);
    }
  }, [initialStatus, errorMessage]);

  // Handle Copy Machine Code
  const handleCopyCode = async () => {
    if (!machineCode) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(machineCode);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = machineCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    } catch (err) {
      console.warn('Copy error:', err);
    }
  };

  // Handle Save Machine Code to File
  const handleSaveCodeToFile = () => {
    if (!machineCode) return;
    const content = `نظام إدارة وتخطيط الموارد - كود ترخيص هذا الجهاز\n` +
      `code systems Device Code\n` +
      `-----------------------------------------\n` +
      `كود الجهاز: ${machineCode}\n` +
      `تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')}\n` +
      `-----------------------------------------\n` +
      `يرجى إرسال هذا الكود إلى مطور النظام للحصول على ملف الترخيص الخاص بهذا الجهاز.`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كود_جهاز_الترخيص_${machineCode}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle License File Selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setLicenseInput(result.trim());
      }
    };
    reader.onerror = () => {
      setErrorMessage('فشل في قراءة ملف الترخيص، يرجى المحاولة مرة أخرى');
    };
    reader.readAsText(file);
  };

  // Handle Activation
  const handleActivate = async (e) => {
    e?.preventDefault();
    const cleanKey = licenseInput.trim();
    if (!cleanKey) {
      setErrorMessage('يرجى لصق نص كود الترخيص أو اختيار ملف الترخيص أولاً');
      return;
    }

    setIsActivating(true);
    setErrorMessage('');

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.activate) {
        const result = await window.electronAPI.activate(cleanKey);

        if (result && result.success) {
          const activatedPayload = {
            ...result,
            isValid: true,
            isActivated: true,
          };
          setSuccessData({
            customerName: result.customerName,
            edition: result.edition || 'Enterprise',
            expiresAt: result.expiresAt,
            daysRemaining: result.daysRemaining,
          });

          // Wait 1.8 seconds then notify parent to open app permanently
          setTimeout(() => {
            if (onActivated) {
              onActivated(activatedPayload);
            }
          }, 1800);
        } else {
          const rawErr = result?.error || 'فشل التحقق من الترخيص';
          setErrorMessage(rawErr);
        }
      } else {
        // Fallback for non-electron environment
        setErrorMessage('خاصية التفعيل متوفرة فقط في تطبيق سطح المكتب');
      }
    } catch (err) {
      setErrorMessage(err?.message || 'حدث خطأ غير متوقع أثناء تفعيل الترخيص');
    } finally {
      setIsActivating(false);
    }
  };

  // Handle Data Backup Safeguard (Never lock users out of their data)
  const handleExportBackup = async () => {
    try {
      setIsExportingBackup(true);
      setBackupFeedback('');
      const res = await backupRepo.exportAllData();
      if (res?.success) {
        setBackupFeedback('تم تصدير وتنزيل النسخة الاحتياطية بنجاح على هذا الجهاز');
        setTimeout(() => setBackupFeedback(''), 4000);
      }
    } catch (err) {
      console.error('Backup safeguard error:', err);
      setBackupFeedback('فشل في تصدير النسخة الاحتياطية: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsExportingBackup(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] flex flex-col justify-between p-4 md:p-8" dir="rtl">
      {/* Top Header */}
      <header className="max-w-3xl mx-auto w-full text-center pt-2 pb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white border border-gray-200 shadow-md mb-3 overflow-hidden p-2">
          <img src="/logo.png" alt="code systems logo" className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#1F3A5F]">تفعيل النسخة</h1>
        <p className="text-sm md:text-base text-gray-600 mt-2 font-medium">
          نظام إدارة موارد المنشأة المتكامل - code systems
        </p>
      </header>

      {/* Main Content Box */}
      <main className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Success State */}
          {successData ? (
            <div className="p-8 text-center space-y-5">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">تم التفعيل بنجاح</h2>
                <p className="text-base text-gray-600 mt-1">
                  تم توثيق وترخيص هذا الجهاز بنجاح وجاهز للاستخدام
                </p>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-5 max-w-md mx-auto text-right space-y-2.5 text-sm">
                <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                  <span className="text-gray-600 font-semibold">اسم العميل والمؤسسة:</span>
                  <span className="font-bold text-gray-900">{successData.customerName}</span>
                </div>
                <div className="flex justify-between border-b border-emerald-200/60 pb-2">
                  <span className="text-gray-600 font-semibold">نوع الإصدار:</span>
                  <span className="font-bold text-gray-900">{successData.edition}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 font-semibold">صلاحية الترخيص:</span>
                  <span className="font-bold text-emerald-800">
                    {successData.expiresAt ? `حتى ${new Date(successData.expiresAt).toLocaleDateString('ar-EG')}` : 'ترخيص دائم (غير محدد بأجل)'}
                  </span>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => onActivated && onActivated(successData)}
                  className="px-8 py-3 bg-[#1F3A5F] hover:bg-[#172c48] text-white font-bold text-base rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  الدخول إلى النظام الآن
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 md:p-8 space-y-6">
              
              {/* 1. Machine Code Section */}
              <section className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-800">
                    كود تعريف هذا الجهاز
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    كود رقمي فريد ومحمي مشتق من عتاد الجهاز
                  </span>
                </div>

                {/* Readonly Machine Code Box */}
                <div className="bg-white border-2 border-slate-300 rounded-lg p-4 text-center select-all">
                  <div className="text-2xl md:text-3xl font-mono font-extrabold tracking-widest text-[#1F3A5F]">
                    {machineCode || 'جاري استخراج كود الجهاز...'}
                  </div>
                </div>

                {/* Copy and Save Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    disabled={!machineCode}
                    className="flex-1 min-w-[140px] h-11 bg-white hover:bg-slate-100 text-[#1F3A5F] border border-slate-300 rounded-md font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{copyFeedback ? 'تم نسخ الكود!' : 'نسخ الكود'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCodeToFile}
                    disabled={!machineCode}
                    className="flex-1 min-w-[140px] h-11 bg-white hover:bg-slate-100 text-[#1F3A5F] border border-slate-300 rounded-md font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>حفظ الكود كملف</span>
                  </button>
                </div>

                {/* Developer Explanation Notice */}
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-md text-xs md:text-sm text-blue-900 leading-relaxed font-semibold">
                  ابعت الكود ده للمطور عشان يديك ترخيص لهذا الجهاز بس
                </div>
              </section>

              {/* Error Message Display */}
              {errorMessage && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-800 text-sm">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="font-bold leading-relaxed">
                    {errorMessage}
                  </div>
                </div>
              )}

              {/* 2. License Input and Activation Form */}
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-bold text-gray-800">
                      إدخال مفتاح أو ملف الترخيص
                    </label>
                    
                    {/* File Picker Button */}
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".lic,.json,.txt"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-[#1F3A5F] hover:text-[#172c48] font-bold underline flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>اختيار ملف الترخيص</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mb-2 font-medium">
                    الصق نص كود الترخيص المشفر بالكامل هنا، أو اضغط اختيار ملف الترخيص لتحميله تلقائياً
                  </p>

                  {selectedFileName && (
                    <div className="mb-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1.5 flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>الملف المحدد: {selectedFileName}</span>
                    </div>
                  )}

                  {/* License Textarea (NO PLACEHOLDER) */}
                  <textarea
                    rows={4}
                    value={licenseInput}
                    onChange={(e) => {
                      setLicenseInput(e.target.value);
                      setErrorMessage('');
                    }}
                    aria-label="نص كود الترخيص"
                    className="w-full rounded-md border border-gray-300 p-3 text-xs md:text-sm font-mono leading-relaxed text-gray-800 focus:border-[#1F3A5F] focus:ring-1 focus:ring-[#1F3A5F] focus:outline-none resize-none"
                  />
                </div>

                {/* Activate Button */}
                <button
                  type="submit"
                  disabled={isActivating || !licenseInput.trim()}
                  className="w-full h-12 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-lg font-bold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isActivating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>جاري التحقق والتفعيل...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>تفعيل</span>
                    </>
                  )}
                </button>

                {/* Temporary Test Skip Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (onSkip) {
                      onSkip();
                    } else if (onActivated) {
                      onActivated({ isValid: true, isBypassed: true, customerName: 'وضع التجربة المؤقت' });
                    }
                  }}
                  className="w-full mt-3 h-11 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer border border-gray-300"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>تخطي الترخيص مؤقتاً للتجربة والاختبار</span>
                </button>
              </form>

              {/* 3. Data Safety Safeguard (Never lock users out of their data) */}
              <section className="pt-4 border-t border-gray-200">
                <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs md:text-sm font-bold text-amber-900">
                    <HardDrive className="w-4 h-4 text-amber-700" />
                    <span>حماية وضمان بيانات المؤسسة (تصدير آمن)</span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">
                    حتى في حال انتهاء صلاحية الترخيص أو عدم تفعيله، يمكنك دائماً تصدير وحفظ نسخة احتياطية كاملة من بياناتك المسجلة على هذا الجهاز بدون أي حظر.
                  </p>
                  
                  <div className="pt-1 flex flex-col sm:flex-row items-center gap-3">
                    <button
                      type="button"
                      onClick={handleExportBackup}
                      disabled={isExportingBackup}
                      className="w-full sm:w-auto h-9 px-4 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isExportingBackup ? 'جاري تصدير البيانات...' : 'تصدير نسخة احتياطية من البيانات'}</span>
                    </button>

                    {backupFeedback && (
                      <span className="text-xs font-bold text-emerald-700">
                        {backupFeedback}
                      </span>
                    )}
                  </div>
                </div>
              </section>

            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl mx-auto w-full text-center text-xs text-gray-500 pt-6 pb-2">
        نظام code systems • حماية الترخيص الرقمي غير المتصل بالإنترنت • حقوق النشر محفوظة 2026
      </footer>
    </div>
  );
}
