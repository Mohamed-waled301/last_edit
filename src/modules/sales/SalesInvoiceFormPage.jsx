import React, { useState, useEffect, useRef } from 'react';
import { 
  Receipt, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Printer, 
  DollarSign, 
  Calendar, 
  User, 
  Store,
  ShieldAlert,
  Info
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import DocumentConfirmModal from '../../components/DocumentConfirmModal';
import PostIssuePrintDialog from '../../components/PostIssuePrintDialog';
import MoneyInput, { NumberInput } from '../../components/MoneyInput';
import { api, getActiveUser } from '../../services/api';
import { formatCurrency, getTodayDateString } from '../../utils/formatters';
import { toPiasters, fromPiasters } from '../../utils/money';
import { Validators, FieldError } from '../../utils/validation';
import { handleFormKeyDown } from '../../utils/formNavigation';
import { navigationGuard } from '../../utils/navigationGuard';
import QuickOutletModal from '../outlets/QuickOutletModal';
import { generateSalesInvoiceHtml } from '../print/invoicePrintTemplates';

export default function SalesInvoiceFormPage({ onSaved, onCancel, onNotify }) {
  const activeUser = getActiveUser();
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerBalance, setCustomerBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creditLimitExceeded, setCreditLimitExceeded] = useState(null);
  const [showQuickOutletModal, setShowQuickOutletModal] = useState(false);
  const [defaultCreditDays, setDefaultCreditDays] = useState(30);
  const [focusedItem, setFocusedItem] = useState(null);
  const [issuedInvoice, setIssuedInvoice] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const quantityInputRefs = useRef([]);
  const isSavedRef = useRef(false);

  const [form, setForm] = useState({
    invoice_number: '',
    customer_id: '',
    outlet_id: activeUser.outlet_id || '',
    invoice_date: getTodayDateString(),
    payment_terms: 'cash', // 'cash' | 'credit'
    due_date: null,
    notes: '',
    items: [
      {
        product_id: '',
        product_code: '',
        code_error: '',
        variant_id: '',
        quantity: '1',
        price_before_discount: '',
        discount_value: '0',
        unit_selling_price: '',
        available_stock: 0,
        has_variants: false,
        variants_list: []
      }
    ]
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    async function loadDependencies() {
      try {
        setLoading(true);
        const [custRes, prodsRes, outRes, setRes] = await Promise.all([
          api.getCustomers ? api.getCustomers() : api.getParties(),
          api.getItems(),
          api.getOutlets(),
          api.getSettings ? api.getSettings() : Promise.resolve({})
        ]);

        const custs = Array.isArray(custRes.data) ? custRes.data : (Array.isArray(custRes.customers) ? custRes.customers : []);
        const filteredCusts = custs.filter(c => c.is_customer !== 0);
        const prods = Array.isArray(prodsRes.data) ? prodsRes.data : [];
        setAllItems(prods);

        // Sales picker lists strictly finished goods (تام / finished)
        const finishedProds = prods.filter(
          p => p.item_type === 'finished' || p.item_type === 'تام' || p.item_type === 'منتج تام'
        );
        const outs = Array.isArray(outRes.data) ? outRes.data : [];

        const settings = setRes?.settings || setRes?.data || {};
        const creditDays = Number(settings.default_credit_days) || 0;
        setDefaultCreditDays(creditDays);

        setCustomers(filteredCusts);
        setProducts(finishedProds);
        setOutlets(outs);

        const nextInvRes = await api.getNextSalesInvoiceNumber().catch(() => null);
        const invNum = nextInvRes?.data || `INV-SLS-${new Date().getFullYear()}-0001`;
        setForm(prev => ({
          ...prev,
          invoice_number: invNum,
          outlet_id: outs.length > 0 ? (activeUser.outlet_id || outs[0].id) : ''
        }));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadDependencies();
  }, []);

  // Register unsaved changes protection (Requirement 5)
  useEffect(() => {
    const unregister = navigationGuard.register(() => {
      if (isSavedRef.current) return false;
      if (Boolean(form.customer_id)) return true;
      if (Boolean(form.notes?.trim())) return true;
      if (form.items.some((it) => Boolean(it.product_id) || (it.quantity && it.quantity !== '1') || Boolean(it.price_before_discount))) {
        return true;
      }
      return false;
    });
    return unregister;
  }, [form]);

  const handleOutletCreated = async (newOutlet) => {
    try {
      const outRes = await api.getOutlets();
      const outs = Array.isArray(outRes.data) ? outRes.data : (Array.isArray(outRes.outlets) ? outRes.outlets : []);
      setOutlets(outs);
      if (newOutlet?.id) {
        setForm(prev => ({ ...prev, outlet_id: newOutlet.id }));
      }
    } catch (err) {
      console.error('Failed to reload outlets:', err);
    }
  };

  // Payment terms change (Requirement: no due date required or auto-generated for sales invoices)
  const handlePaymentTermsChange = (terms) => {
    setForm(prev => ({
      ...prev,
      payment_terms: terms,
      due_date: null
    }));
  };

  // Invoice date change
  const handleInvoiceDateChange = (newDate) => {
    setForm(prev => ({
      ...prev,
      invoice_date: newDate
    }));
  };

  // When customer is selected: immediately show their balance & credit limit
  const handleCustomerChange = async (customerId) => {
    const cust = customers.find(c => String(c.id) === String(customerId));
    setSelectedCustomer(cust || null);
    setForm(prev => ({ ...prev, customer_id: customerId }));

    if (customerId) {
      try {
        let bal = 0;
        if (typeof api.getEntityCurrentBalance === 'function') {
          bal = await api.getEntityCurrentBalance(customerId);
        } else {
          const stmt = await api.getCustomerStatement(customerId);
          bal = stmt?.summary?.remaining_balance ?? stmt?.balance_due ?? cust?.customer_balance ?? 0;
        }
        setCustomerBalance(Number(bal) || 0);
      } catch (e) {
        setCustomerBalance(Number(cust?.customer_balance) || 0);
      }
    } else {
      setCustomerBalance(0);
    }
  };

  // Product Code typing
  const handleProductCodeChange = (index, codeVal) => {
    setForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        product_code: codeVal,
        code_error: ''
      };
      return { ...prev, items: updated };
    });
  };

  // Product Code lookup on Enter or blur (Requirement 6)
  const handleProductCodeLookup = (index) => {
    const code = (form.items[index]?.product_code || '').trim();
    if (!code) return;

    // Look up in all items list
    const found = allItems.find(it => String(it.code).trim().toLowerCase() === code.toLowerCase());

    if (!found) {
      setForm(prev => {
        const updated = [...prev.items];
        updated[index] = {
          ...updated[index],
          code_error: 'الكود غير موجود'
        };
        return { ...prev, items: updated };
      });
      return;
    }

    // Check if raw material: reject in sales invoice
    const isRaw = found.item_type === 'raw_material' || 
                  found.item_type === 'قماش' || 
                  found.item_type === 'مستلزمات' || 
                  found.item_type === 'خامة' || 
                  found.category === 'raw_materials';

    if (isRaw) {
      setForm(prev => {
        const updated = [...prev.items];
        updated[index] = {
          ...updated[index],
          product_id: '',
          code_error: 'هذا الصنف مادة خام ولا يمكن بيعه'
        };
        return { ...prev, items: updated };
      });
      return;
    }

    // Finished good found: load into line and sync code
    const sellPrice = Number(found.selling_price) || 0;
    const variants = Array.isArray(found.variants) ? found.variants : [];
    const hasVars = variants.length > 0;
    const initialVariant = hasVars ? variants[0] : null;
    const stock = initialVariant ? (Number(initialVariant.current_stock) || 0) : (Number(found.actual_balance ?? found.current_stock) || 0);

    setForm(prev => {
      const updated = [...prev.items];
      const existingQty = updated[index]?.quantity;
      const initialQty = existingQty && Number(existingQty) > 0 ? existingQty : '1';
      updated[index] = {
        ...updated[index],
        product_id: found.id,
        product_code: found.code,
        code_error: '',
        variant_id: initialVariant ? initialVariant.id : '',
        quantity: initialQty,
        price_before_discount: String(sellPrice),
        discount_value: '0',
        unit_selling_price: String(sellPrice),
        available_stock: stock,
        has_variants: hasVars,
        variants_list: variants
      };
      return { ...prev, items: updated };
    });

    setFocusedItem(found);

    // Move focus to quantity field
    setTimeout(() => {
      quantityInputRefs.current[index]?.focus();
      quantityInputRefs.current[index]?.select?.();
    }, 50);
  };

  // When product is selected in a row dropdown: fills code and syncs
  const handleProductChange = (index, productId) => {
    const prod = products.find(p => String(p.id) === String(productId));
    if (!prod) return;

    const sellPrice = Number(prod.selling_price) || 0;
    const variants = Array.isArray(prod.variants) ? prod.variants : [];
    const hasVars = variants.length > 0;
    const initialVariant = hasVars ? variants[0] : null;
    const stock = initialVariant ? (Number(initialVariant.current_stock) || 0) : (Number(prod.actual_balance ?? prod.current_stock) || 0);

    setForm(prev => {
      const updated = [...prev.items];
      const existingQty = updated[index]?.quantity;
      const initialQty = existingQty && Number(existingQty) > 0 ? existingQty : '1';
      updated[index] = {
        ...updated[index],
        product_id: productId,
        product_code: prod.code || '',
        code_error: '',
        variant_id: initialVariant ? initialVariant.id : '',
        quantity: initialQty,
        price_before_discount: String(sellPrice),
        discount_value: '0',
        unit_selling_price: String(sellPrice),
        available_stock: stock,
        has_variants: hasVars,
        variants_list: variants
      };
      return { ...prev, items: updated };
    });

    setFocusedItem(prod);

    // Move focus to quantity field
    setTimeout(() => {
      quantityInputRefs.current[index]?.focus();
      quantityInputRefs.current[index]?.select?.();
    }, 50);
  };

  // When variant changes
  const handleVariantChange = (index, variantId) => {
    setForm(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const variant = (cur.variants_list || []).find(v => String(v.id) === String(variantId));
      const stock = variant ? (Number(variant.current_stock) || 0) : cur.available_stock;

      updated[index] = {
        ...cur,
        variant_id: variantId,
        available_stock: stock
      };
      return { ...prev, items: updated };
    });
  };

  // Per line: price before discount -> discount value -> price after discount (Requirement F2)
  const handleLinePriceBeforeDiscountChange = (index, val) => {
    setForm(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const before = Number(val) || 0;
      const discount = Number(cur.discount_value) || 0;
      const after = Math.max(0, before - discount);

      updated[index] = {
        ...cur,
        price_before_discount: val,
        unit_selling_price: String(after)
      };
      return { ...prev, items: updated };
    });
  };

  const handleLineDiscountValueChange = (index, val) => {
    setForm(prev => {
      const updated = [...prev.items];
      const cur = updated[index];
      const before = Number(cur.price_before_discount) || 0;
      const discount = Number(val) || 0;
      const after = Math.max(0, before - discount);

      updated[index] = {
        ...cur,
        discount_value: val,
        unit_selling_price: String(after)
      };
      return { ...prev, items: updated };
    });
  };

  const handleLineQtyChange = (index, qtyVal) => {
    setForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        quantity: qtyVal
      };
      return { ...prev, items: updated };
    });
  };

  const handleRemoveLine = (index) => {
    if (form.items.length <= 1) return;
    setForm(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  // Requirement L2: Strict Line-Item Rule
  const lastLine = form.items[form.items.length - 1];
  const isLastLineComplete = Boolean(
    lastLine &&
    lastLine.product_id &&
    (!lastLine.has_variants || lastLine.variant_id) &&
    Number(lastLine.quantity) > 0 &&
    Number(lastLine.unit_selling_price) >= 0 &&
    lastLine.unit_selling_price !== ''
  );

  const handleAddLine = () => {
    if (!isLastLineComplete) return;
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product_id: '',
          variant_id: '',
          quantity: '1',
          price_before_discount: '',
          discount_value: '0',
          unit_selling_price: '',
          available_stock: 0,
          has_variants: false,
          variants_list: []
        }
      ]
    }));
  };

  // Invoice Subtotal / Total Calculation
  const invoiceTotal = form.items.reduce((sum, it) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_selling_price) || 0;
    return sum + (q * p);
  }, 0);

  // Authoritative Customer Account Summary Calculations (Integer Piasters)
  const actualPaidAmount = form.payment_terms === 'cash' ? invoiceTotal : 0;
  const customerPreviousBalance = customerBalance || 0;
  const resultingCustomerBalance = fromPiasters(
    toPiasters(customerPreviousBalance) + toPiasters(invoiceTotal) - toPiasters(actualPaidAmount)
  );

  // Credit Limit Check (Requirement F3 & Customer Deal Type Rule)
  useEffect(() => {
    const isCustomerCredit = selectedCustomer && (
      selectedCustomer.customer_deal_type === 'credit' ||
      (selectedCustomer.customer_deal_type !== 'cash' && selectedCustomer.payment_terms === 'credit')
    );

    if (form.payment_terms === 'credit' && isCustomerCredit && selectedCustomer.credit_limit > 0) {
      const limit = Number(selectedCustomer.credit_limit) || 0;
      const totalDue = customerBalance + invoiceTotal;
      if (totalDue > limit) {
        const excess = Number((totalDue - limit).toFixed(2));
        setCreditLimitExceeded({
          limit,
          totalDue,
          excess,
          message: `تنبيه: مديونية العميل مع الفاتورة الحالية ستصبح (${formatCurrency(totalDue)}) وتتجاوز الحد الائتماني (${formatCurrency(limit)}) بمقدار (${formatCurrency(excess)}). يمنع الحفظ آجل.`
        });
      } else {
        setCreditLimitExceeded(null);
      }
    } else {
      setCreditLimitExceeded(null);
    }
  }, [form.payment_terms, selectedCustomer, customerBalance, invoiceTotal]);

  const validate = () => {
    const errs = {};
    if (!form.customer_id) errs.customer_id = 'يرجى تحديد العميل';
    if (outlets.length > 0 && !form.outlet_id) errs.outlet_id = 'يرجى تحديد الفرع أو المعرض';
    if (!form.invoice_date) errs.invoice_date = 'تاريخ الفاتورة مطلوب';

    if (creditLimitExceeded) {
      errs.credit_limit = creditLimitExceeded.message;
    }

    if (form.items.length === 0) {
      errs.items = 'لا يمكن إصدار فاتورة بدون بنود';
    }

    // Check line errors
    const lineErrors = [];
    form.items.forEach((line, idx) => {
      if (!line.product_id || Number(line.quantity) <= 0 || (line.has_variants && !line.variant_id)) {
        lineErrors.push(idx + 1);
      }
      if (Number(line.quantity) > line.available_stock && line.available_stock > 0) {
        errs.stock = `الكمية في البند (${idx + 1}) تتجاوز الرصيد المتاح (${line.available_stock})`;
      }
    });

    if (lineErrors.length > 0) {
      errs.items = `البنود (${lineErrors.join(', ')}) غير مكتملة. حدد الصنف والمقاس/اللون والكمية.`;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRequestIssue = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!validate()) return;
    setShowConfirmModal(true);
  };

  const handlePostIssueDone = () => {
    setShowPrintModal(false);
    setIssuedInvoice(null);
    if (onSaved) {
      onSaved();
    } else {
      window.location.hash = '#/sales';
    }
  };

  const handleExecutePrint = async ({ paperSize, printerName, documentData }) => {
    const doc = documentData || issuedInvoice;
    if (window.electronAPI?.printHtml) {
      try {
        const showBalances = localStorage.getItem('erp_print_show_account_balances') === 'true';
        const html = generateSalesInvoiceHtml(doc, settingsRes, paperSize, null, showBalances);
        const res = await window.electronAPI.printHtml(html, {
          silent: Boolean(printerName),
          printerName,
          paperSize: paperSize === '80mm' ? '80mm' : 'A4',
        });
        return res;
      } catch (err) {
        return { error: err.message || 'فشلت الطباعة' };
      }
    } else {
      const docId = doc?.id || doc?.invoice_number;
      window.location.hash = `#/print-preview?type=${paperSize === '80mm' ? 'sales_invoice_thermal' : 'sales_invoice'}&id=${docId}&paper=${paperSize}`;
      return { success: true };
    }
  };

  const handleExecutePreview = ({ paperSize, documentData }) => {
    const doc = documentData || issuedInvoice;
    const docId = doc?.id || doc?.invoice_number;
    window.location.hash = `#/print-preview?type=${paperSize === '80mm' ? 'sales_invoice_thermal' : 'sales_invoice'}&id=${docId}&paper=${paperSize}`;
  };

  const handleConfirmIssue = async () => {
    try {
      setSaving(true);
      const payload = {
        invoice_number: form.invoice_number,
        customer_id: form.customer_id,
        outlet_id: form.outlet_id || null,
        invoice_date: form.invoice_date,
        payment_terms: form.payment_terms,
        due_date: form.payment_terms === 'credit' ? (form.due_date || null) : null,
        notes: form.notes,
        items: form.items.map(it => ({
          product_id: it.product_id,
          variant_id: it.variant_id || null,
          quantity: Number(it.quantity) || 1,
          price_before_discount: Number(it.price_before_discount) || 0,
          discount_value: Number(it.discount_value) || 0,
          unit_selling_price: Number(it.unit_selling_price) || 0,
          line_total: (Number(it.quantity) || 1) * (Number(it.unit_selling_price) || 0)
        }))
      };

      const res = await api.createSalesInvoice(payload);
      isSavedRef.current = true;
      navigationGuard.unregister();
      setShowConfirmModal(false);
      if (onNotify) onNotify('تم إصدار فاتورة المبيعات بنجاح');

      // Check settings for post-issue print behavior
      const settingsRes = await api.getSettings().catch(() => null);
      const printMode = settingsRes?.post_issue_print_sales || 'ask'; // 'ask' | 'auto' | 'none'

      if (printMode === 'none') {
        handlePostIssueDone();
        return;
      }

      setIssuedInvoice(res);

      if (printMode === 'auto') {
        try {
          const savedPref = JSON.parse(localStorage.getItem('erp_post_issue_print_sales_invoice') || '{}');
          const paperSize = savedPref.paperSize || 'a4';
          const printerName = savedPref.printerName || '';
          const showBalances = localStorage.getItem('erp_print_show_account_balances') === 'true';
          if (window.electronAPI?.printHtml) {
            const html = generateSalesInvoiceHtml(res, settingsRes, paperSize, null, showBalances);
            await window.electronAPI.printHtml(html, {
              silent: Boolean(printerName),
              printerName,
              paperSize: paperSize === '80mm' ? '80mm' : 'A4',
            });
          }
        } catch (e) {
          console.warn('Auto print error:', e);
        }
        handlePostIssueDone();
        return;
      }

      // Default: 'ask' -> open PostIssuePrintDialog
      setShowPrintModal(true);
    } catch (err) {
      alert(err.message || 'فشل في حفظ الفاتورة');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(
    form.customer_id &&
    (outlets.length === 0 || form.outlet_id) &&
    !creditLimitExceeded &&
    form.items.length > 0 &&
    isLastLineComplete
  );

  return (
    <PageContainer
      title="إصدار فاتورة مبيعات جديدة"
      subtitle="شروط دفع نقدي أو آجل، فحص الحد الائتماني للعميل، وجدول الأسعار قبل وبعد الخصم"
      breadcrumbs={[
        { label: 'المبيعات', href: '#/sales' },
        { label: 'فاتورة جديدة' }
      ]}
      hasBottomBar={true}
      onSave={handleRequestIssue}
      onCancel={() => { window.location.hash = '#/sales'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار الفاتورة"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>شروط الدفع: <span className="font-bold text-[#1F3A5F]">{form.payment_terms === 'credit' ? 'آجل' : 'نقدي فوري'}</span></span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-900 text-sm">إجمالي الفاتورة: <span className="font-mono text-base font-bold text-green-700">{formatCurrency(invoiceTotal)}</span></span>
        </div>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} onKeyDown={handleFormKeyDown} className="space-y-6">
        {/* Customer Balance & Credit Limit Badge Banner (Requirement F3) */}
        {/* Customer Account Summary Card (4 Metrics: Before, Invoice Total, Actual Paid, After) */}
        {selectedCustomer && (
          <div className="bg-white border-2 border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1F3A5F] flex items-center justify-center font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-gray-500 font-semibold block">بيانات العميل المحدد</span>
                  <span className="font-bold text-gray-900 text-sm">{selectedCustomer.name}</span>
                  {selectedCustomer.phone && (
                    <span className="text-xs text-gray-500 font-mono block">هاتف: {selectedCustomer.phone}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div>
                  <span className="text-xs text-gray-500 block">الحد الائتماني:</span>
                  <span className="font-mono text-sm font-bold text-emerald-700">
                    {selectedCustomer.credit_limit > 0 ? formatCurrency(selectedCustomer.credit_limit) : 'غير مقيد'}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Read-Only Authoritative Balance Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-[11px] text-slate-500 block mb-0.5">رصيد العميل قبل الفاتورة</span>
                <span className="font-mono text-sm font-bold text-slate-800">
                  {formatCurrency(customerPreviousBalance)}
                </span>
              </div>
              <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-200">
                <span className="text-[11px] text-blue-700 block mb-0.5">إجمالي الفاتورة</span>
                <span className="font-mono text-sm font-bold text-blue-900">
                  {formatCurrency(invoiceTotal)}
                </span>
              </div>
              <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200">
                <span className="text-[11px] text-emerald-700 block mb-0.5">المدفوع فعليًا</span>
                <span className="font-mono text-sm font-bold text-emerald-800">
                  {formatCurrency(actualPaidAmount)}
                </span>
              </div>
              <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-300">
                <span className="text-[11px] text-amber-800 block mb-0.5">الرصيد بعد الفاتورة</span>
                <span className="font-mono text-sm font-bold text-amber-900">
                  {formatCurrency(resultingCustomerBalance)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Credit Limit Blocker Message (Requirement F3) */}
        {creditLimitExceeded && (
          <div className="p-4 bg-rose-50 border-2 border-rose-400 rounded-lg text-xs font-bold text-rose-900 flex items-start gap-3 animate-fadeIn">
            <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-bold text-rose-700">تجاوز الحد الائتماني المسموح به!</div>
              <p>{creditLimitExceeded.message}</p>
              <div className="text-[11px] text-rose-600 font-semibold">
                يرجى تحصيل دفعة نقدية فورية من العميل أولاً، أو تحويل الفاتورة إلى دفع (نقدي).
              </div>
            </div>
          </div>
        )}

        {/* Invoice Header Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#1F3A5F]" />
            بيانات الفاتورة والعميل
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Invoice Number */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                رقم الفاتورة (آلي)
              </label>
              <input
                type="text"
                value={form.invoice_number}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-sm font-mono font-bold text-gray-700"
              />
            </div>

            {/* Customer Selector + Shortcut */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700">
                  العميل <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => { window.location.hash = '#/customers/new'; }}
                  className="text-[11px] font-bold text-[#1F3A5F] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>+ عميل جديد</span>
                </button>
              </div>
              <select
                value={form.customer_id}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-bold text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              >
                <option value="">-- اختر العميل --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} (الرصيد: {formatCurrency(c.customer_balance || 0)}){c.credit_limit > 0 ? ` - حد الائتمان: ${c.credit_limit}` : ''}
                  </option>
                ))}
              </select>
              <FieldError error={errors.customer_id} />
            </div>

            {/* Outlet Selector + Quick Add & Management (Shown ONLY when outlets exist) */}
            {outlets.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="sales-invoice-outlet-select" className="block text-xs font-bold text-gray-700">
                    الفرع / المعرض <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickOutletModal(true)}
                      className="text-[11px] font-bold text-[#1F3A5F] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      title="إضافة فرع أو معرض جديد سريعاً"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ فرع جديد</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { window.location.hash = '#/outlets'; }}
                      className="text-[11px] text-gray-500 hover:text-[#1F3A5F] inline-flex items-center gap-0.5 cursor-pointer"
                      title="إدارة وتعديل وحذف كافة الفروع"
                    >
                      <Store className="w-3 h-3" />
                      <span>إدارة</span>
                    </button>
                  </div>
                </div>
                <select
                  id="sales-invoice-outlet-select"
                  aria-required="true"
                  aria-invalid={Boolean(errors.outlet_id)}
                  value={form.outlet_id}
                  onChange={(e) => setForm(prev => ({ ...prev, outlet_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                  required
                >
                  <option value="">-- اختر المنفذ --</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <FieldError error={errors.outlet_id} />
              </div>
            )}

            {/* Invoice Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                تاريخ الفاتورة <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) => handleInvoiceDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
            </div>

            {/* Payment Terms */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                طريقة الدفع <span className="text-red-500">*</span>
              </label>
              <select
                value={form.payment_terms}
                onChange={(e) => handlePaymentTermsChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-bold bg-white text-[#1F3A5F] focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="cash">نقدي فوري</option>
                <option value="credit">آجل</option>
              </select>
            </div>

            {/* Notes */}
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ملاحظات الفاتورة
              </label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
              <p className="text-xs text-gray-500 mt-1">بيانات الاستلام أو بوليصة الشحن</p>
            </div>
          </div>
        </div>

        {/* Section 2: Line Items with Code Lookup & Live Stock Side Panel (Requirement 6) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                  بنود الفاتورة والأسعار والخصومات
                </h2>
                <span className="text-xs text-gray-500 font-medium">
                  اكتب كود الصنف أو اختره بالاسم. عند إدخال الكود يتم تحميل الصنف والانتقال لحقل الكمية مباشرة.
                </span>
              </div>
            </div>

            <FieldError error={errors.items} />
            <FieldError error={errors.stock} />

            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3 w-28 text-center font-mono">كود الصنف</th>
                    <th className="p-3 min-w-[180px]">المنتج</th>
                    <th className="p-3 min-w-[130px]">المقاس واللون</th>
                    <th className="p-3 w-24 text-center font-mono">الرصيد المتاح</th>
                    <th className="p-3 w-24 text-center font-mono">الكمية المباعة</th>
                    <th className="p-3 min-w-[120px] text-center font-mono whitespace-nowrap">السعر قبل الخصم</th>
                    <th className="p-3 min-w-[110px] text-center font-mono text-red-300 whitespace-nowrap">قيمة الخصم</th>
                    <th className="p-3 min-w-[120px] text-center font-mono text-emerald-300 whitespace-nowrap">السعر بعد الخصم</th>
                    <th className="p-3 min-w-[130px] text-left font-mono whitespace-nowrap">إجمالي البند</th>
                    <th className="p-3 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.items.map((line, idx) => {
                    const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_selling_price) || 0);
                    const isStockShortage = Number(line.quantity) > line.available_stock && line.available_stock > 0;
                    return (
                      <tr key={idx} className={`hover:bg-blue-50/30 ${isStockShortage ? 'bg-rose-50/40' : ''}`}>
                        <td className="p-3 text-center font-bold text-gray-400">{idx + 1}</td>

                        {/* Product Code Field (Requirement 6) */}
                        <td className="p-2">
                          <input
                            type="text"
                            inputMode="text"
                            value={line.product_code || ''}
                            onChange={(e) => handleProductCodeChange(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleProductCodeLookup(idx);
                              }
                            }}
                            onBlur={() => handleProductCodeLookup(idx)}
                            className={`w-full px-2 py-1.5 border rounded-md text-xs font-mono font-bold text-center bg-white ${
                              line.code_error ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300 text-gray-900'
                            }`}
                          />
                          {line.code_error && (
                            <span className="text-[10px] text-red-600 font-bold block mt-0.5 whitespace-nowrap">
                              {line.code_error}
                            </span>
                          )}
                        </td>

                        {/* Product Selector */}
                        <td className="p-2">
                          <select
                            value={line.product_id}
                            onChange={(e) => handleProductChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                            required
                          >
                            <option value="">-- اختر المنتج --</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} [{p.code}]
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Variant Selector (Size & Color) */}
                        <td className="p-2">
                          {line.has_variants ? (
                            <select
                              value={line.variant_id}
                              onChange={(e) => handleVariantChange(idx, e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                              required
                            >
                              <option value="">-- المقاس واللون --</option>
                              {line.variants_list.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.size} - {v.color} (متاح: {v.current_stock ?? v.opening_balance})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-400 font-semibold block text-center">مقاس موحد</span>
                          )}
                        </td>

                        {/* Available Stock */}
                        <td className="p-3 text-center font-mono font-bold text-blue-700">
                          {line.available_stock}
                        </td>

                        {/* Selling Quantity (NumberInput, disabled wheel/arrows) */}
                        <td className="p-2 text-center">
                          <NumberInput
                            ref={(el) => { quantityInputRefs.current[idx] = el; }}
                            value={line.quantity}
                            onChange={(e) => handleLineQtyChange(idx, e.target.value)}
                            className={`w-full px-2.5 py-1.5 border rounded-md text-xs text-center font-mono font-bold bg-white ${
                              isStockShortage ? 'border-red-500 text-red-700 bg-red-50' : 'border-gray-300'
                            }`}
                            required
                          />
                        </td>

                        {/* Price Before Discount (MoneyInput) */}
                        <td className="p-2 text-center">
                          <MoneyInput
                            dir="ltr"
                            value={line.price_before_discount}
                            onChange={(e) => handleLinePriceBeforeDiscountChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs text-center font-mono font-bold bg-white"
                            required
                          />
                        </td>

                        {/* Discount Value (MoneyInput) */}
                        <td className="p-2 text-center">
                          <MoneyInput
                            dir="ltr"
                            value={line.discount_value}
                            onChange={(e) => handleLineDiscountValueChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs text-center font-mono font-bold text-red-600 bg-white"
                          />
                        </td>

                        {/* Price After Discount (Requirement F2) */}
                        <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/40 whitespace-nowrap min-w-[120px]">
                          {formatCurrency(line.unit_selling_price)}
                        </td>

                        {/* Line Total */}
                        <td className="p-3 text-left font-mono font-bold text-gray-900 whitespace-nowrap min-w-[130px]">
                          {formatCurrency(lineTotal)}
                        </td>

                        {/* Remove Button */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            disabled={form.items.length <= 1}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Line Button (Strict Line-Item Rule) */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleAddLine}
                disabled={!isLastLineComplete}
                className={`px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLastLineComplete
                    ? 'bg-blue-50 text-[#1F3A5F] border border-blue-200 hover:bg-blue-100'
                    : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>+ إضافة صنف جديد للفاتورة</span>
              </button>

              {!isLastLineComplete && (
                <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>أكمل بيانات البند الحالي أولاً لإتاحة إضافة بند جديد</span>
                </span>
              )}
            </div>
          </div>

          {/* Informational Side Panel (Requirement 6) */}
          <div className="lg:col-span-1">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 sticky top-4 text-xs">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="font-bold text-slate-800">
                  بيانات ورصيد الصنف الحي
                </span>
              </div>

              {focusedItem ? (
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-500 block text-[11px]">اسم الصنف:</span>
                    <span className="font-bold text-gray-900 block text-sm">{focusedItem.name}</span>
                    <span className="text-gray-400 font-mono text-[11px] block mt-0.5">كود: [{focusedItem.code}]</span>
                  </div>

                  {focusedItem.item_group && (
                    <div>
                      <span className="text-gray-500 block text-[11px]">المجموعة:</span>
                      <span className="font-semibold text-gray-800">{focusedItem.item_group}</span>
                    </div>
                  )}

                  <div className="p-3 bg-white border border-slate-200 rounded-lg">
                    <span className="text-gray-600 block text-[11px]">الرصيد الفعلي الحالي (المخزن):</span>
                    <span className="text-xl font-bold font-mono text-blue-700 block mt-1">
                      {focusedItem.actual_balance ?? focusedItem.current_stock ?? 0} {focusedItem.unit || 'قطعة'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-gray-600 font-semibold">سعر التكلفة:</span>
                      <span className="font-mono font-bold text-gray-900">
                        {formatCurrency(focusedItem.cost_price || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-slate-200">
                      <span className="text-gray-600 font-semibold">سعر البيع المعتمد:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {formatCurrency(focusedItem.selling_price || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-gray-400 leading-relaxed">
                  اختر صنفاً أو اكتب كوده لعرض رصيده الفعلي الحي وأسعار التكلفة والبيع هنا.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Bottom Invoice Summary (Requirement F2) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs text-gray-500 font-semibold block">إجمالي عدد القطع بالفاتورة</span>
            <span className="font-mono text-base font-bold text-gray-800">
              {form.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)} قطعة
            </span>
          </div>

          <div className="text-left">
            <span className="text-xs font-semibold text-gray-500 block">إجمالي الفاتورة النهائي</span>
            <div className="text-2xl font-bold font-mono text-green-700">
              {formatCurrency(invoiceTotal)}
            </div>
          </div>
        </div>
      </form>

      {/* Quick Outlet Modal */}
      <QuickOutletModal
        isOpen={showQuickOutletModal}
        onClose={() => setShowQuickOutletModal(false)}
        onCreated={handleOutletCreated}
        onNotify={onNotify}
      />

      {/* Invoice Issuance Confirmation Modal */}
      <DocumentConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmIssue}
        title="تأكيد إصدار فاتورة المبيعات"
        documentType="فاتورة مبيعات"
        partyLabel="العميل"
        partyName={selectedCustomer?.name || ''}
        paymentType={form.payment_terms}
        totalAmount={invoiceTotal}
        isSubmitting={saving}
      />

      {/* Post-Issue Print Dialog (Requirement 2) */}
      <PostIssuePrintDialog
        isOpen={showPrintModal}
        onClose={handlePostIssueDone}
        onFinished={handlePostIssueDone}
        documentType="sales_invoice"
        documentNumber={issuedInvoice?.invoice_number || form.invoice_number}
        documentTitle={`تم إصدار فاتورة المبيعات رقم ${issuedInvoice?.invoice_number || form.invoice_number}`}
        documentData={issuedInvoice}
        onPrint={handleExecutePrint}
        onPreview={handleExecutePreview}
      />
    </PageContainer>
  );
}
