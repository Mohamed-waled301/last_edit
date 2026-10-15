import * as XLSX from 'xlsx';

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
 * Clean data rows so numbers are actual numbers, dates readable, and Arabic text intact.
 */
function cleanRowData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) {
      cleaned[key] = '';
    } else if (typeof val === 'number') {
      cleaned[key] = val;
    } else if (isNumericString(val)) {
      cleaned[key] = Number(val);
    } else {
      cleaned[key] = String(val);
    }
  }
  return cleaned;
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
