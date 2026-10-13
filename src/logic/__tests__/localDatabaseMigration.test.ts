import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
// @ts-ignore
import { LocalDatabaseManager } from '../../../electron/localDatabase.js';
// @ts-ignore
import { runVerification } from '../../../tools/migrate-from-hostinger/verify.js';
import { calculateItemActualBalance } from '../inventoryBalances';

describe('Local SQLite Database Migration Suite', () => {
  let tempDir: string;
  let dbManager: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-test-db-'));
    dbManager = new LocalDatabaseManager(tempDir);
  });

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('1. Schema & Versioned Migrations Build from Scratch', () => {
    it('creates all required system tables and indexes on fresh initialization', () => {
      const db = dbManager.getDb();
      expect(db).toBeDefined();

      // Check schema_version table
      const versions = db.prepare('SELECT * FROM schema_version').all();
      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].version).toBe(1);

      // Verify PRAGMA integrity_check
      const integrity = dbManager.checkIntegrity();
      expect(integrity.ok).toBe(true);
      expect(integrity.details).toEqual(['ok']);

      // Verify essential tables exist
      const requiredTables = [
        'schema_version',
        'items',
        'item_groups',
        'item_sections',
        'item_units',
        'item_colors',
        'item_sizes',
        'materials',
        'products',
        'bom_items',
        'parties',
        'suppliers',
        'customers',
        'sales_invoices',
        'sales_invoice_items',
        'purchase_orders',
        'purchase_order_items',
        'treasury_accounts',
        'cash_transactions',
        'stock_movements',
        'storage_locations',
        'users',
        'settings',
        'audit_log',
      ];

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((t: any) => t.name);

      for (const req of requiredTables) {
        expect(tables).toContain(req);
      }
      expect(tables.length).toBeGreaterThanOrEqual(42);
    });
  });

  describe('2. Multi-Table Atomic Transaction & Rollback on Failure', () => {
    it('rolls back all modifications atomically when a multi-table operation fails', () => {
      const db = dbManager.getDb();

      // Insert baseline account
      db.prepare(
        'INSERT INTO treasury_accounts (id, name, current_balance, is_active, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('acc-tx-test', 'خزينة الاختبار الذري', 1000, 1, new Date().toISOString());

      const balanceBefore = db
        .prepare('SELECT current_balance FROM treasury_accounts WHERE id = ?')
        .get('acc-tx-test').current_balance;
      expect(balanceBefore).toBe(1000);

      // Attempt multi-table operation where second step fails
      let transactionFailed = false;
      try {
        const atomicOp = db.transaction(() => {
          // Step 1: Update treasury balance
          db.prepare('UPDATE treasury_accounts SET current_balance = ? WHERE id = ?').run(
            500,
            'acc-tx-test'
          );

          // Step 2: Deliberately violate unique constraint or invalid operation
          db.prepare(
            'INSERT INTO treasury_accounts (id, name, current_balance, is_active, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run('acc-tx-test', 'Duplicate ID', 999, 1, new Date().toISOString());
        });

        atomicOp();
      } catch (err: any) {
        transactionFailed = true;
      }

      expect(transactionFailed).toBe(true);

      // Verify that Step 1 was ROLLED BACK and balance remains 1000!
      const balanceAfter = db
        .prepare('SELECT current_balance FROM treasury_accounts WHERE id = ?')
        .get('acc-tx-test').current_balance;
      expect(balanceAfter).toBe(1000);
    });
  });

  describe('3. Verification Report Detects Deliberately Broken Row', () => {
    it('strictly detects orphaned foreign keys and deliberate data discrepancies', () => {
      const db = dbManager.getDb();

      // Seed valid party
      db.prepare(
        'INSERT INTO parties (id, code, name, is_customer, is_supplier, current_balance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('pty-valid-01', 'PRT-1001', 'عميل سليم', 1, 0, 0, new Date().toISOString());

      // Seed customer referencing valid party
      db.prepare(
        'INSERT INTO customers (id, party_id, name, created_at) VALUES (?, ?, ?, ?)'
      ).run('pty-valid-01', 'pty-valid-01', 'عميل سليم', new Date().toISOString());

      // Clean check should pass
      const cleanSource = {
        parties: [{ id: 'pty-valid-01', code: 'PRT-1001', name: 'عميل سليم', current_balance: 0 }],
        customers: [{ id: 'pty-valid-01', party_id: 'pty-valid-01', name: 'عميل سليم' }],
      };

      const cleanReport = runVerification(cleanSource, db);
      expect(cleanReport.success).toBe(true);

      // Deliberately inject broken orphaned customer referencing nonexistent party
      db.prepare(
        'INSERT INTO customers (id, party_id, name, created_at) VALUES (?, ?, ?, ?)'
      ).run('cust-broken-99', 'pty-NON-EXISTENT', 'عميل مكسور الرابط', new Date().toISOString());

      const brokenSource = {
        parties: [{ id: 'pty-valid-01', code: 'PRT-1001', name: 'عميل سليم', current_balance: 0 }],
        customers: [
          { id: 'pty-valid-01', party_id: 'pty-valid-01', name: 'عميل سليم' },
          { id: 'cust-broken-99', party_id: 'pty-NON-EXISTENT', name: 'عميل مكسور الرابط' },
        ],
      };

      const brokenReport = runVerification(brokenSource, db);
      expect(brokenReport.success).toBe(false);

      const orphanCheck = brokenReport.checks.find(
        (c: any) => c.name === 'No Orphaned customers.party_id -> parties.id'
      );
      expect(orphanCheck).toBeDefined();
      expect(orphanCheck.status).toBe('FAIL');
      expect(orphanCheck.details).toContain('cust-broken-99');
    });
  });

  describe('4. Stock and Treasury Formulas Unchanged', () => {
    it('preserves exact stock calculation logic across in/out stock movements', () => {
      const openingStock = 50;
      const movements = [
        { movement_type: 'purchase', direction: 'in', quantity: 20 },
        { movement_type: 'sale', direction: 'out', quantity: 15 },
        { movement_type: 'adjustment', direction: 'in', quantity: 5 },
        { movement_type: 'return', direction: 'out', quantity: 2 },
      ];

      const balance = calculateItemActualBalance(openingStock, movements);
      // 50 + 20 - 15 + 5 - 2 = 58
      expect(balance).toBe(58);
    });

    it('calculates treasury balances correctly with positive, negative, and zero balances', () => {
      const db = dbManager.getDb();

      db.prepare(
        'INSERT INTO treasury_accounts (id, name, current_balance, is_active, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('tr-calc', 'خزينة رئيسية', 0, 1, new Date().toISOString());

      // Simulate cash in
      db.prepare('UPDATE treasury_accounts SET current_balance = current_balance + ? WHERE id = ?').run(
        1500,
        'tr-calc'
      );
      let row = db.prepare('SELECT current_balance FROM treasury_accounts WHERE id = ?').get('tr-calc');
      expect(Number(row.current_balance)).toBe(1500);

      // Simulate cash out exceeding balance (allowing negative balance as specified in business logic)
      db.prepare('UPDATE treasury_accounts SET current_balance = current_balance - ? WHERE id = ?').run(
        2500,
        'tr-calc'
      );
      row = db.prepare('SELECT current_balance FROM treasury_accounts WHERE id = ?').get('tr-calc');
      expect(Number(row.current_balance)).toBe(-1000);
    });
  });

  describe('5. Backup & Restore Safety Cycle', () => {
    it('creates an SQLite backup file and restores safely with pre-restore safety snapshot', async () => {
      const db = dbManager.getDb();
      db.prepare('INSERT INTO item_sizes (id, code, name, is_active) VALUES (?, ?, ?, ?)').run(
        'sz-1',
        'XL',
        'مقاس كبير',
        1
      );

      const backupPath = path.join(tempDir, 'manual-backup.db');
      const backupResult = await dbManager.backupDatabase(backupPath);
      expect(backupResult.success).toBe(true);
      expect(fs.existsSync(backupPath)).toBe(true);

      // Modify data after backup
      db.prepare('UPDATE item_sizes SET name = ? WHERE id = ?').run('اسم معدل', 'sz-1');
      let current = db.prepare('SELECT name FROM item_sizes WHERE id = ?').get('sz-1');
      expect(current.name).toBe('اسم معدل');

      // Restore from backup
      const restoreResult = await dbManager.restoreDatabase(backupPath);
      expect(restoreResult.success).toBe(true);
      expect(restoreResult.preRestoreBackupPath).toBeDefined();
      expect(fs.existsSync(restoreResult.preRestoreBackupPath)).toBe(true);

      // Verify data restored to original state
      const restoredDb = dbManager.getDb();
      const restored = restoredDb.prepare('SELECT name FROM item_sizes WHERE id = ?').get('sz-1');
      expect(restored.name).toBe('مقاس كبير');
    });
  });
});
