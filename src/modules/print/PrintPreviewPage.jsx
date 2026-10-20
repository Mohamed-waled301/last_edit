import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Printer, 
  Download, 
  ArrowRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Settings as SettingsIcon, 
  CheckCircle2, 
  AlertCircle, 
  Building2,
  FileText,
  Scissors,
  User,
  Calendar,
  CreditCard,
  MapPin,
  Phone,
  Hash
} from 'lucide-react';
import { api } from '../../services/api';
import db from '../../data/db';
import { salesRepo, suppliersRepo, partiesRepo, manufacturingRepo, itemsRepo, reportsRepo } from '../../data';
import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { generatePurchaseInvoiceHtml, generateSalesInvoiceHtml, generateCutOrderHtml, DEFAULT_CUT_ORDER_PRINT_OPTIONS } from './invoicePrintTemplates';
import { calculateStatementSummaryCards } from '../../logic/statementSummaryCards';

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

  const docType = params.get('type') || 'invoice'; // 'sales_invoice' | 'sales_invoice_thermal' | 'purchase_invoice' | 'purchase_invoice_thermal' | 'purchase_order' | 'invoice' | 'customer_receipt' | 'supplier_payment' | 'statement' | 'cut_order' | 'report' | 'stock_card'
  const docId = params.get('id');
  const returnUrl = params.get('returnUrl');
  const paperParam = params.get('paper');
  const isCutOrder = ['cut_order', 'production_order', 'cutting', 'cutting_order'].includes(docType);

  const [settings, setSettings] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Printers & Print Settings
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const initialPaperSize = paperParam
    ? (paperParam === '80mm' ? '80mm' : 'A4')
    : (docType === 'sales_invoice_thermal' || docType === 'purchase_invoice_thermal' ? '80mm' : 'A4');
  const [paperSize, setPaperSize] = useState(initialPaperSize);
  const [orientation, setOrientation] = useState('portrait'); // 'portrait' | 'landscape'
  const [margins, setMargins] = useState(docType === 'sales_invoice_thermal' ? 'none' : 'default'); // 'default' | 'minimal' | 'none'
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('color'); // 'color' | 'grayscale'
  const [zoomLevel, setZoomLevel] = useState(100); // 50 to 150
  const [cutOrderPrintOptions, setCutOrderPrintOptions] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_cut_order_print_options');
      if (saved) return { ...DEFAULT_CUT_ORDER_PRINT_OPTIONS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULT_CUT_ORDER_PRINT_OPTIONS };
  });

  const handleToggleCutOrderOption = (key, checked) => {
    setCutOrderPrintOptions(prev => {
      const updated = { ...prev, [key]: checked };
      try {
        localStorage.setItem('erp_cut_order_print_options', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const [showAccountBalance, setShowAccountBalance] = useState(() => {
    try {
      return localStorage.getItem('erp_print_show_account_balances') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleShowAccountBalance = (checked) => {
    setShowAccountBalance(checked);
    try {
      localStorage.setItem('erp_print_show_account_balances', String(checked));
    } catch {
      // ignore
    }
  };

  // Status messages
  const [printStatus, setPrintStatus] = useState(null); // { type: 'success' | 'error', text: '' }
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  const printFrameRef = useRef(null);

  // Sync default margin when paper size changes
  useEffect(() => {
    if (paperSize === '80mm') {
      setMargins('none');
      setOrientation('portrait');
    } else if (margins === 'none' && paperSize !== '80mm') {
      setMargins('default');
    }
  }, [paperSize]);

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

        // 1. Check custom payload from sessionStorage if present
        if (typeof window !== 'undefined') {
          const storedPayload = sessionStorage.getItem('print_preview_payload');
          if (storedPayload) {
            try {
              const parsed = JSON.parse(storedPayload);
              if (parsed) {
                const matchesId = !docId ||
                  String(parsed.id) === String(docId) ||
                  String(parsed.item?.id) === String(docId) ||
                  String(parsed.cutting_number) === String(docId) ||
                  String(parsed.order_number) === String(docId) ||
                  String(parsed.invoice_number) === String(docId) ||
                  String(parsed.po_number) === String(docId) ||
                  String(parsed.receipt_number) === String(docId) ||
                  String(parsed.payment_number) === String(docId) ||
                  String(parsed.reportKey) === String(docId);

                const payloadIsCut = isCutOrder || parsed.type === 'cut_order' || Boolean(parsed.matrix) || Boolean(parsed.cutting_number);
                const payloadIsSales = (docType === 'sales_invoice' || docType === 'invoice' || docType === 'sales_invoice_thermal') &&
                  (parsed.type === 'sales_invoice' || parsed.type === 'sales_invoice_thermal' || parsed.type === 'invoice');
                const payloadIsPurchase = (docType === 'purchase_invoice' || docType === 'purchase_order' || docType === 'purchase_invoice_thermal') &&
                  (parsed.type === 'purchase_invoice' || parsed.type === 'purchase_invoice_thermal' || parsed.type === 'purchase_order');
                const payloadIsReport = (docType === 'report' || parsed.type === 'report' || Boolean(parsed.reportKey));

                // If it is a report with empty data, don't return early; query DB to prevent false negative
                const reportHasData = !payloadIsReport || (Array.isArray(parsed.data) && parsed.data.length > 0);
                if (matchesId && reportHasData && (!docType || parsed.type === docType || (isCutOrder && payloadIsCut) || payloadIsSales || payloadIsPurchase || payloadIsReport)) {
                  setDocumentData(parsed);
                  if (parsed.paperSize) setPaperSize(parsed.paperSize);
                  setLoading(false);
                  return;
                }
              }
            } catch (err) {
              console.warn('Failed to parse sessionStorage payload:', err);
            }
          }
        }

        // 2. Persistent storage retrieval based on docType and docId
        if (docType === 'sales_invoice' || docType === 'invoice' || docType === 'sales_invoice_thermal') {
          let found = null;
          if (docId) {
            try {
              const sRes = await api.getSalesInvoice(docId);
              found = sRes?.data || sRes?.invoice || sRes;
            } catch {}
            if (!found) {
              try {
                found = await salesRepo.getSalesInvoice(docId);
              } catch {}
            }
            if (!found) {
              try {
                const res = await api.getSalesInvoices();
                const invoices = Array.isArray(res.data) ? res.data : (res.invoices || (Array.isArray(res) ? res : []));
                found = invoices.find(i => String(i.id) === String(docId) || String(i.invoice_number) === String(docId));
              } catch {}
            }
          }
          if (!found) {
            setDocumentData(null);
            setLoadError(docId ? `لم يتم العثور على فاتورة المبيعات برقم / كود: ${docId}` : 'لم يتم تحديد رقم فاتورة المبيعات للطباعة.');
          } else {
            setDocumentData(found);
          }
        } else if (docType === 'purchase_invoice' || docType === 'purchase_order' || docType === 'purchase_invoice_thermal') {
          let found = null;
          if (docId) {
            try {
              const poRes = await api.getPurchaseOrder(docId);
              found = poRes?.data || poRes?.purchase_order || poRes;
            } catch {}
            if (!found) {
              try {
                found = await suppliersRepo.getPurchaseOrder(docId);
              } catch {}
            }
            if (!found) {
              try {
                const res = await api.getPurchaseOrders();
                const orders = Array.isArray(res.data) ? res.data : (res.purchase_orders || (Array.isArray(res) ? res : []));
                found = orders.find(o => String(o.id) === String(docId) || String(o.po_number) === String(docId));
              } catch {}
            }
          }
          if (!found) {
            setDocumentData(null);
            setLoadError(docId ? `لم يتم العثور على فاتورة / أمر الشراء برقم: ${docId}` : 'لم يتم تحديد رقم أمر الشراء للطباعة.');
          } else {
            setDocumentData(found);
          }
        } else if (docType === 'customer_receipt') {
          let found = null;
          if (docId) {
            try {
              const recRes = await api.getCustomerReceipt(docId);
              found = recRes?.data || recRes?.receipt || recRes;
            } catch {}
            if (!found) {
              try {
                const res = await api.getCustomerReceipts();
                const receipts = Array.isArray(res.data) ? res.data : (res.receipts || []);
                found = receipts.find(r => String(r.id) === String(docId) || String(r.receipt_number) === String(docId));
              } catch {}
            }
          }
          if (!found) {
            setDocumentData(null);
            setLoadError(docId ? `لم يتم العثور على سند قبض العميل برقم: ${docId}` : 'لم يتم تحديد رقم سند القبض للطباعة.');
          } else {
            setDocumentData(found);
          }
        } else if (docType === 'supplier_payment') {
          let found = null;
          if (docId) {
            try {
              const payRes = await api.getSupplierPayment(docId);
              found = payRes?.data || payRes?.payment || payRes;
            } catch {}
            if (!found) {
              try {
                const res = await api.getSupplierPayments();
                const payments = Array.isArray(res.data) ? res.data : (res.payments || []);
                found = payments.find(p => String(p.id) === String(docId) || String(p.payment_number) === String(docId));
              } catch {}
            }
          }
          if (!found) {
            setDocumentData(null);
            setLoadError(docId ? `لم يتم العثور على سند صرف المورد برقم: ${docId}` : 'لم يتم تحديد رقم سند الصرف للطباعة.');
          } else {
            setDocumentData(found);
          }
        } else if (docType === 'statement') {
          if (!docId) {
            setDocumentData(null);
            setLoadError('لم يتم تحديد كود أو معرف جهة التعامل لعرض كشف الحساب.');
          } else {
            let party = null;
            try {
              const pRes = await api.getParty(docId);
              party = pRes?.data || pRes?.party || pRes;
            } catch {}
            if (!party) {
              try {
                party = await partiesRepo.getById(docId);
              } catch {}
            }
            if (!party && db.customers) {
              const cust = await db.customers.get(docId);
              if (cust) party = { ...cust, is_customer: 1, is_supplier: 0 };
            }
            if (!party && db.suppliers) {
              const sup = await db.suppliers.get(docId);
              if (sup) party = { ...sup, is_customer: 0, is_supplier: 1 };
            }

            if (!party) {
              setDocumentData(null);
              setLoadError(`لم يتم العثور على بيانات جهة التعامل برقم: ${docId}`);
            } else {
              let stmtRes = null;
              if (party.is_customer && !party.is_supplier) {
                stmtRes = await api.getCustomerStatement(docId).catch(() => null);
              } else {
                stmtRes = await api.getSupplierStatement(docId).catch(() => null);
                if (!stmtRes && party.is_customer) {
                  stmtRes = await api.getCustomerStatement(docId).catch(() => null);
                }
              }
              const statementData = stmtRes?.data || stmtRes?.statement || stmtRes || null;
              setDocumentData({
                statementData,
                party
              });
            }
          }
        } else if (isCutOrder) {
          let found = null;
          if (docId) {
            try {
              const sRes = await api.getProductionOrder(docId);
              found = sRes?.data || sRes?.order || sRes;
            } catch {}
            if (!found && manufacturingRepo.getProductionOrder) {
              try {
                found = await manufacturingRepo.getProductionOrder(docId);
              } catch {}
            }
            if (!found && db.production_orders) {
              try {
                found = await db.production_orders.get(docId);
                if (!found && !isNaN(Number(docId))) {
                  found = await db.production_orders.get(Number(docId));
                }
                if (!found) {
                  found = await db.production_orders.where('cutting_number').equals(String(docId)).first();
                }
                if (!found) {
                  found = await db.production_orders.where('order_number').equals(String(docId)).first();
                }
              } catch {}
            }
          }
          if (!found) {
            setDocumentData(null);
            setLoadError(docId ? `لم يتم العثور على أمر القص والتشغيل برقم: ${docId}` : 'لم يتم تحديد رقم أمر التشغيل للطباعة.');
          } else {
            setDocumentData(found);
          }
        } else if (docType === 'stock_card') {
          if (!docId) {
            setDocumentData(null);
            setLoadError('لم يتم تحديد كود الصنف لعرض كارت الصنف المخزني.');
          } else {
            let cardRes = null;
            try {
              cardRes = await api.getItemStockCard(docId);
            } catch {}
            let cardData = cardRes?.data || cardRes;
            let itm = null;
            if (db.items) itm = await db.items.get(docId).catch(() => null);
            if (!itm && db.materials) itm = await db.materials.get(docId).catch(() => null);
            if (!itm && db.products) itm = await db.products.get(docId).catch(() => null);
            if (!itm) itm = cardData?.item;

            if (!cardData && !itm) {
              setDocumentData(null);
              setLoadError(`لم يتم العثور على بيانات الصنف برقم: ${docId}`);
            } else {
              const rawEntries = cardData?.entries || cardData?.movements || [];
              let running = 0;
              const formattedMovements = rawEntries.map((entry) => {
                const qIn = Number(entry.quantity_in || entry.qty_in || 0);
                const qOut = Number(entry.quantity_out || entry.qty_out || 0);
                if (entry.running_balance !== undefined && entry.running_balance !== null) {
                  running = Number(entry.running_balance);
                } else {
                  running += qIn - qOut;
                }
                return {
                  date: entry.date,
                  movement_type_ar: entry.movement_type_ar || entry.movement_type,
                  type: entry.movement_type,
                  document_number: entry.document_id || entry.reference_id || entry.document_number || '-',
                  quantity_in: qIn,
                  quantity_out: qOut,
                  running_balance: running,
                  notes: entry.notes || '-'
                };
              });

              setDocumentData({
                type: 'stock_card',
                id: docId,
                item: itm || { id: docId, name: 'الصنف', code: '', unit: 'قطعة' },
                movements: formattedMovements,
                currentStock: cardData?.closing_balance ?? cardData?.current_balance ?? itm?.actual_balance ?? itm?.current_stock ?? running,
                totalIn: cardData?.total_in ?? 0,
                totalOut: cardData?.total_out ?? 0,
                openingBalance: cardData?.opening_balance ?? 0
              });
            }
          }
        } else if (docType === 'report') {
          let reportTitle = 'تقرير النظام المالي والإداري';
          let reportRows = [];

          if (docId === 'sales-invoices' || docId === 'sales' || docId === 'daily-sales' || docId === 'sales-by-customer') {
            reportTitle = 'تقرير فواتير المبيعات وتجميع مبيعات العملاء';
            try {
              const sRep = await salesRepo.getSalesReport();
              reportRows = Array.isArray(sRep?.customers) ? sRep.customers : (Array.isArray(sRep) ? sRep : []);
            } catch {
              const invoices = await db.sales_invoices.toArray().catch(() => []);
              reportRows = invoices;
            }
          } else if (docId === 'customer-statements') {
            reportTitle = 'تقرير أرصدة ومستحقات العملاء';
            try {
              const [parties, salesInvoices, custPayments, returns, settlements] = await Promise.all([
                db.parties.filter(p => p.is_customer === 1).toArray(),
                db.sales_invoices.toArray(),
                db.customer_payments.toArray(),
                db.customer_returns.toArray(),
                db.party_settlements ? db.party_settlements.toArray().catch(() => []) : Promise.resolve([])
              ]);
              reportRows = parties.map(p => {
                const pInvs = (Array.isArray(salesInvoices) ? salesInvoices : []).filter(i => i.customer_id === p.id && i.status !== 'cancelled');
                const totSales = pInvs.reduce((s, i) => s + (Number(i.total_invoice_amount ?? i.total_amount) || 0), 0);
                const pPays = (Array.isArray(custPayments) ? custPayments : []).filter(cp => cp.customer_id === p.id && cp.status !== 'cancelled');
                const totPaid = pPays.reduce((s, cp) => s + (Number(cp.amount) || 0), 0);
                return {
                  code: p.code || '---',
                  name: p.name || 'عميل',
                  phone: p.phone || '',
                  address: p.address || '',
                  tax_number: p.tax_number || '',
                  total_sales: totSales,
                  total_paid: totPaid,
                  balance_due: p.customer_balance ?? p.balance_due ?? (totSales - totPaid),
                  credit_limit: p.credit_limit || 0
                };
              });
            } catch {
              const parties = await partiesRepo.getAll();
              reportRows = (Array.isArray(parties) ? parties : []).filter(p => p.is_customer === 1);
            }
          } else if (docId === 'supplier-statements') {
            reportTitle = 'تقرير أرصدة ومديونيات الموردين والورش';
            try {
              const [parties, supInvoices, payments, returns] = await Promise.all([
                db.parties.filter(p => p.is_supplier === 1).toArray(),
                db.supplier_invoices.toArray(),
                db.payments.toArray(),
                db.supplier_returns.toArray()
              ]);
              reportRows = parties.map(p => {
                const pInvs = (Array.isArray(supInvoices) ? supInvoices : []).filter(i => i.supplier_id === p.id && i.status !== 'cancelled');
                const totPurchases = pInvs.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
                const pPays = (Array.isArray(payments) ? payments : []).filter(pm => pm.supplier_id === p.id && pm.status !== 'cancelled');
                const totPaid = pPays.reduce((s, pm) => s + (Number(pm.amount) || 0), 0);
                const supTypeDisplay = p.supplier_type === 'goods' ? 'توريد خامات' : p.supplier_type === 'service' ? 'خدمات وتشغيل' : (p.supplier_type || 'مورد عام');
                const rowObj = {
                  code: p.code || '---',
                  name: p.name || 'مورد',
                  supplier_type: supTypeDisplay,
                  phone: p.phone || '',
                  total_purchases: totPurchases,
                  total_paid: totPaid,
                  balance_due: p.supplier_balance ?? p.balance_due ?? (totPurchases - totPaid)
                };
                if (p.address && String(p.address).trim()) rowObj.address = p.address;
                if (p.tax_number && String(p.tax_number).trim()) rowObj.tax_number = p.tax_number;
                return rowObj;
              });
            } catch {
              const parties = await partiesRepo.getAll();
              reportRows = (Array.isArray(parties) ? parties : []).filter(p => p.is_supplier === 1);
            }
          } else if (docId === 'purchase-orders') {
            reportTitle = 'تقرير فواتير وأوامر الشراء والتوريد';
            const orders = await suppliersRepo.getPurchaseOrders();
            reportRows = (Array.isArray(orders) ? orders : []).map(o => ({
              po_number: o.po_number || '---',
              supplier_name: o.supplier_name || 'مورد عام',
              order_date: o.order_date || o.created_at?.split('T')[0],
              payment_terms: o.payment_terms === 'credit' ? 'آجل' : 'نقدي',
              subtotal: Number(o.subtotal) || 0,
              discount_value: Number(o.discount_value) || 0,
              total_amount: Number(o.total_amount ?? o.grand_total) || 0,
              status: o.status === 'ordered' ? 'قيد التوريد' : o.status === 'received' ? 'تم الاستلام' : o.status === 'cancelled' ? 'ملغي' : (o.status || 'معتمد')
            }));
          } else if (docId === 'goods-receipts') {
            reportTitle = 'تقرير أذون الاستلام المخزني';
            const receipts = await suppliersRepo.getGoodsReceipts();
            reportRows = (Array.isArray(receipts) ? receipts : []).map(r => ({
              grn_number: r.grn_number || '---',
              po_id: r.po_id || '---',
              supplier_name: r.supplier_name || 'مورد عام',
              receipt_date: r.receipt_date || r.created_at?.split('T')[0],
              receiver_name: r.receiver_name || 'أمين المخزن',
              notes: r.notes || 'استلام بضاعة'
            }));
          } else if (docId === 'stock-adjustments') {
            reportTitle = 'تقرير التسويات الجردية المخزنية';
            reportRows = await db.stock_adjustments.toArray().catch(() => []);
          } else if (docId === 'installments-due') {
            reportTitle = 'تقرير الأقساط المستحقة للموردين';
            reportRows = await suppliersRepo.getDueInstallments();
          } else if (docId === 'returns') {
            reportTitle = 'تقرير المرتجعات (مبيعات ومشتريات)';
            const [cRet, sRet] = await Promise.all([
              db.customer_returns.toArray().catch(() => []),
              db.supplier_returns.toArray().catch(() => [])
            ]);
            reportRows = [
              ...cRet.map(r => ({ ...r, return_type: 'مرتجع مبيعات' })),
              ...sRet.map(r => ({ ...r, return_type: 'مرتجع مشتريات' }))
            ];
          } else if (docId === 'dual-netting') {
            reportTitle = 'تقرير صافي المركز المالي والمقاصة للجهات المشتركة';
            const parties = await partiesRepo.getAll();
            reportRows = (Array.isArray(parties) ? parties : []).filter(p => p.is_supplier === 1 && p.is_customer === 1);
          } else if (docId === 'invalid-phones') {
            reportTitle = 'تقرير أرقام الهواتف غير المطابقة لجهات التعامل';
            const parties = await db.parties.filter(p => p.is_active === 1).toArray().catch(() => []);
            reportRows = (Array.isArray(parties) ? parties : []).filter(p => !p.phone || !/^01[0125][0-9]{8}$/.test(String(p.phone).trim()));
          } else if (docId === 'production-orders') {
            reportTitle = 'تقرير أوامر التصنيع والقص والإنتاج التام';
            reportRows = await manufacturingRepo.getAll();
          } else if (docId === 'cut-order-stages') {
            reportTitle = 'تقرير مراحل القص والورش (المطابع والتطريز والحياكة)';
            const orders = await manufacturingRepo.getAll();
            const stageRows = [];
            for (const o of orders) {
              const stages = o.stages || {};
              for (const [stKey, st] of Object.entries(stages)) {
                if (st && (st.vendor_name || st.total_cost || st.fixed_total)) {
                  const title = stKey === 'printing' ? 'الطباعة' : stKey === 'embroidery' ? 'التطريز' : 'الحياكة والتجميع';
                  stageRows.push({
                    cutting_number: o.cutting_number || o.order_number,
                    cutting_name: o.cutting_name || o.product_name,
                    stage: title,
                    workshop_name: st.vendor_name || 'غير محدد',
                    stage_cost: Number(st.total_cost || st.fixed_total || 0),
                    paid: Number(st.paid || 0),
                    remaining: Math.max(0, (Number(st.total_cost || st.fixed_total || 0) - Number(st.paid || 0))),
                    status: o.status === 'closed' ? 'مقفل' : 'صادر'
                  });
                }
              }
            }
            reportRows = stageRows;
          } else if (docId === 'cut-production-by-size-color') {
            reportTitle = 'تقرير إنتاج القص حسب المقاس واللون';
            const orders = await manufacturingRepo.getAll();
            const rows = [];
            const SIZES = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];
            for (const o of orders) {
              const matrix = Array.isArray(o.matrix) ? o.matrix : [];
              if (matrix.length > 0) {
                for (const mRow of matrix) {
                  const qtyObj = mRow.quantities || {};
                  const rowTot = SIZES.reduce((s, sz) => s + (Number(qtyObj[sz]) || 0), 0);
                  if (rowTot > 0 || mRow.color) {
                    rows.push({
                      cutting_number: o.cutting_number || o.order_number,
                      cutting_name: o.cutting_name || o.product_name,
                      fabric_type: o.fabric_type || '---',
                      color: mRow.color || 'افتراضي',
                      row_total: rowTot,
                      date: o.start_date || o.created_at?.split('T')[0],
                      status: o.status === 'closed' ? 'مقفل' : 'صادر'
                    });
                  }
                }
              }
            }
            reportRows = rows;
          } else if (docId === 'disbursements-by-expense') {
            reportTitle = 'تقرير حركة الخزائن وصرف النقدية حسب كود المصروف';
            const txs = await db.cash_transactions.filter(t => t.tx_type === 'outflow' || t.type === 'expense').toArray().catch(() => []);
            const codes = await db.expense_codes.toArray().catch(() => []);
            const codeMap = new Map(codes.map(c => [c.id, c.name]));
            reportRows = txs.map(t => ({
              tx_number: t.tx_number || '---',
              expense_name: codeMap.get(t.expense_code_id) || t.category || 'مصروف عام',
              amount: Number(t.amount) || 0,
              date: t.date || t.created_at?.split('T')[0],
              description: t.description || 'صرف نقدي'
            }));
          } else if (docId === 'audit-log') {
            reportTitle = 'سجل الرقابة وتدقيق الحركات';
            reportRows = await auditRepo.getAll().catch(() => []);
          } else if (docId === 'cost-breakdown') {
            reportTitle = 'تقرير تفصيلي لتكاليف أوامر التشغيل والقص';
            const cb = await reportsRepo.getCostBreakdown();
            reportRows = cb?.breakdown || (Array.isArray(cb) ? cb : []);
          } else if (docId === 'profitability') {
            reportTitle = 'تقرير الربحية ومعدل العائد على المنتجات';
            const prof = await reportsRepo.getProfitability();
            reportRows = Array.isArray(prof) ? prof : [];
          } else if (docId === 'debt-aging') {
            reportTitle = 'تقرير أعمار الديون والمستحقات المالية';
            const da = await reportsRepo.getDebtAging();
            reportRows = Array.isArray(da?.supplierAging) ? da.supplierAging : (Array.isArray(da?.customerAging) ? da.customerAging : []);
          } else if (docId === 'items' || docId === 'low-stock' || docId === 'inventory-valuation') {
            reportTitle = docId === 'low-stock' ? 'تقرير نواقص ومستويات إعادة الطلب' : 'تقرير المخزون وأرصدة المستودعات';
            const items = await itemsRepo.getAll();
            reportRows = docId === 'low-stock' ? (Array.isArray(items) ? items : []).filter(i => (i.actual_balance ?? 0) <= (i.min_reorder_level ?? 0)) : (Array.isArray(items) ? items : []);
          }

          setDocumentData({
            type: 'report',
            reportKey: docId,
            reportTitle,
            data: reportRows
          });
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
      ? `@page { size: 80mm auto; margin: 0; }
         html, body {
           width: 80mm !important;
           max-width: 80mm !important;
           margin: 0 auto !important;
           padding: 2mm 3mm !important;
           font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
           direction: rtl;
           background: #ffffff !important;
           color: #000000 !important;
           -webkit-print-color-adjust: exact;
           print-color-adjust: exact;
         }`
      : `@page { size: ${paperSize} ${orientation}; margin: ${margins === 'none' ? '0' : margins === 'minimal' ? '5mm' : '10mm'}; }
         html, body {
           margin: 0 !important;
           padding: 0 !important;
           font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
           direction: rtl;
           background: #ffffff !important;
           color: #111827 !important;
           -webkit-print-color-adjust: exact;
           print-color-adjust: exact;
         }`;

    // Extract all stylesheets and style tags currently in document so Tailwind classes render
    const collectedStyles = typeof document !== 'undefined'
      ? Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map(node => node.outerHTML)
          .join('\n')
      : '';

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كود سيستمز - طباعة مستند</title>
  ${collectedStyles}
  <style>
    * { box-sizing: border-box; }
    ${pageCss}
    .font-mono { font-family: 'Consolas', 'Courier New', monospace; font-variant-numeric: tabular-nums; }
    table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; word-break: break-word; }
    th, td { word-break: break-word; overflow-wrap: break-word; }
    .no-print { display: none !important; }
    ${colorMode === 'grayscale' ? 'html, body { filter: grayscale(100%) !important; -webkit-filter: grayscale(100%) !important; }' : ''}
  </style>
</head>
<body class="${colorMode === 'grayscale' ? 'grayscale' : ''}">
  <div style="${isThermal ? 'width: 100%; max-width: 76mm; margin: 0 auto;' : 'width: 100%;'}">
    ${content}
  </div>
</body>
</html>`;
  };

  // Direct Silent Print
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
          setPrintStatus({ type: 'success', text: 'تم إرسال أمر الطباعة بنجاح' });
        } else {
          setPrintStatus({ type: 'error', text: res?.error || 'فشلت الطباعة، تأكد من توصيل الطابعة' });
        }
      } else {
        // Browser fallback: window.print()
        window.print();
        setPrintStatus({ type: 'success', text: 'تم فتح أمر الطباعة بنجاح' });
      }
    } catch (err) {
      console.error('Print execution failed:', err);
      setPrintStatus({ type: 'error', text: 'فشلت الطباعة، يرجى إعادة المحاولة' });
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
      const defaultFilename = `${docType}-${documentData?.invoice_number || documentData?.code || docId || 'document'}.pdf`;

      if (typeof window !== 'undefined' && window.electronAPI?.savePdf) {
        const res = await window.electronAPI.savePdf({
          html,
          filename: defaultFilename,
          pageSize: paperSize,
          landscape: orientation === 'landscape'
        });

        if (res && res.success) {
          setPrintStatus({ type: 'success', text: 'تم تصدير وحفظ الملف الإلكتروني بنجاح' });
        } else if (!res?.canceled) {
          setPrintStatus({ type: 'error', text: res?.error || 'فشل حفظ الملف الإلكتروني' });
        }
      } else {
        // Browser fallback
        window.print();
      }
    } catch (err) {
      console.error('Save PDF failed:', err);
      setPrintStatus({ type: 'error', text: 'حدث خطأ أثناء تصدير الملف الإلكتروني' });
    } finally {
      setIsSavingPdf(false);
    }
  };

  // Dimensions of Preview Frame
  const frameWidthStyle = useMemo(() => {
    if (paperSize === '80mm') return 'w-[320px] max-w-[320px]';
    if (paperSize === 'A5') return orientation === 'landscape' ? 'w-[793px] max-w-[793px]' : 'w-[559px] max-w-[559px]';
    // A4: 210mm x 297mm (794px x 1123px at 96 DPI)
    return orientation === 'landscape' ? 'w-[1123px] max-w-[1123px]' : 'w-[794px] max-w-[794px]';
  }, [paperSize, orientation]);

  // Document Content Renderer
  const renderDocumentContent = () => {
    const companyName = settings?.factory_name || 'code systems';
    const companyLogo = settings?.company_logo || '/logo.png';
    const isThermal = paperSize === '80mm';

    // 0. Purchase Invoice Rendering (Both 80mm Thermal and A4 Official)
    if (docType === 'purchase_invoice' || docType === 'purchase_order' || docType === 'purchase_invoice_thermal') {
      const po = documentData;
      if (!po) {
        return (
          <div className="p-8 text-center text-slate-500 font-bold">
            لم يتم العثور على أمر التوريد / فاتورة الشراء المطلوبة.
          </div>
        );
      }
      return (
        <div
          dangerouslySetInnerHTML={{
            __html: generatePurchaseInvoiceHtml(po, settings, paperSize, showAccountBalance)
          }}
        />
      );
    }

    // 1. Sales Invoice Rendering (Both 80mm Thermal and A4 Tax Invoice)
    if (docType === 'sales_invoice' || docType === 'invoice' || docType === 'sales_invoice_thermal') {
      const invoice = documentData;
      if (!invoice) {
        return (
          <div className="p-8 text-center text-slate-500 font-bold">
            لم يتم العثور على الفاتورة المطلوبة.
          </div>
        );
      }
      return (
        <div
          dangerouslySetInnerHTML={{
            __html: generateSalesInvoiceHtml(invoice, settings, paperSize, null, showAccountBalance)
          }}
        />
      );
    }

    // 2. Customer Receipt & Supplier Payment
    const isCustomer = docType === 'customer_receipt';
    const isSupplierPay = docType === 'supplier_payment';
    const isReceiptOrPayment = isCustomer || isSupplierPay;

    if (isReceiptOrPayment && documentData) {
      const rec = documentData;
      const docTitle = isCustomer ? 'سند استلام نقدية عميل' : 'سند صرف دفعة مورد';
      const docNumber = isCustomer ? (rec.receipt_number || rec.code || '---') : (rec.payment_number || rec.code || '---');
      const partyName = isCustomer ? (rec.customer_name || rec.party_name || 'العميل') : (rec.supplier_name || rec.party_name || 'المورد');
      const partyCode = isCustomer ? rec.customer_code : rec.supplier_code;

      // Thermal Receipt for voucher
      if (isThermal) {
        return (
          <div className="p-3 bg-white text-slate-900 font-mono text-xs w-[80mm] max-w-[80mm] mx-auto select-text" dir="rtl">
            <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
              <img
                src={companyLogo}
                alt="Logo"
                className="h-12 w-auto max-w-[110px] object-contain mx-auto mb-1.5"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
              <h2 className="font-extrabold text-sm text-slate-900">{companyName}</h2>
              <div className="text-[11px] font-bold text-[#1F3A5F]">{docTitle}</div>
              <div className="mt-2 text-right pt-2 border-t border-dotted border-slate-300 space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">رقم السند:</span>
                  <span className="font-bold text-slate-900">{docNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">التاريخ:</span>
                  <span>{formatDate(rec.payment_date || rec.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">طريقة الدفع:</span>
                  <span>{rec.payment_method || 'نقداً'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">الطرف:</span>
                  <span className="font-bold">{partyName}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-300 rounded text-center space-y-1 mb-3">
              <span className="text-[10px] text-slate-500 block">المبلغ:</span>
              <span className="text-xl font-bold font-mono text-[#1F3A5F] block">{formatCurrency(rec.amount || 0)}</span>
            </div>

            {rec.notes && (
              <div className="text-[10px] text-slate-600 border-b border-dashed border-slate-400 pb-2 mb-3">
                <span className="font-bold">ملاحظات: </span>
                <span>{rec.notes}</span>
              </div>
            )}

            <div className="flex justify-between text-[10px] font-bold pt-4 pb-2 border-b border-dashed border-slate-400">
              <div className="text-center w-1/2">
                <span>توقيع المحاسب</span>
                <div className="border-b border-slate-400 w-16 mx-auto mt-6"></div>
              </div>
              <div className="text-center w-1/2">
                <span>توقيع المستلم</span>
                <div className="border-b border-slate-400 w-16 mx-auto mt-6"></div>
              </div>
            </div>

            <div className="text-center text-[9px] text-slate-400 pt-2">
              كود سيستمز المتكامل • سند مالي معتمد
            </div>
          </div>
        );
      }

      // A4 / A5 Voucher Layout
      return (
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-5">
            <div className="flex items-center gap-4">
              <img
                src={companyLogo}
                alt="Logo"
                className="h-16 w-auto max-w-[130px] object-contain rounded"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
              <div>
                <h2 className="text-2xl font-bold text-[#1F3A5F]">{companyName}</h2>
                <div className="text-xs font-bold text-slate-500">نظام إدارة المؤسسات - كود سيستمز المتكامل</div>
                {settings?.address && <p className="text-xs text-slate-600 mt-1">{settings.address}</p>}
                {settings?.phone && <p className="text-xs text-slate-600">هاتف: <span className="font-mono">{settings.phone}</span></p>}
              </div>
            </div>

            <div className="text-left font-mono">
              <span className={`inline-block px-3.5 py-1.5 text-white font-bold text-sm rounded shadow-xs mb-2 ${isCustomer ? 'bg-emerald-700' : 'bg-blue-800'}`}>
                {docTitle}
              </span>
              <div className="text-xs text-slate-600 font-bold">
                رقم السند: <span className="font-mono text-slate-900 text-sm">{docNumber}</span>
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
              <span className="text-base font-bold text-slate-900 block">
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
          <div className="p-6 bg-blue-50/60 border border-blue-200 rounded-xl text-center space-y-1">
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

          {/* Signatures */}
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
          <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-200 mt-4 break-inside-avoid">
            سند مالي معتمد مستخرج من نظام كود سيستمز المتكامل
          </div>
        </div>
      );
    }

    // 3. Production Cutting Order (`cut_order` / `production_order`)
    if (isCutOrder) {
      const order = documentData;
      if (!order) {
        return (
          <div className="p-8 text-center text-slate-500 font-bold" dir="rtl">
            لم يتم العثور على أمر القص والتشغيل المطلوب.
          </div>
        );
      }
      return (
        <div
          dangerouslySetInnerHTML={{
            __html: generateCutOrderHtml(order, settings, paperSize, cutOrderPrintOptions)
          }}
        />
      );
    }

    // 4. Statement of Account (`statement`)
    if (docType === 'statement' && documentData) {
      const party = documentData.party || {};
      const stData = documentData.statementData || {};
      const rawTransactions = Array.isArray(stData.transactions)
        ? stData.transactions
        : (Array.isArray(stData.statement)
            ? stData.statement
            : (Array.isArray(stData.movements) ? stData.movements : []));

      // Calculate running balance robustly without undefined errors
      let runningAcc = 0;
      const transactions = rawTransactions.map((tr) => {
        const d = Number(tr.debit || 0);
        const c = Number(tr.credit || 0);
        let rowBal = null;
        if (tr.balance_after !== undefined && tr.balance_after !== null) {
          rowBal = Number(tr.balance_after);
          runningAcc = rowBal;
        } else if (tr.running_balance !== undefined && tr.running_balance !== null) {
          rowBal = Number(tr.running_balance);
          runningAcc = rowBal;
        } else if (tr.balance !== undefined && tr.balance !== null) {
          rowBal = Number(tr.balance);
          runningAcc = rowBal;
        } else {
          const isSup = party?.is_supplier && !party?.is_customer;
          runningAcc = isSup ? (runningAcc + c - d) : (runningAcc + d - c);
          rowBal = runningAcc;
        }
        return {
          ...tr,
          running_balance: rowBal
        };
      });

      const printSummaryCards = calculateStatementSummaryCards({
        party,
        openingBalance: stData.summary?.opening_balance ?? party.opening_balance ?? 0,
        openingType: stData.summary?.opening_balance_type ?? party.opening_balance_type,
        filteredRows: transactions,
        allMovements: transactions,
        txTypeFilter: 'all'
      });

      const finalClosingBalance = stData.balance_due ??
        stData.remaining_balance ??
        printSummaryCards.finalBalance;

      // 4.A) Thermal 80mm Layout for Account Statement
      if (isThermal) {
        return (
          <div className="p-3 bg-white text-slate-900 font-mono text-xs w-[80mm] max-w-[80mm] mx-auto select-text" dir="rtl">
            <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
              <img
                src={companyLogo}
                alt="Logo"
                className="h-10 w-auto max-w-[90px] object-contain mx-auto mb-1"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
              <h2 className="font-extrabold text-sm text-slate-900">{companyName}</h2>
              <div className="text-[11px] font-bold text-[#1F3A5F]">كشف حساب مالي معتمد</div>
              <div className="text-[10px] text-slate-500 mt-0.5">تاريخ الكشف: {formatDate(new Date().toISOString())}</div>
              <div className="mt-2 text-right pt-2 border-t border-dotted border-slate-300 text-[11px] space-y-0.5">
                <div><strong>الطرف:</strong> {party.name || 'عميل / مورد'}</div>
                <div><strong>كود الحساب:</strong> <span className="font-mono">{party.code || '-'}</span></div>
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-300 rounded text-center mb-3">
              <span className="text-[10px] text-slate-500 block mb-0.5">الرصيد الختامي الحالي:</span>
              <span className="text-base font-bold font-mono text-blue-800 block">
                {formatCurrency(finalClosingBalance)}
              </span>
            </div>

            <table className="w-full text-right text-[10px] border-collapse mb-3">
              <thead>
                <tr className="border-b border-slate-400 font-bold">
                  <th className="py-1">الحركة / المستند</th>
                  <th className="py-1 text-left font-mono">مدين</th>
                  <th className="py-1 text-left font-mono">دائن</th>
                  <th className="py-1 text-left font-mono">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dotted divide-slate-300">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-slate-400">لا توجد حركات مسجلة.</td>
                  </tr>
                ) : (
                  transactions.map((tr, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 leading-tight">
                        <div className="font-mono text-[9px] text-slate-500">{formatDate(tr.date)}</div>
                        <div className="font-semibold text-slate-800">{tr.description || tr.type}</div>
                        {tr.reference && <div className="font-mono text-[9px] text-slate-400">{tr.reference}</div>}
                      </td>
                      <td className="py-1.5 text-left font-mono text-rose-700">{tr.debit > 0 ? formatCurrency(tr.debit) : '-'}</td>
                      <td className="py-1.5 text-left font-mono text-emerald-700">{tr.credit > 0 ? formatCurrency(tr.credit) : '-'}</td>
                      <td className="py-1.5 text-left font-mono font-bold text-slate-900">{formatCurrency(tr.running_balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="flex justify-between text-[10px] font-bold pt-3 border-t border-dashed border-slate-400 text-center">
              <div>توقيع المحاسب</div>
              <div>اعتماد الطرف</div>
            </div>
            <div className="text-center text-[9px] text-slate-400 pt-2">
              كود سيستمز المتكامل • كشف حساب معتمد
            </div>
          </div>
        );
      }

      // 4.B) A4 Official Statement Layout
      return (
        <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
          <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-5">
            <div className="flex items-center gap-4">
              <img
                src={companyLogo}
                alt="Logo"
                className="h-16 w-auto max-w-[130px] object-contain rounded"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
              <div>
                <h2 className="text-2xl font-bold text-[#1F3A5F]">{companyName}</h2>
                <div className="text-xs font-bold text-slate-500">كشف حساب مالي تفصيلي معتمد</div>
              </div>
            </div>
            <div className="text-left font-mono">
              <span className="inline-block px-3.5 py-1.5 bg-[#1F3A5F] text-white font-bold text-sm rounded mb-2">
                كشف حساب معتمد
              </span>
              <div className="text-xs text-slate-600 font-mono mt-1">تاريخ الكشف: {formatDate(new Date().toISOString())}</div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap justify-between items-center gap-4 text-xs font-bold">
            <div>
              <span className="text-slate-500 block mb-1">اسم الطرف التجاري:</span>
              <span className="text-sm font-bold text-slate-900 block">{party.name || 'عميل / مورد'}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">كود الحساب:</span>
              <span className="text-sm font-mono text-slate-900 block">{party.code || '-'}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">طبيعة الحساب:</span>
              <span className="text-sm font-bold text-slate-800 block">
                {party.is_customer && !party.is_supplier ? 'عميل توزيع' : 'مورد / ورشة تشغيل'}
              </span>
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-4 gap-3 text-right">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 block mb-0.5">رصيد أول المدة</span>
              <span className="text-sm font-bold font-mono text-slate-900 block">
                {formatCurrency(printSummaryCards.openingBalance)}
              </span>
              <span className="text-[9px] text-slate-500 block mt-0.5 font-semibold">
                {printSummaryCards.openingNatureText}
              </span>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
              <span className="text-[10px] font-bold text-blue-700 block mb-0.5">إجمالي الفواتير والتوريدات</span>
              <span className="text-sm font-bold font-mono text-blue-900 block">
                {formatCurrency(printSummaryCards.periodInvoices)}
              </span>
              <span className="text-[9px] text-blue-600 block mt-0.5 font-semibold">
                الفواتير وتكلفة المراحل للفترة
              </span>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
              <span className="text-[10px] font-bold text-emerald-700 block mb-0.5">إجمالي المسدد</span>
              <span className="text-sm font-bold font-mono text-emerald-900 block">
                {formatCurrency(printSummaryCards.periodPaid)}
              </span>
              <span className="text-[9px] text-emerald-600 block mt-0.5 font-semibold">
                سندات الصرف والدفعات المعتمدة
              </span>
            </div>

            <div className="p-3 bg-slate-900 text-white rounded-lg">
              <span className="text-[10px] font-bold text-slate-300 block mb-0.5">الرصيد المتبقي الحالي</span>
              <span className={`text-base font-bold font-mono block ${printSummaryCards.valueClass}`}>
                {formatCurrency(printSummaryCards.finalBalance)}
              </span>
              <span className={`text-[9px] block mt-0.5 font-semibold ${printSummaryCards.subtitleClass}`}>
                {printSummaryCards.subtitle}
              </span>
            </div>
          </div>

          <div className="w-full max-w-full overflow-hidden">
            <table className="w-full max-w-full text-right text-xs border-collapse table-fixed">
              <thead>
                <tr className="bg-[#1F3A5F] text-white font-bold">
                  <th className="p-2.5 border border-slate-300">التاريخ</th>
                  <th className="p-2.5 border border-slate-300">نوع الحركة / المستند</th>
                  <th className="p-2.5 border border-slate-300">رقم المرجع</th>
                  <th className="p-2.5 border border-slate-300 text-left font-mono">مدين (+)</th>
                  <th className="p-2.5 border border-slate-300 text-left font-mono">دائن (-)</th>
                  <th className="p-2.5 border border-slate-300 text-left font-mono">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500 font-semibold">
                      لا توجد حركات مسجلة خلال الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tr, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2.5 border border-slate-200 font-mono">{formatDate(tr.date)}</td>
                      <td className="p-2.5 border border-slate-200">{tr.description || tr.type}</td>
                      <td className="p-2.5 border border-slate-200 font-mono">{tr.reference || '-'}</td>
                      <td className="p-2.5 border border-slate-200 text-left font-mono text-rose-700">{tr.debit > 0 ? formatCurrency(tr.debit) : '-'}</td>
                      <td className="p-2.5 border border-slate-200 text-left font-mono text-emerald-700">{tr.credit > 0 ? formatCurrency(tr.credit) : '-'}</td>
                      <td className="p-2.5 border border-slate-200 text-left font-mono font-bold text-slate-900">{formatCurrency(tr.running_balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-12 text-center text-xs font-bold text-slate-700">
            <div className="space-y-8">
              <span>توقيع المحاسب المالي</span>
              <div className="border-b border-slate-400 w-36 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span>توقيع واعتماد الطرف التجاري</span>
              <div className="border-b border-slate-400 w-36 mx-auto"></div>
            </div>
          </div>
          <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-200 mt-4 break-inside-avoid">
            كشف حساب رسمي مستخرج من نظام كود سيستمز المتكامل • مطابق دفترياً ومحاسبياً
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
              <img
                src={companyLogo}
                alt="Logo"
                className="h-14 w-auto max-w-[120px] object-contain rounded"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
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

          <div className="w-full max-w-full overflow-hidden">
            <table className="w-full max-w-full text-right text-xs border-collapse table-fixed">
              <thead>
                <tr className="bg-[#1F3A5F] text-white border-b border-slate-300">
                  <th className="p-2 border border-slate-200 font-bold">التاريخ</th>
                  <th className="p-2 border border-slate-200 font-bold">نوع الحركة</th>
                  <th className="p-2 border border-slate-200 font-bold">رقم المستند</th>
                  <th className="p-2 border border-slate-200 font-bold text-center">الوارد</th>
                  <th className="p-2 border border-slate-200 font-bold text-center">المنصرف</th>
                  <th className="p-2 border border-slate-200 font-bold text-center">الرصيد التراكمي</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500 font-semibold">
                      لا توجد حركات مخزنية مسجلة لهذا الصنف خلال الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  movements.map((m, idx) => (
                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className="p-2 border border-slate-200 font-mono">{formatDate(m.date)}</td>
                      <td className="p-2 border border-slate-200">{m.movement_type_ar || m.type}</td>
                      <td className="p-2 border border-slate-200 font-mono">{m.document_number || '-'}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono text-emerald-700">{m.quantity_in > 0 ? formatNumber(m.quantity_in) : '-'}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono text-rose-700">{m.quantity_out > 0 ? formatNumber(m.quantity_out) : '-'}</td>
                      <td className="p-2 border border-slate-200 text-center font-mono font-bold text-slate-900">{formatNumber(m.running_balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-200 mt-4 break-inside-avoid">
            سجل حركة مخزنية مستخرج من نظام كود سيستمز المتكامل
          </div>
        </div>
      );
    }

    // 6. Reports View (تقارير النظام والقوائم الإدارية والمالية)
    if (docType === 'report' || documentData?.type === 'report') {
      const reportTitle = documentData.reportTitle || documentData.title || 'تقرير النظام المالي والإداري';
      const reportRows = Array.isArray(documentData.data) ? documentData.data : (Array.isArray(documentData.rows) ? documentData.rows : []);
      const activeReportKey = String(documentData.reportKey || documentData.id || docId || '').trim();

      // Filter out technical, primary key, and internal fields that should not appear on printed sheets
      const ignoredKeys = new Set([
        'id', '_id', 'uuid', 'created_by', 'updated_at', 'is_active', 'raw_date', 'password', 'salt',
        'party_id', 'supplier_id', 'customer_id', 'item_id', 'outlet_id', 'user_id', 'account_id',
        'order_id', 'category_id', 'version', 'hash', 'sync_status', 'items', 'matrix', 'stages'
      ]);

      // Comprehensive 100% Arabic Table Column Translations Dictionary
      const columnLabels = {
        // Party & Statement fields (Audit items)
        supplier_type: 'نوع المورد / النشاط',
        phone: 'رقم الهاتف',
        address: 'العنوان',
        tax_number: 'الرقم الضريبي',
        total_purchases: 'إجمالي المشتريات / التعاملات',
        total_paid: 'إجمالي المسدد',
        total_sales: 'إجمالي المبيعات',
        balance_due: 'الرصيد المتبقي',
        credit_limit: 'الحد الائتماني',
        code: 'الكود',
        name: 'البيان / الاسم',
        title: 'البيان / الاسم',
        balance: 'الرصيد المتبقي',
        remaining: 'الرصيد المتبقي',
        remaining_balance: 'الرصيد المتبقي',
        remaining_amount: 'المتبقي',
        current_balance: 'الرصيد الحالي',
        opening_balance: 'رصيد أول المدة',
        opening_type: 'طبيعة رصيد أول المدة',
        credit_invoices_total: 'إجمالي الفواتير الآجلة',
        credit_sales_total: 'إجمالي المبيعات الآجلة',
        stage_costs_total: 'تكاليف مراحل التشغيل',
        payments_total: 'إجمالي المسدد',
        receipts_total: 'إجمالي المقبوضات',
        returns_total: 'إجمالي المرتجعات',
        supplier_balance: 'رصيد المورد (له)',
        customer_balance: 'رصيد العميل (عليه)',
        net_balance: 'صافي الرصيد',
        max_offset_amount: 'المقاصة المتاحة',

        // Invoices, POs & Cutting Orders
        invoice_number: 'رقم الفاتورة',
        po_number: 'رقم أمر الشراء',
        po_id: 'رقم أمر الشراء',
        receipt_number: 'رقم إذن الاستلام',
        order_number: 'رقم الطلب',
        cutting_number: 'رقم أمر القص',
        customer_name: 'اسم العميل',
        customer_code: 'كود العميل',
        supplier_name: 'اسم المورد',
        supplier_code: 'كود المورد',
        party_name: 'اسم الطرف',
        vendor_name: 'الورشة / المطبعة',
        date: 'التاريخ',
        created_at: 'تاريخ الإنشاء',
        due_date: 'تاريخ الاستحقاق',
        payment_date: 'تاريخ السداد',
        invoice_date: 'تاريخ الفاتورة',
        order_date: 'تاريخ الطلب',
        start_date: 'تاريخ البدء',
        payment_terms: 'طريقة الدفع',
        payment_type: 'طريقة الدفع',
        payment_method: 'طريقة السداد',
        status: 'الحالة',
        quantity: 'الكمية',
        unit_price: 'سعر الوحدة',
        price: 'السعر',
        subtotal: 'المجموع قبل الخصم',
        discount: 'قيمة الخصم',
        discount_value: 'قيمة الخصم',
        discount_amount: 'قيمة الخصم',
        discount_percent: 'نسبة الخصم %',
        additional_expenses: 'مصاريف إضافية',
        total_amount: 'إجمالي المبلغ',
        total_invoice_amount: 'إجمالي الفاتورة',
        total_product_cost: 'إجمالي التكلفة',
        total_stages_cost: 'إجمالي مراحل التشغيل',
        paid_amount: 'المسدد',
        grand_total: 'الإجمالي الكلي',
        actual_balance: 'الرصيد الفعلي',
        invoices_count: 'عدد الفواتير',
        items_count: 'عدد الأصناف',
        batch_quantity: 'كمية الباتش (قطعة)',
        total_quantity: 'إجمالي الكمية',

        // Items, Raw Materials & Stock
        item_code: 'كود الصنف',
        item_name: 'اسم الصنف',
        product_code: 'كود الموديل',
        product_name: 'اسم الموديل',
        fabric_type: 'نوع القماش',
        color: 'اللون',
        size: 'المقاس',
        item_type: 'نوع الصنف',
        category: 'التصنيف',
        unit: 'الوحدة',
        min_reorder_level: 'حد إعادة الطلب',
        deficit: 'العجز المخزني',
        adjustment_type: 'نوع التسوية',
        movement_type: 'نوع الحركة',
        reason: 'السبب / البيان',
        account_name: 'الخزينة',
        tx_number: 'رقم الحركة',
        tx_type: 'نوع الحركة',
        amount: 'المبلغ',
        notes: 'ملاحظات',
        description: 'البيان',
        return_number: 'رقم المرتجع',
        return_type: 'نوع المرتجع',
        refund_amount: 'قيمة المرتجع',
        stage_name: 'مرحلة التشغيل',
        stage: 'المرحلة',
        grn_number: 'رقم إذن الاستلام',
        receipt_date: 'تاريخ الاستلام',
        receiver_name: 'المستلم'
      };

      // Fail-safe resolver to guarantee ZERO English database keys ever reach print headers
      const getArabicColumnTitle = (key) => {
        if (columnLabels[key]) return columnLabels[key];
        const k = String(key || '').toLowerCase().trim();
        if (k.includes('grn')) return 'رقم إذن الاستلام';
        if (k.includes('po_') || k === 'po' || k === 'po_id') return 'رقم أمر الشراء';
        if (k.includes('supplier_type') || k.includes('activity')) return 'نوع المورد / النشاط';
        if (k.includes('phone') || k.includes('mobile')) return 'رقم الهاتف';
        if (k.includes('address')) return 'العنوان';
        if (k.includes('tax')) return 'الرقم الضريبي';
        if (k.includes('purchases')) return 'إجمالي المشتريات / التعاملات';
        if (k.includes('paid')) return 'إجمالي المسدد';
        if (k.includes('sales')) return 'إجمالي المبيعات';
        if (k.includes('balance') || k.includes('due') || k.includes('remaining')) return 'الرصيد المتبقي';
        if (k.includes('subtotal')) return 'المجموع قبل الخصم';
        if (k.includes('discount')) return 'قيمة الخصم';
        if (k.includes('expense')) return 'مصاريف إضافية';
        if (k.includes('invoice')) return 'الفاتورة';
        if (k.includes('receipt')) return 'إذن الاستلام';
        if (k.includes('order')) return 'الطلب';
        if (k.includes('item') || k.includes('product')) return 'الصنف / المنتج';
        if (k.includes('price') || k.includes('cost')) return 'السعر / التكلفة';
        if (k.includes('qty') || k.includes('quantity')) return 'الكمية';
        if (k.includes('unit')) return 'الوحدة';
        if (k.includes('date')) return 'التاريخ';
        if (k.includes('status')) return 'الحالة';
        if (k.includes('code')) return 'الكود';
        if (k.includes('name') || k.includes('title')) return 'البيان / الاسم';
        if (k.includes('notes')) return 'ملاحظات';
        if (k.includes('desc') || k.includes('reason')) return 'البيان';
        return 'البيان';
      };

      // Standard Schemas for known reports
      const REPORT_SCHEMAS = {
        'supplier-statements': ['code', 'name', 'supplier_type', 'phone', 'total_purchases', 'total_paid', 'balance_due'],
        'customer-statements': ['code', 'name', 'phone', 'total_sales', 'total_paid', 'balance_due'],
        'goods-receipts': ['grn_number', 'po_number', 'po_id', 'supplier_name', 'receipt_date', 'receiver_name', 'notes'],
        'purchase-orders': ['po_number', 'supplier_name', 'order_date', 'payment_terms', 'subtotal', 'discount_value', 'total_amount'],
        'sales-invoices': ['invoice_number', 'customer_name', 'invoice_date', 'payment_terms', 'total_amount', 'status'],
        'stock-adjustments': ['id', 'item_name', 'adjustment_type', 'quantity', 'reason', 'date'],
        'installments-due': ['po_number', 'supplier_name', 'due_date', 'amount', 'paid_amount', 'remaining_amount'],
        'returns': ['return_number', 'return_type', 'created_at', 'total_amount', 'reason'],
        'items': ['code', 'name', 'item_group', 'item_type', 'actual_balance', 'cost_price', 'selling_price'],
        'low-stock': ['code', 'name', 'item_group', 'actual_balance', 'min_reorder_level', 'cost_price']
      };

      // Determine active columns with deduplication and data-presence check
      let columnKeys = [];
      if (REPORT_SCHEMAS[activeReportKey] && Array.isArray(reportRows) && reportRows.length > 0) {
        columnKeys = REPORT_SCHEMAS[activeReportKey].filter(k => {
          return reportRows.some(row => {
            const val = row[k];
            return val !== undefined && val !== null && String(val).trim() !== '';
          });
        });
        // If both po_number and po_id exist, keep po_number only
        if (columnKeys.includes('po_number') && columnKeys.includes('po_id')) {
          columnKeys = columnKeys.filter(k => k !== 'po_id');
        }
      }

      // Dynamic fallback for unlisted reports
      if (columnKeys.length === 0 && Array.isArray(reportRows) && reportRows.length > 0 && typeof reportRows[0] === 'object' && reportRows[0] !== null) {
        columnKeys = Object.keys(reportRows[0]).filter(k =>
          !ignoredKeys.has(k) &&
          typeof reportRows[0][k] !== 'object' &&
          reportRows.some(row => row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '')
        ).slice(0, 8);
      }

      // Balanced Column Widths Map (Guarantees every column has ample horizontal room)
      const COLUMN_WIDTH_MAP = {
        grn_number: '18%',
        po_number: '17%',
        po_id: '17%',
        supplier_name: '18%',
        customer_name: '22%',
        receipt_date: '14%',
        order_date: '13%',
        invoice_date: '13%',
        receiver_name: '14%',
        notes: '21%',
        description: '21%',
        reason: '20%',
        code: '12%',
        name: '24%',
        phone: '14%',
        supplier_type: '14%',
        total_purchases: '14%',
        total_sales: '14%',
        total_paid: '13%',
        balance_due: '14%',
        total_amount: '14%',
        subtotal: '12%',
        discount_value: '10%',
        payment_terms: '12%',
        status: '12%',
        actual_balance: '12%',
        cost_price: '12%',
        selling_price: '12%',
        item_group: '14%',
        item_type: '12%',
        quantity: '12%',
        due_date: '13%',
        amount: '14%',
        paid_amount: '13%',
        remaining_amount: '14%',
        return_number: '18%',
        return_type: '18%',
        stage_title: '14%',
        vendor_name: '18%',
        pricing_type: '13%',
        total_cost: '14%'
      };

      const getColWidth = (k, count) => {
        if (COLUMN_WIDTH_MAP[k]) return COLUMN_WIDTH_MAP[k];
        return `${Math.floor(100 / (count || 1))}%`;
      };

      // Summary sums
      let totalAmountSum = 0;
      let hasAmountSum = false;
      for (const row of reportRows) {
        const amt = row.total_amount ?? row.total_invoice_amount ?? row.balance_due ?? row.current_balance ?? row.total_sales;
        if (amt !== undefined && amt !== null && !isNaN(Number(amt))) {
          totalAmountSum += Number(amt);
          hasAmountSum = true;
        }
      }

      // Column count and dynamic density classes (Eliminate horizontal scrollbar on A4)
      const colCount = columnKeys.length + 1;
      const isUltraDense = colCount >= 9;
      const isDense = colCount >= 6 && !isUltraDense;
      const tableFontClass = isUltraDense ? 'text-[9.5px]' : isDense ? 'text-[11px]' : 'text-xs';
      const thPadClass = isUltraDense ? 'py-1 px-1' : isDense ? 'py-2 px-2' : 'py-2.5 px-3';
      const tdPadClass = isUltraDense ? 'py-1 px-1' : isDense ? 'py-1.5 px-2' : 'py-2 px-3';

      // 6.A) Thermal 80mm Layout for Report Summary
      if (isThermal) {
        return (
          <div className="p-3 bg-white text-slate-900 font-mono text-xs w-[80mm] max-w-[80mm] mx-auto select-text" dir="rtl">
            <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
              <img
                src={companyLogo}
                alt="Logo"
                className="h-10 w-auto max-w-[90px] object-contain mx-auto mb-1"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
              <h2 className="font-extrabold text-sm text-slate-900">{companyName}</h2>
              <div className="text-[11px] font-bold text-[#1F3A5F]">{reportTitle}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">تاريخ الطباعة: {formatDate(new Date().toISOString())}</div>
              <div className="text-[10px] font-bold text-slate-700 mt-1">عدد السجلات: {formatNumber(reportRows.length)}</div>
            </div>

            {hasAmountSum && (
              <div className="p-2.5 bg-slate-50 border border-slate-300 rounded text-center mb-3">
                <span className="text-[10px] text-slate-500 block mb-0.5">إجمالي المطابقات المحاسبية:</span>
                <span className="text-base font-bold font-mono text-emerald-800 block">
                  {formatCurrency(totalAmountSum)}
                </span>
              </div>
            )}

            <div className="text-center text-[9px] text-slate-400 pt-3 border-t border-dashed border-slate-400">
              كود سيستمز المتكامل • ملخص تقرير معتمد
            </div>
          </div>
        );
      }

      // 6.B) Standardized A4 / A5 Report Layout (Zero Side-Scroll, 100% Arabic Headers, Zero Overlap)
      return (
        <div className="p-6 sm:p-8 space-y-6 text-slate-900 bg-white max-w-full overflow-hidden" dir="rtl">
          {/* Standardized Report Header: Logo top-right, Company top-left, Title centered in bordered box, Date/Time stamp */}
          <div className="flex justify-between items-center border-b-2 border-[#1F3A5F] pb-4 mb-4" dir="rtl">
            {/* Top-Right: Logo */}
            <div className="flex items-center gap-3">
              <img
                src={companyLogo}
                alt="Logo"
                className="h-14 w-auto max-w-[120px] object-contain rounded"
                onError={(e) => {
                  if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
                }}
              />
              <div className="text-right">
                <div className="text-[11px] font-bold text-slate-500">نظام كود سيستمز المتكامل</div>
                <div className="text-[10px] text-slate-400">قسم الحسابات والإدارة العامة</div>
              </div>
            </div>

            {/* Center: Report Title in sleek bordered box */}
            <div className="text-center px-6 py-2 bg-slate-50 border-2 border-[#1F3A5F] rounded-xl shadow-xs">
              <h2 className="text-base font-extrabold text-[#1F3A5F] tracking-wide m-0">{reportTitle}</h2>
              <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                سجل إداري ومحاسبي معتمد • إجمالي السجلات: <span className="font-mono text-slate-900">{formatNumber(reportRows.length)}</span>
              </div>
            </div>

            {/* Top-Left: Company Name & Date/Time stamp */}
            <div className="text-left font-mono">
              <div className="text-base font-bold text-[#1F3A5F] font-sans">{companyName}</div>
              <div className="text-[10px] text-slate-600 font-sans">{settings?.address || 'جمهورية مصر العربية'}</div>
              {settings?.phone && <div className="text-[10px] text-slate-600">هاتف: {settings.phone}</div>}
              <div className="text-[10px] text-slate-500 mt-1 font-sans">
                تاريخ الطباعة: <span className="font-mono">{formatDate(new Date().toISOString())}</span>
              </div>
            </div>
          </div>

          {/* Data Table with complete overflow-x elimination, colgroup widths, and cell containment */}
          <div className="w-full max-w-full overflow-hidden">
            <table className={`w-full max-w-full text-right ${tableFontClass} border-collapse table-fixed`}>
              <colgroup>
                <col style={{ width: '42px' }} />
                {columnKeys.map(k => (
                  <col key={k} style={{ width: getColWidth(k, columnKeys.length) }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-[#1F3A5F] text-white border-b border-slate-300">
                  <th className={`${thPadClass} border border-slate-300 text-center font-bold whitespace-nowrap w-10 shrink-0`}>#</th>
                  {columnKeys.map(k => {
                    const isNum = k.includes('total') || k.includes('amount') || k.includes('balance') || k.includes('price') || k.includes('cost') || k.includes('limit');
                    return (
                      <th
                        key={k}
                        style={{ width: getColWidth(k, columnKeys.length) }}
                        className={`${thPadClass} border border-slate-300 font-bold whitespace-nowrap ${isNum ? 'text-left' : 'text-center'}`}
                      >
                        <span className="whitespace-nowrap font-bold block">
                          {getArabicColumnTitle(k)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr>
                    <td colSpan={columnKeys.length + 1} className="p-8 text-center text-slate-500 font-bold">
                      لا توجد بيانات مطابقة لمعايير هذا التقرير.
                    </td>
                  </tr>
                ) : (
                  reportRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                      <td className={`${tdPadClass} border border-slate-200 text-center font-mono text-slate-500 whitespace-nowrap`}>{idx + 1}</td>
                      {columnKeys.map(k => {
                        const val = row[k];
                        const isNum = typeof val === 'number';
                        const isDate = typeof val === 'string' && (k.includes('date') || k.includes('created_at'));
                        const isMoney = k.includes('total') || k.includes('amount') || k.includes('balance') || k.includes('price') || k.includes('cost') || k.includes('paid');
                        const isCenter = k === 'code' || k.includes('code') || isDate || k === 'status' || k.includes('phone') || k.includes('terms') || k === 'unit' || k === 'quantity' || k === 'po_number' || k === 'grn_number' || k === 'po_id';
                        return (
                          <td
                            key={k}
                            className={`${tdPadClass} border border-slate-200 ${
                              isMoney ? 'text-left font-mono font-bold whitespace-nowrap' : isCenter ? 'text-center whitespace-nowrap' : 'text-right'
                            }`}
                          >
                            {(() => {
                              if (k === 'is_customer' || k === 'is_supplier') {
                                return Number(val) === 1 || val === true ? 'نعم' : 'لا';
                              }
                              if (k === 'supplier_type') {
                                return val === 'goods' ? 'توريد خامات' : val === 'service' ? 'خدمات وتشغيل' : String(val || '-');
                              }
                              if (k === 'status') {
                                const sMap = { paid: 'مسدد', unpaid: 'غير مسدد', partially_paid: 'مسدد جزئياً', cancelled: 'ملغي', completed: 'مكتمل', closed: 'مقفل', issued: 'صادر', draft: 'مسودة', in_progress: 'قيد التشغيل', pending: 'معلق', ordered: 'قيد التوريد', received: 'تم الاستلام' };
                                return sMap[val] || String(val || '-');
                              }
                              if (k === 'adjustment_type' || k === 'type') {
                                const aMap = { add: 'إضافة للمخزن', subtract: 'عجز / خصم', damage: 'تالف / هالك', increase: 'زيادة', decrease: 'عجز' };
                                if (aMap[val]) return aMap[val];
                              }
                              if (k === 'item_type') {
                                const iMap = { raw: 'خامة', finished: 'منتج تام', fabric: 'قماش', accessory: 'إكسسوار' };
                                if (iMap[val]) return iMap[val];
                              }
                              if (k === 'payment_terms') {
                                return val === 'credit' ? 'آجل' : 'نقدي';
                              }
                              if (isDate) {
                                return (
                                  <span className="font-mono inline-block text-center whitespace-nowrap" dir="ltr">
                                    {formatDate(val)}
                                  </span>
                                );
                              }
                              if (isMoney || (isNum && (k.includes('price') || k.includes('cost')))) {
                                return (
                                  <span className="font-mono font-bold whitespace-nowrap block text-left" dir="ltr">
                                    {formatCurrency(Number(val) || 0)}
                                  </span>
                                );
                              }
                              if (isNum) {
                                return (
                                  <span className="font-mono font-bold whitespace-nowrap block text-center" dir="ltr">
                                    {formatNumber(Number(val) || 0)}
                                  </span>
                                );
                              }
                              if (k === 'code' || k.includes('code') || k === 'po_number' || k === 'grn_number' || k === 'po_id' || k === 'phone' || k.includes('phone')) {
                                return (
                                  <span className="font-mono font-bold whitespace-nowrap block text-center" dir="ltr">
                                    {String(val || '-')}
                                  </span>
                                );
                              }
                              return (
                                <span className="break-words whitespace-normal leading-tight block">
                                  {String(val ?? '-')}
                                </span>
                              );
                            })()}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
              {hasAmountSum && reportRows.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                    <td colSpan={columnKeys.length} className={`${tdPadClass} text-right font-bold`}>الإجمالي الكلي للمطابقات:</td>
                    <td className={`${tdPadClass} text-left font-mono text-emerald-700 ${isUltraDense ? 'text-xs' : 'text-sm'} whitespace-nowrap`}>
                      {formatCurrency(totalAmountSum)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

                    {/* Standardized Formal Signatures: المحاسب المسؤول / المدير المالي / اعتماد الإدارة */}
          <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs font-bold text-slate-700 break-inside-avoid">
            <div className="space-y-6">
              <span>المحاسب المسؤول</span>
              <div className="border-b border-slate-400 w-36 mx-auto"></div>
            </div>
            <div className="space-y-6">
              <span>المدير المالي</span>
              <div className="border-b border-slate-400 w-36 mx-auto"></div>
            </div>
            <div className="space-y-6">
              <span>اعتماد الإدارة</span>
              <div className="border-b border-slate-400 w-36 mx-auto"></div>
            </div>
          </div>
          <div className="text-center text-[9px] text-slate-400 pt-4 border-t border-slate-200 mt-4 break-inside-avoid">
            تقرير رسمي مستخرج من نظام كود سيستمز المتكامل • تم التحقق والمطابقة المحاسبية
          </div>
        </div>
      );
    }
    // 7. Generic Fallback Document View
    if (!documentData) {
      return (
        <div className="p-8 text-center text-slate-600 space-y-4" dir="rtl">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="text-base font-bold text-slate-900">
            {loadError || 'لم يتم العثور على بيانات المستند المطلوب للطباعة.'}
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            يرجى التأكد من اختيار المستند المطلوب من القائمة أو التحقق من صحة رقم المستند.
          </p>
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة للشاشة السابقة</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" dir="rtl">
        <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-4">
          <div className="flex items-center gap-3">
            <img
              src={companyLogo}
              alt="Logo"
              className="h-14 w-auto max-w-[120px] object-contain rounded"
              onError={(e) => {
                if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
              }}
            />
            <div>
              <h2 className="text-xl font-bold text-[#1F3A5F]">{companyName}</h2>
              <p className="text-xs text-slate-500">{settings?.address || 'جمهورية مصر العربية'}</p>
            </div>
          </div>
          <div className="text-left">
            <span className="px-3 py-1 bg-[#1F3A5F] text-white font-bold text-xs rounded">
              {documentData.title || 'مستند نظام معتمد'}
            </span>
            <div className="text-xs text-slate-500 font-mono mt-1">{formatDate(documentData.date || documentData.created_at || new Date().toISOString())}</div>
          </div>
        </div>

        <div className="py-4">
          <h3 className="text-base font-bold text-slate-800 mb-2">
            {documentData.title || documentData.name || 'تفاصيل المستند'}
          </h3>
          {documentData.notes && (
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              {documentData.notes}
            </p>
          )}
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
    <div className="min-h-screen bg-slate-800 text-slate-100 flex flex-col select-none print:bg-white print:text-black" dir="rtl">
      {/* Print-specific style tag for window.print() browser / electron fallback */}
      <style>{`
        .printable-sheet table {
          border-collapse: collapse !important;
          table-layout: fixed !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        .printable-sheet th,
        .printable-sheet td {
          overflow: hidden !important;
          box-sizing: border-box !important;
          word-break: break-word !important;
          overflow-wrap: break-word !important;
        }
        @media print {
          header, aside, .no-print {
            display: none !important;
          }
          body, html {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            display: block !important;
            overflow: visible !important;
          }
          .print-scale-wrapper {
            transform: none !important;
          }
          .printable-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            width: ${paperSize === '80mm' ? '80mm !important' : '100% !important'};
            max-width: ${paperSize === '80mm' ? '80mm !important' : orientation === 'landscape' ? '297mm !important' : '210mm !important'};
          }
          table {
            border-collapse: collapse !important;
            table-layout: fixed !important;
            width: 100% !important;
            max-width: 100% !important;
            page-break-inside: auto !important;
          }
          th, td {
            overflow: hidden !important;
            box-sizing: border-box !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          @page {
            size: ${paperSize === '80mm' ? '80mm auto' : `${paperSize} ${orientation}`};
            margin: ${paperSize === '80mm' ? '0' : margins === 'none' ? '0' : margins === 'minimal' ? '5mm' : '10mm'};
          }
        }
      `}</style>

      {/* Top Header Bar */}
      <header className="h-14 bg-slate-900 border-b border-slate-700 px-4 flex items-center justify-between shrink-0 z-30 no-print">
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
              title="تصغير (-10%)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono font-bold text-slate-200">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel(prev => Math.min(150, prev + 10))}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white cursor-pointer"
              title="تكبير (+10%)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white cursor-pointer ml-1"
              title="الحجم الأصلي (100%)"
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
          ) : loadError && !documentData ? (
            <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-xl border border-rose-200 text-center space-y-4" dir="rtl">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">تعذر عرض المستند للطباعة</h3>
              <p className="text-xs text-rose-600 font-semibold">{loadError}</p>
              <p className="text-xs text-slate-500">
                يرجى التأكد من اختيار المستند المطلوب من القائمة أو التحقق من صحة رقم المستند.
              </p>
              <div>
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة للشاشة السابقة</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              className="transition-transform duration-150 print-scale-wrapper"
            >
              <div
                ref={printFrameRef}
                style={{ maxWidth: '100%', overflowX: 'hidden' }}
              className={`${frameWidthStyle} min-h-[500px] bg-white shadow-2xl rounded-sm border border-slate-300 overflow-hidden text-slate-900 printable-sheet ${
                  colorMode === 'grayscale' ? 'grayscale' : ''
                }`}
              >
                {renderDocumentContent()}
              </div>
            </div>
          )}
        </main>

        {/* Right Settings Panel (Arabic) */}
        <aside className="w-80 bg-slate-900 border-r border-slate-700 p-5 flex flex-col justify-between shrink-0 overflow-y-auto no-print">
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

            {/* Cutting / Work Order Customizable Printable Fields Checkboxes (Task 1) */}
            {isCutOrder && (
              <div className="p-3.5 bg-slate-800/90 border border-blue-500/40 rounded-xl space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                  <Scissors className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white">حقول طباعة أمر الشغل للصنايعي / الورشة</span>
                </div>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 text-slate-200 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_story_info)}
                      onChange={(e) => handleToggleCutOrderOption('show_story_info', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>اسم القصة ورقم القصة</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-200 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_matrix)}
                      onChange={(e) => handleToggleCutOrderOption('show_matrix', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>تفاصيل الألوان والمقاسات والكميات</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-200 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_stages_names)}
                      onChange={(e) => handleToggleCutOrderOption('show_stages_names', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>اسم المرحلة والورشة / المطبعة</span>
                  </label>

                  <label className="flex items-center gap-2 text-amber-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_fabric_cost)}
                      onChange={(e) => handleToggleCutOrderOption('show_fabric_cost', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>تكلفة الخامة / نوع القماش (مالي)</span>
                  </label>

                  <label className="flex items-center gap-2 text-amber-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_stage_costs)}
                      onChange={(e) => handleToggleCutOrderOption('show_stage_costs', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>تكاليف مراحل التشغيل (مالي)</span>
                  </label>

                  <label className="flex items-center gap-2 text-amber-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_total_cost)}
                      onChange={(e) => handleToggleCutOrderOption('show_total_cost', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>إجمالي تكلفة أمر القص (مالي)</span>
                  </label>

                  <label className="flex items-center gap-2 text-amber-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_agreed_rates)}
                      onChange={(e) => handleToggleCutOrderOption('show_agreed_rates', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>أسعار الاتفاق مع الصنايعي / الورشة (مالي)</span>
                  </label>

                  <label className="flex items-center gap-2 text-slate-200 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cutOrderPrintOptions.show_specifications)}
                      onChange={(e) => handleToggleCutOrderOption('show_specifications', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 accent-blue-600 cursor-pointer"
                    />
                    <span>التخاريج والمواصفات التفصيلية</span>
                  </label>
                </div>
                <div className="text-[10px] text-slate-400 border-t border-slate-700/60 pt-1.5">
                  تُحفظ خياراتك تلقائياً لطباعة أوامر الشغل اللاحقة.
                </div>
              </div>
            )}

            {/* 1. Printer Select */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                الطابعة المحددة
              </label>
              {printers.length === 0 ? (
                <div className="p-3 bg-slate-800 rounded-lg text-[11px] text-amber-400 font-semibold border border-amber-500/30">
                  لم يتم اكتشاف طابعة متصلة. يمكنك استخدام «حفظ كملف إلكتروني» لتصدير المستند.
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
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
              >
                <option value="A4">ورق قياسي كامل (210 × 297 مم)</option>
                <option value="A5">نصف صفحة قياسي (148 × 210 مم)</option>
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
                      ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  رأسي
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  أفقي
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
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono font-bold text-white text-center focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  الهوامش
                </label>
                <select
                  value={margins}
                  onChange={(e) => setMargins(e.target.value)}
                  className="w-full px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white focus:outline-hidden focus:border-blue-500 cursor-pointer"
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
                      ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
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
                      ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  أبيض وأسود
                </button>
              </div>
            </div>

            {/* 6. Optional Account Balances Preference (Section 5.4, 6.4, 9.1) */}
            {(['sales_invoice', 'sales_invoice_thermal', 'invoice', 'purchase_invoice', 'purchase_invoice_thermal', 'purchase_order'].includes(docType)) && (
              <div className="pt-3 border-t border-slate-700">
                <label className="flex items-start gap-2.5 text-xs font-bold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAccountBalance}
                    onChange={(e) => handleToggleShowAccountBalance(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-blue-600 focus:ring-0 cursor-pointer accent-blue-600"
                  />
                  <div>
                    <span>إظهار أرصدة الحساب في الفاتورة المطبوعة</span>
                    <span className="block text-[10px] text-slate-400 font-normal mt-0.5">
                      (الافتراضي إخفاء تفاصيل رصيد الحساب للاكتفاء بإجمالي الفاتورة فقط)
                    </span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Bottom Action Buttons */}
          <div className="pt-6 space-y-2.5 border-t border-slate-800 mt-6">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              title="طباعة المستند مباشرة"
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
              <span>{isSavingPdf ? 'جاري تصدير الملف...' : 'حفظ كملف إلكتروني'}</span>
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
