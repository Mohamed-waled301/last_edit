import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import db from '../../data/db';
import salesRepo from '../../data/repositories/salesRepo';
import { BalanceCalculator, computeReturnTotal } from '../balances';
import { getEntityCurrentBalance } from '../../services/balanceService';

describe('TASK 1 & TASK 2 & TASK 3: Comprehensive Verification Suite', () => {
  beforeEach(async () => {
    await db.customers.clear();
    await db.parties.clear();
    await db.sales_invoices.clear();
    await db.sales_invoice_items.clear();
    await db.customer_payments.clear();
    await db.customer_returns.clear();
    await db.products.clear();
    await db.items.clear();
    await db.treasury_accounts.clear();
    await db.cash_transactions.clear();
    await db.stock_movements.clear();
  });

  // =========================================================================
  // TASK 1: Return Amount Calculation, Display, and Customer Statement Sync
  // =========================================================================
  describe('TASK 1: Return Total Calculation (Quantity * Refund/Unit Amount) and Statement Sync', () => {
    it('1.1. Correctly calculates totalReturnAmount = quantity * unitRefundAmount when creating customer return', async () => {
      const customer = {
        id: 'cust-ret-1',
        name: 'عميل الأناقة للملابس',
        code: 'CUST-001',
        is_customer: 1,
        opening_balance: 50000,
        opening_balance_type: 'debit',
      };
      await db.customers.add(customer);
      await db.parties.add(customer);

      const product = {
        id: 'prod-shirt-01',
        name: 'قميص رجالي كلاسيك',
        code: 'SHIRT-CLS',
        item_type: 'finished',
        current_finished_stock: 50,
      };
      await db.products.add(product);
      await db.items.add({ ...product, current_stock: 50 });

      // Return 60 pieces with unit refund amount 150.00
      const res = await salesRepo.createCustomerReturn({
        customer_id: customer.id,
        product_id: product.id,
        quantity: 60,
        unit_price: 150,
        refund_method: 'deduct_balance',
        return_date: '2026-11-19',
        reason: 'عيب خياطة في القماش',
      });

      expect(res.success).toBe(true);

      const storedReturn = await db.customer_returns.get(res.returnId);
      expect(storedReturn).toBeDefined();
      expect(storedReturn.quantity).toBe(60);
      expect(storedReturn.unit_price).toBe(150);
      expect(storedReturn.unit_refund_amount).toBe(150);
      // Total amount MUST be quantity * unitRefundAmount = 60 * 150 = 9000
      expect(storedReturn.total_amount).toBe(9000);
      expect(storedReturn.refund_amount).toBe(9000);
    });

    it('1.2. Correctly handles refund_amount passed as unit amount with multiple quantity', async () => {
      const customer = {
        id: 'cust-ret-2',
        name: 'محلات النور للأزياء',
        code: 'CUST-002',
        is_customer: 1,
        opening_balance: 60000,
        opening_balance_type: 'debit',
      };
      await db.customers.add(customer);
      await db.parties.add(customer);

      const product = {
        id: 'prod-dress-01',
        name: 'فستان حريمي سواريه',
        code: 'DRS-SWR',
        item_type: 'finished',
        current_finished_stock: 200,
      };
      await db.products.add(product);
      await db.items.add({ ...product, current_stock: 200 });

      // Quantity = 116, refund_amount passed as 140 (the observed user case)
      const res = await salesRepo.createCustomerReturn({
        customer_id: customer.id,
        product_id: product.id,
        quantity: 116,
        refund_amount: 140, // unit price passed
        refund_method: 'deduct_balance',
        return_date: '2026-11-19',
      });

      const stored = await db.customer_returns.get(res.returnId);
      expect(stored.quantity).toBe(116);
      expect(stored.unit_price).toBe(140);
      // 116 * 140 = 16240
      expect(stored.total_amount).toBe(16240);
      expect(stored.refund_amount).toBe(16240);
    });

    it('1.3. Syncs calculated totalReturnAmount to Customer Statement credit side (المسدد منه) and running balance', async () => {
      const customer = {
        id: 'cust-ret-3',
        name: 'شركة الفخامة التجارية',
        code: 'CUST-003',
        is_customer: 1,
        opening_balance: 50000,
        opening_balance_type: 'debit',
      };
      await db.customers.add(customer);
      await db.parties.add(customer);

      const product = {
        id: 'prod-pant-01',
        name: 'بنطلون جينز شبابي',
        code: 'PNT-JNZ',
        item_type: 'finished',
        current_finished_stock: 100,
      };
      await db.products.add(product);
      await db.items.add({ ...product, current_stock: 100 });

      // Create return: 60 pieces * 150 = 9000
      await salesRepo.createCustomerReturn({
        customer_id: customer.id,
        product_id: product.id,
        quantity: 60,
        unit_price: 150,
        refund_method: 'deduct_balance',
        return_date: '2026-11-19',
        reason: 'تلف بالأزرار',
      });

      const stmt = await salesRepo.getCustomerStatement(customer.id);
      expect(stmt).toBeDefined();
      expect(stmt.statement).toBeDefined();

      const returnRow = stmt.statement.find((r: any) => r.type === 'مرتجع مبيعات');
      expect(returnRow).toBeDefined();
      // Must post total 9000 under credit (المسدد منه), NEVER the 150 unit price!
      expect(returnRow.credit).toBe(9000);
      expect(returnRow.debit).toBe(0);

      // Verify transparent description with reference, quantity, unit price, and total
      expect(returnRow.description).toContain('60 قطعة');
      expect(returnRow.description).toContain('150.00 ج.م');
      expect(returnRow.description).toContain('9000.00 ج.م');
      expect(returnRow.description).toContain('بنطلون جينز شبابي');

      // Verify running balance is reduced by the 9000: 50000 - 9000 = 41000
      expect(returnRow.balance_after).toBe(41000);
      expect(stmt.summary.remaining_balance).toBe(41000);
    });

    it('1.4. Safely heals and recalculates historical return records in Dexie that lacked total_amount', async () => {
      const customer = {
        id: 'cust-ret-hist',
        name: 'عميل تاريخي قديم',
        code: 'CUST-004',
        is_customer: 1,
        opening_balance: 30000,
        opening_balance_type: 'debit',
      };
      await db.customers.add(customer);
      await db.parties.add(customer);

      const product = {
        id: 'prod-polo-01',
        name: 'تيشرت بولو صيفي',
        code: 'TSH-POLO',
        item_type: 'finished',
        current_finished_stock: 80,
      };
      await db.products.add(product);
      await db.items.add({ ...product, current_stock: 80 });

      // Simulate historical entry directly in Dexie as observed in screenshots:
      // quantity: 51, refund_amount: 120 (unit price stored in refund_amount, total_amount undefined)
      const histId = 'cret-historical-01';
      await db.customer_returns.add({
        id: histId,
        return_number: 'RET-SLS-0051',
        return_mode: 'free_return',
        customer_id: customer.id,
        product_id: product.id,
        quantity: 51,
        refund_amount: 120, // unit price
        refund_method: 'deduct_balance',
        return_date: '2026-11-10',
        created_at: '2026-11-10T10:00:00.000Z',
      });

      // Fetch customer statement which triggers normalizeHistoricalReturns
      const stmt = await salesRepo.getCustomerStatement(customer.id);
      const retRow = stmt.statement.find((r: any) => r.reference === 'RET-SLS-0051');
      expect(retRow).toBeDefined();

      // 51 * 120 = 6120
      expect(retRow.credit).toBe(6120);

      // Verify Dexie record itself got healed
      const healedRecord = await db.customer_returns.get(histId);
      expect(healedRecord.unit_price).toBe(120);
      expect(healedRecord.total_amount).toBe(6120);
      expect(healedRecord.refund_amount).toBe(6120);

      // 30000 - 6120 = 23880
      expect(stmt.summary.remaining_balance).toBe(23880);
    });

    it('1.5. Pure BalanceCalculator and computeReturnTotal compute line totals accurately', () => {
      // 1. Explicit total_amount
      expect(computeReturnTotal({ quantity: 60, unit_price: 150, total_amount: 9000 })).toBe(9000);

      // 2. Missing total_amount with quantity and unit price
      expect(computeReturnTotal({ quantity: 116, unit_price: 140 })).toBe(16240);

      // 3. Historical unit refund_amount
      expect(computeReturnTotal({ quantity: 266, refund_amount: 90 })).toBe(23940);

      // 4. Fallback when quantity is 1
      expect(computeReturnTotal({ refund_amount: 300 })).toBe(300);

      // 5. BalanceCalculator integration
      const summary = BalanceCalculator.calculateCustomerBalance(
        [{ total_amount: 50000, paid_amount: 10000 }],
        [{ quantity: 60, refund_amount: 150, refund_method: 'deduct_balance' }],
        0,
        0,
        'debit'
      );
      // Invoiced: 50000, Paid: 10000, Returns: 60 * 150 = 9000 => Due: 50000 - 10000 - 9000 = 31000
      expect(summary.totalReturns).toBe(9000);
      expect(summary.balanceDue).toBe(31000);
    });
  });

  // =========================================================================
  // TASK 2: Automatic App Relaunch After Update / Restart
  // =========================================================================
  describe('TASK 2: Automatic App Relaunch & Single-Instance Lock Release', () => {
    it('2.1. CuttingAutoUpdater.quitAndInstall configures relaunch and clean exit', () => {
      const { CuttingAutoUpdater } = require('../../../electron/updater.js');
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relaunch-test-'));
      const fakeInstaller = path.join(tempDir, 'fake-installer.exe');
      fs.writeFileSync(fakeInstaller, 'binary');

      const mockSpawn = vi.fn().mockReturnValue({ unref: vi.fn() });
      const mockApp = {
        isReady: () => true,
        getVersion: () => '1.2.2',
        releaseSingleInstanceLock: vi.fn(),
        relaunch: vi.fn(),
        exit: vi.fn(),
        quit: vi.fn(),
      };

      vi.useFakeTimers();

      const updater = new CuttingAutoUpdater({
        app: mockApp,
        spawn: mockSpawn,
        activeEdition: 'cutting',
        currentVersion: '1.2.2',
      });
      updater.state.installerPath = fakeInstaller;

      updater.quitAndInstall();

      // Installer must be spawned in silent mode with /S and --updated
      expect(mockSpawn).toHaveBeenCalledWith(
        fakeInstaller,
        ['/S', '--updated'],
        expect.objectContaining({ detached: true })
      );

      // Advance timers by 500ms to trigger exit & relaunch
      vi.advanceTimersByTime(500);

      expect(mockApp.releaseSingleInstanceLock).toHaveBeenCalled();
      expect(mockApp.relaunch).toHaveBeenCalled();
      expect(mockApp.exit).toHaveBeenCalledWith(0);

      vi.useRealTimers();
      try {
        fs.unlinkSync(fakeInstaller);
        fs.rmdirSync(tempDir);
      } catch {}
    });

    it('2.2. Preload script exposes relaunch and restart APIs', () => {
      const preloadPath = path.resolve(__dirname, '../../../electron/preload.js');
      const content = fs.readFileSync(preloadPath, 'utf8');

      expect(content).toContain("relaunch: () => ipcRenderer.invoke('app:relaunch')");
      expect(content).toContain("restart: () => ipcRenderer.invoke('app:restart')");
    });

    it('2.3. Electron main process registers app:relaunch and app:restart with releaseSingleInstanceLock', () => {
      const mainPath = path.resolve(__dirname, '../../../electron/main.js');
      const content = fs.readFileSync(mainPath, 'utf8');

      expect(content).toContain("ipcMain.handle('app:relaunch'");
      expect(content).toContain("ipcMain.handle('app:restart'");
      expect(content).toContain('app.releaseSingleInstanceLock');
      expect(content).toContain('app.relaunch');
      expect(content).toContain('app.exit(0)');
    });
  });

  // =========================================================================
  // TASK 3: Standardize Print Format Labels to "A4" and "إيصال حراري"
  // =========================================================================
  describe('TASK 3: Standardize Print Format Labels across UI', () => {
    it('3.1. Verifies PrintPreviewPage uses exact "A4" and "إيصال حراري" labels without old names', () => {
      const filePath = path.resolve(__dirname, '../../modules/print/PrintPreviewPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('<option value="A4">A4</option>');
      expect(content).toContain('<option value="80mm">إيصال حراري</option>');
      expect(content).not.toContain('ورق قياسي كامل');
      expect(content).not.toContain('إيصال طباعة حرارية (80 مم)');
    });

    it('3.2. Verifies PostIssuePrintDialog uses exact "A4" and "إيصال حراري" labels without old names', () => {
      const filePath = path.resolve(__dirname, '../../components/PostIssuePrintDialog.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('<span className="text-xs">A4</span>');
      expect(content).toContain('<span className="text-xs">إيصال حراري</span>');
      expect(content).not.toContain('ورق كامل A4');
      expect(content).not.toContain('حراري 80 مم');
    });

    it('3.3. Verifies SalesInvoicePrintPage uses exact "A4" and "إيصال حراري" labels without old names', () => {
      const filePath = path.resolve(__dirname, '../../modules/sales/SalesInvoicePrintPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toMatch(/>\s*A4\s*<\/button>/);
      expect(content).toMatch(/>\s*إيصال حراري\s*<\/button>/);
      expect(content).not.toContain('فاتورة رسمية قياس كامل');
      expect(content).not.toContain('إيصال طباعة حرارية');
    });

    it('3.4. Verifies SalesModule print modal uses exact "A4" and "إيصال حراري" labels without old names', () => {
      const filePath = path.resolve(__dirname, '../../modules/SalesModule.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toMatch(/>\s*A4\s*<\/button>/);
      expect(content).toMatch(/>\s*إيصال حراري\s*<\/button>/);
      expect(content).not.toContain('نموذج ورقي كامل');
    });
  });
});
