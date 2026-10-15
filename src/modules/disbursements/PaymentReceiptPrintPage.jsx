import React, { useState, useEffect } from 'react';
import { Printer, ArrowRight, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { triggerPrint } from '../../utils/print';

export default function PaymentReceiptPrintPage({ type = 'supplier_payment', id = null }) {
  const [record, setRecord] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [setRes, doc] = await Promise.all([
          api.getSettings(),
          type === 'customer_receipt'
            ? api.getCustomerReceipts().then(res => (res.receipts || []).find(r => r.id === id || r.receipt_number === id))
            : api.getSupplierPayments().then(res => (res.payments || []).find(p => p.id === id || p.payment_number === id))
        ]);
        setSettings(setRes?.settings || setRes?.data || null);
        setRecord(doc || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [type, id]);

  const handlePrint = () => {
    triggerPrint({ silent: false, printBackground: true });
  };

  if (loading) {
    return (
      <div className="p-10 text-center font-bold text-gray-500" dir="rtl">
        جاري تجهيز سند الطباعة...
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-10 text-center text-gray-500" dir="rtl">
        لم يتم العثور على السند المطلوب.
      </div>
    );
  }

  const isCustomer = type === 'customer_receipt';
  const docTitle = isCustomer ? 'سند استلام نقدية عميل' : 'سند صرف دفعة مورد';
  const docNumber = isCustomer ? record.receipt_number : record.payment_number;
  const partyName = isCustomer ? record.customer_name : record.supplier_name;
  const partyCode = isCustomer ? record.customer_code : record.supplier_code;

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 print:p-0 print:bg-white" dir="rtl">
      {/* Top Action Bar (hidden on print) */}
      <div className="max-w-3xl mx-auto mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg shadow-xs no-print">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { window.location.hash = '#/disbursements'; }}
            className="p-2 border border-gray-300 hover:bg-gray-50 rounded-md cursor-pointer"
            title="رجوع لسجل الحركات"
          >
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-base text-gray-900">{docTitle}</h1>
            <span className="text-xs text-gray-500 font-mono">{docNumber}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="px-5 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة السند</span>
        </button>
      </div>

      {/* Printable Voucher */}
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-10 shadow-md rounded-lg border border-gray-200 print:shadow-none print:border-none print:p-0">
        {/* Header with Company Logo */}
        <div className="flex justify-between items-start border-b-2 border-[#1F3A5F] pb-6">
          <div className="flex items-center gap-4">
            <img
              src={settings?.company_logo || '/logo.png'}
              alt="شعار المنشأة"
              className="h-16 w-auto max-w-[140px] object-contain rounded"
              onError={(e) => {
                if (e.target.src !== '/logo.png') e.target.src = '/logo.png';
              }}
            />
            <div>
              <h2 className="text-2xl font-bold text-[#1F3A5F]">{settings?.factory_name || 'code systems'}</h2>
              {settings?.address && <p className="text-xs text-gray-600 mt-1">{settings.address}</p>}
              {settings?.phone && <p className="text-xs text-gray-600">هاتف: {settings.phone}</p>}
            </div>
          </div>

          <div className="text-left font-mono">
            <span className={`inline-block px-3 py-1 text-white font-bold text-sm rounded mb-2 ${isCustomer ? 'bg-emerald-700' : 'bg-blue-800'}`}>
              {docTitle}
            </span>
            <div className="text-xs text-gray-600">رقم السند: <strong className="text-gray-900">{docNumber}</strong></div>
            <div className="text-xs text-gray-600">التاريخ: {formatDate(record.payment_date)}</div>
            <div className="text-xs text-gray-600">طريقة الدفع: <strong>{record.payment_method || 'نقداً'}</strong></div>
            {record.status === 'cancelled' && (
              <div className="text-xs text-rose-700 font-bold mt-1">السند ملغي</div>
            )}
          </div>
        </div>

        {/* Voucher Body */}
        <div className="py-8 space-y-6 text-sm">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-500 font-bold block mb-1">
                {isCustomer ? 'استلمنا من السيد / السادة:' : 'صرفنا إلى السيد / السادة:'}
              </span>
              <span className="text-base font-bold text-gray-900 block">
                {partyName} {partyCode ? `[${partyCode}]` : ''}
              </span>
            </div>

            <div className="text-left">
              <span className="text-xs text-gray-500 font-bold block mb-1">
                {isCustomer ? 'الخزينة المودع بها:' : 'الخزينة المنصرف منها:'}
              </span>
              <span className="text-base font-bold text-gray-900 block font-mono">
                {record.account_name}
              </span>
            </div>
          </div>

          <div className="p-6 bg-blue-50/40 border border-blue-200 rounded-xl text-center space-y-2">
            <span className="text-xs font-bold text-gray-600 block">
              {isCustomer ? 'المبلغ المستلم وقدره:' : 'المبلغ المصروف وقدره:'}
            </span>
            <span className="text-3xl font-bold font-mono text-[#1F3A5F] block">
              {formatCurrency(record.amount)}
            </span>
          </div>

          {record.notes && (
            <div className="p-3 border border-gray-200 rounded-md bg-white">
              <span className="text-xs text-gray-500 font-bold block mb-0.5">البيان والملاحظات:</span>
              <p className="text-gray-800 text-xs font-medium">{record.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs text-gray-600">
            <div className="space-y-8">
              <span className="font-bold block">أمين الخزينة</span>
              <div className="border-b border-gray-400 w-32 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span className="font-bold block">المحاسب المسؤول</span>
              <div className="border-b border-gray-400 w-32 mx-auto"></div>
            </div>
            <div className="space-y-8">
              <span className="font-bold block">{isCustomer ? 'المستلم / المورد' : 'المستلم'}</span>
              <div className="border-b border-gray-400 w-32 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
