import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

describe('Excel Export Arabic UTF-8 and Numeric Roundtrip', () => {
  it('creates an XLSX workbook with Arabic headers, RTL worksheet view, real numbers, and reads it back', () => {
    const headers = ['كود الصنف', 'اسم الصنف', 'سعر التكلفة', 'الرصيد'];
    const rows = [
      ['ITM-001', 'قميص أكسفورد أبيض فاخر', 150.75, 40],
      ['ITM-002', 'بنطلون جينز كلاسيك أزرق', 280.5, 25]
    ];

    const data = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Verify RTL view configuration on worksheet
    worksheet['!views'] = [{ rightToLeft: true }];
    expect(worksheet['!views'][0].rightToLeft).toBe(true);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'الأصناف');

    // Generate binary buffer
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    expect(excelBuffer).toBeDefined();
    expect(excelBuffer.length).toBeGreaterThan(0);

    // Read it back
    const readWorkbook = XLSX.read(excelBuffer, { type: 'buffer' });
    expect(readWorkbook.SheetNames).toContain('الأصناف');

    const readSheet = readWorkbook.Sheets['الأصناف'];
    expect(readSheet).toBeDefined();

    const parsedJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(readSheet);
    expect(parsedJson.length).toBe(2);

    expect(parsedJson[0]['كود الصنف']).toBe('ITM-001');
    expect(parsedJson[0]['اسم الصنف']).toBe('قميص أكسفورد أبيض فاخر');
    expect(typeof parsedJson[0]['سعر التكلفة']).toBe('number');
    expect(parsedJson[0]['سعر التكلفة']).toBe(150.75);
    expect(parsedJson[0]['الرصيد']).toBe(40);

    expect(parsedJson[1]['كود الصنف']).toBe('ITM-002');
    expect(parsedJson[1]['اسم الصنف']).toBe('بنطلون جينز كلاسيك أزرق');
    expect(parsedJson[1]['سعر التكلفة']).toBe(280.5);
    expect(parsedJson[1]['الرصيد']).toBe(25);
  });
});
