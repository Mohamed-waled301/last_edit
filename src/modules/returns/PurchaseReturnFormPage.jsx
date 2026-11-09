import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  RotateCcw, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign, 
  Package, 
  Plus, 
  Trash2, 
  ArrowRight,
  Printer,
  Building2,
  FileText,
  Landmark
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import db from '../../data/db';
import { formatCurrency, getTodayDateString, formatDate } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import { handleFormKeyDown } from '../../utils/formNavigation';
import { navigationGuard } from '../../utils/navigationGuard';
import { getEntityCurrentBalance } from '../../services/balanceService';

export default function PurchaseReturnFormPage({ onBack, onNotify }) {
  const isSavedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Core Data
  const [suppliers, setSuppliers] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [supplierInvoices, setSupplierInvoices] = useState([]);

  // Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierData, setSupplierData] = useState(null);
  const [supplierBalance, setSupplierBalance] = useState(0);
  const [supplierOpeningType, setSupplierOpeningType] = useState('credit');

  const [returnMode, setReturnMode] = useState('against_invoice'); // 'against_invoice' | 'free_return'
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const [returnDate, setReturnDate] = useState(getTodayDateString());
  const [generalReason, setGeneralReason] = useState('غير مطابق للمواصفات الفنية');
  const [customReason, setCustomReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('deduct_balance'); // 'deduct_balance' | 'cash_refund'
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [notes, setNotes] = useState('');

  // Matrix Lines
  const [rows, setRows] = useState([
    {
      id: 'line-1',
      item_id: '',
      item_name: '',
      item_code: '',
      color: '',
      size: '',
      unit: 'قطعة',
      available_stock: 0,
      max_invoice_qty: 0,
      quantity: '',
      unit_price: '',
      line_reason: ''
    }
  ]);

  const [errors, setErrors] = useState({});

  // 1. Initial Load: suppliers, inventory items, treasuries
  useEffect(() => {
    async function initData() {
      try {
        setLoading(true);
        const [supRes, rawMatRes, itmRes, trRes] = await Promise.all([
          api.getSuppliers ? api.getSuppliers() : { data: [] },
          db.materials ? db.materials.toArray() : [],
          db.items ? db.items.toArray() : [],
          db.treasury_accounts ? db.treasury_accounts.toArray() : []
        ]);

        const rawSups = Array.isArray(supRes.data) ? supRes.data : (Array.isArray(supRes) ? supRes : []);
        setSuppliers(rawSups);

        // Combine items and materials for inventory catalogue
        const combined = new Map();
        for (const m of rawMatRes) {
          if (m && m.id) {
            combined.set(m.id, {
              id: m.id,
              name: m.name || '',
              code: m.code || '',
              unit: m.unit || 'متر',
              color: m.color || '',
              size: m.size || '',
              current_stock: Number(m.current_stock) || 0,
              cost_price: Number(m.last_purchase_price || m.cost_price || 0)
            });
          }
        }
        for (const it of itmRes) {
          if (it && it.id) {
            const existing = combined.get(it.id);
            combined.set(it.id, {
              id: it.id,
              name: it.name || existing?.name || '',
              code: it.code || existing?.code || '',
              unit: it.unit || existing?.unit || 'قطعة',
              color: it.color || existing?.color || '',
              size: it.size || existing?.size || '',
              current_stock: Number(it.current_stock ?? existing?.current_stock ?? 0),
              cost_price: Number(it.last_purchase_price || it.cost_price || existing?.cost_price || 0)
            });
          }
        }
        setInventoryItems(Array.from(combined.values()));

        // Treasuries
        const activeTreasuries = (Array.isArray(trRes) ? trRes : []).filter(t => t.is_active !== 0);
        setTreasuryAccounts(activeTreasuries);
        const mainTr = activeTreasuries.find(t => t.is_main === 1) || activeTreasuries[0];
        if (mainTr) setSelectedAccountId(mainTr.id);
      } catch (err) {
        console.error('Failed to load initial data for purchase returns:', err);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  // 2. Navigation Guard
  useEffect(() => {
    const unregister = navigationGuard.register(() => {
      if (isSavedRef.current) return false;
      const hasRows = rows.some(r => r.item_id && Number(r.quantity) > 0);
      return Boolean(selectedSupplierId || hasRows || notes.trim());
    });
    return unregister;
  }, [selectedSupplierId, rows, notes]);

  // 3. Load Supplier Live Balance and Invoices when supplier changes
  useEffect(() => {
    async function loadSupplierDetails() {
      if (!selectedSupplierId) {
        setSupplierData(null);
        setSupplierBalance(0);
        setSupplierInvoices([]);
        setSelectedInvoiceId('');
        setSelectedInvoice(null);
        return;
      }

      try {
        const bal = await getEntityCurrentBalance(selectedSupplierId);
        setSupplierBalance(Number(bal.supplierBalance) || 0);
        setSupplierOpeningType(bal.supplierOpeningType || 'credit');

        const supObj = suppliers.find(s => s.id === selectedSupplierId);
        setSupplierData(supObj || null);

        // Fetch supplier's purchase orders and invoices
        const [orders, invoices] = await Promise.all([
          db.purchase_orders ? db.purchase_orders.where('supplier_id').equals(selectedSupplierId).toArray() : [],
          db.supplier_invoices ? db.supplier_invoices.where('supplier_id').equals(selectedSupplierId).toArray() : []
        ]);

        const allInvoices = [
          ...(Array.isArray(orders) ? orders.map(o => ({
            id: o.id,
            po_number: o.po_number || o.id,
            date: o.order_date || o.created_at,
            total_amount: Number(o.total_amount ?? o.grand_total ?? 0),
            items: o.items || [],
            type: 'أمر توريد / شراء'
          })) : []),
          ...(Array.isArray(invoices) ? invoices.map(i => ({
            id: i.id,
            po_number: i.invoice_number || i.id,
            date: i.invoice_date || i.created_at,
            total_amount: Number(i.total_amount ?? 0),
            items: i.items || [],
            type: 'فاتورة مورد'
          })) : [])
        ];

        // Deduplicate by number/id
        const seen = new Set();
        const unique = [];
        for (const inv of allInvoices) {
          const key = inv.po_number || inv.id;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(inv);
          }
        }
        setSupplierInvoices(unique);
      } catch (err) {
        console.error('Failed to load supplier details:', err);
      }
    }
    loadSupplierDetails();
  }, [selectedSupplierId, suppliers]);

  // Handle Invoice Selection
  const handleSelectInvoice = (invId) => {
    setSelectedInvoiceId(invId);
    const found = supplierInvoices.find(i => String(i.id) === String(invId));
    setSelectedInvoice(found || null);
  };

  // Populate items from selected invoice into the matrix
  const handlePopulateInvoiceItems = () => {
    if (!selectedInvoice || !Array.isArray(selectedInvoice.items) || selectedInvoice.items.length === 0) {
      if (onNotify) onNotify('الفاتورة المحددة لا تحتوي على بنود مسجلة', 'error');
      return;
    }

    const newRows = selectedInvoice.items.map((it, idx) => {
      const itmId = it.material_id || it.item_id || it.id;
      const invMaster = inventoryItems.find(x => x.id === itmId);
      const stock = invMaster ? invMaster.current_stock : 0;
      const origQty = Number(it.quantity_ordered ?? it.quantity ?? 1);
      const unitPrice = Number(it.unit_price ?? it.cost_price ?? 0);

      return {
        id: `line-${idx + 1}`,
        item_id: itmId || `inv-item-${idx}`,
        item_name: it.material_name || it.item_name || invMaster?.name || 'صنف بالفاتورة',
        item_code: it.item_code || invMaster?.code || '',
        color: it.color || invMaster?.color || '',
        size: it.size || invMaster?.size || '',
        unit: it.material_unit || it.unit || invMaster?.unit || 'قطعة',
        available_stock: stock,
        max_invoice_qty: origQty,
        quantity: Math.min(origQty, stock > 0 ? stock : origQty),
        unit_price: unitPrice,
        line_reason: generalReason
      };
    });

    setRows(newRows);
    if (onNotify) onNotify(`تم إدراج ${newRows.length} بنود من الفاتورة الأصلية بنجاح`);
  };

  // Matrix Row Management
  const handleAddRow = () => {
    setRows(prev => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length + 1}`,
        item_id: '',
        item_name: '',
        item_code: '',
        color: '',
        size: '',
        unit: 'قطعة',
        available_stock: 0,
        max_invoice_qty: 0,
        quantity: '',
        unit_price: '',
        line_reason: ''
      }
    ]);
  };

  const handleRemoveRow = (index) => {
    if (rows.length === 1) {
      setRows([
        {
          id: `line-${Date.now()}`,
          item_id: '',
          item_name: '',
          item_code: '',
          color: '',
          size: '',
          unit: 'قطعة',
          available_stock: 0,
          max_invoice_qty: 0,
          quantity: '',
          unit_price: '',
          line_reason: ''
        }
      ]);
      return;
    }
    setRows(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleRowItemChange = (index, itemId) => {
    const itm = inventoryItems.find(x => x.id === itemId);
    setRows(prev => prev.map((r, idx) => {
      if (idx !== index) return r;
      return {
        ...r,
        item_id: itemId,
        item_name: itm ? itm.name : '',
        item_code: itm ? itm.code : '',
        color: itm ? itm.color : '',
        size: itm ? itm.size : '',
        unit: itm ? itm.unit : 'قطعة',
        available_stock: itm ? itm.current_stock : 0,
        unit_price: itm ? String(itm.cost_price || '') : '',
        quantity: '1'
      };
    }));
  };

  const handleRowFieldChange = (index, field, value) => {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== index) return r;
      return { ...r, [field]: value };
    }));
  };

  // Calculated Totals
  const { totalItemsCount, totalReturnedQuantity, totalRefundAmount } = useMemo(() => {
    let itemsCount = 0;
    let qtySum = 0;
    let refundSum = 0;

    for (const r of rows) {
      if (r.item_id && Number(r.quantity) > 0) {
        itemsCount += 1;
        const q = Number(r.quantity) || 0;
        const p = Number(r.unit_price) || 0;
        qtySum += q;
        refundSum += Number((q * p).toFixed(2));
      }
    }

    return {
      totalItemsCount: itemsCount,
      totalReturnedQuantity: qtySum,
      totalRefundAmount: Number(refundSum.toFixed(2))
    };
  }, [rows]);

  // Financial impact calculation
  const resultingSupplierBalance = useMemo(() => {
    if (refundMethod === 'cash_refund') {
      return supplierBalance;
    }
    // Deduct from supplier balance (reduces what we owe them)
    return Number((supplierBalance - totalRefundAmount).toFixed(2));
  }, [supplierBalance, totalRefundAmount, refundMethod]);

  // Validation
  const validate = () => {
    const errs = {};
    if (!selectedSupplierId) {
      errs.supplier_id = 'يرجى تحديد المورد / الجهة';
    }

    if (totalItemsCount === 0) {
      errs.rows = 'يرجى إضافة صنف واحد على الأقل مع تحديد كمية وسعر الرد';
    }

    // Check individual rows for stock availability
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.item_id) continue;
      const q = Number(r.quantity) || 0;
      if (q <= 0) {
        errs[`row_${i}_qty`] = 'الكمية يجب أن تكون أكبر من صفر';
      } else if (q > r.available_stock) {
        errs[`row_${i}_qty`] = `الكمية (${q}) تتجاوز رصيد المخزن المتاح (${r.available_stock} ${r.unit})`;
      }
    }

    if (refundMethod === 'cash_refund' && !selectedAccountId) {
      errs.account_id = 'يرجى تحديد الخزينة المستلمة للاسترداد النقدي';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Handle Submit
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const effectiveReason = generalReason === 'أخرى' && customReason.trim()
        ? customReason.trim()
        : generalReason;

      const itemsPayload = rows
        .filter(r => r.item_id && Number(r.quantity) > 0)
        .map(r => ({
          item_id: r.item_id,
          material_id: r.item_id,
          item_name: r.item_name,
          item_code: r.item_code,
          color: r.color,
          size: r.size,
          unit: r.unit,
          quantity: Number(r.quantity) || 0,
          unit_price: Number(r.unit_price) || 0,
          unit_cost: Number(r.unit_price) || 0,
          total_price: Number((Number(r.quantity) * Number(r.unit_price)).toFixed(2)),
          reason: r.line_reason || effectiveReason
        }));

      const res = await api.createSupplierReturn({
        supplier_id: selectedSupplierId,
        invoice_id: returnMode === 'against_invoice' ? selectedInvoiceId : null,
        po_id: returnMode === 'against_invoice' ? selectedInvoiceId : null,
        return_date: returnDate,
        items: itemsPayload,
        total_amount: totalRefundAmount,
        refund_amount: totalRefundAmount,
        refund_method: refundMethod,
        refund_status: refundMethod,
        account_id: refundMethod === 'cash_refund' ? selectedAccountId : null,
        reason: effectiveReason,
        notes: notes.trim()
      });

      isSavedRef.current = true;
      navigationGuard.unregister();

      if (onNotify) {
        onNotify(`تم إصدار إذن مرتجع المشتريات رقم ${res.returnNumber || res.returnId} وتحديث المخزون بنجاح`);
      }

      // Navigate to print preview of the return voucher with explicit return to dashboard
      const returnDocId = res.returnId || res.returnNumber;
      window.location.hash = `#/print-preview?type=purchase_return&id=${returnDocId}&returnUrl=dashboard`;
    } catch (err) {
      alert(err.message || 'فشل في حفظ إذن المرتجع');
    } finally {
      setSaving(false);
    }
  };

  const hasExcessQty = rows.some(r => r.item_id && Number(r.quantity) > r.available_stock);
  const isFormValid = Boolean(
    selectedSupplierId &&
    totalItemsCount > 0 &&
    totalReturnedQuantity > 0 &&
    !hasExcessQty &&
    (refundMethod !== 'cash_refund' || selectedAccountId)
  );

  return (
    <PageContainer
      title="تسجيل مرتجع مشتريات لمورد"
      subtitle="إرجاع خامات أو بضائع لمورد مع حصر أرصدة المخازن والخصم الفوري من كشف حساب المورد"
      breadcrumbs={[
        { label: 'المرتجعات', href: '#/returns' },
        { label: 'مرتجع مشتريات جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.location.hash = '#/returns'; }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText="إصدار إذن المرتجع"
      extraBottomContent={
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
          <span>عدد البنود: <span className="font-mono text-[#1F3A5F]">{totalItemsCount}</span></span>
          <span className="text-gray-300">|</span>
          <span>إجمالي الكميات: <span className="font-mono text-gray-900">{totalReturnedQuantity}</span></span>
          <span className="text-gray-300">|</span>
          <span>طريقة الرد: <span className="text-[#1F3A5F]">{refundMethod === 'cash_refund' ? 'استرداد نقدي بالخزينة' : 'خصم من رصيد المورد'}</span></span>
          <span className="text-gray-300">|</span>
          <span className="text-rose-700">قيمة المرتجع: <span className="font-mono text-base font-bold">{formatCurrency(totalRefundAmount)}</span></span>
        </div>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} onKeyDown={handleFormKeyDown} className="space-y-6">
        
        {/* Section 1: Supplier & Live Balance */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#1F3A5F]" />
              <span>بيانات المورد والحساب المالي</span>
            </h3>
            {supplierData && (
              <span className="text-xs text-gray-500 font-mono">
                كود المورد: {supplierData.code || '-'} | هاتف: {supplierData.phone || '-'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {/* Supplier Selector */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                المورد / الجهة *
              </label>
              <select
                required
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full h-11 rounded-md border border-gray-300 px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
                aria-label="اختيار المورد"
              >
                <option value="">اختر المورد أو الجهة...</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
              <FieldError error={errors.supplier_id} />
            </div>

            {/* Live Balance Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] font-bold text-gray-500 mb-1">الرصيد المالي الحالي للمورد</div>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-lg font-bold text-[#1F3A5F]">
                  {formatCurrency(supplierBalance)}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                  supplierBalance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {supplierBalance > 0 ? 'مستحق للمورد (دائن)' : supplierBalance < 0 ? 'دفعة مقدمة (مدين)' : 'متزن (0)'}
                </span>
              </div>
              {totalRefundAmount > 0 && refundMethod === 'deduct_balance' && (
                <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] flex justify-between text-gray-600">
                  <span>الرصيد بعد الخصم:</span>
                  <span className="font-mono font-bold text-rose-700">
                    {formatCurrency(resultingSupplierBalance)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Return Mode & Reference Invoice */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#1F3A5F]" />
              <span>مصدر المرتجع والمرجعية</span>
            </h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setReturnMode('against_invoice')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  returnMode === 'against_invoice'
                    ? 'bg-[#1F3A5F] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                مرتجع مرتبط بفاتورة / أمر شراء
              </button>
              <button
                type="button"
                onClick={() => setReturnMode('free_return')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  returnMode === 'free_return'
                    ? 'bg-[#1F3A5F] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                مرتجع حر من أرصدة المخزن
              </button>
            </div>
          </div>

          {returnMode === 'against_invoice' && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    اختر فاتورة / أمر الشراء المرجعي
                  </label>
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => handleSelectInvoice(e.target.value)}
                    disabled={!selectedSupplierId || supplierInvoices.length === 0}
                    className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-xs focus:border-[#1F3A5F] focus:outline-none"
                    aria-label="اختر فاتورة أو أمر الشراء"
                  >
                    <option value="">
                      {!selectedSupplierId 
                        ? 'يرجى اختيار المورد أولاً...' 
                        : supplierInvoices.length === 0 
                          ? 'لا توجد فواتير أو أوامر شراء مسجلة لهذا المورد' 
                          : 'اختر الفاتورة...'}
                    </option>
                    {supplierInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.po_number} ({formatDate(inv.date)}) - القيمة: {formatCurrency(inv.total_amount)} [{inv.type}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handlePopulateInvoiceItems}
                    disabled={!selectedInvoice}
                    className="w-full h-10 px-4 bg-[#1F3A5F] hover:bg-[#162a45] disabled:bg-gray-300 text-white rounded-md text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <FileText className="w-4 h-4" />
                    <span>إدراج بنود الفاتورة بالجدول</span>
                  </button>
                </div>
              </div>

              {selectedInvoice && (
                <div className="text-xs text-blue-900 bg-white/80 p-2.5 rounded border border-blue-100 flex items-center justify-between">
                  <span>
                    الفاتورة رقم: <strong className="font-mono">{selectedInvoice.po_number}</strong> | 
                    التاريخ: <span className="font-mono">{formatDate(selectedInvoice.date)}</span> | 
                    إجمالي الفاتورة: <span className="font-mono font-bold">{formatCurrency(selectedInvoice.total_amount)}</span>
                  </span>
                  <span className="font-bold text-blue-700">عدد البنود: {selectedInvoice.items?.length || 0}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Items Return Matrix */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-[#1F3A5F]" />
                <span>جدول الأصناف والخامات المرتجعة (مصفوفة المرتجع)</span>
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                حدد الأصناف والكميات المراد إرجاعها للمورد. يتم التحقق تلقائياً من توفر الرصيد بالمخزن وعدم تجاوزه
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddRow}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة سطر صنف</span>
            </button>
          </div>

          <FieldError error={errors.rows} />

          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold">
                <tr>
                  <th className="p-2.5 text-center w-10">#</th>
                  <th className="p-2.5 min-w-[200px]">الصنف / الخامة *</th>
                  <th className="p-2.5 w-24">اللون</th>
                  <th className="p-2.5 w-20">المقاس</th>
                  <th className="p-2.5 w-20">الوحدة</th>
                  <th className="p-2.5 text-center w-28">رصيد المخزن المتاح</th>
                  <th className="p-2.5 text-center w-28">الكمية المرتجعة *</th>
                  <th className="p-2.5 text-left w-28">سعر الوحدة (ج.م) *</th>
                  <th className="p-2.5 text-left w-28">الإجمالي (ج.م)</th>
                  <th className="p-2.5 min-w-[140px]">سبب السطر</th>
                  <th className="p-2.5 text-center w-12">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, idx) => {
                  const lineQty = Number(row.quantity) || 0;
                  const linePrice = Number(row.unit_price) || 0;
                  const lineTotal = Number((lineQty * linePrice).toFixed(2));
                  const isStockExcess = row.item_id && lineQty > row.available_stock;
                  const rowErr = errors[`row_${idx}_qty`];

                  return (
                    <tr key={row.id || idx} className={`hover:bg-gray-50/80 ${isStockExcess ? 'bg-rose-50/50' : ''}`}>
                      <td className="p-2.5 text-center font-mono text-gray-500 font-bold">{idx + 1}</td>
                      
                      {/* Item Selector */}
                      <td className="p-2">
                        <select
                          required
                          value={row.item_id}
                          onChange={(e) => handleRowItemChange(idx, e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs bg-white focus:border-[#1F3A5F] focus:outline-none"
                          aria-label={`اختيار الصنف للسطر ${idx + 1}`}
                        >
                          <option value="">اختر الصنف / الخامة...</option>
                          {inventoryItems.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name} {item.code ? `[${item.code}]` : ''} - (رصيد: {item.current_stock} {item.unit})
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Color */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.color}
                          onChange={(e) => handleRowFieldChange(idx, 'color', e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                          aria-label={`لون الصنف للسطر ${idx + 1}`}
                        />
                      </td>

                      {/* Size */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.size}
                          onChange={(e) => handleRowFieldChange(idx, 'size', e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                          aria-label={`مقاس الصنف للسطر ${idx + 1}`}
                        />
                      </td>

                      {/* Unit */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.unit}
                          onChange={(e) => handleRowFieldChange(idx, 'unit', e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs text-center"
                          aria-label={`وحدة الصنف للسطر ${idx + 1}`}
                        />
                      </td>

                      {/* Available Stock */}
                      <td className="p-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-mono font-bold ${
                          row.available_stock <= 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {row.available_stock} {row.unit}
                        </span>
                      </td>

                      {/* Quantity Returned */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          required
                          value={row.quantity}
                          onChange={(e) => handleRowFieldChange(idx, 'quantity', e.target.value)}
                          className={`w-full h-9 rounded border px-2 text-xs font-mono text-center font-bold ${
                            isStockExcess || rowErr ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-300'
                          }`}
                          aria-label={`الكمية المرتجعة للسطر ${idx + 1}`}
                        />
                        {isStockExcess && (
                          <div className="text-[10px] text-rose-600 font-bold mt-0.5 whitespace-nowrap">
                            تجاوز الرصيد ({row.available_stock})
                          </div>
                        )}
                      </td>

                      {/* Unit Price */}
                      <td className="p-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={row.unit_price}
                          onChange={(e) => handleRowFieldChange(idx, 'unit_price', e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs font-mono text-left font-bold"
                          aria-label={`سعر الوحدة للسطر ${idx + 1}`}
                        />
                      </td>

                      {/* Total Price */}
                      <td className="p-2 text-left font-mono font-bold text-rose-700">
                        {formatCurrency(lineTotal)}
                      </td>

                      {/* Reason */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.line_reason}
                          onChange={(e) => handleRowFieldChange(idx, 'line_reason', e.target.value)}
                          className="w-full h-9 rounded border border-gray-300 px-2 text-xs"
                          aria-label={`سبب الإرجاع للسطر ${idx + 1}`}
                        />
                      </td>

                      {/* Remove Button */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          aria-label={`حذف السطر ${idx + 1}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 font-bold text-xs">
                <tr>
                  <td colSpan="6" className="p-3 text-right text-gray-700">
                    الإجمالي الكلي للبنود والكميات المرتجعة:
                  </td>
                  <td className="p-3 text-center font-mono text-sm font-bold text-[#1F3A5F]">
                    {totalReturnedQuantity}
                  </td>
                  <td className="p-3 text-left text-gray-500">
                    صافي المرتجع:
                  </td>
                  <td className="p-3 text-left font-mono text-sm font-bold text-rose-700">
                    {formatCurrency(totalRefundAmount)}
                  </td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 4: Settlement Method, Reason & Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-gray-900 pb-2 border-b border-gray-100 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#1F3A5F]" />
            <span>المعالجة المالية وأسباب الإرجاع</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Right: Settlement Method */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-700">
                طريقة المعالجة والتسوية المالية *
              </label>

              <div className="grid grid-cols-1 gap-2.5">
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  refundMethod === 'deduct_balance'
                    ? 'border-[#1F3A5F] bg-blue-50/40 text-gray-900'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}>
                  <input
                    type="radio"
                    name="refundMethod"
                    value="deduct_balance"
                    checked={refundMethod === 'deduct_balance'}
                    onChange={() => setRefundMethod('deduct_balance')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-bold text-xs">خصم من رصيد المورد (قيد دائن لحساب المورد)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      يتم تخفيض رصيد مديونية المورد المستحقة له بالقيمة المرتجعة تلقائياً في كشف الحساب
                    </div>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  refundMethod === 'cash_refund'
                    ? 'border-[#1F3A5F] bg-blue-50/40 text-gray-900'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}>
                  <input
                    type="radio"
                    name="refundMethod"
                    value="cash_refund"
                    checked={refundMethod === 'cash_refund'}
                    onChange={() => setRefundMethod('cash_refund')}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-bold text-xs">استرداد نقدي فوري بالخزينة (قبض نقدي من المورد)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      يتم زيادة رصيد الخزينة المحددة بمبلغ الرد مع إثبات حركة حركة مقبوضات واردة
                    </div>
                  </div>
                </label>
              </div>

              {refundMethod === 'cash_refund' && (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                  <label className="block text-xs font-bold text-emerald-900">
                    الخزينة المستلمة للمبلغ النقدي *
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full h-10 rounded border border-emerald-300 bg-white px-3 text-xs focus:outline-none"
                    aria-label="الخزينة المستلمة"
                  >
                    {treasuryAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (الرصيد: {formatCurrency(acc.current_balance || 0)})
                      </option>
                    ))}
                  </select>
                  <FieldError error={errors.account_id} />
                </div>
              )}
            </div>

            {/* Left: Return Date, Reason & Notes */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">تاريخ المرتجع *</label>
                <input
                  type="date"
                  required
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs font-mono"
                  aria-label="تاريخ المرتجع"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">سبب الإرجاع الرئيسي *</label>
                <select
                  value={generalReason}
                  onChange={(e) => setGeneralReason(e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs bg-white"
                  aria-label="سبب الإرجاع"
                >
                  <option value="غير مطابق للمواصفات الفنية">غير مطابق للمواصفات الفنية</option>
                  <option value="عيوب تصنيع وتلفيات">عيوب تصنيع وتلفيات بالخامة</option>
                  <option value="زيادة عن الكميات المطلوبة بأمر الشراء">زيادة عن الكميات المطلوبة بأمر الشراء</option>
                  <option value="خطأ في درجات الألوان أو القياسات">خطأ في درجات الألوان أو القياسات</option>
                  <option value="رفض خامات من قسم فحص الجودة">رفض خامات من قسم فحص الجودة</option>
                  <option value="أخرى">أخرى (كتابة سبب مخصص)</option>
                </select>
              </div>

              {generalReason === 'أخرى' && (
                <div>
                  <input
                    type="text"
                    required
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-300 px-3 text-xs"
                    aria-label="اكتب سبب الإرجاع بالتفصيل"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات إضافية على إذن المرتجع</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-gray-300 p-2.5 text-xs"
                  aria-label="ملاحظات إضافية"
                />
              </div>
            </div>
          </div>
        </div>

      </form>
    </PageContainer>
  );
}
