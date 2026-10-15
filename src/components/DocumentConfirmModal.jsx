import React from 'react';
import { CheckCircle2, X, AlertCircle, FileText } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

/**
 * DocumentConfirmModal
 * Modal shown before issuing an invoice or document (Purchase / Sales / Orders).
 * Displays document type, party name (supplier/customer), payment terms, and net total.
 * Actions: "تأكيد الإصدار" / "رجوع"
 */
export default function DocumentConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'تأكيد إصدار المستند',
  documentType = 'فاتورة',
  partyLabel = 'الطرف الثاني',
  partyName = '',
  paymentType = 'cash', // 'cash' | 'credit'
  totalAmount = 0,
  isSubmitting = false,
  extraDetails = null,
}) {
  if (!isOpen) return null;

  const paymentLabel = paymentType === 'credit' ? 'آجل' : 'نقدي فوري';
  const paymentBadgeColor = paymentType === 'credit'
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-emerald-100 text-emerald-800 border-emerald-200';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden transform scale-100 transition-all">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{title}</h3>
              <p className="text-xs text-slate-500 font-medium">مراجعة وتأكيد الاعتماد النهائي للـ {documentType}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
            title="رجوع"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Confirmation Cards */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            {/* Party Row */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">{partyLabel}:</span>
              <span className="font-bold text-slate-900 text-sm">{partyName || 'غير محدد'}</span>
            </div>

            {/* Payment Terms Row */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
              <span className="font-semibold text-slate-600">طريقة الدفع:</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${paymentBadgeColor}`}>
                {paymentLabel}
              </span>
            </div>

            {/* Extra details if provided */}
            {extraDetails}
          </div>

          {/* Grand Total Display */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-200">الصافي النهائي للمستند:</span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-xs text-blue-900">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              بالضغط على «تأكيد الإصدار» سيتم اعتماد الفاتورة رسمياً، وتحديث الأرصدة المخزنية والمالية.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 bg-white hover:bg-slate-100 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            رجوع
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'جاري الاعتماد...' : 'تأكيد الإصدار'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
