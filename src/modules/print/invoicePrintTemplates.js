import { formatCurrency, formatDate, formatNumber } from '../../utils/formatters';
import { toPiasters, fromPiasters } from '../../utils/money';

/**
 * Invoice Print Templates
 * Provides pure HTML generation for both A4 and Thermal 80mm layouts.
 * Used for silent Electron printing, in-app print preview, and PDF generation.
 */

// Helper to escape HTML characters
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Build standard complete print document HTML wrapper
export function wrapDocumentHtml({ title, content, paperSize = 'a4', orientation = 'portrait', colorMode = 'color' }) {
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
    : `@page { size: ${paperSize} ${orientation}; margin: 10mm; }
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

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title || 'code systems - طباعة مستند')}</title>
  <style>
    * { box-sizing: border-box; }
    ${pageCss}
    body {
      font-size: 12px;
      line-height: 1.4;
      direction: rtl;
      text-align: right;
    }
    .font-mono {
      font-family: 'Consolas', 'Courier New', monospace;
      font-variant-numeric: tabular-nums;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 6px 8px;
    }
    .border {
      border: 1px solid #cbd5e1;
    }
    .border-b {
      border-bottom: 1px solid #e2e8f0;
    }
    .text-center { text-align: center; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .break-inside-avoid {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    ${colorMode === 'grayscale' ? 'html, body { filter: grayscale(100%) !important; }' : ''}
  </style>
</head>
<body class="${colorMode === 'grayscale' ? 'grayscale' : ''}">
  <div style="${isThermal ? 'width: 100%; max-width: 76mm; margin: 0 auto;' : 'width: 100%;'}">
    ${content}
  </div>
</body>
</html>`;
}

/**
 * 1. Purchase Invoice HTML Generator
 */
export function generatePurchaseInvoiceHtml(po, settings = {}, paperSize = 'a4') {
  if (!po) return '';
  const isThermal = paperSize === '80mm';
  const companyName = settings?.factory_name || 'code systems';
  const hasValidLogo = Boolean(settings?.company_logo && typeof settings.company_logo === 'string' && settings.company_logo.trim() !== '');
  const companyLogo = hasValidLogo ? settings.company_logo : '';

  const poNumber = po.po_number || po.id || '';
  const orderDate = po.order_date || po.created_at || '';
  const supplierName = po.supplier_name || po.supplier?.name || 'مورد عام';
  const supplierCode = po.supplier_code || po.supplier?.code || '';
  const supplierPhone = po.supplier_phone || po.supplier?.phone || '';
  const paymentTerms = po.payment_terms === 'credit' ? 'آجل' : 'نقدي فوري';
  const isCredit = po.payment_terms === 'credit';

  const items = Array.isArray(po.items) ? po.items : [];
  const installments = Array.isArray(po.installments) ? po.installments : [];

  // Totals in exact currency
  const subtotal = Number(po.subtotal ?? 0);
  const discount = Number(po.discount_value ?? 0);
  const additionalExpenses = Number(po.additional_expenses ?? 0);
  const totalAmount = Number(po.total_amount ?? po.grand_total ?? (subtotal - discount + additionalExpenses));

  // --- 1.A) Thermal 80mm Layout for Purchase Invoice ---
  if (isThermal) {
    const itemsRowsHtml = items.map((it, idx) => {
      const qty = Number(it.quantity_ordered ?? it.quantity ?? 1);
      const price = Number(it.unit_price ?? 0);
      const lineTotal = Number(it.total_price ?? (qty * price));
      return `
        <tr style="border-bottom: 1px dotted #94a3b8; font-size: 11px;">
          <td style="padding: 4px 2px; font-weight: bold;">${escapeHtml(it.material_name || it.item_name || it.name || `بند ${idx + 1}`)}</td>
          <td style="padding: 4px 2px; text-align: center;" class="font-mono">${qty}</td>
          <td style="padding: 4px 2px; text-align: left;" class="font-mono">${formatCurrency(price)}</td>
          <td style="padding: 4px 2px; text-align: left; font-weight: bold;" class="font-mono">${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    }).join('');

    const installmentsHtml = isCredit && installments.length > 0 ? `
      <div style="margin-top: 8px; border-top: 1px dashed #64748b; padding-top: 6px; font-size: 10px;">
        <div style="font-weight: bold; margin-bottom: 4px;">جدول الأقساط المستحقة:</div>
        ${installments.map((inst, i) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>الدفعة ${i + 1} (${formatDate(inst.due_date)}):</span>
            <span class="font-mono font-bold">${formatCurrency(inst.amount)}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div style="padding: 4px; font-family: 'Cairo', Tahoma, sans-serif; font-size: 11px; color: #000;" dir="rtl">
        <!-- Header -->
        <div style="text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: 8px; margin-bottom: 8px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 40px; max-width: 90px; object-contain: contain; margin: 0 auto 4px;" />` : ''}
          <div style="font-weight: 800; font-size: 14px;">${escapeHtml(companyName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #1e293b;">فاتورة مشتريات وتوريد بضاعة</div>
          ${settings?.phone ? `<div style="font-size: 10px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
          
          <div style="margin-top: 6px; border-top: 1px dotted #cbd5e1; padding-top: 4px; text-align: right; font-size: 10px; line-height: 1.5;">
            <div><strong>رقم الفاتورة:</strong> <span class="font-mono font-bold">${escapeHtml(poNumber)}</span></div>
            <div><strong>التاريخ:</strong> <span class="font-mono">${formatDate(orderDate)}</span></div>
            <div><strong>المورد:</strong> ${escapeHtml(supplierName)}</div>
            <div><strong>طريقة السداد:</strong> ${escapeHtml(paymentTerms)}</div>
          </div>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <thead>
            <tr style="border-bottom: 1px solid #475569; font-size: 10px; font-weight: bold;">
              <th style="text-align: right; padding: 3px 2px;">الصنف</th>
              <th style="text-align: center; padding: 3px 2px;">الكمية</th>
              <th style="text-align: left; padding: 3px 2px;">السعر</th>
              <th style="text-align: left; padding: 3px 2px;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>

        <!-- Totals Block -->
        <div style="border-top: 1px dashed #64748b; padding-top: 6px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>إجمالي البنود:</span>
            <span class="font-mono">${formatCurrency(subtotal)}</span>
          </div>
          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #b91c1c;">
              <span>الخصم التجاري:</span>
              <span class="font-mono font-bold">-${formatCurrency(discount)}</span>
            </div>
          ` : ''}
          ${additionalExpenses > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>مصاريف إضافية:</span>
              <span class="font-mono">+${formatCurrency(additionalExpenses)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
            <span>الصافي النهائي:</span>
            <span class="font-mono">${formatCurrency(totalAmount)}</span>
          </div>
        </div>

        ${installmentsHtml}

        ${po.notes ? `
          <div style="margin-top: 8px; border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 10px;">
            <strong>ملاحظات:</strong> ${escapeHtml(po.notes)}
          </div>
        ` : ''}

        <!-- Footer Signatures -->
        <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; font-weight: bold; text-align: center;">
          <div style="width: 48%;">
            <div>أمين المخزن المستلم</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 18px;"></div>
          </div>
          <div style="width: 48%;">
            <div>المحاسب المسؤول</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 18px;"></div>
          </div>
        </div>

        <div style="text-align: center; font-size: 9px; color: #64748b; margin-top: 10px;">
          code systems ERP • إشعار استلام رسمي
        </div>
      </div>
    `;
  }

  // --- 1.B) A4 Official Layout for Purchase Invoice ---
  const itemsRowsA4 = items.map((it, idx) => {
    const qty = Number(it.quantity_ordered ?? it.quantity ?? 1);
    const price = Number(it.unit_price ?? 0);
    const lineDiscount = Number(it.discount ?? 0);
    const lineTotal = Number(it.total_price ?? (qty * price - lineDiscount));

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; text-align: center;" class="font-mono">${idx + 1}</td>
        <td style="padding: 8px; font-mono; font-size: 11px; color: #475569;">${escapeHtml(it.material_code || it.item_code || '-')}</td>
        <td style="padding: 8px; font-weight: bold; color: #0f172a;">${escapeHtml(it.material_name || it.item_name || it.name || '')}</td>
        <td style="padding: 8px; text-align: center; font-weight: bold;" class="font-mono">${formatNumber(qty)}</td>
        <td style="padding: 8px; text-align: left;" class="font-mono">${formatCurrency(price)}</td>
        <td style="padding: 8px; text-align: center;" class="font-mono">${lineDiscount > 0 ? formatCurrency(lineDiscount) : '-'}</td>
        <td style="padding: 8px; text-align: left; font-weight: bold; color: #0f172a;" class="font-mono">${formatCurrency(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  const installmentsTableA4 = isCredit && installments.length > 0 ? `
    <div style="margin-top: 18px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
      <div style="background-color: #f1f5f9; padding: 6px 12px; font-weight: bold; font-size: 11px; color: #334155; border-bottom: 1px solid #cbd5e1;">
        جدول مواعيد استحقاق دفعات الفاتورة الآجلة (${installments.length} أقساط)
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
            <th style="padding: 6px 10px; text-align: center; width: 40px;">#</th>
            <th style="padding: 6px 10px; text-align: right;">البيان</th>
            <th style="padding: 6px 10px; text-align: center;">تاريخ الاستحقاق</th>
            <th style="padding: 6px 10px; text-align: left;">مبلغ القسط</th>
          </tr>
        </thead>
        <tbody>
          ${installments.map((inst, i) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 6px 10px; text-align: center;" class="font-mono">${i + 1}</td>
              <td style="padding: 6px 10px;">${escapeHtml(inst.notes || `الدفعة ${i + 1}`)}</td>
              <td style="padding: 6px 10px; text-align: center; font-weight: bold; color: #b91c1c;" class="font-mono">${formatDate(inst.due_date)}</td>
              <td style="padding: 6px 10px; text-align: left; font-weight: bold;" class="font-mono">${formatCurrency(inst.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <div style="padding: 24px 32px; color: #1e293b; background: #ffffff; font-family: 'Cairo', Tahoma, sans-serif;" dir="rtl">
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain; border-radius: 4px;" />` : ''}
          <div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px 0;">${escapeHtml(companyName)}</h1>
            <div style="font-size: 11px; font-weight: bold; color: #64748b;">نظام تخطيط موارد المؤسسات - code systems ERP</div>
            ${settings?.address ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${escapeHtml(settings.address)}</div>` : ''}
            ${settings?.phone ? `<div style="font-size: 11px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
          </div>
        </div>

        <div style="text-align: left;">
          <div style="display: inline-block; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 13px; padding: 5px 14px; border-radius: 6px; margin-bottom: 8px;">
            فاتورة مشتريات وتوريد
          </div>
          <div style="font-size: 11px; color: #334155; font-weight: bold;">
            رقم الفاتورة: <span class="font-mono" style="font-size: 13px; color: #0f172a;">${escapeHtml(poNumber)}</span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;">
            تاريخ الفاتورة: <span class="font-mono">${formatDate(orderDate)}</span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;">
            طريقة السداد: <strong style="color: ${isCredit ? '#b91c1c' : '#047857'};">${escapeHtml(paymentTerms)}</strong>
          </div>
        </div>
      </div>

      <!-- Supplier Information Card -->
      <div style="display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 11px;">
        <div>
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">بيانات المورد:</span>
          <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${escapeHtml(supplierName)}</div>
          ${supplierCode ? `<div style="color: #64748b; margin-top: 2px;" class="font-mono">كود المورد: ${escapeHtml(supplierCode)}</div>` : ''}
          ${supplierPhone ? `<div style="color: #64748b; margin-top: 2px;">هاتف: <span class="font-mono">${escapeHtml(supplierPhone)}</span></div>` : ''}
        </div>
        <div style="text-align: left;">
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">مستودع الاستلام:</span>
          <div style="font-size: 13px; font-weight: bold; color: #0f172a;">مستودع الخامات الرئيسي</div>
          <div style="color: #047857; font-weight: bold; margin-top: 3px;">حالة الفاتورة: معتمدة ومستلمة بالمخزن</div>
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px;">
        <thead>
          <tr style="background: #1e3a8a; color: #ffffff; font-weight: bold;">
            <th style="padding: 8px; text-align: center; width: 35px;">#</th>
            <th style="padding: 8px; text-align: right; width: 85px;">كود الصنف</th>
            <th style="padding: 8px; text-align: right;">بيان الصنف والمواصفات</th>
            <th style="padding: 8px; text-align: center; width: 75px;">الكمية</th>
            <th style="padding: 8px; text-align: left; width: 95px;">سعر الوحدة</th>
            <th style="padding: 8px; text-align: center; width: 75px;">الخصم</th>
            <th style="padding: 8px; text-align: left; width: 105px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsA4}
        </tbody>
      </table>

      <!-- Totals & Notes Section -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;" class="break-inside-avoid">
        <div style="flex: 1; font-size: 11px;">
          ${po.notes ? `
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa;">
              <strong style="color: #334155;">ملاحظات أمر الشراء:</strong>
              <p style="margin: 4px 0 0; color: #475569;">${escapeHtml(po.notes)}</p>
            </div>
          ` : ''}
        </div>

        <div style="width: 290px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
            <span>إجمالي البنود:</span>
            <span class="font-mono font-bold">${formatCurrency(subtotal)}</span>
          </div>
          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #b91c1c;">
              <span>الخصم التجاري:</span>
              <span class="font-mono font-bold">-${formatCurrency(discount)}</span>
            </div>
          ` : ''}
          ${additionalExpenses > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
              <span>مصاريف إضافية وشحن:</span>
              <span class="font-mono font-bold">+${formatCurrency(additionalExpenses)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 13px;">
            <span>الصافي النهائي:</span>
            <span class="font-mono">${formatCurrency(totalAmount)}</span>
          </div>
        </div>
      </div>

      <!-- Installments Table (Credit) -->
      ${installmentsTableA4}

      <!-- Official Signatures for Purchase Document -->
      <div style="margin-top: 36px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align: center; font-size: 11px; font-weight: bold; color: #334155;" class="break-inside-avoid">
        <div>
          <div>أمين المخزن / المستلم</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>مسؤول المشتريات</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>المحاسب المسؤول</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>الاعتماد المالي / الإدارة</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
      </div>

      <!-- Bottom System Stamp -->
      <div style="margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8;" class="break-inside-avoid">
        مستند مشتريات وتوريد رسمي صادر عن نظام code systems ERP • تم ترحيل أثر المخزون وحساب المورد تلقائياً
      </div>
    </div>
  `;
}

/**
 * 2. Sales Invoice HTML Generator
 */
export function generateSalesInvoiceHtml(invoice, settings = {}, paperSize = 'a4', customerBalanceAfter = null) {
  if (!invoice) return '';
  const isThermal = paperSize === '80mm';
  const companyName = settings?.factory_name || 'code systems';
  const hasValidLogo = Boolean(settings?.company_logo && typeof settings.company_logo === 'string' && settings.company_logo.trim() !== '');
  const companyLogo = hasValidLogo ? settings.company_logo : '';

  const invoiceNumber = invoice.invoice_number || invoice.id || '';
  const invoiceDate = invoice.invoice_date || invoice.created_at || '';
  const customerName = invoice.customer_name || invoice.customer?.name || 'عميل نقدي';
  const customerCode = invoice.customer_code || invoice.customer?.code || '';
  const customerPhone = invoice.customer_phone || invoice.customer?.phone || '';
  const isCredit = invoice.payment_terms === 'credit';
  const paymentTerms = isCredit ? 'آجل' : 'نقدي فوري';
  const dueDate = invoice.due_date || '';

  const items = Array.isArray(invoice.items) ? invoice.items : [];

  // Totals
  const totalAmount = Number(invoice.total_amount ?? invoice.total_invoice_amount ?? invoice.subtotal ?? 0);
  const subtotal = Number(invoice.subtotal ?? totalAmount);
  const discount = Number(invoice.discount_value ?? invoice.discount ?? 0);
  const paidAmount = Number(invoice.paid_amount ?? (isCredit ? 0 : totalAmount));
  const remainingAmount = Number(invoice.remaining_amount ?? (totalAmount - paidAmount));

  // Determine customer balance after invoice
  let balanceAfter = customerBalanceAfter;
  if (balanceAfter === null || balanceAfter === undefined) {
    if (invoice.customer_balance_after !== undefined) {
      balanceAfter = Number(invoice.customer_balance_after);
    } else if (invoice.customer_balance !== undefined) {
      balanceAfter = Number(invoice.customer_balance);
    } else {
      balanceAfter = null;
    }
  }

  // --- 2.A) Thermal 80mm Layout for Sales Invoice ---
  if (isThermal) {
    const itemsRowsHtml = items.map((it) => {
      const qty = Number(it.quantity ?? 1);
      const priceBefore = Number(it.price_before_discount ?? it.unit_price ?? it.unit_selling_price ?? 0);
      const disc = Number(it.discount_value ?? 0);
      const netPrice = Number(it.unit_selling_price ?? (priceBefore - disc));
      const lineTotal = Number(it.line_total ?? it.total_price ?? (qty * netPrice));

      return `
        <tr style="border-bottom: 1px dotted #94a3b8; font-size: 11px;">
          <td style="padding: 4px 2px; font-weight: bold;">
            ${escapeHtml(it.product_name || it.name || '')}
            ${it.variant_label ? `<div style="font-size: 9px; color: #475569;">${escapeHtml(it.variant_label)}</div>` : ''}
          </td>
          <td style="padding: 4px 2px; text-align: center;" class="font-mono">${qty}</td>
          <td style="padding: 4px 2px; text-align: left;" class="font-mono">${formatCurrency(netPrice)}</td>
          <td style="padding: 4px 2px; text-align: left; font-weight: bold;" class="font-mono">${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div style="padding: 4px; font-family: 'Cairo', Tahoma, sans-serif; font-size: 11px; color: #000;" dir="rtl">
        <!-- Header -->
        <div style="text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: 8px; margin-bottom: 8px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 40px; max-width: 90px; object-fit: contain; margin: 0 auto 4px;" />` : ''}
          <div style="font-weight: 800; font-size: 14px;">${escapeHtml(companyName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #1e293b;">فاتورة مبيعات نقدية وآجلة</div>
          ${settings?.phone ? `<div style="font-size: 10px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
          ${settings?.tax_number ? `<div style="font-size: 10px; color: #475569;">الرقم الضريبي: <span class="font-mono">${escapeHtml(settings.tax_number)}</span></div>` : ''}

          <div style="margin-top: 6px; border-top: 1px dotted #cbd5e1; padding-top: 4px; text-align: right; font-size: 10px; line-height: 1.5;">
            <div><strong>رقم الفاتورة:</strong> <span class="font-mono font-bold">${escapeHtml(invoiceNumber)}</span></div>
            <div><strong>التاريخ:</strong> <span class="font-mono">${formatDate(invoiceDate)}</span></div>
            <div><strong>العميل:</strong> ${escapeHtml(customerName)}</div>
            <div><strong>طريقة السداد:</strong> ${escapeHtml(paymentTerms)}</div>
            ${isCredit && dueDate ? `<div><strong>تاريخ الاستحقاق:</strong> <span class="font-mono">${formatDate(dueDate)}</span></div>` : ''}
          </div>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <thead>
            <tr style="border-bottom: 1px solid #475569; font-size: 10px; font-weight: bold;">
              <th style="text-align: right; padding: 3px 2px;">الصنف</th>
              <th style="text-align: center; padding: 3px 2px;">الكمية</th>
              <th style="text-align: left; padding: 3px 2px;">السعر</th>
              <th style="text-align: left; padding: 3px 2px;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRowsHtml}
          </tbody>
        </table>

        <!-- Totals Block -->
        <div style="border-top: 1px dashed #64748b; padding-top: 6px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>إجمالي البنود:</span>
            <span class="font-mono">${formatCurrency(subtotal)}</span>
          </div>
          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #b91c1c;">
              <span>الخصم الممنوح:</span>
              <span class="font-mono font-bold">-${formatCurrency(discount)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
            <span>الصافي المطلوب:</span>
            <span class="font-mono">${formatCurrency(totalAmount)}</span>
          </div>
          ${isCredit ? `
            <div style="display: flex; justify-content: space-between; margin-top: 3px; font-size: 10px;">
              <span>المسدد نقداً:</span>
              <span class="font-mono font-bold">${formatCurrency(paidAmount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #b91c1c;">
              <span>المتبقي الآجل:</span>
              <span class="font-mono font-bold">${formatCurrency(remainingAmount)}</span>
            </div>
            ${balanceAfter !== null ? `
              <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: #1e3a8a; border-top: 1px dotted #cbd5e1; padding-top: 3px; margin-top: 3px;">
                <span>رصيد العميل بعد الفاتورة:</span>
                <span class="font-mono">${formatCurrency(balanceAfter)}</span>
              </div>
            ` : ''}
          ` : ''}
        </div>

        ${invoice.notes ? `
          <div style="margin-top: 8px; border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 10px;">
            <strong>ملاحظات:</strong> ${escapeHtml(invoice.notes)}
          </div>
        ` : ''}

        <!-- Signatures -->
        <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; font-weight: bold; text-align: center;">
          <div style="width: 32%;">
            <div>المستلم / العميل</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 16px;"></div>
          </div>
          <div style="width: 32%;">
            <div>المحاسب المسؤول</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 16px;"></div>
          </div>
          <div style="width: 32%;">
            <div>أمين الخزينة</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 16px;"></div>
          </div>
        </div>

        <div style="text-align: center; font-size: 9px; color: #64748b; margin-top: 10px;">
          شكراً لتعاملكم معنا • code systems ERP
        </div>
      </div>
    `;
  }

  // --- 2.B) A4 Official Layout for Sales Invoice ---
  const itemsRowsA4 = items.map((it, idx) => {
    const qty = Number(it.quantity ?? 1);
    const priceBefore = Number(it.price_before_discount ?? it.unit_price ?? it.unit_selling_price ?? 0);
    const disc = Number(it.discount_value ?? 0);
    const netPrice = Number(it.unit_selling_price ?? (priceBefore - disc));
    const lineTotal = Number(it.line_total ?? it.total_price ?? (qty * netPrice));

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px; text-align: center;" class="font-mono">${idx + 1}</td>
        <td style="padding: 8px; font-mono; font-size: 11px; color: #475569;">${escapeHtml(it.product_code || '-')}</td>
        <td style="padding: 8px; font-weight: bold; color: #0f172a;">
          ${escapeHtml(it.product_name || it.name || '')}
          ${it.variant_label ? `<span style="font-weight: normal; color: #64748b; font-size: 10px;"> (${escapeHtml(it.variant_label)})</span>` : ''}
        </td>
        <td style="padding: 8px; text-align: center; font-weight: bold;" class="font-mono">${formatNumber(qty)}</td>
        <td style="padding: 8px; text-align: left;" class="font-mono">${formatCurrency(priceBefore)}</td>
        <td style="padding: 8px; text-align: center;" class="font-mono">${disc > 0 ? formatCurrency(disc) : '-'}</td>
        <td style="padding: 8px; text-align: left;" class="font-mono">${formatCurrency(netPrice)}</td>
        <td style="padding: 8px; text-align: left; font-weight: bold; color: #0f172a;" class="font-mono">${formatCurrency(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="padding: 24px 32px; color: #1e293b; background: #ffffff; font-family: 'Cairo', Tahoma, sans-serif;" dir="rtl">
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain; border-radius: 4px;" />` : ''}
          <div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px 0;">${escapeHtml(companyName)}</h1>
            <div style="font-size: 11px; font-weight: bold; color: #64748b;">نظام تخطيط موارد المؤسسات - code systems ERP</div>
            ${settings?.address ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${escapeHtml(settings.address)}</div>` : ''}
            ${settings?.phone ? `<div style="font-size: 11px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
            ${settings?.tax_number ? `<div style="font-size: 11px; color: #475569;">الرقم الضريبي: <span class="font-mono">${escapeHtml(settings.tax_number)}</span></div>` : ''}
          </div>
        </div>

        <div style="text-align: left;">
          <div style="display: inline-block; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 13px; padding: 5px 14px; border-radius: 6px; margin-bottom: 8px;">
            فاتورة مبيعات ضريبية
          </div>
          <div style="font-size: 11px; color: #334155; font-weight: bold;">
            رقم الفاتورة: <span class="font-mono" style="font-size: 13px; color: #0f172a;">${escapeHtml(invoiceNumber)}</span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;">
            تاريخ الفاتورة: <span class="font-mono">${formatDate(invoiceDate)}</span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;">
            طريقة السداد: <strong style="color: ${isCredit ? '#b91c1c' : '#047857'};">${escapeHtml(paymentTerms)}</strong>
          </div>
          ${isCredit && dueDate ? `
            <div style="font-size: 11px; color: #b91c1c; margin-top: 3px; font-weight: bold;">
              تاريخ الاستحقاق: <span class="font-mono">${formatDate(dueDate)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Customer Information Card -->
      <div style="display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; font-size: 11px;">
        <div>
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">بيانات العميل:</span>
          <div style="font-size: 14px; font-weight: bold; color: #0f172a;">${escapeHtml(customerName)}</div>
          ${customerCode ? `<div style="color: #64748b; margin-top: 2px;" class="font-mono">كود العميل: ${escapeHtml(customerCode)}</div>` : ''}
          ${customerPhone ? `<div style="color: #64748b; margin-top: 2px;">هاتف: <span class="font-mono">${escapeHtml(customerPhone)}</span></div>` : ''}
        </div>
        <div style="text-align: left;">
          ${(invoice.outlet_name && invoice.outlet_name !== 'بدون منفذ' && invoice.outlet_id) ? `
            <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">الفرع / المنفذ:</span>
            <div style="font-size: 13px; font-weight: bold; color: #0f172a;">${escapeHtml(invoice.outlet_name)}</div>
          ` : ''}
          ${isCredit && balanceAfter !== null ? `
            <div style="color: #1e3a8a; font-weight: bold; margin-top: 4px; font-size: 12px;">
              رصيد العميل بعد الفاتورة: <span class="font-mono">${formatCurrency(balanceAfter)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px;">
        <thead>
          <tr style="background: #1e3a8a; color: #ffffff; font-weight: bold;">
            <th style="padding: 8px; text-align: center; width: 35px;">#</th>
            <th style="padding: 8px; text-align: right; width: 85px;">كود الصنف</th>
            <th style="padding: 8px; text-align: right;">بيان الصنف والمقاس واللون</th>
            <th style="padding: 8px; text-align: center; width: 65px;">الكمية</th>
            <th style="padding: 8px; text-align: left; width: 90px;">السعر قبل</th>
            <th style="padding: 8px; text-align: center; width: 65px;">الخصم</th>
            <th style="padding: 8px; text-align: left; width: 90px;">السعر بعد</th>
            <th style="padding: 8px; text-align: left; width: 105px;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsA4}
        </tbody>
      </table>

      <!-- Totals & Notes Section -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;" class="break-inside-avoid">
        <div style="flex: 1; font-size: 11px;">
          ${invoice.notes ? `
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa;">
              <strong style="color: #334155;">ملاحظات الفاتورة:</strong>
              <p style="margin: 4px 0 0; color: #475569;">${escapeHtml(invoice.notes)}</p>
            </div>
          ` : ''}
        </div>

        <div style="width: 290px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
            <span>إجمالي البنود:</span>
            <span class="font-mono font-bold">${formatCurrency(subtotal)}</span>
          </div>
          ${discount > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #b91c1c;">
              <span>إجمالي الخصم الممنوح:</span>
              <span class="font-mono font-bold">-${formatCurrency(discount)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 13px;">
            <span>الصافي المطلوب سداده:</span>
            <span class="font-mono">${formatCurrency(totalAmount)}</span>
          </div>
          ${isCredit ? `
            <div style="display: flex; justify-content: space-between; padding: 5px 12px; border-top: 1px solid #e2e8f0; font-size: 10px;">
              <span>المسدد:</span>
              <span class="font-mono font-bold">${formatCurrency(paidAmount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 5px 12px; font-size: 10px; color: #b91c1c;">
              <span>المتبقي الآجل:</span>
              <span class="font-mono font-bold">${formatCurrency(remainingAmount)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Signatures for Sales Document -->
      <div style="margin-top: 36px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; font-size: 11px; font-weight: bold; color: #334155;" class="break-inside-avoid">
        <div>
          <div>المستلم / العميل</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 75%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>المحاسب المسؤول</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 75%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>أمين الخزينة</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 75%; margin: 24px auto 0;"></div>
        </div>
      </div>

      <!-- Bottom System Stamp -->
      <div style="margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8;" class="break-inside-avoid">
        مستند مبيعات رسمي صادر عن نظام code systems ERP • البضاعة المباعة ترد وتستبدل خلال 14 يوماً مع الفاتورة
      </div>
    </div>
  `;
}

/**
 * 3. Cut Order (أمر تشغيل وقص ملابس) HTML Generator
 * Matches corporate ERP invoice styling for both A4 and 80mm Thermal
 */
export function generateCutOrderHtml(order, settings = {}, paperSize = 'a4') {
  if (!order) return '';
  const isThermal = paperSize === '80mm';
  const companyName = settings?.factory_name || 'code systems';
  const hasValidLogo = Boolean(settings?.company_logo && typeof settings.company_logo === 'string' && settings.company_logo.trim() !== '');
  const companyLogo = hasValidLogo ? settings.company_logo : '';

  const cuttingNumber = order.cutting_number || order.order_number || order.id || '';
  const orderDate = order.start_date || order.order_date || order.created_at || '';
  const productName = order.cutting_name || order.model_name || order.product_name || (order.product ? order.product.name : '') || 'موديل ملابس جاهزة';
  const productCode = order.product_code || (order.product ? order.product.code : '') || '';
  const fabricType = order.fabric_type || order.fabric_code || order.raw_material || 'قماش أساسي';
  const legacyColor = order.color || '';
  const supplierName = order.supplier_name || 'مستودع الخامات الرئيسي';
  const isClosed = order.status === 'completed' || order.status === 'closed';
  const statusLabel = isClosed ? 'مكتمل ومغلق' : order.status === 'in_progress' ? 'قيد التشغيل' : 'أمر صادر معتمد';

  const batchQty = Number(order.batch_quantity || order.planned_quantity || order.quantity || 0);
  const totalStagesCost = Number(order.total_stages_cost || order.total_printing_cost || 0);
  const totalMaterialCost = Number(order.total_material_cost || 0);
  const totalAdditionalCost = Number(order.total_additional_cost || 0);
  const totalProductCost = Number(order.total_product_cost || (totalMaterialCost + totalStagesCost + totalAdditionalCost));
  const unitCostExact = Number(order.unit_cost_exact || (batchQty > 0 ? totalProductCost / batchQty : 0));
  const unitCost4Decimals = Number(order.unit_cost || unitCostExact);

  const CUT_SIZES = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'];

  // Matrix rows resolution
  let printMatrix = [];
  if (Array.isArray(order.matrix) && order.matrix.length > 0) {
    printMatrix = order.matrix;
  } else {
    let legacyMap = {};
    if (typeof order.size_quantities === 'string') {
      try { legacyMap = JSON.parse(order.size_quantities); } catch (e) {}
    } else if (order.size_quantities && typeof order.size_quantities === 'object') {
      legacyMap = order.size_quantities;
    }
    const color = legacyColor || 'افتراضي';
    const rowQ = {};
    let hasAny = false;
    CUT_SIZES.forEach(sz => {
      const q = Number(legacyMap[sz]) || 0;
      rowQ[sz] = q;
      if (q > 0) hasAny = true;
    });
    if (hasAny) {
      printMatrix = [{ color, quantities: rowQ }];
    }
  }

  // Calculate matrix totals
  const colTotals = {};
  CUT_SIZES.forEach(sz => { colTotals[sz] = 0; });
  let matrixGrandTotal = 0;
  printMatrix.forEach(r => {
    CUT_SIZES.forEach(sz => {
      const q = Number(r.quantities?.[sz]) || 0;
      colTotals[sz] += q;
      matrixGrandTotal += q;
    });
  });
  const effectiveBatchQty = matrixGrandTotal > 0 ? matrixGrandTotal : batchQty;

  // Raw materials used
  const rawMaterials = Array.isArray(order.materials_lines) && order.materials_lines.length > 0
    ? order.materials_lines
    : (Array.isArray(order.materials) && order.materials.length > 0
        ? order.materials
        : (Array.isArray(order.materials_used) ? order.materials_used : []));

  // Stages
  const stages = order.stages || {};
  const stageConfigs = [
    { key: 'printing', title: 'مرحلة الطباعة', data: stages.printing },
    { key: 'embroidery', title: 'مرحلة التطريز', data: stages.embroidery },
    { key: 'sewing', title: 'مرحلة الحياكة والتجميع', data: stages.sewing }
  ];
  const activeStages = stageConfigs.filter(st => Boolean(st.data && (st.data.vendor_name || st.data.total_cost || st.data.fixed_total || st.data.price_per_piece)));

  // --- 3.A) Thermal 80mm Layout for Cut Order ---
  if (isThermal) {
    return `
      <div style="padding: 4px; font-family: 'Cairo', Tahoma, sans-serif; font-size: 11px; color: #000;" dir="rtl">
        <!-- Thermal Header -->
        <div style="text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: 8px; margin-bottom: 8px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 40px; max-width: 90px; object-fit: contain; margin: 0 auto 4px;" />` : ''}
          <div style="font-weight: 800; font-size: 14px;">${escapeHtml(companyName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #1e293b;">أمر تشغيل وقص ملابس</div>
          ${settings?.phone ? `<div style="font-size: 10px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}

          <div style="margin-top: 6px; border-top: 1px dotted #cbd5e1; padding-top: 4px; text-align: right; font-size: 10px; line-height: 1.5;">
            <div><strong>رقم الأمر:</strong> <span class="font-mono font-bold">${escapeHtml(cuttingNumber)}</span></div>
            <div><strong>التاريخ:</strong> <span class="font-mono">${formatDate(orderDate)}</span></div>
            <div><strong>الموديل:</strong> ${escapeHtml(productName)} ${productCode ? `(${escapeHtml(productCode)})` : ''}</div>
            <div><strong>الخامة:</strong> ${escapeHtml(fabricType)}</div>
            <div><strong>إجمالي القطع:</strong> <span class="font-mono font-bold">${formatNumber(effectiveBatchQty)} قطعة</span></div>
            <div><strong>حالة الأمر:</strong> ${escapeHtml(statusLabel)}</div>
          </div>
        </div>

        <!-- Matrix Summary Table -->
        <div style="font-weight: bold; font-size: 10px; margin-bottom: 4px; border-bottom: 1px solid #000; padding-bottom: 2px;">
          بيان الكميات بالمقاس واللون:
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px;">
          <thead>
            <tr style="border-bottom: 1px solid #475569; font-weight: bold;">
              <th style="text-align: right; padding: 2px;">اللون</th>
              <th style="text-align: center; padding: 2px;">المقاسات</th>
              <th style="text-align: left; padding: 2px;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${printMatrix.map(r => {
              const activeSizes = CUT_SIZES.filter(sz => (Number(r.quantities?.[sz]) || 0) > 0)
                .map(sz => `${sz}:${r.quantities[sz]}`)
                .join(' | ');
              const rowTotal = CUT_SIZES.reduce((sum, sz) => sum + (Number(r.quantities?.[sz]) || 0), 0);
              return `
                <tr style="border-bottom: 1px dotted #94a3b8;">
                  <td style="padding: 3px 2px; font-weight: bold;">${escapeHtml(r.color || 'عام')}</td>
                  <td style="padding: 3px 2px; text-align: center;" class="font-mono">${escapeHtml(activeSizes || '-')}</td>
                  <td style="padding: 3px 2px; text-align: left; font-weight: bold;" class="font-mono">${rowTotal}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top: 1px solid #000; font-weight: bold;">
              <td colspan="2" style="padding: 3px 2px;">إجمالي قطع الباتش:</td>
              <td style="padding: 3px 2px; text-align: left;" class="font-mono">${effectiveBatchQty}</td>
            </tr>
          </tfoot>
        </table>

        <!-- Stages Summary -->
        ${activeStages.length > 0 ? `
          <div style="border-top: 1px dashed #64748b; padding-top: 6px; margin-top: 6px; font-size: 10px;">
            <div style="font-weight: bold; margin-bottom: 3px;">مراحل التشغيل والورش:</div>
            ${activeStages.map(st => `
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>${escapeHtml(st.title)} (${escapeHtml(st.data.vendor_name || 'غير محدد')}):</span>
                <span class="font-mono font-bold">${formatCurrency(st.data.total_cost || st.data.fixed_total || 0)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Financial Breakdown -->
        <div style="border-top: 1px dashed #64748b; padding-top: 6px; margin-top: 6px; font-size: 11px;">
          ${totalMaterialCost > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>تكلفة الخامات:</span>
              <span class="font-mono">${formatCurrency(totalMaterialCost)}</span>
            </div>
          ` : ''}
          ${totalStagesCost > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>تكلفة المراحل:</span>
              <span class="font-mono">${formatCurrency(totalStagesCost)}</span>
            </div>
          ` : ''}
          ${totalAdditionalCost > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span>تكاليف إضافية:</span>
              <span class="font-mono">${formatCurrency(totalAdditionalCost)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
            <span>إجمالي تكلفة القصة:</span>
            <span class="font-mono">${formatCurrency(totalProductCost)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: #334155; margin-top: 2px;">
            <span>تكلفة القطعة التقديرية:</span>
            <span class="font-mono font-bold">${unitCostExact.toFixed(2)} ج.م</span>
          </div>
        </div>

        ${order.cutting_comment || order.notes ? `
          <div style="margin-top: 8px; border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 10px;">
            <strong>ملاحظات:</strong> ${escapeHtml(order.cutting_comment || order.notes)}
          </div>
        ` : ''}

        <!-- Footer Signatures -->
        <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; font-size: 9px; font-weight: bold; text-align: center;">
          <div style="width: 48%;">
            <div>مسؤول المقصدار</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 18px;"></div>
          </div>
          <div style="width: 48%;">
            <div>مشرف الإنتاج والجودة</div>
            <div style="border-bottom: 1px dotted #94a3b8; height: 18px;"></div>
          </div>
        </div>

        <div style="text-align: center; font-size: 9px; color: #64748b; margin-top: 10px;">
          code systems ERP • أمر تشغيل وقص ملابس
        </div>
      </div>
    `;
  }

  // --- 3.B) A4 Official Layout for Cut Order ---
  return `
    <div style="padding: 24px 32px; color: #1e293b; background: #ffffff; font-family: 'Cairo', Tahoma, sans-serif;" dir="rtl">
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 18px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 56px; max-width: 120px; object-fit: contain; border-radius: 4px;" />` : ''}
          <div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px 0;">${escapeHtml(companyName)}</h1>
            <div style="font-size: 11px; font-weight: bold; color: #64748b;">قسم الإنتاج والتشغيل - أمر قص وتشغيل ملابس رسمي</div>
            ${settings?.address ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;">${escapeHtml(settings.address)}</div>` : ''}
            ${settings?.phone ? `<div style="font-size: 11px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
          </div>
        </div>

        <div style="text-align: left;">
          <div style="display: inline-block; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 13px; padding: 5px 14px; border-radius: 6px; margin-bottom: 8px;">
            أمر تشغيل وقص ملابس (Cut Order)
          </div>
          <div style="font-size: 11px; color: #334155; font-weight: bold;">
            رقم أمر القص: <span class="font-mono" style="font-size: 13px; color: #0f172a;">${escapeHtml(cuttingNumber)}</span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;">
            تاريخ التشغيل: <span class="font-mono">${formatDate(orderDate)}</span>
          </div>
          <div style="font-size: 11px; color: #334155; margin-top: 3px;">
            حالة الأمر: <strong style="color: ${isClosed ? '#047857' : '#1e3a8a'};">${escapeHtml(statusLabel)}</strong>
          </div>
        </div>
      </div>

      <!-- Order Details Card -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 11px;">
        <div>
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">اسم الموديل / المنتج:</span>
          <div style="font-size: 13px; font-weight: bold; color: #0f172a;">${escapeHtml(productName)}</div>
          ${productCode ? `<div style="color: #64748b; margin-top: 2px;" class="font-mono">كود الموديل: ${escapeHtml(productCode)}</div>` : ''}
        </div>
        <div>
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">نوع ولون القماش:</span>
          <div style="font-size: 13px; font-weight: bold; color: #0f172a;">${escapeHtml(fabricType)}</div>
          ${legacyColor ? `<div style="color: #64748b; margin-top: 2px;">الألوان: ${escapeHtml(legacyColor)}</div>` : ''}
        </div>
        <div style="text-align: left;">
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 3px;">جهة التوريد / المستودع:</span>
          <div style="font-size: 13px; font-weight: bold; color: #0f172a;">${escapeHtml(supplierName)}</div>
          <div style="color: #047857; font-weight: bold; margin-top: 2px;">معتمد ومطابق للمواصفات</div>
        </div>
      </div>

      <!-- 4 Quick Stats Badges -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; text-align: center;">
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px;">
          <span style="font-size: 10px; font-weight: bold; color: #1e40af; display: block;">إجمالي قطع الباتش</span>
          <span style="font-size: 16px; font-weight: bold; color: #1e3a8a;" class="font-mono">${formatNumber(effectiveBatchQty)}</span>
        </div>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 8px;">
          <span style="font-size: 10px; font-weight: bold; color: #065f46; display: block;">تكلفة الخامات المصروفة</span>
          <span style="font-size: 16px; font-weight: bold; color: #047857;" class="font-mono">${formatCurrency(totalMaterialCost)}</span>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px;">
          <span style="font-size: 10px; font-weight: bold; color: #92400e; display: block;">تكلفة مراحل التشغيل</span>
          <span style="font-size: 16px; font-weight: bold; color: #b45309;" class="font-mono">${formatCurrency(totalStagesCost)}</span>
        </div>
        <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 8px;">
          <span style="font-size: 10px; font-weight: bold; color: #6b21a8; display: block;">تكلفة القطعة الواحدة</span>
          <span style="font-size: 16px; font-weight: bold; color: #7e22ce;" class="font-mono">${unitCostExact.toFixed(2)} ج.م</span>
        </div>
      </div>

      <!-- Color by Size Matrix Table (Requirement 4.6) -->
      <div style="margin-bottom: 18px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
        <div style="background: #1e3a8a; color: #ffffff; padding: 6px 12px; font-weight: bold; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span>جدول توزيع المقاسات والكميات للقصة (Matrix Breakdown)</span>
          <span style="font-size: 11px; font-weight: normal;">10 مقاسات قياسية (M إلى 8XL)</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #334155; font-weight: bold;">
              <th style="padding: 7px 10px; text-align: right; width: 140px; border-left: 1px solid #e2e8f0;">اللون</th>
              ${CUT_SIZES.map(sz => `
                <th style="padding: 7px 4px; text-align: center; border-left: 1px solid #e2e8f0;" class="font-mono">${sz}</th>
              `).join('')}
              <th style="padding: 7px 10px; text-align: center; width: 90px; color: #1e3a8a; font-weight: bold;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${printMatrix.length > 0 ? printMatrix.map((r, idx) => {
              const rowTotal = CUT_SIZES.reduce((sum, sz) => sum + (Number(r.quantities?.[sz]) || 0), 0);
              return `
                <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
                  <td style="padding: 7px 10px; font-weight: bold; color: #0f172a; border-left: 1px solid #e2e8f0;">${escapeHtml(r.color || 'افتراضي')}</td>
                  ${CUT_SIZES.map(sz => {
                    const q = Number(r.quantities?.[sz]) || 0;
                    return `
                      <td style="padding: 7px 4px; text-align: center; border-left: 1px solid #e2e8f0; font-weight: ${q > 0 ? 'bold' : 'normal'}; color: ${q > 0 ? '#0f172a' : '#94a3b8'};" class="font-mono">
                        ${q > 0 ? q : '-'}
                      </td>
                    `;
                  }).join('')}
                  <td style="padding: 7px 10px; text-align: center; font-weight: bold; color: #1e3a8a;" class="font-mono">${rowTotal}</td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="12" style="padding: 12px; text-align: center; color: #94a3b8;">لا توجد تفاصيل مقاسات مسجلة</td>
              </tr>
            `}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1; font-weight: bold; color: #0f172a;">
              <td style="padding: 8px 10px; border-left: 1px solid #cbd5e1;">الإجمالي لكل مقاس</td>
              ${CUT_SIZES.map(sz => `
                <td style="padding: 8px 4px; text-align: center; border-left: 1px solid #cbd5e1; color: #1e3a8a;" class="font-mono">${colTotals[sz]}</td>
              `).join('')}
              <td style="padding: 8px 10px; text-align: center; background: #e0e7ff; color: #1e3a8a; font-size: 13px;" class="font-mono">${effectiveBatchQty}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Raw Materials Issued Table (if any) -->
      ${rawMaterials.length > 0 ? `
        <div style="margin-bottom: 18px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
          <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 6px 12px; font-weight: bold; font-size: 11px; color: #334155;">
            الخامات ومستلزمات الإنتاج المنصرفة للقصة
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold;">
                <th style="padding: 6px 10px; text-align: center; width: 35px;">#</th>
                <th style="padding: 6px 10px; text-align: right;">اسم الخامة والمواصفات</th>
                <th style="padding: 6px 10px; text-align: center; width: 85px;">الكمية المنصرفة</th>
                <th style="padding: 6px 10px; text-align: center; width: 70px;">الوحدة</th>
                <th style="padding: 6px 10px; text-align: left; width: 95px;">سعر الوحدة</th>
                <th style="padding: 6px 10px; text-align: left; width: 105px;">إجمالي التكلفة</th>
              </tr>
            </thead>
            <tbody>
              ${rawMaterials.map((m, idx) => {
                const qty = Number(m.quantity ?? m.actual_quantity ?? m.standard_quantity ?? 0);
                const price = Number(m.unit_price ?? m.unit_cost ?? 0);
                const lineTotal = Number(m.line_cost ?? m.total_cost ?? (qty * price));
                return `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 10px; text-align: center;" class="font-mono">${idx + 1}</td>
                    <td style="padding: 6px 10px; font-weight: bold; color: #0f172a;">${escapeHtml(m.material_name || m.name || m.raw_material_id || '')}</td>
                    <td style="padding: 6px 10px; text-align: center; font-weight: bold;" class="font-mono">${formatNumber(qty)}</td>
                    <td style="padding: 6px 10px; text-align: center;">${escapeHtml(m.material_unit || m.unit || 'وحدة')}</td>
                    <td style="padding: 6px 10px; text-align: left;" class="font-mono">${formatCurrency(price)}</td>
                    <td style="padding: 6px 10px; text-align: left; font-weight: bold; color: #0f172a;" class="font-mono">${formatCurrency(lineTotal)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Production Stages & Services Table (if any) -->
      ${activeStages.length > 0 ? `
        <div style="margin-bottom: 18px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
          <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 6px 12px; font-weight: bold; font-size: 11px; color: #334155;">
            مراحل التشغيل والخدمات الخارجية (الطباعة والتطريز والحياكة)
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold;">
                <th style="padding: 6px 10px; text-align: right; width: 130px;">المرحلة</th>
                <th style="padding: 6px 10px; text-align: right;">الورشة / مقاول الخدمة</th>
                <th style="padding: 6px 10px; text-align: center; width: 100px;">طريقة المحاسبة</th>
                <th style="padding: 6px 10px; text-align: left; width: 95px;">التكلفة الإجمالية</th>
                <th style="padding: 6px 10px; text-align: left; width: 90px;">المسدد</th>
                <th style="padding: 6px 10px; text-align: left; width: 90px;">المتبقي</th>
              </tr>
            </thead>
            <tbody>
              ${activeStages.map(st => {
                const cost = Number(st.data.total_cost || st.data.fixed_total || 0);
                const paid = Number(st.data.paid || 0);
                const rem = Math.max(0, cost - paid);
                const pricingType = st.data.pricing_type === 'per_piece' ? 'بالقطعة' : 'مبلغ مقطوع';
                return `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 10px; font-weight: bold; color: #1e3a8a;">${escapeHtml(st.title)}</td>
                    <td style="padding: 6px 10px; font-weight: bold; color: #0f172a;">${escapeHtml(st.data.vendor_name || 'غير محدد')}</td>
                    <td style="padding: 6px 10px; text-align: center; font-size: 10px;">${escapeHtml(pricingType)}</td>
                    <td style="padding: 6px 10px; text-align: left; font-weight: bold;" class="font-mono">${formatCurrency(cost)}</td>
                    <td style="padding: 6px 10px; text-align: left; color: #047857;" class="font-mono">${formatCurrency(paid)}</td>
                    <td style="padding: 6px 10px; text-align: left; color: ${rem > 0 ? '#b91c1c' : '#475569'};" class="font-mono">${formatCurrency(rem)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Financial Totals Box & Notes Section -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px;" class="break-inside-avoid">
        <div style="flex: 1; font-size: 11px;">
          ${order.cutting_comment || order.notes ? `
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa;">
              <strong style="color: #334155;">تعليمات وتوجيهات قسم القص:</strong>
              <p style="margin: 4px 0 0; color: #475569;">${escapeHtml(order.cutting_comment || order.notes)}</p>
            </div>
          ` : ''}
        </div>

        <div style="width: 300px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
            <span>إجمالي تكلفة الخامات:</span>
            <span class="font-mono font-bold">${formatCurrency(totalMaterialCost)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
            <span>إجمالي تكاليف المراحل الخارجية:</span>
            <span class="font-mono font-bold">${formatCurrency(totalStagesCost)}</span>
          </div>
          ${totalAdditionalCost > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">
              <span>مصاريف إضافية وتشغيلية:</span>
              <span class="font-mono font-bold">+${formatCurrency(totalAdditionalCost)}</span>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 13px;">
            <span>التكلفة الإجمالية لأمر القص:</span>
            <span class="font-mono">${formatCurrency(totalProductCost)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 12px; background: #eff6ff; font-weight: bold; font-size: 11px; color: #1e40af;">
            <span>تكلفة القطعة الواحدة:</span>
            <span class="font-mono">${unitCostExact.toFixed(2)} ج.م</span>
          </div>
        </div>
      </div>

      <!-- Official Signatures for Cutting Order -->
      <div style="margin-top: 36px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; text-align: center; font-size: 11px; font-weight: bold; color: #334155;" class="break-inside-avoid">
        <div>
          <div>مسؤول مقصدار (القص)</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>مراقب الجودة الفنية</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>المحاسب المسؤول</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
        <div>
          <div>الاعتماد الإداري / إدارة الإنتاج</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 24px auto 0;"></div>
        </div>
      </div>

      <!-- Bottom System Stamp -->
      <div style="margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8;" class="break-inside-avoid">
        أمر تشغيل وقص رسمي صادر عن نظام code systems ERP • تم خصم الخامات وتوزيع التكاليف آلياً لأقرب قرش
      </div>
    </div>
  `;
}
