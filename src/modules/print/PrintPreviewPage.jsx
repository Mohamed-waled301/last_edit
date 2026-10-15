import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Printer, 
  Download, 
  ArrowRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  ChevronRight, 
  ChevronLeft, 
  Settings as SettingsIcon, 
  CheckCircle2, 
  AlertCircle, 
  Building2,
  FileText
} from 'lucide-react';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';

export default function PrintPreviewPage({ searchParams = {}, onBack }) {
  const params = useMemo(() => {
    if (searchParams instanceof URLSearchParams) return searchParams;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        return new URLSearchParams(hash.slice(qIndex));
      }
    }
    return new URLSearchParams();
  }, [searchParams]);

  const docType = params.get('type') || 'invoice'; // 'sales_invoice' | 'customer_receipt' | 'supplier_payment' | 'statement' | 'cut_order' | 'custom'
  const docId = params.get('id');
  const returnUrl = params.get('returnUrl');

  const [settings, setSettings] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Printers & Print Settings
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [paperSize, setPaperSize] = useState(docType === 'sales_invoice_thermal' ? '80mm' : 'A4');
  const [orientation, setOrientation] = useState('portrait'); // 'portrait' | 'landscape'
  const [margins, setMargins] = useState('default'); // 'default' | 'minimal' | 'none'
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('color'); // 'color' | 'grayscale'
  const [zoomLevel, setZoomLevel] = useState(100); // 50 to 150
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Status messages
  const [printStatus, setPrintStatus] = useState(null); // { type: 'success' | 'error', text: '' }
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const printFrameRef = useRef(null);

  // Load Settings and Printers
  useEffect(() => {
    async function initPrintersAndSettings() {
      try {
        const [setRes, printerList] = await Promise.all([
          api.getSettings ? api.getSettings().catch(() => null) : null,
          typeof window !== 'undefined' && window.electronAPI?.listPrinters
            ? window.electronAPI.listPrinters().catch(() => [])
            : (typeof window !== 'undefined' && window.electronAPI?.getPrinters
                ? window.electronAPI.getPrinters().catch(() => [])
                : [])
        ]);

        const sData = setRes?.settings || setRes?.data || setRes || null;
        setSettings(sData);

        const list = Array.isArray(printerList) ? printerList : [];
        setPrinters(list);
        if (list.length > 0) {
          const defaultP = list.find((p) => p.isDefault) || list[0];
          setSelectedPrinter(defaultP.name);
        }
      } catch (err) {
        console.warn('Init print preview failed:', err);
      }
    }

    initPrintersAndSettings();
  }, []);

  // Load Document Content
  useEffect(() => {
    async function loadDoc() {
      try {
        setLoading(true);
        setLoadError('');

        // Custom payload from sessionStorage if present
        if (typeof window !== 'undefined') {
          const storedPayload = sessionStorage.getItem('print_preview_payload');
          if (storedPayload) {
            try {
              const parsed = JSON.parse(storedPayload);
              if (parsed && (parsed.type === docType || !docId)) {
                setDocumentData(parsed);
                if (parsed.paperSize) setPaperSize(parsed.paperSize);
                setLoading(false);
                return;
              }
            } catch {}
          }
        }

        // Fetch based on docType and docId
        if (docType === 'sales_invoice' || docType === 'invoice') {
          const res = await api.getSalesInvoices();
          const invoices = Array.isArray(res.data) ? res.data : (res.invoices || []);
          const found = invoices.find(i => String(i.id) === String(docId) || String(i.invoice_number) === String(docId)) || invoices[0];
          setDocumentData(found || null);
        } else if (docType === 'customer_receipt') {
          const res = await api.getCustomerReceipts();
          const receipts = Array.isArray(res.data) ? res.data : (res.receipts || []);
          const found = receipts.find(r => String(r.id) === String(docId) || String(r.receipt_number) === String(docId)) || receipts[0];
          setDocumentData(found || null);
        } else if (docType === 'supplier_payment') {
          const res = await api.getSupplierPayments();
          const payments = Array.isArray(res.data) ? res.data : (res.payments || []);
          const found = payments.find(p => String(p.id) === String(docId) || String(p.payment_number) === String(docId)) || payments[0];
          setDocumentData(found || null);
        } else if (docType === 'statement') {
          const res = await api.getSupplierStatement(docId).catch(() => null);
          const pRes = await api.getParty(docId).catch(() => null);
          setDocumentData({
            statementData: res?.data || null,
            party: pRes?.data || null
          });
        } else if (docType === 'cut_order') {
          const res = await api.getProductionOrders();
          const orders = Array.isArray(res.data) ? res.data : (res.production_orders || []);
          const found = orders.find(o => String(o.id) === String(docId) || String(o.cutting_number) === String(docId) || String(o.order_number) === String(docId)) || orders[0];
          setDocumentData(found || null);
        }
      } catch (err) {
        console.error('Failed to load document for print preview:', err);
        setLoadError('تعذر تحميل بيانات المستند للطباعة');
      } finally {
        setLoading(false);
      }
    }

    loadDoc();
  }, [docType, docId]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (returnUrl) {
      window.location.hash = returnUrl;
    } else {
      window.history.back();
    }
  };

  // Generate complete HTML string of preview container for print/pdf IPC
  const getDocumentHtml = () => {
    if (!printFrameRef.current) return '';
    const content = printFrameRef.current.innerHTML;
    const isThermal = paperSize === '80mm';
    const pageCss = isThermal
      ? `@page { size: 80mm auto; margin: 0; } body { width: 80mm; margin: 0; padding: 4mm; font-family: Cairo, 'Segoe UI', Tahoma, sans-serif; direction: rtl; }`
      : `@page { size: ${paperSize} ${orientation}; margin: ${margins === 'none' ? '0' : margins === 'minimal' ? '5mm' : '10mm'}; } body { margin: 0; font-family: Cairo, 'Segoe UI', Tahoma, sans-serif; direction: rtl; }`;

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>code systems - طباعة مستند</title>
  <style>
    * { box-sizing: border-box; }
    ${pageCss}
    body {
      background: #ffffff;
      color: #111827;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .font-mono { font-family: 'Consolas', 'Courier New', monospace; font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e7eb; padding: 6px; text-align: right; }
    th { background: #f3f4f6; font-weight: bold; }
    .no-print { display: none !important; }
  </style>
</head>
<body class="${colorMode === 'grayscale' ? 'grayscale' : ''}">
  ${content}
</body>
</html>`;
  };

  // Direct Silent Print without native Windows dialog
  const handlePrint = async () => {
    setPrintStatus(null);
    setIsPrinting(true);

    try {
      const html = getDocumentHtml();

      // Electron Silent Print
      if (typeof window !== 'undefined' && window.electronAPI?.printHtml) {
        const res = await window.electronAPI.printHtml({
          html,
          deviceName: selectedPrinter || undefined,
          pageSize: paperSize,
          landscape: orientation === 'landscape',
          margins,
          copies: Number(copies) || 1,
          printBackground: true
        });

        if (res && res.success) {
          setPrintStatus({ type: 'success', text: 'تم إرسال المستند للطابعة بنجاح' });
        } else {
          setPrintStatus({ type: 'error', text: res?.error || 'فشلت الطباعة، تأكد من اتصال الطابعة' });
        }
      } else {
        // Browser fallback: window.print()
        window.print();
        setPrintStatus({ type: 'success', text: 'تم فتح نافذة الطباعة' });
      }
    } catch (err) {
      console.error('Print execution failed:', err);
      setPrintStatus({ type: 'error', text: 'فشلت الطباعة، تأكد من اتصال الطابعة' });
    } finally {
      setIsPrinting(false);
    }
  };

  // Save Document directly as PDF
  const handleSavePdf = async () => {
    setPrintStatus(null);
    setIsSavingPdf(true);

    try {
      const html = getDocumentHtml();
      const defaultFilename = `${docType}-${docId || 'document'}.pdf`;

      if (typeof window !== 'undefined' && window.electronAPI?.savePdf) {
        const res = await window.electronAPI.savePdf({
          html,
          filename: defaultFilename,
          pageSize: paperSize,
          landscape: orientation === 'landscape'
        });

        if (res && res.success) {
          setPrintStatus({ type: 'success', text: 'تم حفظ ملف PDF بنجاح' });
        } else if (!res?.canceled) {
          setPrintStatus({ type: 'error', text: res?.error || 'فشل حفظ ملف PDF' });
        }
      } else {
        // Browser fallback
        window.print();
      }
    } catch (err) {
      console.error('Save PDF failed:', err);
      setPrintStatus({ type: 'error', text: 'حدث خطأ أثناء حفظ ملف PDF' });
    } finally {
      setIsSavingPdf(false);
    }
  };

  // Dimensions of Preview Frame
  const frameWidthStyle = useMemo(() => {
    if (paperSize === '80mm') return 'w-[320px]';
    if (paperSize === 'A5') return orientation === 'landscape' ? 'w-[793px]' : 'w-[559px]';
    // A4
    return orientation === 'landscape' ? 'w-[1123px]' : 'w-[794px]';
  }, [paperSize, orientation]);

  // Document Content Renderer
  const renderDocumentContent = () => {
    const isCustomer = docType === 'customer_receipt';
    const isSupplierPay = docType === 'supplier_payment';
    const isReceiptOrPayment = isCustomer || isSupplierPay;

    // Header Logo and Company Info
    const companyName = settings?.factory_name || 'code systems';
    const companyLogo = settings?.company_logo; // Data URL or valid path

    if (isReceiptOrPayment && documentData) {
      const rec = documentData;
      const docTitle = isCustomer ? 'سند استلام نقدية عميل' : 'سند صرف دفعة مورد';
      const docNumber = isCustomer ? (rec.receipt_number || rec.code || '---') : (rec.payment_number || rec.code || '---');
      const partyName = isCustomer ? (rec.customer_name || rec.party_name || 'العميل') : (rec.supplier_name || rec.party_name || 'المورد');
      const partyCode = isCustomer ? rec.customer_code : rec.supplier_code;

      return (
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-5">
            <div className="flex items-center gap-4">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt=""
                  className="h-16 w-auto max-w-[130px] object-contain rounded"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div>
                <h2 className="text-2xl font-bold text-[#1F3A5F]">{companyName}</h2>
                {settings?.address && <p className="text-xs text-slate-600 mt-1">{settings.address}</p>}
                {settings?.phone && <p className="text-xs text-slate-600">هاتف: <span className="font-mono">{settings.phone}</span></p>}
              </div>
            </div>

            <div className="text-left">
              <span className={`inline-block px-3 py-1 text-white font-bold text-sm rounded mb-2 ${isCustomer ? 'bg-emerald-700' : 'bg-blue-800'}`}>
                {docTitle}
              </span>
              <div className="text-xs text-slate-600 font-bold">
                رقم السند: <span className="font-mono text-slate-900">{docNumber}</span>
              </div>
              <div className="text-xs text-slate-600 font-bold mt-1">
                التاريخ: <span className="font-mono">{formatDate(rec.payment_date || rec.created_at)}</span>
              </div>
              <div className="text-xs text-slate-600 font-bold mt-1">
                طريقة الدفع: <span className="text-slate-900">{rec.payment_method || 'نقداً'}</span>
              </div>
            </div>
          </div>

          {/* Details Box */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 text-xs font-bold">
            <div>
              <span className="text-slate-500 block mb-1">
                {isCustomer ? 'استلمنا من السيد / السادة:' : 'صرفنا إلى السيد / السادة:'}
              </span>
              <span className="text-sm font-bold text-slate-900 block">
                {partyName} {partyCode ? `[${partyCode}]` : ''}
              </span>
            </div>

            <div className="text-left">
              <span className="text-slate-500 block mb-1">
                {isCustomer ? 'الخزينة المودع بها:' : 'الخزينة المنصرف منها:'}
              </span>
              <span className="text-sm font-bold text-slate-900 block">
                {rec.account_name || 'الخزينة الرئيسية'}
              </span>
            </div>
          </div>

          {/* Amount Box */}
          <div className="p-6 bg-blue-50/50 border border-blue-200 rounded-xl text-center space-y-1">
            <span className="text-xs font-bold text-slate-600 block">
              {isCustomer ? 'المبلغ المستلم وقدره:' : 'المبلغ المصروف وقدره:'}
            </span>
            <span className="text-3xl font-bold font-mono text-[#1F3A5F] block">
              {formatCurrency(rec.amount || 0)}
            </span>
          </div>

          {rec.notes && (
            <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-xs">
              <span className="font-bold text-slate-500 block mb-0.5">البيان والملاحظات:</span>
              <p className="text-slate-800 font-medium">{rec.notes}</p>
            </div>
          )}

          {/* Signatures Matching Specification (Requirement 9) */}
          <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs font-bold text-slate-700">
            <div className="space-y-8">
              <span className="block">
                {isCustomer ? 'المسلِّم / العميل' : 'المستلم / المورد'}
              </span>
              <div className="border-b border-slate-400 w-32 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span className="block">المحاسب المسؤول</span>
              <div className="border-b border-slate-400 w-32 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span className="block">أمين الخزينة</span>
              <div className="border-b border-slate-400 w-32 mx-auto"></div>
            </div>
          </div>
        </div>
      );
    }

    // 4. Report Document View
    if (docType === 'report' && documentData) {
      const repTitle = documentData.reportTitle || 'تقرير النظام';
      const rows = Array.isArray(documentData.data) ? documentData.data : [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return (
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
          <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-4">
            <div className="flex items-center gap-3">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt=""
                  className="h-14 w-auto max-w-[120px] object-contain rounded"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div>
                <h2 className="text-xl font-bold text-[#1F3A5F]">{companyName}</h2>
                <p className="text-xs text-slate-500">{settings?.address || 'جمهورية مصر العربية'}</p>
              </div>
            </div>
            <div className="text-left">
              <span className="px-3 py-1 bg-[#1F3A5F] text-white font-bold text-xs rounded">
                {repTitle}
              </span>
              <div className="text-xs text-slate-500 font-mono mt-1">{formatDate(new Date().toISOString())}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border border-slate-200 text-center w-12 font-bold">#</th>
                  {columns.map((col) => (
                    <th key={col} className="p-2 border border-slate-200 font-bold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 border border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                    {columns.map((col) => (
                      <td key={col} className="p-2 border border-slate-200 font-mono">
                        {String(row[col] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // 5. Stock Card View
    if (docType === 'stock_card' && documentData) {
      const item = documentData.item || {};
      const movements = Array.isArray(documentData.movements) ? documentData.movements : [];

      return (
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
          <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-4">
            <div className="flex items-center gap-3">
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt=""
                  className="h-14 w-auto max-w-[120px] object-contain rounded"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div>
                <h2 className="text-xl font-bold text-[#1F3A5F]">{companyName}</h2>
                <p className="text-xs text-slate-500">{settings?.address || 'جمهورية مصر العربية'}</p>
              </div>
            </div>
            <div className="text-left">
              <span className="px-3 py-1 bg-[#1F3A5F] text-white font-bold text-xs rounded">
                كارت حركة الصنف
              </span>
              <div className="text-xs text-slate-500 font-mono mt-1">{formatDate(new Date().toISOString())}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs font-bold">
            <div>
              <span className="text-slate-500 block">كود الصنف:</span>
              <span className="font-mono text-sm text-slate-900">{item.code || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">اسم الصنف:</span>
              <span className="text-sm text-slate-900">{item.name || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 block">الرصيد الفعلي الحالي:</span>
              <span className="font-mono text-sm text-blue-700">{formatNumber(documentData.currentStock ?? 0)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border border-slate-200 font-bold">التاريخ</th>
                  <th className="p-2 border border-slate-200 font-bold">نوع الحركة</th>
                  <th className="p-2 border border-slate-200 font-bold">رقم المستند</th>
                  <th className="p-2 border border-slate-200 font-bold text-center">الوارد</th>
                  <th className="p-2 border border-slate-200 font-bold text-center">المنصرف</th>
                  <th className="p-2 border border-slate-200 font-bold text-center">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m, idx) => (
                  <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 border border-slate-200 font-mono">{formatDate(m.date)}</td>
                    <td className="p-2 border border-slate-200">{m.movement_type_ar || m.type}</td>
                    <td className="p-2 border border-slate-200 font-mono">{m.document_number || '-'}</td>
                    <td className="p-2 border border-slate-200 text-center font-mono text-emerald-700">{m.quantity_in > 0 ? formatNumber(m.quantity_in) : '-'}</td>
                    <td className="p-2 border border-slate-200 text-center font-mono text-rose-700">{m.quantity_out > 0 ? formatNumber(m.quantity_out) : '-'}</td>
                    <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-900">{formatNumber(m.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Default Fallback Document View
    return (
      <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
        <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-4">
          <div className="flex items-center gap-3">
            {companyLogo && (
              <img
                src={companyLogo}
                alt=""
                className="h-14 w-auto max-w-[120px] object-contain rounded"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div>
              <h2 className="text-xl font-bold text-[#1F3A5F]">{companyName}</h2>
              <p className="text-xs text-slate-500">{settings?.address || 'جمهورية مصر العربية'}</p>
            </div>
          </div>
          <div className="text-left">
            <span className="px-3 py-1 bg-[#1F3A5F] text-white font-bold text-xs rounded">
              مستند معتمد
            </span>
            <div className="text-xs text-slate-500 font-mono mt-1">{formatDate(new Date().toISOString())}</div>
          </div>
        </div>

        <div className="py-6">
          <p className="text-sm font-bold text-slate-800">
            معاينة المستند جاهزة للطباعة والتصدير.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs font-bold text-slate-600">
          <div className="space-y-6">
            <span>توقيع المسؤول</span>
            <div className="border-b border-slate-300 w-28 mx-auto"></div>
          </div>
          <div className="space-y-6">
            <span>المحاسب المسؤول</span>
            <div className="border-b border-slate-300 w-28 mx-auto"></div>
          </div>
          <div className="space-y-6">
            <span>الاعتماد الإداري</span>
            <div className="border-b border-slate-300 w-28 mx-auto"></div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-800 text-slate-100 flex flex-col select-none" dir="rtl">
      {/* Top Header Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-700 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="رجوع للشاشة السابقة"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع</span>
          </button>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-blue-400" />
            <h1 className="text-sm font-bold text-white">معاينة الطباعة وإعدادات الطابعة</h1>
          </div>
        </div>

        {/* Zoom & Page Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.max(50, prev - 10))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white cursor-pointer"
              title="تصغير"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-200">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white cursor-pointer"
              title="تكبير"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white cursor-pointer ml-1"
              title="الحجم الأصلي 100%"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Work Area: Preview Frame (Center) + Settings Panel (Side) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Document Preview Canvas */}
        <main className="flex-1 bg-slate-800 p-6 overflow-auto flex items-center justify-center">
          {loading ? (
            <div className="text-center font-bold text-slate-400 text-sm">
              جاري تجهيز المستند ومعاينة الطباعة...
            </div>
          ) : loadError ? (
            <div className="text-center text-rose-400 text-sm font-bold">
              {loadError}
            </div>
          ) : (
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              className="transition-transform duration-150"
            >
              <div
                ref={printFrameRef}
                className={`${frameWidthStyle} min-h-[500px] bg-white shadow-2xl rounded-sm border border-slate-300 overflow-hidden text-slate-900 ${
                  colorMode === 'grayscale' ? 'grayscale' : ''
                }`}
              >
                {renderDocumentContent()}
              </div>
            </div>
          )}
        </main>

        {/* Right Settings Panel (Arabic) */}
        <aside className="w-80 bg-slate-900 border-r border-slate-700 p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
          <div className="space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <SettingsIcon className="w-4 h-4 text-blue-400" />
              <h2 className="text-xs font-bold text-slate-200">خيارات وإعدادات الطباعة</h2>
            </div>

            {/* Status alerts */}
            {printStatus && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  printStatus.type === 'success'
                    ? 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                    : 'bg-rose-950/80 border border-rose-700 text-rose-300'
                }`}
              >
                {printStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{printStatus.text}</span>
              </div>
            )}

            {/* 1. Printer Select */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الطابعة المحددة
              </label>
              {printers.length === 0 ? (
                <div className="p-3 bg-slate-800 rounded-lg text-[11px] text-amber-400 font-semibold border border-amber-500/30">
                  لم يتم اكتشاف طابعات متصلة. يمكنك استخدام «حفظ PDF» لتصدير الملف.
                </div>
              ) : (
                <select
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:border-blue-500"
                >
                  {printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.displayName || p.name} {p.isDefault ? '(الافتراضية)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 2. Paper Size */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                قياس الورق
              </label>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:border-blue-500"
              >
                <option value="A4">A4 (ورق قياسي كامل 210 × 297 مم)</option>
                <option value="A5">A5 (نصف صفحة 148 × 210 مم)</option>
                <option value="80mm">إيصال طباعة حرارية (80 مم)</option>
              </select>
            </div>

            {/* 3. Orientation */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الاتجاه
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    orientation === 'portrait'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  رأسي (Portrait)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  أفقي (Landscape)
                </button>
              </div>
            </div>

            {/* 4. Copies & Margins */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  عدد النسخ
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  الهوامش
                </label>
                <select
                  value={margins}
                  onChange={(e) => setMargins(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white"
                >
                  <option value="default">عادي</option>
                  <option value="minimal">ضيق</option>
                  <option value="none">بدون هوامش</option>
                </select>
              </div>
            </div>

            {/* 5. Color Mode */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                نمط الألوان
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setColorMode('color')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    colorMode === 'color'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  ألوان
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('grayscale')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    colorMode === 'grayscale'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  أبيض وأسود
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-6 space-y-2.5 border-t border-slate-800 mt-6">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'جاري إرسال الأمر للطابعة...' : 'طباعة المستند مباشرة'}</span>
            </button>

            <button
              type="button"
              onClick={handleSavePdf}
              disabled={isSavingPdf}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isSavingPdf ? 'جاري حفظ الملف...' : 'حفظ كملف PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleBack}
              className="w-full py-2 text-slate-400 hover:text-white text-xs font-bold transition-colors cursor-pointer text-center"
            >
              رجوع دون طباعة
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
