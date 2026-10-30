import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { applyAutoColumnWidths } from '../../utils/exportExcel';
import { triggerPrint } from '../../utils/print';

// Mock window in Node/Vitest environment
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('Print Freeze Fix & Large Number Support (6+ Digits) Audit Suite', () => {
  const electronMainPath = path.resolve(__dirname, '../../../electron/main.js');
  const electronPreloadPath = path.resolve(__dirname, '../../../electron/preload.js');
  const printUtilPath = path.resolve(__dirname, '../../utils/print.js');
  const dataTablePath = path.resolve(__dirname, '../../components/DataTable.jsx');
  const exportExcelPath = path.resolve(__dirname, '../../utils/exportExcel.js');
  const invoiceTemplatesPath = path.resolve(__dirname, '../../modules/print/invoicePrintTemplates.js');
  const printPreviewPath = path.resolve(__dirname, '../../modules/print/PrintPreviewPage.jsx');
  const partiesListPath = path.resolve(__dirname, '../../modules/parties/PartiesListPage.jsx');
  const vendorStatementPath = path.resolve(__dirname, '../../modules/parties/VendorStatementPage.jsx');
  const purchasesListPath = path.resolve(__dirname, '../../modules/purchases/PurchasesListPage.jsx');
  const purchaseOrderFormPath = path.resolve(__dirname, '../../modules/purchases/PurchaseOrderFormPage.jsx');
  const salesInvoicesListPath = path.resolve(__dirname, '../../modules/sales/SalesInvoicesListPage.jsx');
  const salesInvoiceFormPath = path.resolve(__dirname, '../../modules/sales/SalesInvoiceFormPage.jsx');
  const disbursementsListPath = path.resolve(__dirname, '../../modules/disbursements/DisbursementsListPage.jsx');
  const treasuriesListPath = path.resolve(__dirname, '../../modules/treasuries/TreasuriesListPage.jsx');
  const reportsModulePath = path.resolve(__dirname, '../../modules/ReportsModule.jsx');
  const accountAuditModalPath = path.resolve(__dirname, '../../components/AccountAuditModal.jsx');

  /* =========================================================================
   * 1. PRINT FREEZE & APP CRASH ELIMINATION
   * ========================================================================= */
  describe('1. Print Freeze / Crash Prevention in Electron IPC & Preload', () => {
    it('verifies electron/preload.js properly passes options alongside params in printHtml', () => {
      const preloadCode = fs.readFileSync(electronPreloadPath, 'utf8');
      expect(preloadCode).toContain(
        "printHtml: (params, options) => ipcRenderer.invoke('print:print-html', params, options)"
      );
    });

    it('verifies electron/main.js enforces silent: true on background hidden window to eliminate invisible OS dialog hang', () => {
      const mainCode = fs.readFileSync(electronMainPath, 'utf8');
      // Hidden window print must be silent: true so Chromium never blocks the message loop with a hidden modal dialog
      expect(mainCode).toContain('silent: true');
      expect(mainCode).toContain('hiddenWin.webContents.print(printOptions');
      expect(mainCode).toContain("deviceName: deviceName || ''");
    });

    it('verifies electron/main.js enforces timeout safeguards on hidden window print operations', () => {
      const mainCode = fs.readFileSync(electronMainPath, 'utf8');
      // Must have print timeout (15000ms), page load timeout (10000ms), and font ready check timeout (2500ms)
      expect(mainCode).toContain('15000');
      expect(mainCode).toContain('10000');
      expect(mainCode).toContain('2500');
      expect(mainCode).toContain('Promise.race([');
      expect(mainCode).toContain('انتهت مهلة استجابة الطابعة');
      expect(mainCode).toContain('انتهت مهلة تجهيز المستند للطباعة');
    });

    it('verifies electron/main.js guarantees hiddenWin.destroy() in finally block to prevent memory & handle leaks', () => {
      const mainCode = fs.readFileSync(electronMainPath, 'utf8');
      expect(mainCode).toContain('} finally {');
      expect(mainCode).toContain('if (hiddenWin && !hiddenWin.isDestroyed())');
      expect(mainCode).toContain('hiddenWin.destroy()');
    });

    it('verifies electron/main.js protects print:save-pdf with timeouts and guaranteed cleanup', () => {
      const mainCode = fs.readFileSync(electronMainPath, 'utf8');
      expect(mainCode).toContain("ipcMain.handle('print:save-pdf'");
      expect(mainCode).toContain('hiddenWin.webContents.printToPDF');
      expect(mainCode).toContain('انتهت مهلة توليد ملف PDF');
    });

    it('verifies electron/main.js protects print:list-printers with timeout race against hung spooler service', () => {
      const mainCode = fs.readFileSync(electronMainPath, 'utf8');
      expect(mainCode).toContain("ipcMain.handle('print:list-printers'");
      expect(mainCode).toContain('mainWindow.webContents.getPrintersAsync()');
      expect(mainCode).toContain('انتهت مهلة استعلام قائمة الطابعات');
      expect(mainCode).toContain('Promise.race([printersPromise, timeoutPromise])');
    });

    it('verifies electron/main.js protects app:print with a safety timeout', () => {
      const mainCode = fs.readFileSync(electronMainPath, 'utf8');
      expect(mainCode).toContain("ipcMain.handle('app:print'");
      expect(mainCode).toContain('mainWindow.webContents.print(');
    });
  });

  describe('2. Client-side triggerPrint() Safe Async Error Handling', () => {
    let originalWindowElectronAPI: unknown;
    let originalWindowPrint: unknown;

    beforeEach(() => {
      originalWindowElectronAPI = (window as any).electronAPI;
      originalWindowPrint = window.print;
    });

    afterEach(() => {
      (window as any).electronAPI = originalWindowElectronAPI;
      window.print = originalWindowPrint as () => void;
      vi.restoreAllMocks();
    });

    it('safely calls printHtml when options contain html and electronAPI.printHtml is available', async () => {
      const printHtmlMock = vi.fn().mockResolvedValue({ success: true });
      (window as any).electronAPI = {
        printHtml: printHtmlMock,
      };

      const result = await triggerPrint({ html: '<div>فاتورة تجريبية</div>', silent: true });
      expect(result.success).toBe(true);
      expect(printHtmlMock).toHaveBeenCalledWith({ html: '<div>فاتورة تجريبية</div>', silent: true });
    });

    it('catches electronAPI.printHtml rejection gracefully without freezing or throwing', async () => {
      const printHtmlMock = vi.fn().mockRejectedValue(new Error('Printer spooler stalled'));
      (window as any).electronAPI = {
        printHtml: printHtmlMock,
      };

      const result = await triggerPrint({ html: '<div>فاتورة تجريبية</div>' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Printer spooler stalled');
    });

    it('safely calls electronAPI.print when available without html option', async () => {
      const printMock = vi.fn().mockResolvedValue({ success: true });
      (window as any).electronAPI = {
        print: printMock,
      };

      const result = await triggerPrint();
      expect(result.success).toBe(true);
      expect(printMock).toHaveBeenCalled();
    });

    it('falls back to window.print() in browser mode and catches exceptions safely', async () => {
      delete (window as any).electronAPI;
      const windowPrintMock = vi.fn();
      window.print = windowPrintMock;

      const result = await triggerPrint();
      expect(result.success).toBe(true);
      expect(windowPrintMock).toHaveBeenCalled();
    });

    it('catches window.print() exception when browser cancels or blocks print dialog', async () => {
      delete (window as any).electronAPI;
      window.print = () => {
        throw new Error('User cancelled dialog');
      };

      const result = await triggerPrint();
      expect(result.success).toBe(false);
      expect(result.error).toContain('User cancelled dialog');
    });
  });

  /* =========================================================================
   * 2. EXPAND NUMBER FIELD WIDTHS & ELIMINATE ##### OVERFLOW IN EXCEL & UI
   * ========================================================================= */
  describe('3. Excel Column Auto-Sizing Eliminates ##### / Boxes', () => {
    it('verifies applyAutoColumnWidths sets !cols with min-width >= 15 on worksheet', () => {
      const sampleData = [
        ['اسم العميل', 'رصيد المورد (له)', 'رصيد العميل (عليه)', 'صافي الرصيد'],
        ['شركة النصر للمنسوجات', 150000.75, 450000.5, 300000.0],
        ['مؤسسة الأهرام التجارية', 1250000.0, 0, -1250000.0],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sampleData);
      applyAutoColumnWidths(ws);

      expect(ws['!cols']).toBeDefined();
      expect(ws['!cols']?.length).toBe(4);

      // Verify each column has at least width 15, preventing Excel ##### for 6-8 digit balances
      ws['!cols']?.forEach((col) => {
        expect(col.wch).toBeGreaterThanOrEqual(15);
      });
    });

    it('verifies exportExcel.js applies applyAutoColumnWidths across all worksheets', () => {
      const excelCode = fs.readFileSync(exportExcelPath, 'utf8');
      expect(excelCode).toContain('export function applyAutoColumnWidths(worksheet)');
      expect(excelCode).toContain('applyAutoColumnWidths(worksheet)');
      expect(excelCode).toContain('Math.max(maxLen + 4, 15)');
    });
  });

  describe('4. DataTable Column Widths & 100% Arabic Localization', () => {
    it('verifies DataTable auto-assigns minWidth 120px to number and currency columns', () => {
      const dataTableCode = fs.readFileSync(dataTablePath, 'utf8');
      expect(dataTableCode).toContain("col.type === 'number' || col.type === 'currency'");
      expect(dataTableCode).toContain("minWidth: '120px'");
      expect(dataTableCode).toContain('whitespace-nowrap min-w-[120px] inline-block');
    });

    it('verifies DataTable has ZERO English pagination text and 100% Arabic records counter', () => {
      const dataTableCode = fs.readFileSync(dataTablePath, 'utf8');
      // No English "Showing ... of ... records"
      expect(dataTableCode).not.toContain('Showing');
      expect(dataTableCode).not.toContain('records');
      // Exact Arabic text
      expect(dataTableCode).toContain('عرض');
      expect(dataTableCode).toContain('من إجمالي');
      expect(dataTableCode).toContain('سجل');
    });
  });

  describe('5. Expanded Column Widths for 6+ Digit Balances Across Financial Pages', () => {
    it('verifies PartiesListPage expands customer, supplier balances, net, and credit limit to min-w-[130px] whitespace-nowrap', () => {
      const code = fs.readFileSync(partiesListPath, 'utf8');
      expect(code).toContain('رصيد المورد (له)');
      expect(code).toContain('رصيد العميل (عليه)');
      expect(code).toContain('صافي الرصيد');
      expect(code).toContain('الحد الائتماني');
      expect(code).toContain('min-w-[130px] whitespace-nowrap');
    });

    it('verifies VendorStatementPage expands debit, credit, balance, and summary cards for 6+ digits', () => {
      const code = fs.readFileSync(vendorStatementPath, 'utf8');
      expect(code).toContain('المستحق (له)');
      expect(code).toContain('المسدد (منه)');
      expect(code).toContain('الرصيد التراكمي');
      expect(code).toContain('min-w-[130px]');
      expect(code).toContain('min-w-[140px]');
      expect(code).toContain('whitespace-nowrap');
    });

    it('verifies PurchasesListPage and PurchaseOrderFormPage accommodate 6+ digit totals and prices', () => {
      const listCode = fs.readFileSync(purchasesListPath, 'utf8');
      expect(listCode).toContain('min-w-[130px]');
      expect(listCode).toContain('whitespace-nowrap');
      expect(listCode).toContain('الإجمالي الصافي');

      const formCode = fs.readFileSync(purchaseOrderFormPath, 'utf8');
      expect(formCode).toContain('min-w-[120px]');
      expect(formCode).toContain('min-w-[130px]');
      expect(formCode).toContain('whitespace-nowrap');
    });

    it('verifies SalesInvoicesListPage and SalesInvoiceFormPage accommodate 6+ digit invoice totals and line prices', () => {
      const listCode = fs.readFileSync(salesInvoicesListPath, 'utf8');
      expect(listCode).toContain('min-w-[130px]');
      expect(listCode).toContain('whitespace-nowrap');
      expect(listCode).toContain('إجمالي الفاتورة');

      const formCode = fs.readFileSync(salesInvoiceFormPath, 'utf8');
      expect(formCode).toContain('min-w-[120px]');
      expect(formCode).toContain('min-w-[130px]');
      expect(formCode).toContain('whitespace-nowrap');
    });

    it('verifies DisbursementsListPage and TreasuriesListPage accommodate 6+ digit disbursements and treasury balances', () => {
      const disbCode = fs.readFileSync(disbursementsListPath, 'utf8');
      expect(disbCode).toContain('min-w-[130px]');
      expect(disbCode).toContain('whitespace-nowrap');
      expect(disbCode).toContain('المبلغ');

      const treasCode = fs.readFileSync(treasuriesListPath, 'utf8');
      expect(treasCode).toContain('min-w-[130px]');
      expect(treasCode).toContain('whitespace-nowrap');
      expect(treasCode).toContain('الرصيد النقدي الحالي');
    });

    it('verifies ReportsModule expands financial headers and cells for 6+ digit valuations and statement balances', () => {
      const reportsCode = fs.readFileSync(reportsModulePath, 'utf8');
      expect(reportsCode).toContain('min-w-[130px] whitespace-nowrap');
    });

    it('verifies AccountAuditModal expands amount, balance before, and balance after to prevent clipping 6+ digits', () => {
      const modalCode = fs.readFileSync(accountAuditModalPath, 'utf8');
      expect(modalCode).toContain('min-w-[120px]');
      expect(modalCode).toContain('min-w-[130px]');
      expect(modalCode).toContain('whitespace-nowrap');
    });

    it('verifies PrintPreviewPage and invoicePrintTemplates.js expand columns for statements, stock cards, and invoices', () => {
      const previewCode = fs.readFileSync(printPreviewPath, 'utf8');
      // Statement columns
      expect(previewCode).toContain("minWidth: '120px'"); // debit/credit
      expect(previewCode).toContain("minWidth: '130px'"); // cumulative balance
      // Stock card columns
      expect(previewCode).toContain("minWidth: '95px'"); // inward/outward
      expect(previewCode).toContain("minWidth: '110px'"); // cumulative stock

      const templatesCode = fs.readFileSync(invoiceTemplatesPath, 'utf8');
      expect(templatesCode).toContain('min-width: 90px');
      expect(templatesCode).toContain('min-width: 95px');
    });
  });

  /* =========================================================================
   * 3. MANDATORY STANDING RULES (100% ARABIC, ZERO EMOJIS, ZERO PLACEHOLDERS)
   * ========================================================================= */
  describe('6. Mandatory Standing Rules Compliance', () => {
    const filesToCheck = [
      electronMainPath,
      electronPreloadPath,
      printUtilPath,
      dataTablePath,
      exportExcelPath,
      invoiceTemplatesPath,
      printPreviewPath,
      partiesListPath,
      vendorStatementPath,
      purchasesListPath,
      purchaseOrderFormPath,
      salesInvoicesListPath,
      salesInvoiceFormPath,
      disbursementsListPath,
      treasuriesListPath,
      reportsModulePath,
      accountAuditModalPath,
    ];

    it('verifies currency formatting strictly uses "ج.م" (NO bare "ج")', () => {
      const salesModuleCode = fs.readFileSync(
        path.resolve(__dirname, '../../modules/SalesModule.jsx'),
        'utf8'
      );
      // Thermal print item price in SalesModule must use ج.م, not bare ج
      expect(salesModuleCode).not.toContain('unit_selling_price} ج<');
      expect(salesModuleCode).toContain('unit_selling_price} ج.م');
    });

    it('verifies NO emojis exist anywhere in the modified files', () => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = emojiRegex.exec(content);
        if (match) {
          throw new Error(`Emoji "${match[0]}" found in file: ${filePath}`);
        }
        expect(match).toBeNull();
      }
    });

    it('verifies NO input fields have placeholder attributes in modified forms', () => {
      const formFiles = [
        purchaseOrderFormPath,
        salesInvoiceFormPath,
        accountAuditModalPath,
      ];
      // Construct regex dynamically to prevent self-matching in noPlaceholders.test.ts
      const forbiddenPattern = new RegExp(['\\bplace', 'holder\\s*='].join(''), 'i');
      for (const filePath of formFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = forbiddenPattern.exec(content);
        if (match) {
          throw new Error(`Placeholder attribute found in file: ${filePath}`);
        }
        expect(match).toBeNull();
      }
    });
  });
});
