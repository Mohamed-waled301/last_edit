import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Eye, X, Check, FileText } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const STORAGE_PREFIX = 'erp_post_issue_print_';

/**
 * PostIssuePrintDialog
 * Reusable modal appearing immediately after an invoice or document is issued.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function (closes dialog and triggers completion flow)
 * - documentType: 'purchase_invoice' | 'sales_invoice'
 * - documentNumber: string
 * - documentTitle: string (optional, defaults based on docType)
 * - documentData: object (the complete document payload)
 * - onPrint: async function({ paperSize, printerName, documentData }) => { success, error }
 * - onPreview: function({ paperSize, documentData })
 * - onFinished: function() (called when user is done: after printing or clicking "لا أريد الطباعة")
 */
export default function PostIssuePrintDialog({
  isOpen,
  onClose,
  documentType = 'purchase_invoice',
  documentNumber = '',
  documentTitle = '',
  documentData = null,
  onPrint = null,
  onPreview = null,
  onFinished = null,
}) {
  const [paperSize, setPaperSize] = useState('a4'); // 'a4' | '80mm'
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState('');

  // 1. Load saved preferences for this docType
  useEffect(() => {
    if (!isOpen) return;

    try {
      const savedPref = localStorage.getItem(`${STORAGE_PREFIX}${documentType}`);
      if (savedPref) {
        const parsed = JSON.parse(savedPref);
        if (parsed.paperSize) setPaperSize(parsed.paperSize);
        if (parsed.printerName) setSelectedPrinter(parsed.printerName);
      }
    } catch {
      // ignore
    }

    // Load system printers via Electron API
    async function fetchPrinters() {
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.listPrinters) {
          const list = await window.electronAPI.listPrinters();
          const safeList = Array.isArray(list) ? list : [];
          setPrinters(safeList);
          if (safeList.length > 0 && !selectedPrinter) {
            const def = safeList.find((p) => p.isDefault) || safeList[0];
            setSelectedPrinter(def.name);
          }
        }
      } catch (err) {
        console.warn('Failed to load printer list:', err);
      }
    }

    fetchPrinters();
  }, [isOpen, documentType]);

  // Save preference on change
  const handlePaperSizeChange = (newSize) => {
    setPaperSize(newSize);
    try {
      const currentPref = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${documentType}`) || '{}');
      localStorage.setItem(
        `${STORAGE_PREFIX}${documentType}`,
        JSON.stringify({ ...currentPref, paperSize: newSize })
      );
    } catch {}
  };

  const handlePrinterChange = (printerName) => {
    setSelectedPrinter(printerName);
    try {
      const currentPref = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${documentType}`) || '{}');
      localStorage.setItem(
        `${STORAGE_PREFIX}${documentType}`,
        JSON.stringify({ ...currentPref, printerName })
      );
    } catch {}
  };

  // Safe dismiss handler
  const handleDismiss = useCallback(() => {
    if (onClose) onClose();
    if (onFinished) onFinished();
  }, [onClose, onFinished]);

  // Handle printing
  const handleExecutePrint = async () => {
    setPrintError('');
    setIsPrinting(true);
    try {
      if (onPrint) {
        const res = await onPrint({
          paperSize,
          printerName: selectedPrinter,
          documentData,
          documentType,
          documentNumber,
        });
        if (res && res.error) {
          setPrintError(res.error);
          setIsPrinting(false);
          return;
        }
      } else {
        // Fallback: navigate to print preview
        handleOpenPreview();
      }
      handleDismiss();
    } catch (err) {
      console.error('Print error in dialog:', err);
      setPrintError(err.message || 'فشلت الطباعة، تأكد من توصيل الطابعة');
      setIsPrinting(false);
    }
  };

  // Handle preview
  const handleOpenPreview = () => {
    if (onPreview) {
      onPreview({ paperSize, documentData, documentType, documentNumber });
    } else {
      let docTypeParam = 'sales_invoice';
      if (documentType === 'cut_order' || documentType === 'production_order' || documentType === 'cutting') {
        docTypeParam = 'cut_order';
      } else if (documentType === 'sales_invoice') {
        docTypeParam = paperSize === '80mm' ? 'sales_invoice_thermal' : 'sales_invoice';
      } else if (documentType === 'purchase_invoice' || documentType === 'purchase_order') {
        docTypeParam = paperSize === '80mm' ? 'purchase_invoice_thermal' : 'purchase_invoice';
      } else if (documentType) {
        docTypeParam = documentType;
      }

      const docId = documentData?.id || documentData?.cutting_number || documentData?.order_number || documentData?.po_number || documentData?.invoice_number || documentNumber;

      if (documentData && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('print_preview_payload', JSON.stringify({
            ...documentData,
            type: docTypeParam,
            paperSize
          }));
        } catch {}
      }

      window.location.hash = `#/print-preview?type=${docTypeParam}&id=${docId || ''}&paper=${paperSize}`;
    }
    handleDismiss();
  };

  // Keyboard navigation: Enter NEVER submits or triggers print; Esc closes dialog safely
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleDismiss();
      } else if (e.key === 'Enter') {
        // Rule: Enter never submits or issues or triggers printing
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleDismiss]);

  if (!isOpen) return null;

  const titleText = documentTitle || `تم إصدار الفاتورة رقم ${documentNumber}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-issue-print-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden transform scale-100 transition-all text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 id="post-issue-print-title" className="font-bold text-slate-900 text-base">
                {titleText}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                تم حفظ الفاتورة بنجاح واعتماد القيود. هل تود طباعتها الآن؟
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Paper Size Radio Choices */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              نوع الورق والطباعة:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  paperSize === 'a4'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-bold'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="post_issue_paper_size"
                    value="a4"
                    checked={paperSize === 'a4'}
                    onChange={() => handlePaperSizeChange('a4')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs">ورق كامل A4</span>
                </div>
                <FileText className="w-4 h-4 text-slate-400" />
              </label>

              <label
                className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  paperSize === '80mm'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-bold'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="post_issue_paper_size"
                    value="80mm"
                    checked={paperSize === '80mm'}
                    onChange={() => handlePaperSizeChange('80mm')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs">حراري 80 مم</span>
                </div>
                <Printer className="w-4 h-4 text-slate-400" />
              </label>
            </div>
          </div>

          {/* Printer Selection Dropdown */}
          <div className="space-y-1.5">
            <label htmlFor="post-issue-printer-select" className="block text-xs font-bold text-slate-700">
              اختيار الطابعة:
            </label>
            <select
              id="post-issue-printer-select"
              value={selectedPrinter}
              onChange={(e) => handlePrinterChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
            >
              {printers.length === 0 ? (
                <option value="">طابعة النظام الافتراضية</option>
              ) : (
                printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {printError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700">
              {printError}
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isPrinting}
            className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            لا أريد الطباعة
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={isPrinting}
              className="px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>معاينة</span>
            </button>

            <button
              type="button"
              onClick={handleExecutePrint}
              disabled={isPrinting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isPrinting ? 'جاري الطباعة...' : 'طباعة'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
