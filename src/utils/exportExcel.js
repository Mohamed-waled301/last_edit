import * as XLSX from 'xlsx';

/**
 * Export data to native Excel (.xlsx) using SheetJS with proper Arabic RTL support
 */
export function exportToExcel(filename, headers, rows) {
  try {
    let worksheet;

    if (Array.isArray(headers) && Array.isArray(rows)) {
      // Build 2D array: [headers, ...rows]
      const aoa = [headers, ...rows];
      worksheet = XLSX.utils.aoa_to_sheet(aoa);
    } else if (Array.isArray(headers) && !rows) {
      // Direct array of objects
      worksheet = XLSX.utils.json_to_sheet(headers);
    } else {
      throw new Error('بيانات التصدير غير صالحة');
    }

    // Set right-to-left layout for Arabic
    if (!worksheet['!views']) worksheet['!views'] = [];
    worksheet['!views'].push({ rightToLeft: true });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'التقرير');

    const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    XLSX.writeFile(workbook, cleanFilename);
  } catch (err) {
    console.error('Export to Excel failed:', err);
    alert('حدث خطأ أثناء تصدير ملف الإكسيل: ' + err.message);
  }
}

export default exportToExcel;
