const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

/**
 * Runs a complete verification suite comparing source (Hostinger data) and local SQLite.
 * @param {object|string} sourceDataOrPath JSON object or path to JSON backup file
 * @param {string|Database} targetDbPathOrInstance SQLite file path or Database instance
 * @returns {object} { success: boolean, checks: Array<{ name: string, status: 'PASS'|'FAIL', details: string }> }
 */
function runVerification(sourceDataOrPath, targetDbPathOrInstance) {
  let source = null;
  if (typeof sourceDataOrPath === 'string') {
    if (!fs.existsSync(sourceDataOrPath)) {
      throw new Error(`Source file not found: ${sourceDataOrPath}`);
    }
    source = JSON.parse(fs.readFileSync(sourceDataOrPath, 'utf8'));
  } else if (typeof sourceDataOrPath === 'object' && sourceDataOrPath !== null) {
    source = sourceDataOrPath;
  } else {
    throw new Error('Invalid source data provided');
  }

  let db = null;
  let shouldClose = false;
  if (typeof targetDbPathOrInstance === 'string') {
    db = new Database(targetDbPathOrInstance, { readonly: true });
    shouldClose = true;
  } else if (targetDbPathOrInstance && typeof targetDbPathOrInstance.prepare === 'function') {
    db = targetDbPathOrInstance;
  } else {
    throw new Error('Invalid target SQLite database provided');
  }

  const checks = [];

  try {
    // 1. Table Row Counts (Source vs Target)
    for (const [table, rows] of Object.entries(source)) {
      if (!Array.isArray(rows)) continue;
      const expectedCount = rows.length;

      // Check if table exists in SQLite
      const tableExists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);

      if (!tableExists) {
        checks.push({
          category: 'Row Counts',
          name: `Table: ${table}`,
          status: 'FAIL',
          expected: expectedCount,
          actual: 0,
          details: `Table ${table} does not exist in local SQLite database`,
        });
        continue;
      }

      const countRow = db.prepare(`SELECT COUNT(*) as c FROM \`${table}\``).get();
      const actualCount = countRow ? countRow.c : 0;

      // In local database, row count must be >= expectedCount (and equal if initial sync)
      const isMatch = actualCount >= expectedCount;
      checks.push({
        category: 'Row Counts',
        name: `Table: ${table}`,
        status: isMatch ? 'PASS' : 'FAIL',
        expected: expectedCount,
        actual: actualCount,
        details: isMatch
          ? `Matched (${actualCount} records in local, ${expectedCount} in source)`
          : `Mismatch: source has ${expectedCount} rows, but local has ${actualCount}`,
      });
    }

    // 2. Sums Verification: Treasury Balances
    if (source.treasury_accounts && source.treasury_accounts.length > 0) {
      const sourceSum = source.treasury_accounts.reduce(
        (sum, a) => sum + (Number(a.current_balance) || 0),
        0
      );
      const targetSumRow = db
        .prepare('SELECT SUM(current_balance) as s FROM `treasury_accounts`')
        .get();
      const targetSum = Number(targetSumRow?.s) || 0;
      const match = Math.abs(sourceSum - targetSum) < 0.001;

      checks.push({
        category: 'Financial Sums',
        name: 'Treasury Current Balances Sum',
        status: match ? 'PASS' : 'FAIL',
        expected: sourceSum.toFixed(2),
        actual: targetSum.toFixed(2),
        details: match
          ? `Equal balance sum: ${targetSum.toFixed(2)}`
          : `Mismatch: source=${sourceSum.toFixed(2)}, local=${targetSum.toFixed(2)}`,
      });
    }

    // 3. Sums Verification: Stock Balances per Item
    if (source.items && source.items.length > 0) {
      const sourceStock = source.items.reduce(
        (sum, i) => sum + (Number(i.current_stock) || 0),
        0
      );
      const targetStockRow = db.prepare('SELECT SUM(current_stock) as s FROM `items`').get();
      const targetStock = Number(targetStockRow?.s) || 0;
      const match = Math.abs(sourceStock - targetStock) < 0.001;

      checks.push({
        category: 'Stock Sums',
        name: 'Items Stock Sum',
        status: match ? 'PASS' : 'FAIL',
        expected: sourceStock.toFixed(3),
        actual: targetStock.toFixed(3),
        details: match
          ? `Equal stock sum: ${targetStock.toFixed(3)}`
          : `Mismatch: source=${sourceStock.toFixed(3)}, local=${targetStock.toFixed(3)}`,
      });
    }

    // 4. Sums Verification: Customer Balances
    if (source.parties && source.parties.length > 0) {
      const sourcePartySum = source.parties.reduce(
        (sum, p) => sum + (Number(p.current_balance) || 0),
        0
      );
      const targetPartyRow = db.prepare('SELECT SUM(current_balance) as s FROM `parties`').get();
      const targetPartySum = Number(targetPartyRow?.s) || 0;
      const match = Math.abs(sourcePartySum - targetPartySum) < 0.001;

      checks.push({
        category: 'Financial Sums',
        name: 'Parties Current Balances Sum',
        status: match ? 'PASS' : 'FAIL',
        expected: sourcePartySum.toFixed(2),
        actual: targetPartySum.toFixed(2),
        details: match
          ? `Equal party balances sum: ${targetPartySum.toFixed(2)}`
          : `Mismatch: source=${sourcePartySum.toFixed(2)}, local=${targetPartySum.toFixed(2)}`,
      });
    }

    // 5. Integrity & Duplicate Codes Check
    const codeTables = [
      { table: 'items', col: 'code' },
      { table: 'parties', col: 'code' },
      { table: 'storage_locations', col: 'code' },
    ];

    for (const { table, col } of codeTables) {
      const exists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (exists) {
        const dupes = db
          .prepare(
            `SELECT \`${col}\`, COUNT(*) as cnt FROM \`${table}\` GROUP BY \`${col}\` HAVING cnt > 1`
          )
          .all();
        const passed = dupes.length === 0;
        checks.push({
          category: 'Data Uniqueness',
          name: `No Duplicate Codes in ${table}.${col}`,
          status: passed ? 'PASS' : 'FAIL',
          expected: '0 duplicates',
          actual: `${dupes.length} duplicates`,
          details: passed
            ? `All ${table}.${col} values are strictly unique`
            : `Duplicate codes found: ${dupes.map((d) => d[col]).join(', ')}`,
        });
      }
    }

    // 6. Foreign Key Consistency / Orphaned Records
    const fkChecks = [
      {
        table: 'customers',
        fk: 'party_id',
        parent: 'parties',
        parentKey: 'id',
      },
      {
        table: 'suppliers',
        fk: 'party_id',
        parent: 'parties',
        parentKey: 'id',
      },
      {
        table: 'cash_transactions',
        fk: 'account_id',
        parent: 'treasury_accounts',
        parentKey: 'id',
      },
    ];

    for (const { table, fk, parent, parentKey } of fkChecks) {
      const tableExists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      const parentExists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(parent);

      if (tableExists && parentExists) {
        const orphans = db
          .prepare(
            `SELECT t.id FROM \`${table}\` t LEFT JOIN \`${parent}\` p ON t.\`${fk}\` = p.\`${parentKey}\` WHERE t.\`${fk}\` IS NOT NULL AND p.\`${parentKey}\` IS NULL`
          )
          .all();

        const passed = orphans.length === 0;
        checks.push({
          category: 'Foreign Key Integrity',
          name: `No Orphaned ${table}.${fk} -> ${parent}.${parentKey}`,
          status: passed ? 'PASS' : 'FAIL',
          expected: '0 orphans',
          actual: `${orphans.length} orphans`,
          details: passed
            ? 'All references resolve to valid parent records'
            : `Found ${orphans.length} orphaned rows with ids: ${orphans.map((o) => o.id).join(', ')}`,
        });
      }
    }

    // 7. SQLite Native PRAGMA integrity_check
    const pragmaRows = db.pragma('integrity_check');
    const integrityOk = pragmaRows.length === 1 && pragmaRows[0].integrity_check === 'ok';
    checks.push({
      category: 'Database File Integrity',
      name: 'PRAGMA integrity_check',
      status: integrityOk ? 'PASS' : 'FAIL',
      expected: 'ok',
      actual: pragmaRows[0]?.integrity_check || 'failed',
      details: integrityOk ? 'SQLite database structure is 100% healthy' : 'Integrity errors detected',
    });
  } finally {
    if (shouldClose && db) {
      db.close();
    }
  }

  const overallSuccess = checks.every((c) => c.status === 'PASS');
  return {
    success: overallSuccess,
    passedCount: checks.filter((c) => c.status === 'PASS').length,
    failedCount: checks.filter((c) => c.status === 'FAIL').length,
    checks,
  };
}

// CLI Execution Support
if (require.main === module) {
  const args = process.argv.slice(2);
  let sourcePath = path.join(__dirname, '../../backups/hostinger_export_2026-10-13.json');
  let targetPath = null;

  for (const arg of args) {
    if (arg.startsWith('--source=')) sourcePath = arg.split('=')[1];
    if (arg.startsWith('--target=')) targetPath = arg.split('=')[1];
  }

  if (!targetPath) {
    const os = require('os');
    targetPath = path.join(os.homedir(), 'AppData/Roaming/apex-apparel-erp/apex-erp.db');
    if (!fs.existsSync(targetPath)) {
      targetPath = path.resolve('apex-erp.db');
    }
  }

  console.log('='.repeat(70));
  console.log('Apex Apparel ERP - Database Migration Verification Report');
  console.log(`Source File : ${sourcePath}`);
  console.log(`Target SQLite: ${targetPath}`);
  console.log('='.repeat(70));

  try {
    const result = runVerification(sourcePath, targetPath);
    console.table(
      result.checks.map((c) => ({
        Category: c.category,
        Check: c.name,
        Status: c.status,
        Details: c.details,
      }))
    );

    console.log(
      `\nOverall Status: ${result.success ? 'PASS (ALL CHECKS PASSED)' : 'FAIL (CHECKS FAILED)'}`
    );
    console.log(`Passed: ${result.passedCount} | Failed: ${result.failedCount}\n`);

    if (!result.success) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Verification error:', err.message);
    process.exit(1);
  }
}

module.exports = {
  runVerification,
};
