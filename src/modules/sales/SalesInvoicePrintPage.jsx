import React, { useState, useEffect } from 'react';
import { Printer, ArrowRight, FileText, CheckCircle2 } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

export default function SalesInvoicePrintPage({ invoiceId = null }) {
  const [invoice, setInvoice] = useState(null);
  const [printMode, setPrintMode] = useState('a4'); // 'a4' | 'thermal'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvoice() {
      try {
        setLoading(true);
        const res = await api.getSalesInvoices();
        const invoices = Array.isArray(res.data) ? res.data : (Array.isArray(res.invoices) ? res.invoices : []);
        const inv = invoices.find(i => String(i.id) === String(invoiceId) || String(i.invoice_number) === String(invoiceId)) || invoices[0];
        setInvoice(inv || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [invoiceId]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="p-10 text-center font-bold text-gray-500" dir="rtl">
        جاري تجهيز الفاتورة للطباعة...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-10 text-center text-gray-500" dir="rtl">
        لم يتم العثور على الفاتورة المطلوبة.
      </div>
    );
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const totalAmount = Number(invoice.total_amount ?? invoice.subtotal ?? 0);

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 print:p-0 print:bg-white" dir="rtl">
      {/* Top Action Bar (hidden on print) */}
      <div className="max-w-4xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg shadow-xs no-print">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/sales'; }}
            className="p-2 border border-gray-300 hover:bg-gray-50 rounded-md cursor-pointer"
            title="رجوع للمبيعات"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-base text-gray-900">طباعة فاتورة مبيعات</h1>
            <span className="text-xs text-gray-500 font-mono">{invoice.invoice_number}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Format Switcher */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-md text-xs font-bold">
            <button
              onClick={() => setPrintMode('a4')}
              className={`px-3 py-1.5 rounded-sm cursor-pointer ${
                printMode === 'a4' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600'
              }`}
            >
              فاتورة رسمية A4
            </button>
            <button
              onClick={() => setPrintMode('thermal')}
              className={`px-3 py-1.5 rounded-sm cursor-pointer ${
                printMode === 'thermal' ? 'bg-white text-[#1F3A5F] shadow-xs' : 'text-gray-600'
              }`}
            >
              إيصال حراري (80mm)
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الآن (Print)</span>
          </button>
        </div>
      </div>

      {/* A4 Invoice Preview */}
      {printMode === 'a4' && (
        <div className="max-w-4xl mx-auto bg-white p-8 sm:p-12 shadow-md rounded-lg border border-gray-200 print:shadow-none print:border-none print:p-0">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#1F3A5F]">شركة أبيكس لصناعة الملابس الجاهزة</h2>
              <p className="text-xs text-gray-500 mt-1">Apex Apparel Manufacturing & Export Enterprise</p>
              <p className="text-xs text-gray-600 mt-1">المنطقة الصناعية - المحلة الكبرى / القاهرة</p>
              <p className="text-xs text-gray-600">س.ت: 489201 • ب.ض: 789-204-110</p>
            </div>
            <div className="text-left font-mono">
              <span className="inline-block px-3 py-1 bg-[#1F3A5F] text-white font-bold text-sm rounded mb-2">
                فاتورة مبيعات ضريبية
              </span>
              <div className="text-xs text-gray-600">رقم الفاتورة: <strong className="text-gray-900">{invoice.invoice_number}</strong></div>
              <div className="text-xs text-gray-600">التاريخ: {formatDate(invoice.invoice_date)}</div>
              <div className="text-xs text-gray-600">شروط الدفع: <strong className={invoice.payment_terms === 'credit' ? 'text-rose-700' : 'text-emerald-700'}>{invoice.payment_terms === 'credit' ? 'آجل' : 'نقدي'}</strong></div>
              {invoice.due_date && (
                <div className="text-xs text-rose-700 font-bold">تاريخ الاستحقاق: {formatDate(invoice.due_date)}</div>
              )}
            </div>
          </div>

          {/* Customer & Outlet Details */}
          <div className="grid grid-cols-2 gap-4 py-4 border-b border-gray-200 text-xs">
            <div>
              <span className="font-bold text-gray-500 block mb-1">بيانات العميل:</span>
              <div className="text-sm font-bold text-gray-900">{invoice.customer_name || 'عميل نقدي'}</div>
            </div>
            <div className="text-left">
              <span className="font-bold text-gray-500 block mb-1">فرع البيع / المعرض:</span>
              <div className="text-sm font-bold text-gray-900">{invoice.outlet_name || 'الفرع الرئيسي'}</div>
            </div>
          </div>

          {/* Items Table */}
          <div className="py-6">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3">بيان الصنف والمقاس واللون</th>
                  <th className="p-3 w-24 text-center font-mono">الكمية</th>
                  <th className="p-3 w-28 text-left font-mono">السعر قبل الخصم</th>
                  <th className="p-3 w-24 text-center font-mono">الخصم</th>
                  <th className="p-3 w-28 text-left font-mono">صافي السعر</th>
                  <th className="p-3 w-32 text-left font-mono">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-3 text-center text-gray-500 font-mono">{idx + 1}</td>
                    <td className="p-3 font-bold text-gray-900">
                      {item.product_name || item.name}
                      {item.variant_label && <span className="text-gray-500 font-normal"> ({item.variant_label})</span>}
                    </td>
                    <td className="p-3 text-center font-mono font-bold">{item.quantity}</td>
                    <td className="p-3 text-left font-mono">{formatCurrency(item.price_before_discount || item.unit_selling_price)}</td>
                    <td className="p-3 text-center font-mono text-red-600">{formatCurrency(item.discount_value || 0)}</td>
                    <td className="p-3 text-left font-mono font-bold text-emerald-800">{formatCurrency(item.unit_selling_price)}</td>
                    <td className="p-3 text-left font-mono font-bold text-gray-900">{formatCurrency((Number(item.quantity) || 1) * (Number(item.unit_selling_price) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end pt-4 border-t-2 border-gray-200">
            <div className="w-64 space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>إجمالي الفاتورة:</span>
                <span className="font-mono font-bold">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-[#1F3A5F] text-base font-bold pt-2 border-t border-gray-200">
                <span>الصافي المطلوب:</span>
                <span className="font-mono">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-16 text-center text-xs font-bold text-gray-600">
            <div>
              <p className="mb-8">المستلم</p>
              <div className="border-b border-gray-300 w-32 mx-auto"></div>
            </div>
            <div>
              <p className="mb-8">أمين الخزينة</p>
              <div className="border-b border-gray-300 w-32 mx-auto"></div>
            </div>
            <div>
              <p className="mb-8">المدير المالي</p>
              <div className="border-b border-gray-300 w-32 mx-auto"></div>
            </div>
          </div>
        </div>
      )}

      {/* 80mm Thermal Receipt Preview (Requirement F6) */}
      {printMode === 'thermal' && (
        <div className="max-w-[320px] mx-auto bg-white p-4 shadow-md rounded-md font-mono text-xs border border-gray-300 print:shadow-none print:border-none print:p-0">
          <div className="text-center border-b border-dashed border-gray-400 pb-3 mb-3">
            <h3 className="font-bold text-sm">مصنع أبيكس للملابس</h3>
            <p className="text-[10px] text-gray-600">Apex Apparel Store</p>
            <p className="text-[10px] text-gray-600">س.ت 489201 • ب.ض 789204110</p>
            <div className="mt-2 text-right">
              <div>رقم الفاتورة: <strong>{invoice.invoice_number}</strong></div>
              <div>التاريخ: {formatDate(invoice.invoice_date)}</div>
              <div>العميل: {invoice.customer_name || 'عميل نقدي'}</div>
              <div>الدفع: {invoice.payment_terms === 'credit' ? 'آجل' : 'نقدي'}</div>
            </div>
          </div>

          <div className="border-b border-dashed border-gray-400 pb-2 mb-2">
            <div className="flex justify-between font-bold border-b border-gray-300 pb-1 mb-1">
              <span>الصنف</span>
              <span>الكمية × السعر</span>
              <span>الإجمالي</span>
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="flex justify-between py-1 text-[11px]">
                <div className="truncate max-w-[120px]">{it.product_name || it.name}</div>
                <div>{it.quantity} × {it.unit_selling_price}</div>
                <div className="font-bold">{((Number(it.quantity) || 1) * (Number(it.unit_selling_price) || 0)).toFixed(2)}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-right text-xs font-bold border-b border-dashed border-gray-400 pb-2 mb-3">
            <div className="flex justify-between text-sm">
              <span>الإجمالي الكلي:</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <div className="text-center text-[10px] text-gray-500">
            <p>شكراً لتعاملكم معنا</p>
            <p>البضاعة المباعة ترد وتستبدل خلال 14 يوماً بالفاتورة</p>
          </div>
        </div>
      )}
    </div>
  );
}
