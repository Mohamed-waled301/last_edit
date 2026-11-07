import * as XLSX from 'xlsx';

/**
 * 100% Arabic Column Translations Dictionary for System & Database Keys
 */
export const ARABIC_EXCEL_COLUMN_LABELS = {
  seq: '#',
  index: '#',
  code: 'الكود',
  customer_code: 'كود العميل',
  supplier_code: 'كود المورد',
  item_code: 'كود الصنف',
  product_code: 'كود الموديل',
  name: 'البيان / الاسم',
  customer_name: 'اسم العميل',
  supplier_name: 'اسم المورد',
  item_name: 'اسم الصنف',
  product_name: 'اسم الموديل',
  phone: 'رقم الهاتف',
  address: 'العنوان',
  tax_number: 'الرقم الضريبي',
  supplier_type: 'نوع المورد / النشاط',
  total_sales: 'إجمالي المبيعات',
  credit_sales_total: 'إجمالي المبيعات الآجلة',
  total_purchases: 'إجمالي المشتريات / التكلفة',
  credit_invoices_total: 'إجمالي المشتريات الآجلة',
  stage_costs_total: 'تكاليف مراحل التشغيل',
  total_paid: 'إجمالي المسدد',
  payments_total: 'إجمالي المسدد',
  receipts_total: 'إجمالي المسدد',
  paid_amount: 'إجمالي المسدد',
  paid_total: 'إجمالي المسدد',
  balance_due: 'الرصيد المتبقي',
  balance: 'الرصيد المتبقي',
  remaining_balance: 'الرصيد المتبقي',
  remaining_amount: 'الرصيد المتبقي',
  balance_remaining: 'الرصيد المتبقي',
  current_balance: 'الرصيد الحالي',
  opening_balance: 'رصيد أول المدة',
  opening_type: 'طبيعة رصيد أول المدة',
  returns_total: 'إجمالي المرتجعات',
  total_amount: 'إجمالي المبلغ',
  total_invoice_amount: 'إجمالي الفاتورة',
  grand_total: 'الإجمالي الكلي',
  invoices_count: 'عدد الفواتير',
  invoice_number: 'رقم الفاتورة',
  po_number: 'رقم أمر الشراء',
  order_number: 'رقم الطلب',
  cutting_number: 'رقم أمر القص',
  grn_number: 'رقم إذن الاستلام',
  receipt_date: 'تاريخ الاستلام',
  invoice_date: 'تاريخ الفاتورة',
  order_date: 'تاريخ الطلب',
  due_date: 'تاريخ الاستحقاق',
  date: 'التاريخ',
  created_at: 'تاريخ الإنشاء',
  payment_terms: 'طريقة الدفع',
  status: 'الحالة',
  unit: 'الوحدة',
  quantity: 'الكمية',
  cost_price: 'سعر التكلفة',
  selling_price: 'سعر البيع',
  actual_balance: 'الرصيد الفعلي',
  min_reorder_level: 'حد إعادة الطلب',
  item_group: 'المجموعة',
  item_department: 'القسم',
  item_type: 'نوع الصنف',
  notes: 'ملاحظات',
  reason: 'سبب الحركة / البيان'
};

const IGNORED_EXCEL_KEYS = new Set([
  'id', '_id', 'uuid', 'created_by', 'updated_at', 'is_active', 'raw_date', 'password', 'salt',
  'party_id', 'supplier_id', 'customer_id', 'item_id', 'outlet_id', 'user_id', 'account_id',
  'order_id', 'category_id', 'version', 'hash', 'sync_status', 'items', 'matrix', 'stages',
  'is_customer', 'is_supplier'
]);

/**
 * Helper to test if a string represents a clean numeric value (Western digits, optional decimal)
 */
function isNumericString(val) {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed === '') return false;
  // If it's a date or phone number, don't convert to number
  if (trimmed.startsWith('01') && trimmed.length === 11) return false; // Egyptian mobile
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return false; // Date
  return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
}

/**
 * Translate and clean row object into Arabic keys and numbers
 */
function cleanRowData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (IGNORED_EXCEL_KEYS.has(key)) continue;
    const arabicKey = ARABIC_EXCEL_COLUMN_LABELS[key] || key;
    if (val === null || val === undefined) {
      cleaned[arabicKey] = '';
    } else if (typeof val === 'number') {
      cleaned[arabicKey] = val;
    } else if (isNumericString(val)) {
      cleaned[arabicKey] = Number(val);
    } else {
      cleaned[arabicKey] = String(val);
    }
  }
  return cleaned;
}

/**
 * Automatically calculates and sets exact column widths on XLSX worksheets
 * (col.width = 18 baseline for financial numbers, generous widths for names)
 * to completely eliminate truncation, clipping, and Excel hash overflows (#####).
 */
export function applyAutoColumnWidths(worksheet) {
  if (!worksheet || !worksheet['!ref']) return;
  try {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const colCount = range.e.c - range.s.c + 1;

    // Check if this matches standard 6-column Balances Report:
    // [# (Seq), Code, Name, Sales/Cost, Paid, Remaining Balance]
    const firstRowHeader = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const headerCell = worksheet[XLSX.utils.encode_cell({ c: C, r: range.s.r })];
      firstRowHeader.push(headerCell ? String(headerCell.v || '').trim() : '');
    }

    const isSixColBalanceReport = (
      colCount === 6 &&
      (firstRowHeader.some(h => h.includes('مبيعات') || h.includes('مشتريات') || h.includes('تكلفة'))) &&
      (firstRowHeader.some(h => h.includes('مسدد'))) &&
      (firstRowHeader.some(h => h.includes('متبقي') || h.includes('رصيد')))
    );

    if (isSixColBalanceReport) {
      // Explicit exact column width settings matching report structure
      worksheet['!cols'] = [
        { wch: 8 },   // #
        { wch: 15 },  // الكود
        { wch: 35 },  // البيان / الاسم
        { wch: 22 },  // إجمالي المبيعات / التكلفة (col.width >= 18)
        { wch: 22 },  // إجمالي المسدد (col.width >= 18)
        { wch: 22 }   // الرصيد المتبقي (col.width >= 18)
      ];
      return;
    }

    const colWidths = [];

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const headerCell = worksheet[XLSX.utils.encode_cell({ c: C, r: range.s.r })];
      const headerVal = headerCell ? String(headerCell.v || '').trim() : '';
      const isSeq = headerVal === '#' || C === 0 && headerVal.length <= 2;

      let maxLen = isSeq ? 6 : 14;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cellAddress = XLSX.utils.encode_cell({ c: C, r: R });
        const cell = worksheet[cellAddress];
        if (cell && cell.v !== undefined && cell.v !== null) {
          const valStr = String(cell.v).trim();
          const visualLen = valStr.length;
          if (visualLen > maxLen) {
            maxLen = visualLen;
          }
        }
      }

      if (isSeq) {
        colWidths.push({ wch: Math.max(maxLen + 2, 8) });
      } else {
        // Enforce baseline column width (col.width = 18 minimum for numeric/data columns, at least Math.max(maxLen + 4, 15))
        const autoWidth = Math.max(maxLen + 4, 15);
        colWidths.push({ wch: Math.max(autoWidth, 18) });
      }
    }

    worksheet['!cols'] = colWidths;
  } catch (err) {
    console.warn('Auto column width calculation skipped:', err);
  }
}

/**
 * Export data to native Excel (.xlsx) with Arabic RTL view, real numbers, and Electron native save.
 * Supports:
 * - exportToExcel(dataArray, filename)
 * - exportToExcel(filename, headers, rows)
 * - exportToExcel(filename, dataArray)
 */
export async function exportToExcel(arg1, arg2, arg3) {
  try {
    let filename = 'تقرير.xlsx';
    let worksheet = null;

    if (typeof arg1 === 'string') {
      filename = arg1;
      if (Array.isArray(arg2) && Array.isArray(arg3)) {
        // Signature: (filename, headers, rows)
        const processedRows = arg3.map((row) => {
          if (Array.isArray(row)) {
            return row.map((cell) => (isNumericString(cell) ? Number(cell) : (cell ?? '')));
          }
          return row;
        });
        const aoa = [arg2, ...processedRows];
        worksheet = XLSX.utils.aoa_to_sheet(aoa);
      } else if (Array.isArray(arg2)) {
        // Signature: (filename, dataArray)
        const cleanedRows = arg2.map((item) => cleanRowData(item));
        worksheet = XLSX.utils.json_to_sheet(cleanedRows);
      } else {
        throw new Error('بيانات التصدير غير صالحة');
      }
    } else if (Array.isArray(arg1)) {
      // Signature: (dataArray, filename)
      if (typeof arg2 === 'string') {
        filename = arg2;
      }
      if (arg1.length > 0 && Array.isArray(arg1[0])) {
        // Array of arrays
        const processedRows = arg1.map((row) =>
          row.map((cell) => (isNumericString(cell) ? Number(cell) : (cell ?? '')))
        );
        worksheet = XLSX.utils.aoa_to_sheet(processedRows);
      } else {
        // Array of objects
        const cleanedRows = arg1.map((item) => cleanRowData(item));
        worksheet = XLSX.utils.json_to_sheet(cleanedRows);
      }
    } else {
      throw new Error('بيانات التصدير غير صالحة');
    }

    if (!worksheet) {
      throw new Error('تعذر إنشاء ورقة البيانات للتصدير');
    }

    // Automatically calculate generous column widths for 6+ digits & Arabic labels
    applyAutoColumnWidths(worksheet);

    // Set right-to-left layout for Arabic
    if (!worksheet['!views']) worksheet['!views'] = [];
    worksheet['!views'].push({ rightToLeft: true });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'التقرير');

    const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;

    // 1. Electron environment with IPC save
    if (
      typeof window !== 'undefined' &&
      window.electronAPI &&
      typeof window.electronAPI.saveExcel === 'function'
    ) {
      const base64Data = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
      const result = await window.electronAPI.saveExcel({
        filename: cleanFilename,
        base64Data,
      });

      if (result.canceled) {
        return { canceled: true };
      }
      if (result.success) {
        const msg = `تم حفظ الملف بنجاح:\n${result.filePath}`;
        alert(msg);
        return { success: true, filePath: result.filePath };
      }
      if (result.error) {
        throw new Error(result.error);
      }
    }

    // 2. Browser environment (Blob download)
    XLSX.writeFile(workbook, cleanFilename);
    const successMsg = `تم حفظ الملف بنجاح (${cleanFilename})`;
    alert(successMsg);
    return { success: true, filePath: cleanFilename };
  } catch (err) {
    console.error('Export to Excel failed:', err);
    alert('فشل في تصدير ملف الإكسيل: ' + (err.message || 'خطأ غير معروف'));
    return { success: false, error: err.message };
  }
}

export default exportToExcel;
