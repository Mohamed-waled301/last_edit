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

/**
 * Auto-Fit inline CSS for HTML printing templates (Invoices, POs, Cutting Orders)
 * Guarantees long text stays strictly on a single line without wrapping or hiding behind border lines
 */
export function getAutoFitInlineStyle(text, maxChars = 24, baseFontSize = 11.5) {
  const str = String(text ?? '').trim();
  const len = str.length;
  if (!len || len <= maxChars) {
    return `font-size: ${baseFontSize}px; letter-spacing: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; max-width: 100%; box-sizing: border-box;`;
  }
  const excess = len - maxChars;
  let size = baseFontSize;
  let letterSpacing = 'normal';
  let fontStretch = '';
  if (excess <= 6) {
    size = Math.max(9.5, Number((baseFontSize - 1.2).toFixed(1)));
    letterSpacing = '-0.2px';
  } else if (excess <= 14) {
    size = Math.max(8.8, Number((baseFontSize - 2.2).toFixed(1)));
    letterSpacing = '-0.35px';
    fontStretch = 'font-stretch: condensed;';
  } else if (excess <= 24) {
    size = Math.max(8.2, Number((baseFontSize - 3.0).toFixed(1)));
    letterSpacing = '-0.45px';
    fontStretch = 'font-stretch: condensed;';
  } else {
    size = Math.max(7.8, Number((baseFontSize - 3.5).toFixed(1)));
    letterSpacing = '-0.5px';
    fontStretch = 'font-stretch: condensed;';
  }
  return `font-size: ${size}px; letter-spacing: ${letterSpacing}; ${fontStretch} white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; max-width: 100%; box-sizing: border-box;`;
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
      line-height: 1.45;
      direction: rtl;
      text-align: right;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
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
    .break-inside-avoid, tr, td, th {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .cell-autofit {
      display: inline-block !important;
      max-width: 100% !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      box-sizing: border-box !important;
      vertical-align: middle !important;
      line-height: 1.3 !important;
    }
    img {
      max-height: 56px !important;
      max-width: 140px !important;
      height: auto !important;
      width: auto !important;
      object-fit: contain !important;
      display: block !important;
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
export function generatePurchaseInvoiceHtml(po, settings = {}, paperSize = 'a4', options = false) {
  if (!po) return '';
  const showAccountBalance = typeof options === 'boolean' ? options : Boolean(options?.showAccountBalance);
  const isThermal = paperSize === '80mm';
  const companyName = settings?.factory_name || 'code systems';
  const hasValidLogo = Boolean(settings?.company_logo && typeof settings.company_logo === 'string' && settings.company_logo.trim() !== '' && settings.company_logo !== '/logo.png');
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
  let discount = Number(po.discount_value ?? po.discount_amount ?? po.discount ?? 0);
  if (!discount && Number(po.discount_percent) > 0 && subtotal > 0) {
    discount = Number(((subtotal * Number(po.discount_percent)) / 100).toFixed(2));
  }
  const additionalExpenses = Number(po.additional_expenses ?? 0);
  const totalAmount = Number(po.total_amount ?? po.grand_total ?? (subtotal - discount + additionalExpenses));

  // Authoritative Supplier Account Balances for Optional Printing
  const supPrevBalance = Number(po.supplier_previous_balance ?? po.previous_balance ?? po.supplier?.current_balance ?? 0);
  const supActualPaid = Number(po.actual_paid_amount ?? po.paid_amount ?? (isCredit ? 0 : totalAmount));
  const supResultingBalance = fromPiasters(
    toPiasters(supPrevBalance) + toPiasters(totalAmount) - toPiasters(supActualPaid)
  );

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
          ${hasValidLogo ? `<img src="${companyLogo}" alt="" onerror="this.style.display='none';" style="height: 40px; max-width: 90px; object-fit: contain; margin: 0 auto 4px;" />` : ''}
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
              <span>الخصم التجاري${Number(po.discount_percent) > 0 ? ` (${po.discount_percent}%)` : ''}:</span>
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

        ${showAccountBalance ? `
          <div style="margin-top: 6px; border-top: 1px dashed #64748b; padding-top: 4px; font-size: 10px;">
            <div style="font-weight: bold; color: #1e3a8a; margin-bottom: 3px;">ملخص حساب المورد (الأرصدة المالية):</div>
            <div style="display: flex; justify-content: space-between;">
              <span>رصيد المورد قبل الفاتورة:</span>
              <span class="font-mono">${formatCurrency(supPrevBalance)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>إجمالي الفاتورة:</span>
              <span class="font-mono font-bold">${formatCurrency(totalAmount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>المدفوع فعليًا:</span>
              <span class="font-mono">${formatCurrency(supActualPaid)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: #1e3a8a; border-top: 1px dotted #93c5fd; padding-top: 2px; margin-top: 2px;">
              <span>الرصيد بعد الفاتورة:</span>
              <span class="font-mono">${formatCurrency(supResultingBalance)}</span>
            </div>
          </div>
        ` : ''}

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
  const explicitLineDiscountsSum = items.reduce((sum, it) => sum + Number(it.discount ?? it.discount_value ?? 0), 0);
  const effectiveInvoiceDiscount = discount > 0 ? discount : explicitLineDiscountsSum;

  const itemsWithGross = items.map(it => {
    const qty = Number(it.quantity_ordered ?? it.quantity ?? 1);
    const price = Number(it.unit_price ?? 0);
    const gross = Number((qty * price).toFixed(2));
    const explicitDisc = Number(it.discount ?? it.discount_value ?? 0);
    return { it, qty, price, gross, explicitDisc };
  });

  const totalGross = itemsWithGross.reduce((s, x) => s + x.gross, 0) || subtotal || 1;

  let distributedDiscounts = [];
  if (effectiveInvoiceDiscount > 0 && explicitLineDiscountsSum === 0) {
    if (itemsWithGross.length === 1) {
      distributedDiscounts = [effectiveInvoiceDiscount];
    } else {
      const totalDiscPiasters = toPiasters(effectiveInvoiceDiscount);
      const shares = itemsWithGross.map((x, idx) => {
        const exact = (totalDiscPiasters * x.gross) / totalGross;
        const base = Math.floor(exact);
        const rem = exact - base;
        return { idx, base, rem };
      });
      const sumBase = shares.reduce((s, sh) => s + sh.base, 0);
      let left = totalDiscPiasters - sumBase;
      const sorted = [...shares].sort((a, b) => b.rem - a.rem);
      for (let i = 0; i < left && i < sorted.length; i++) {
        shares[sorted[i].idx].base += 1;
      }
      distributedDiscounts = shares.map(sh => fromPiasters(sh.base));
    }
  }

  const itemsRowsA4 = itemsWithGross.map(({ it, qty, price, gross, explicitDisc }, idx) => {
    let lineDiscount = explicitDisc;
    if (lineDiscount <= 0 && distributedDiscounts.length > idx) {
      lineDiscount = distributedDiscounts[idx];
    }
    const lineTotal = Number(Math.max(0, gross - lineDiscount).toFixed(2));
    const matName = it.material_name || it.item_name || it.name || '';
    const matCode = it.material_code || it.item_code || '-';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center;" class="font-mono">${idx + 1}</td>
        <td style="padding: 6px 8px; font-mono; font-size: 11px; color: #475569; text-align: center;">
          <span style="${getAutoFitInlineStyle(matCode, 14, 11)}" title="${escapeHtml(matCode)}">${escapeHtml(matCode)}</span>
        </td>
        <td style="padding: 6px 8px; font-weight: bold; color: #0f172a;">
          <span style="${getAutoFitInlineStyle(matName, 32, 11.5)}" title="${escapeHtml(matName)}">${escapeHtml(matName)}</span>
        </td>
        <td style="padding: 6px 8px; text-align: center; font-weight: bold;" class="font-mono">${formatNumber(qty)}</td>
        <td style="padding: 6px 8px; text-align: left;" class="font-mono">${formatCurrency(price)}</td>
        <td style="padding: 6px 8px; text-align: center;" class="font-mono">${lineDiscount > 0 ? formatCurrency(lineDiscount) : '-'}</td>
        <td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #0f172a;" class="font-mono">${formatCurrency(lineTotal)}</td>
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
          ${hasValidLogo ? `<img src="${companyLogo}" alt="" onerror="this.style.display='none';" style="height: 56px; max-width: 120px; object-fit: contain; border-radius: 4px;" />` : ''}
          <div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px 0;">${escapeHtml(companyName)}</h1>
            <div style="font-size: 11px; font-weight: bold; color: #64748b;">نظام تخطيط موارد المؤسسات - كود سيستمز المتكامل</div>
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
      <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; table-layout: auto;">
        <colgroup>
          <col style="width: 5%; min-width: 35px;" />
          <col style="width: 13%; min-width: 85px;" />
          <col style="width: 40%; min-width: 180px;" />
          <col style="width: 10%; min-width: 65px;" />
          <col style="width: 11%; min-width: 90px;" />
          <col style="width: 9%; min-width: 65px;" />
          <col style="width: 12%; min-width: 95px;" />
        </colgroup>
        <thead>
          <tr style="background: #1e3a8a; color: #ffffff; font-weight: bold;">
            <th style="padding: 8px 6px; text-align: center; width: 5%; min-width: 35px; white-space: nowrap;">#</th>
            <th style="padding: 8px 8px; text-align: right; width: 13%; min-width: 85px; white-space: nowrap;">كود الصنف</th>
            <th style="padding: 8px 12px; text-align: right; width: 40%; min-width: 180px;">بيان الصنف والمواصفات</th>
            <th style="padding: 8px 6px; text-align: center; width: 10%; min-width: 65px; white-space: nowrap;">الكمية</th>
            <th style="padding: 8px 6px; text-align: left; width: 11%; min-width: 90px; white-space: nowrap;">سعر الوحدة</th>
            <th style="padding: 8px 6px; text-align: center; width: 9%; min-width: 65px; white-space: nowrap;">الخصم</th>
            <th style="padding: 8px 8px; text-align: left; width: 12%; min-width: 95px; white-space: nowrap;">الإجمالي</th>
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
              <span>الخصم التجاري${Number(po.discount_percent) > 0 ? ` (${po.discount_percent}%)` : ''}:</span>
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

      ${showAccountBalance ? `
        <div style="margin-top: 16px; border: 1px solid #93c5fd; background: #eff6ff; border-radius: 8px; padding: 10px 14px; font-size: 11px;" class="break-inside-avoid">
          <div style="font-weight: bold; color: #1e3a8a; margin-bottom: 6px; border-bottom: 1px solid #bfdbfe; padding-bottom: 4px;">
            ملخص حساب المورد (الأرصدة المالية):
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">رصيد المورد قبل الفاتورة:</span>
              <span class="font-mono" style="font-weight: bold; color: #1e293b;">${formatCurrency(supPrevBalance)}</span>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">إجمالي الفاتورة:</span>
              <span class="font-mono" style="font-weight: bold; color: #1e3a8a;">${formatCurrency(totalAmount)}</span>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">المدفوع فعليًا:</span>
              <span class="font-mono" style="font-weight: bold; color: #047857;">${formatCurrency(supActualPaid)}</span>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">الرصيد بعد الفاتورة:</span>
              <span class="font-mono" style="font-weight: bold; color: #b91c1c;">${formatCurrency(supResultingBalance)}</span>
            </div>
          </div>
        </div>
      ` : ''}

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
export function generateSalesInvoiceHtml(invoice, settings = {}, paperSize = 'a4', customerBalanceAfter = null, options = false) {
  if (!invoice) return '';
  const showAccountBalance = typeof options === 'boolean' ? options : Boolean(options?.showAccountBalance);
  const isThermal = paperSize === '80mm';
  const companyName = settings?.factory_name || 'code systems';
  const hasValidLogo = Boolean(settings?.company_logo && typeof settings.company_logo === 'string' && settings.company_logo.trim() !== '' && settings.company_logo !== '/logo.png');
  const companyLogo = hasValidLogo ? settings.company_logo : '';

  const invoiceNumber = invoice.invoice_number || invoice.id || '';
  const invoiceDate = invoice.invoice_date || invoice.created_at || '';
  const customerName = invoice.customer_name || invoice.customer?.name || 'عميل نقدي';
  const customerCode = invoice.customer_code || invoice.customer?.code || '';
  const customerPhone = invoice.customer_phone || invoice.customer?.phone || '';
  const isCredit = invoice.payment_terms === 'credit';
  const paymentTerms = isCredit ? 'آجل' : 'نقدي فوري';

  const items = Array.isArray(invoice.items) ? invoice.items : [];

  // Totals
  const totalAmount = Number(invoice.total_amount ?? invoice.total_invoice_amount ?? invoice.subtotal ?? 0);
  const subtotal = Number(invoice.subtotal ?? totalAmount);
  const discount = Number(invoice.discount_value ?? invoice.discount ?? 0);
  const paidAmount = Number(invoice.actual_paid_amount ?? invoice.paid_amount ?? (isCredit ? 0 : totalAmount));
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

  // Authoritative Customer Account Balances for Optional Printing
  const custPrevBalance = Number(invoice.customer_previous_balance ?? invoice.previous_balance ?? invoice.customer?.current_balance ?? 0);
  const custResultingBalance = balanceAfter !== null ? balanceAfter : fromPiasters(
    toPiasters(custPrevBalance) + toPiasters(totalAmount) - toPiasters(paidAmount)
  );

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
          ${hasValidLogo ? `<img src="${companyLogo}" alt="" onerror="this.style.display='none';" style="height: 40px; max-width: 90px; object-fit: contain; margin: 0 auto 4px;" />` : ''}
          <div style="font-weight: 800; font-size: 14px;">${escapeHtml(companyName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #1e293b;">فاتورة مبيعات نقدية وآجلة</div>
          ${settings?.phone ? `<div style="font-size: 10px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
          ${settings?.tax_number ? `<div style="font-size: 10px; color: #475569;">الرقم الضريبي: <span class="font-mono">${escapeHtml(settings.tax_number)}</span></div>` : ''}

          <div style="margin-top: 6px; border-top: 1px dotted #cbd5e1; padding-top: 4px; text-align: right; font-size: 10px; line-height: 1.5;">
            <div><strong>رقم الفاتورة:</strong> <span class="font-mono font-bold">${escapeHtml(invoiceNumber)}</span></div>
            <div><strong>التاريخ:</strong> <span class="font-mono">${formatDate(invoiceDate)}</span></div>
            <div><strong>العميل:</strong> ${escapeHtml(customerName)}</div>
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
          ` : ''}
          ${showAccountBalance ? `
            <div style="margin-top: 6px; border-top: 1px dashed #64748b; padding-top: 4px; font-size: 10px;">
              <div style="font-weight: bold; color: #1e3a8a; margin-bottom: 3px;">ملخص حساب العميل (الأرصدة المالية):</div>
              <div style="display: flex; justify-content: space-between;">
                <span>رصيد العميل قبل الفاتورة:</span>
                <span class="font-mono">${formatCurrency(custPrevBalance)}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>إجمالي الفاتورة:</span>
                <span class="font-mono font-bold">${formatCurrency(totalAmount)}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>المدفوع فعليًا:</span>
                <span class="font-mono">${formatCurrency(paidAmount)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-weight: bold; color: #1e3a8a; border-top: 1px dotted #93c5fd; padding-top: 2px; margin-top: 2px;">
                <span>رصيد العميل بعد الفاتورة:</span>
                <span class="font-mono">${formatCurrency(custResultingBalance)}</span>
              </div>
            </div>
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
    const prodName = it.product_name || it.name || '';
    const fullProdText = prodName + (it.variant_label ? ` (${it.variant_label})` : '');
    const prodCode = it.product_code || '-';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 6px 8px; text-align: center;" class="font-mono">${idx + 1}</td>
        <td style="padding: 6px 8px; font-mono; font-size: 11px; color: #475569; text-align: center;">
          <span style="${getAutoFitInlineStyle(prodCode, 14, 11)}" title="${escapeHtml(prodCode)}">${escapeHtml(prodCode)}</span>
        </td>
        <td style="padding: 6px 8px; font-weight: bold; color: #0f172a;">
          <span style="${getAutoFitInlineStyle(fullProdText, 32, 11.5)}" title="${escapeHtml(fullProdText)}">
            ${escapeHtml(prodName)}
            ${it.variant_label ? `<span style="font-weight: normal; color: #64748b; font-size: 10px;"> (${escapeHtml(it.variant_label)})</span>` : ''}
          </span>
        </td>
        <td style="padding: 6px 8px; text-align: center; font-weight: bold;" class="font-mono">${formatNumber(qty)}</td>
        <td style="padding: 6px 8px; text-align: left;" class="font-mono">${formatCurrency(priceBefore)}</td>
        <td style="padding: 6px 8px; text-align: center;" class="font-mono">${disc > 0 ? formatCurrency(disc) : '-'}</td>
        <td style="padding: 6px 8px; text-align: left;" class="font-mono">${formatCurrency(netPrice)}</td>
        <td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #0f172a;" class="font-mono">${formatCurrency(lineTotal)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="padding: 24px 32px; color: #1e293b; background: #ffffff; font-family: 'Cairo', Tahoma, sans-serif;" dir="rtl">
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="" onerror="this.style.display='none';" style="height: 56px; max-width: 120px; object-fit: contain; border-radius: 4px;" />` : ''}
          <div>
            <h1 style="font-size: 20px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px 0;">${escapeHtml(companyName)}</h1>
            <div style="font-size: 11px; font-weight: bold; color: #64748b;">نظام تخطيط موارد المؤسسات - كود سيستمز المتكامل</div>
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
        </div>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 18px; table-layout: auto;">
        <colgroup>
          <col style="width: 5%; min-width: 35px;" />
          <col style="width: 13%; min-width: 80px;" />
          <col style="width: 34%; min-width: 160px;" />
          <col style="width: 9%; min-width: 60px;" />
          <col style="width: 10%; min-width: 80px;" />
          <col style="width: 8%; min-width: 60px;" />
          <col style="width: 10%; min-width: 80px;" />
          <col style="width: 12%; min-width: 95px;" />
        </colgroup>
        <thead>
          <tr style="background: #1e3a8a; color: #ffffff; font-weight: bold;">
            <th style="padding: 8px 6px; text-align: center; width: 5%; min-width: 35px; white-space: nowrap;">#</th>
            <th style="padding: 8px 8px; text-align: right; width: 13%; min-width: 80px; white-space: nowrap;">كود الصنف</th>
            <th style="padding: 8px 12px; text-align: right; width: 34%; min-width: 160px;">بيان الصنف والمقاس واللون</th>
            <th style="padding: 8px 6px; text-align: center; width: 9%; min-width: 60px; white-space: nowrap;">الكمية</th>
            <th style="padding: 8px 6px; text-align: left; width: 10%; min-width: 80px; white-space: nowrap;">السعر قبل</th>
            <th style="padding: 8px 6px; text-align: center; width: 8%; min-width: 60px; white-space: nowrap;">الخصم</th>
            <th style="padding: 8px 6px; text-align: left; width: 10%; min-width: 80px; white-space: nowrap;">السعر بعد</th>
            <th style="padding: 8px 8px; text-align: left; width: 12%; min-width: 95px; white-space: nowrap;">الإجمالي</th>
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

      ${showAccountBalance ? `
        <div style="margin-top: 16px; border: 1px solid #93c5fd; background: #eff6ff; border-radius: 8px; padding: 10px 14px; font-size: 11px;" class="break-inside-avoid">
          <div style="font-weight: bold; color: #1e3a8a; margin-bottom: 6px; border-bottom: 1px solid #bfdbfe; padding-bottom: 4px;">
            ملخص حساب العميل (الأرصدة المالية):
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">رصيد العميل قبل الفاتورة:</span>
              <span class="font-mono" style="font-weight: bold; color: #1e293b;">${formatCurrency(custPrevBalance)}</span>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">إجمالي الفاتورة:</span>
              <span class="font-mono" style="font-weight: bold; color: #1e3a8a;">${formatCurrency(totalAmount)}</span>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">المدفوع فعليًا:</span>
              <span class="font-mono" style="font-weight: bold; color: #047857;">${formatCurrency(paidAmount)}</span>
            </div>
            <div>
              <span style="color: #64748b; display: block; font-size: 10px;">رصيد العميل بعد الفاتورة:</span>
              <span class="font-mono" style="font-weight: bold; color: #b91c1c;">${formatCurrency(custResultingBalance)}</span>
            </div>
          </div>
        </div>
      ` : ''}

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

export const DEFAULT_CUT_ORDER_PRINT_OPTIONS = {
  show_story_info: true,       // اسم القصة ورقم القصة
  show_matrix: true,           // تفاصيل الألوان والمقاسات والكميات
  show_stages_names: true,     // اسم المرحلة والورشة / المطبعة
  show_fabric_cost: false,     // تكلفة الخامة / نوع القماش (Default OFF)
  show_stage_costs: false,     // تكاليف مراحل التشغيل (Default OFF)
  show_total_cost: false,      // إجمالي تكلفة أمر القص (Default OFF)
  show_agreed_rates: false,    // أسعار الاتفاق مع الصنايعي / الورشة (Default OFF)
  show_specifications: true,   // التخاريج والمواصفات التفصيلية

  // CamelCase aliases
  showStoryDetails: true,
  showColorSizeMatrix: true,
  showStageWorkshop: true,
  showFabricCost: false,
  showStageCosts: false,
  showTotalCutCost: false,
  showAgreedRates: false,
  showSpecifications: true
};

/**
 * 3. Cut Order (أمر تشغيل وقص ملابس) HTML Generator
 * Matches corporate ERP invoice styling for both A4 and 80mm Thermal
 * Supports customizable field toggles for industrial/subcontractor printouts
 */
export function generateCutOrderHtml(order, settings = {}, paperSize = 'a4', printOptions = {}) {
  if (!order) return '';

  // Flexible argument handling: (order, paperSize, printOptions) or (order, settings, paperSize, printOptions)
  let actualSettings = settings;
  let actualPaperSize = paperSize;
  let actualPrintOptions = printOptions;

  if (typeof settings === 'string') {
    actualPaperSize = settings;
    actualSettings = {};
    if (typeof paperSize === 'object' && paperSize !== null) {
      actualPrintOptions = paperSize;
    }
  } else if (typeof paperSize === 'object' && paperSize !== null && (!printOptions || Object.keys(printOptions).length === 0)) {
    actualPrintOptions = paperSize;
    actualPaperSize = 'a4';
  }

  const isThermal = String(actualPaperSize).toLowerCase() === '80mm';
  const companyName = actualSettings?.factory_name || 'code systems';
  const hasValidLogo = Boolean(actualSettings?.company_logo && typeof actualSettings.company_logo === 'string' && actualSettings.company_logo.trim() !== '' && actualSettings.company_logo !== '/logo.png');
  const companyLogo = hasValidLogo ? actualSettings.company_logo : '';

  const masterStageCosts = Boolean(actualPrintOptions?.show_stage_costs || actualPrintOptions?.showStageCosts);

  // If sub-keys are provided explicitly, respect them. If not provided, inherit from masterStageCosts
  const showStageCostPrinting = actualPrintOptions?.show_stage_cost_printing !== undefined
    ? Boolean(actualPrintOptions.show_stage_cost_printing)
    : (actualPrintOptions?.showStageCostPrinting !== undefined ? Boolean(actualPrintOptions.showStageCostPrinting) : masterStageCosts);

  const showStageCostEmbroidery = actualPrintOptions?.show_stage_cost_embroidery !== undefined
    ? Boolean(actualPrintOptions.show_stage_cost_embroidery)
    : (actualPrintOptions?.showStageCostEmbroidery !== undefined ? Boolean(actualPrintOptions.showStageCostEmbroidery) : masterStageCosts);

  const showStageCostSewing = actualPrintOptions?.show_stage_cost_sewing !== undefined
    ? Boolean(actualPrintOptions.show_stage_cost_sewing)
    : (actualPrintOptions?.showStageCostSewing !== undefined ? Boolean(actualPrintOptions.showStageCostSewing) : masterStageCosts);

  const showStageCostOperation = actualPrintOptions?.show_stage_cost_operation !== undefined
    ? Boolean(actualPrintOptions.show_stage_cost_operation)
    : (actualPrintOptions?.showStageCostOperation !== undefined ? Boolean(actualPrintOptions.showStageCostOperation) : masterStageCosts);

  const hasAnyStageCost = showStageCostPrinting || showStageCostEmbroidery || showStageCostSewing || showStageCostOperation;

  const opts = {
    show_story_info: actualPrintOptions?.show_story_info !== undefined ? Boolean(actualPrintOptions.show_story_info) : (actualPrintOptions?.showStoryDetails !== undefined ? Boolean(actualPrintOptions.showStoryDetails) : true),
    show_matrix: actualPrintOptions?.show_matrix !== undefined ? Boolean(actualPrintOptions.show_matrix) : (actualPrintOptions?.showColorSizeMatrix !== undefined ? Boolean(actualPrintOptions.showColorSizeMatrix) : true),
    show_stages_names: actualPrintOptions?.show_stages_names !== undefined ? Boolean(actualPrintOptions.show_stages_names) : (actualPrintOptions?.showStageWorkshop !== undefined ? Boolean(actualPrintOptions.showStageWorkshop) : true),
    show_fabric_cost: Boolean(actualPrintOptions?.show_fabric_cost || actualPrintOptions?.showFabricCost),
    show_stage_costs: hasAnyStageCost,
    show_stage_cost_printing: showStageCostPrinting,
    show_stage_cost_embroidery: showStageCostEmbroidery,
    show_stage_cost_sewing: showStageCostSewing,
    show_stage_cost_operation: showStageCostOperation,
    show_total_cost: Boolean(actualPrintOptions?.show_total_cost || actualPrintOptions?.showTotalCutCost),
    show_agreed_rates: Boolean(actualPrintOptions?.show_agreed_rates || actualPrintOptions?.showAgreedRates),
    show_specifications: actualPrintOptions?.show_specifications !== undefined ? Boolean(actualPrintOptions.show_specifications) : (actualPrintOptions?.showSpecifications !== undefined ? Boolean(actualPrintOptions.showSpecifications) : true)
  };

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
    { key: 'sewing', title: 'مرحلة الحياكة والتجميع', data: stages.sewing },
    { key: 'operation', title: 'مرحلة التشغيل', data: stages.operation }
  ];
  const activeStages = stageConfigs.filter(st => Boolean(st.data && (st.data.vendor_name || st.data.total_cost || st.data.fixed_total || st.data.price_per_piece)));

  const isStageCostVisible = (stageKey) => {
    if (stageKey === 'printing') return Boolean(opts.show_stage_cost_printing);
    if (stageKey === 'embroidery') return Boolean(opts.show_stage_cost_embroidery);
    if (stageKey === 'sewing') return Boolean(opts.show_stage_cost_sewing);
    if (stageKey === 'operation') return Boolean(opts.show_stage_cost_operation);
    return Boolean(opts.show_stage_costs);
  };

  const visibleStagesCost = activeStages.reduce((sum, st) => {
    if (isStageCostVisible(st.key)) {
      return sum + Number(st.data.total_cost || st.data.fixed_total || 0);
    }
    return sum;
  }, 0);

  const showFinancialRates = Boolean(opts.show_stage_costs || opts.show_agreed_rates);

  // --- 3.A) Thermal 80mm Layout for Cut Order ---
  if (isThermal) {
    return `
      <div style="padding: 4px; font-family: 'Cairo', Tahoma, sans-serif; font-size: 11px; color: #000; width: 100%; max-width: 76mm; margin: 0 auto;" dir="rtl">
        <!-- Thermal Header -->
        <div style="text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: 8px; margin-bottom: 8px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="" onerror="this.style.display='none';" style="height: 40px; max-width: 90px; object-fit: contain; margin: 0 auto 4px;" />` : ''}
          <div style="font-weight: 800; font-size: 14px;">${escapeHtml(companyName)}</div>
          <div style="font-size: 11px; font-weight: bold; color: #1e293b;">أمر تشغيل وقص ملابس (امر شغل)</div>
          ${settings?.phone ? `<div style="font-size: 10px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}

          <div style="margin-top: 6px; border-top: 1px dotted #cbd5e1; padding-top: 4px; text-align: right; font-size: 10px; line-height: 1.5;">
            ${opts.show_story_info ? `<div><strong>رقم القصة / الأمر:</strong> <span class="font-mono font-bold">${escapeHtml(cuttingNumber)}</span></div>` : ''}
            <div><strong>التاريخ:</strong> <span class="font-mono">${formatDate(orderDate)}</span></div>
            ${opts.show_story_info ? `<div><strong>الموديل / القصة:</strong> ${escapeHtml(productName)} ${productCode ? `(${escapeHtml(productCode)})` : ''}</div>` : ''}
            <div><strong>الخامة:</strong> ${escapeHtml(fabricType)}</div>
            <div><strong>إجمالي القطع:</strong> <span class="font-mono font-bold">${formatNumber(effectiveBatchQty)} قطعة</span></div>
            <div><strong>حالة الأمر:</strong> ${escapeHtml(statusLabel)}</div>
          </div>
        </div>

        ${opts.show_matrix ? `
          <!-- Matrix Summary Table -->
          <div style="font-weight: bold; font-size: 10px; margin-bottom: 4px; border-bottom: 1px solid #000; padding-bottom: 2px;">
            بيان الكميات بالمقاس واللون:
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10px;">
            <thead>
              <tr style="border-bottom: 1px solid #000; text-align: center;">
                <th style="text-align: right; padding: 2px;">اللون</th>
                <th style="padding: 2px;">المقاسات</th>
                <th style="text-align: left; padding: 2px;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${printMatrix.map(r => {
                const rowTotal = CUT_SIZES.reduce((sum, sz) => sum + (Number(r.quantities?.[sz]) || 0), 0);
                const activeSizes = CUT_SIZES.filter(sz => (Number(r.quantities?.[sz]) || 0) > 0)
                  .map(sz => `${sz}:${r.quantities[sz]}`)
                  .join(' | ');
                return `
                  <tr style="border-bottom: 1px dotted #cbd5e1;">
                    <td style="padding: 3px 2px; font-weight: bold;">${escapeHtml(r.color || 'افتراضي')}</td>
                    <td style="padding: 3px 2px; text-align: center; font-size: 9px;" class="font-mono">${activeSizes || '-'}</td>
                    <td style="padding: 3px 2px; text-align: left; font-weight: bold;" class="font-mono">${rowTotal}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight: bold; border-top: 1px solid #000;">
                <td colspan="2" style="padding: 3px 2px;">إجمالي عدد القطع:</td>
                <td style="padding: 3px 2px; text-align: left;" class="font-mono">${effectiveBatchQty}</td>
              </tr>
            </tfoot>
          </table>
        ` : ''}

        ${opts.show_stages_names && activeStages.length > 0 ? `
          <!-- Stages Info -->
          <div style="border-top: 1px dashed #64748b; padding-top: 4px; margin-top: 6px;">
            <div style="font-weight: bold; font-size: 10px; margin-bottom: 3px;">مراحل التشغيل والورش:</div>
            ${activeStages.map(st => {
              const cost = Number(st.data.total_cost || st.data.fixed_total || 0);
              const stageCostVisible = isStageCostVisible(st.key);
              return `
                <div style="font-size: 10px; margin-bottom: 3px; display: flex; justify-content: space-between;">
                  <span><strong>${escapeHtml(st.title)}:</strong> ${escapeHtml(st.data.vendor_name || 'غير محدد')}</span>
                  ${showFinancialRates && stageCostVisible ? `<span class="font-mono font-bold">${formatCurrency(cost)}</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        ${opts.show_total_cost ? `
          <!-- Financial Breakdown -->
          <div style="border-top: 1px dashed #64748b; padding-top: 6px; margin-top: 6px; font-size: 11px;">
            ${opts.show_fabric_cost && totalMaterialCost > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>تكلفة الخامات:</span>
                <span class="font-mono">${formatCurrency(totalMaterialCost)}</span>
              </div>
            ` : ''}
            ${opts.show_stage_costs && visibleStagesCost > 0 ? `
              <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                <span>تكلفة المراحل:</span>
                <span class="font-mono">${formatCurrency(visibleStagesCost)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
              <span>إجمالي تكلفة القصة:</span>
              <span class="font-mono">${formatCurrency(totalProductCost)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #334155; margin-top: 2px;">
              <span>تكلفة القطعة:</span>
              <span class="font-mono font-bold">${unitCostExact.toFixed(2)} ج.م</span>
            </div>
          </div>
        ` : ''}

        ${opts.show_specifications && (order.cutting_comment || order.notes || order.cutouts_1 || order.cutouts_2) ? `
          <div style="margin-top: 8px; border-top: 1px dotted #94a3b8; padding-top: 4px; font-size: 10px;">
            ${order.cutouts_1 ? `<div><strong>تخاريج 1:</strong> ${escapeHtml(order.cutouts_1)}</div>` : ''}
            ${order.cutouts_2 ? `<div><strong>تخاريج 2:</strong> ${escapeHtml(order.cutouts_2)}</div>` : ''}
            ${order.cutting_comment || order.notes ? `<div><strong>ملاحظات:</strong> ${escapeHtml(order.cutting_comment || order.notes)}</div>` : ''}
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

  // --- 3.B) A4 Official Layout for Cut Order (Industrial/Workshop Standard) ---
  return `
    <div style="padding: 20px 24px; color: #1e293b; background: #ffffff; font-family: 'Cairo', Tahoma, sans-serif; width: 100%; max-width: 210mm; margin: 0 auto; box-sizing: border-box;" dir="rtl">
      <!-- Top Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${hasValidLogo ? `<img src="${companyLogo}" alt="" onerror="this.style.display='none';" style="height: 54px; max-width: 120px; object-fit: contain; border-radius: 4px;" />` : ''}
          <div>
            <h1 style="font-size: 18px; font-weight: 800; color: #1e3a8a; margin: 0 0 3px 0;">${escapeHtml(companyName)}</h1>
            <div style="font-size: 11px; font-weight: bold; color: #64748b;">قسم الإنتاج والتشغيل - أمر تشغيل وقص ملابس رسمي (أمر شغل)</div>
            ${settings?.address ? `<div style="font-size: 10px; color: #475569; margin-top: 2px;">${escapeHtml(settings.address)}</div>` : ''}
            ${settings?.phone ? `<div style="font-size: 10px; color: #475569;">هاتف: <span class="font-mono">${escapeHtml(settings.phone)}</span></div>` : ''}
          </div>
        </div>

        <div style="text-align: left;">
          <div style="display: inline-block; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 12px; padding: 4px 12px; border-radius: 6px; margin-bottom: 6px;">
            أمر تشغيل وتفصيل وقص ملابس
          </div>
          ${opts.show_story_info ? `
            <div style="font-size: 11px; color: #334155; font-weight: bold;">
              رقم أمر القص: <span class="font-mono" style="font-size: 13px; color: #0f172a;">${escapeHtml(cuttingNumber)}</span>
            </div>
          ` : ''}
          <div style="font-size: 10px; color: #334155; margin-top: 2px;">
            تاريخ التشغيل: <span class="font-mono">${formatDate(orderDate)}</span>
          </div>
          <div style="font-size: 10px; color: #334155; margin-top: 2px;">
            حالة الأمر: <strong style="color: ${isClosed ? '#047857' : '#1e3a8a'};">${escapeHtml(statusLabel)}</strong>
          </div>
        </div>
      </div>

      <!-- Order Details Card -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 11px;">
        <div>
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 2px;">اسم الموديل / القصة:</span>
          <div style="font-size: 12px; font-weight: bold; color: #0f172a;">${opts.show_story_info ? escapeHtml(productName) : '---'}</div>
          ${opts.show_story_info && productCode ? `<div style="color: #64748b; margin-top: 2px;" class="font-mono">كود الموديل: ${escapeHtml(productCode)}</div>` : ''}
        </div>
        <div>
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 2px;">نوع ولون القماش:</span>
          <div style="font-size: 12px; font-weight: bold; color: #0f172a;">${escapeHtml(fabricType)}</div>
          ${legacyColor ? `<div style="color: #64748b; margin-top: 2px;">الألوان: ${escapeHtml(legacyColor)}</div>` : ''}
        </div>
        <div style="text-align: left;">
          <span style="color: #64748b; font-weight: bold; display: block; margin-bottom: 2px;">جهة التوريد / المستودع:</span>
          <div style="font-size: 12px; font-weight: bold; color: #0f172a;">${escapeHtml(supplierName)}</div>
          <div style="color: #047857; font-weight: bold; margin-top: 2px;">معتمد ومطابق للمواصفات</div>
        </div>
      </div>

      <!-- Quick Stats Badges: Conditional on Total Cost Toggle -->
      <div style="display: grid; grid-template-columns: ${opts.show_total_cost ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)'}; gap: 10px; margin-bottom: 14px; text-align: center;">
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 6px 8px;">
          <span style="font-size: 10px; font-weight: bold; color: #1e40af; display: block;">إجمالي قطع الباتش</span>
          <span style="font-size: 15px; font-weight: bold; color: #1e3a8a;" class="font-mono">${formatNumber(effectiveBatchQty)} قطعة</span>
        </div>
        <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 8px;">
          <span style="font-size: 10px; font-weight: bold; color: #334155; display: block;">عدد الألوان المنفذة</span>
          <span style="font-size: 15px; font-weight: bold; color: #0f172a;" class="font-mono">${printMatrix.length} ألوان</span>
        </div>
        ${opts.show_total_cost ? `
          <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 6px 8px;">
            <span style="font-size: 10px; font-weight: bold; color: #065f46; display: block;">تكلفة مراحل التشغيل</span>
            <span style="font-size: 15px; font-weight: bold; color: #047857;" class="font-mono">${formatCurrency(totalStagesCost)}</span>
          </div>
          <div style="background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 8px; padding: 6px 8px;">
            <span style="font-size: 10px; font-weight: bold; color: #6b21a8; display: block;">إجمالي التكلفة</span>
            <span style="font-size: 15px; font-weight: bold; color: #7e22ce;" class="font-mono">${formatCurrency(totalProductCost)}</span>
          </div>
        ` : ''}
      </div>

      ${opts.show_matrix ? `
        <!-- Color by Size Matrix Table -->
        <div style="margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
          <div style="background: #1e3a8a; color: #ffffff; padding: 6px 12px; font-weight: bold; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
            <span>جدول توزيع المقاسات والكميات التفصيلي للقصة</span>
            <span style="font-size: 10px; font-weight: normal;">10 مقاسات قياسية تفصيلية</span>
          </div>
          <table style="width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #334155; font-weight: bold;">
                <th style="padding: 6px 8px; text-align: right; width: 130px; border-left: 1px solid #e2e8f0;">اللون</th>
                ${CUT_SIZES.map(sz => `
                  <th style="padding: 6px 3px; text-align: center; border-left: 1px solid #e2e8f0;" class="font-mono">${sz}</th>
                `).join('')}
                <th style="padding: 6px 8px; text-align: center; width: 85px; color: #1e3a8a; font-weight: bold;">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${printMatrix.length > 0 ? printMatrix.map((r, idx) => {
                const rowTotal = CUT_SIZES.reduce((sum, sz) => sum + (Number(r.quantities?.[sz]) || 0), 0);
                return `
                  <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
                    <td style="padding: 6px 8px; font-weight: bold; color: #0f172a; border-left: 1px solid #e2e8f0;">${escapeHtml(r.color || 'افتراضي')}</td>
                    ${CUT_SIZES.map(sz => {
                      const q = Number(r.quantities?.[sz]) || 0;
                      return `
                        <td style="padding: 6px 3px; text-align: center; border-left: 1px solid #e2e8f0; font-weight: ${q > 0 ? 'bold' : 'normal'}; color: ${q > 0 ? '#0f172a' : '#94a3b8'};" class="font-mono">
                          ${q > 0 ? q : '-'}
                        </td>
                      `;
                    }).join('')}
                    <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #1e3a8a;" class="font-mono">${rowTotal}</td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="12" style="padding: 10px; text-align: center; color: #94a3b8;">لا توجد تفاصيل مقاسات مسجلة</td>
                </tr>
              `}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1; font-weight: bold; color: #0f172a;">
                <td style="padding: 6px 8px; border-left: 1px solid #cbd5e1;">الإجمالي لكل مقاس</td>
                ${CUT_SIZES.map(sz => `
                  <td style="padding: 6px 3px; text-align: center; border-left: 1px solid #cbd5e1; color: #1e3a8a;" class="font-mono">${colTotals[sz]}</td>
                `).join('')}
                <td style="padding: 6px 8px; text-align: center; background: #e0e7ff; color: #1e3a8a; font-size: 12px;" class="font-mono">${effectiveBatchQty}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}

      ${opts.show_stages_names && activeStages.length > 0 ? `
        <!-- Production Stages & Services Table -->
        <div style="margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
          <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 6px 12px; font-weight: bold; font-size: 11px; color: #334155; display: flex; justify-content: space-between;">
            <span>مراحل التشغيل والورش المسند إليها العمل (المطابع والتطريز والحياكة)</span>
            ${!showFinancialRates ? `<span style="font-size: 10px; color: #64748b; font-weight: normal;">(نسخة أمر شغل بدون أسعار)</span>` : ''}
          </div>
          <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 11px; table-layout: auto;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold;">
                <th style="padding: 6px 10px; text-align: right; width: ${showFinancialRates ? '18%' : '25%'}; min-width: ${showFinancialRates ? '90px' : '110px'}; white-space: nowrap;">المرحلة</th>
                <th style="padding: 6px 12px; text-align: right; width: ${showFinancialRates ? '34%' : '40%'}; min-width: ${showFinancialRates ? '150px' : '160px'};">الورشة / المطبعة / مقاول الخدمة</th>
                ${showFinancialRates ? `
                  <th style="padding: 6px 8px; text-align: center; width: 12%; min-width: 75px; white-space: nowrap;">طريقة المحاسبة</th>
                  <th style="padding: 6px 8px; text-align: left; width: 12%; min-width: 90px; white-space: nowrap;">التكلفة الإجمالية</th>
                  <th style="padding: 6px 8px; text-align: left; width: 12%; min-width: 85px; white-space: nowrap;">المسدد</th>
                  <th style="padding: 6px 8px; text-align: left; width: 12%; min-width: 85px; white-space: nowrap;">المتبقي</th>
                ` : `
                  <th style="padding: 6px 12px; text-align: right; width: 35%; min-width: 150px;">تعليمات وملاحظات المرحلة</th>
                `}
              </tr>
            </thead>
            <tbody>
              ${activeStages.map(st => {
                const cost = Number(st.data.total_cost || st.data.fixed_total || 0);
                const paid = Number(st.data.paid || 0);
                const rem = Math.max(0, cost - paid);
                const pricingType = st.data.pricing_type === 'per_piece' ? 'بالقطعة' : 'مبلغ مقطوع';
                const stageCostVisible = isStageCostVisible(st.key);
                const vendorText = st.data.vendor_name || 'غير محدد';
                const notesText = st.data.notes || 'تسليم واستلام مطابق للمواصفات';
                return `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 10px; font-weight: bold; color: #1e3a8a; white-space: nowrap;">${escapeHtml(st.title)}</td>
                    <td style="padding: 6px 12px; font-weight: bold; color: #0f172a;">
                      <span style="${getAutoFitInlineStyle(vendorText, 26, 11)}" title="${escapeHtml(vendorText)}">${escapeHtml(vendorText)}</span>
                    </td>
                    ${showFinancialRates ? `
                      <td style="padding: 6px 8px; text-align: center; font-size: 10px; white-space: nowrap;">${stageCostVisible ? escapeHtml(pricingType) : '<span style="color:#94a3b8;">-</span>'}</td>
                      <td style="padding: 6px 8px; text-align: left; font-weight: bold; white-space: nowrap;" class="font-mono">${stageCostVisible ? formatCurrency(cost) : '<span style="color:#94a3b8; font-weight: normal;">-</span>'}</td>
                      <td style="padding: 6px 8px; text-align: left; color: #047857; white-space: nowrap;" class="font-mono">${stageCostVisible ? formatCurrency(paid) : '<span style="color:#94a3b8;">-</span>'}</td>
                      <td style="padding: 6px 8px; text-align: left; color: ${rem > 0 ? '#b91c1c' : '#475569'}; white-space: nowrap;" class="font-mono">${stageCostVisible ? formatCurrency(rem) : '<span style="color:#94a3b8;">-</span>'}</td>
                    ` : `
                      <td style="padding: 6px 12px; color: #475569; font-size: 10px;">
                        <span style="${getAutoFitInlineStyle(notesText, 34, 10.5)}" title="${escapeHtml(notesText)}">${escapeHtml(notesText)}</span>
                      </td>
                    `}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Raw Materials Issued Table (if any) -->
      ${rawMaterials.length > 0 ? `
        <div style="margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;" class="break-inside-avoid">
          <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 6px 12px; font-weight: bold; font-size: 11px; color: #334155; display: flex; justify-content: space-between;">
            <span>الخامات ومستلزمات الإنتاج المنصرفة للقصة</span>
            ${!opts.show_fabric_cost ? `<span style="font-size: 10px; color: #64748b; font-weight: normal;">(تم إخفاء أسعار التكلفة)</span>` : ''}
          </div>
          <table style="width: 100%; max-width: 100%; border-collapse: collapse; font-size: 11px; table-layout: auto;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold;">
                <th style="padding: 6px 8px; text-align: center; width: ${opts.show_fabric_cost ? '6%' : '8%'}; min-width: 35px; white-space: nowrap;">#</th>
                <th style="padding: 6px 12px; text-align: right; width: ${opts.show_fabric_cost ? '46%' : '56%'}; min-width: ${opts.show_fabric_cost ? '180px' : '200px'};">اسم الخامة والمواصفات</th>
                <th style="padding: 6px 8px; text-align: center; width: ${opts.show_fabric_cost ? '14%' : '20%'}; min-width: 85px; white-space: nowrap;">الكمية المنصرفة</th>
                <th style="padding: 6px 8px; text-align: center; width: ${opts.show_fabric_cost ? '10%' : '16%'}; min-width: 60px; white-space: nowrap;">الوحدة</th>
                ${opts.show_fabric_cost ? `
                  <th style="padding: 6px 8px; text-align: left; width: 12%; min-width: 75px; white-space: nowrap;">سعر الوحدة</th>
                  <th style="padding: 6px 8px; text-align: left; width: 12%; min-width: 80px; white-space: nowrap;">إجمالي التكلفة</th>
                ` : ''}
              </tr>
            </thead>
            <tbody>
              ${rawMaterials.map((m, idx) => {
                const qty = Number(m.quantity ?? m.actual_quantity ?? m.standard_quantity ?? 0);
                const price = Number(m.unit_price ?? m.unit_cost ?? 0);
                const lineTotal = Number(m.line_cost ?? m.total_cost ?? (qty * price));
                const matText = m.material_name || m.name || m.raw_material_id || '';
                return `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 8px; text-align: center;" class="font-mono">${idx + 1}</td>
                    <td style="padding: 6px 8px; font-weight: bold; color: #0f172a;">
                      <span style="${getAutoFitInlineStyle(matText, 34, 11)}" title="${escapeHtml(matText)}">${escapeHtml(matText)}</span>
                    </td>
                    <td style="padding: 6px 8px; text-align: center; font-weight: bold;" class="font-mono">${formatNumber(qty)}</td>
                    <td style="padding: 6px 8px; text-align: center;">${escapeHtml(m.material_unit || m.unit || 'وحدة')}</td>
                    ${opts.show_fabric_cost ? `
                      <td style="padding: 6px 8px; text-align: left;" class="font-mono">${formatCurrency(price)}</td>
                      <td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #0f172a;" class="font-mono">${formatCurrency(lineTotal)}</td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- Trimmings, Notes & Optional Financial Summary Box -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px;" class="break-inside-avoid">
        <div style="flex: 1; font-size: 11px;">
          ${opts.show_specifications && (order.cutouts_1 || order.cutouts_2 || order.cutting_comment || order.notes) ? `
            <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #fafafa;">
              <strong style="color: #334155; display: block; margin-bottom: 4px;">المواصفات الفنية والتخاريج وتعليمات التشغيل:</strong>
              ${order.cutouts_1 ? `<div style="margin-top: 2px;"><strong>تخاريج (1):</strong> ${escapeHtml(order.cutouts_1)}</div>` : ''}
              ${order.cutouts_2 ? `<div style="margin-top: 2px;"><strong>تخاريج (2):</strong> ${escapeHtml(order.cutouts_2)}</div>` : ''}
              ${order.cutting_comment || order.notes ? `<div style="margin-top: 4px; color: #475569;"><strong>توجيهات القص:</strong> ${escapeHtml(order.cutting_comment || order.notes)}</div>` : ''}
            </div>
          ` : ''}
        </div>

        ${opts.show_total_cost ? `
          <div style="width: 290px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; font-size: 11px;">
            ${opts.show_fabric_cost ? `
              <div style="display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">
                <span>إجمالي تكلفة الخامات:</span>
                <span class="font-mono font-bold">${formatCurrency(totalMaterialCost)}</span>
              </div>
            ` : ''}
            ${opts.show_stage_costs && visibleStagesCost > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">
                <span>تكاليف مراحل التشغيل:</span>
                <span class="font-mono font-bold">${formatCurrency(visibleStagesCost)}</span>
              </div>
            ` : ''}
            ${totalAdditionalCost > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">
                <span>مصاريف إضافية وتشغيلية:</span>
                <span class="font-mono font-bold">+${formatCurrency(totalAdditionalCost)}</span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; padding: 7px 10px; background: #1e3a8a; color: #ffffff; font-weight: bold; font-size: 12px;">
              <span>إجمالي تكلفة أمر القص:</span>
              <span class="font-mono">${formatCurrency(totalProductCost)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 5px 10px; background: #eff6ff; font-weight: bold; font-size: 11px; color: #1e40af;">
              <span>تكلفة القطعة الواحدة:</span>
              <span class="font-mono">${unitCostExact.toFixed(2)} ج.م</span>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Official Signatures for Cutting Order -->
      <div style="margin-top: 28px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; text-align: center; font-size: 11px; font-weight: bold; color: #334155;" class="break-inside-avoid">
        <div>
          <div>مسؤول مقصدار (القص)</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 22px auto 0;"></div>
        </div>
        <div>
          <div>مراقب الجودة الفنية</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 22px auto 0;"></div>
        </div>
        <div>
          <div>المحاسب المسؤول</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 22px auto 0;"></div>
        </div>
        <div>
          <div>الاعتماد الإداري / إدارة الإنتاج</div>
          <div style="border-bottom: 1px solid #94a3b8; width: 80%; margin: 22px auto 0;"></div>
        </div>
      </div>

      <!-- Bottom System Stamp -->
      <div style="margin-top: 20px; padding-top: 8px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8;" class="break-inside-avoid">
        أمر تشغيل وقص رسمي صادر عن نظام كود سيستمز المتكامل • تم توزيع التكاليف وحفظ البيانات آلياً
      </div>
    </div>
  `;
}
