import React, { useEffect } from 'react';
import { AlertTriangle, LogOut, ArrowRight } from 'lucide-react';

export default function UnsavedChangesModal({ isOpen, onStay, onLeave }) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onStay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onStay]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-modal-title"
      aria-describedby="unsaved-modal-description"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-right space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 flex-1">
            <h3 id="unsaved-modal-title" className="text-base font-bold text-slate-900">
              تنبيه: تغييرات غير محفوظة
            </h3>
            <p id="unsaved-modal-description" className="text-xs text-slate-600 leading-relaxed">
              لديك بيانات وتعديلات مدخلة لم يتم حفظها بعد. هل تريد البقاء في الشاشة الحالية ومتابعة العمل، أم الخروج دون حفظ؟
            </p>
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-[11px] text-amber-900 flex items-center gap-2">
          <span className="font-bold">ملاحظة:</span>
          <span>في حال الخروج دون حفظ، سيتم فقدان كافة التعديلات غير المسجلة.</span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onStay}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            autoFocus
          >
            <span>البقاء في الشاشة</span>
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>الخروج دون حفظ</span>
          </button>
        </div>
      </div>
    </div>
  );
}
