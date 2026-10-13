const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runVerification } = require('./verify');

/**
 * Apex Apparel ERP - One-Time Hostinger to Local SQLite Migration Tool
 * Reads from remote Hostinger MySQL (if credentials supplied) or saved backup,
 * populates the local SQLite database, and runs strict verification.
 */
async function migrate() {
  const args = process.argv.slice(2);
  let sourceArg = null;
  let targetArg = null;

  for (const arg of args) {
    if (arg.startsWith('--source=')) sourceArg = arg.split('=')[1];
    if (arg.startsWith('--target=')) targetArg = arg.split('=')[1];
  }

  // 1. Resolve Target SQLite Path
  let targetDbPath = targetArg;
  if (!targetDbPath) {
    const defaultUserData =
      process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(process.env.HOME, 'Library/Application Support')
        : path.join(process.env.HOME, '.config'));
    const erpUserData = path.join(defaultUserData, 'apex-apparel-erp');
    if (!fs.existsSync(erpUserData)) {
      fs.mkdirSync(erpUserData, { recursive: true });
    }
    targetDbPath = path.join(erpUserData, 'apex-erp.db');
  }

  console.log('='.repeat(70));
  console.log('Apex Apparel ERP - Hostinger to Local SQLite Migration');
  console.log(`Target SQLite Database: ${targetDbPath}`);
  console.log('='.repeat(70));

  // 2. Fetch or Load Source Data
  let dataToMigrate = null;
  const mysqlHost = process.env.MYSQL_HOST;
  const mysqlUser = process.env.MYSQL_USER;
  const mysqlPassword = process.env.MYSQL_PASSWORD;
  const mysqlDatabase = process.env.MYSQL_DATABASE;

  if (mysqlHost && mysqlUser && mysqlDatabase && !sourceArg) {
    console.log(`[Hostinger] Connecting read-only to remote MySQL at ${mysqlHost}...`);
    try {
      const mysql = require('mysql2/promise');
      const conn = await mysql.createConnection({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword || '',
        database: mysqlDatabase,
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        connectTimeout: 10000,
      });

      const [tables] = await conn.query('SHOW TABLES');
      const tableNames = tables.map((r) => Object.values(r)[0]);
      dataToMigrate = {};

      for (const t of tableNames) {
        const [rows] = await conn.query(`SELECT * FROM \`${t}\``);
        if (rows.length > 0) {
          dataToMigrate[t] = rows;
        }
      }
      await conn.end();
      console.log(`[Hostinger] Read ${Object.keys(dataToMigrate).length} populated tables successfully!`);
    } catch (netErr) {
      console.warn('[Hostinger Connection Failed]:', netErr.message);
      console.log('Falling back to local backup export file...');
    }
  }

  // Fallback to local export backup file
  if (!dataToMigrate) {
    const possiblePaths = [
      sourceArg,
      path.join(__dirname, '../../backups/hostinger_export_2026-10-13.json'),
      path.resolve('backups/hostinger_export_2026-10-13.json'),
    ].filter(Boolean);

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log(`[Source Backup] Loading source data from: ${p}`);
        dataToMigrate = JSON.parse(fs.readFileSync(p, 'utf8'));
        break;
      }
    }
  }

  if (!dataToMigrate) {
    throw new Error('No source data found. Please provide --source=<file.json> or set MYSQL_HOST environment variables.');
  }

  // 3. Save a dated export backup file outside git
  const backupsDir = path.resolve('backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().slice(0, 10);
  const datedExportFile = path.join(backupsDir, `hostinger_export_${dateStr}.json`);
  fs.writeFileSync(datedExportFile, JSON.stringify(dataToMigrate, null, 2), 'utf8');
  console.log(`[Backup Saved] Dated source export saved to: ${datedExportFile}`);

  // 4. Initialize Local SQLite and run migrations
  const { LocalDatabaseManager } = require('../../electron/localDatabase');
  const targetDir = path.dirname(targetDbPath);
  const dbManager = new LocalDatabaseManager(targetDir);
  // Ensure custom dbPath matches
  dbManager.dbPath = targetDbPath;
  const db = dbManager.getDb();

  console.log('[SQLite] Target schema prepared via migrations.');

  // 5. Populate Data in an Atomic Transaction
  const populateTransaction = db.transaction(() => {
    let totalImported = 0;

    for (const [table, rows] of Object.entries(dataToMigrate)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      // Check if table exists in SQLite
      const exists = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
        .get(table);
      if (!exists) {
        console.warn(`[Warning] Skipping table ${table} (not found in SQLite schema)`);
        continue;
      }

      // Get columns for the table in SQLite
      const colInfo = db.prepare(`PRAGMA table_info(\`${table}\`)`).all();
      const validCols = new Set(colInfo.map((c) => c.name));

      for (const row of rows) {
        const rowKeys = Object.keys(row).filter((k) => validCols.has(k));
        if (rowKeys.length === 0) continue;

        const colsSql = rowKeys.map((k) => `\`${k}\``).join(', ');
        const placeholders = rowKeys.map(() => '?').join(', ');
        const updateSql = rowKeys
          .filter((k) => k !== 'id')
          .map((k) => `\`${k}\`=excluded.\`${k}\``)
          .join(', ');

        const values = rowKeys.map((k) => {
          const val = row[k];
          if (val === null || val === undefined) return null;
          if (typeof val === 'boolean') return val ? 1 : 0;
          if (val instanceof Date) return val.toISOString();
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });

        const sql = updateSql
          ? `INSERT INTO \`${table}\` (${colsSql}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updateSql}`
          : `INSERT OR IGNORE INTO \`${table}\` (${colsSql}) VALUES (${placeholders})`;

        db.prepare(sql).run(...values);
        totalImported++;
      }

      console.log(`  Imported ${rows.length} rows into table: ${table}`);
    }

    return totalImported;
  });

  const totalCount = populateTransaction();
  console.log(`\nSuccessfully imported ${totalCount} records into local SQLite database!`);

  // 6. Run Verification Suite
  console.log('\nRunning post-migration verification checks...');
  const report = runVerification(dataToMigrate, db);

  console.table(
    report.checks.map((c) => ({
      Category: c.category,
      Check: c.name,
      Status: c.status,
      Details: c.details,
    }))
  );

  if (!report.success) {
    console.error('\n[FATAL] Migration verification checks failed! Stopping with error.');
    process.exit(1);
  }

  console.log('\n[PASS] All verification checks passed! Migration complete.');
  dbManager.close();
  return { success: true, targetDbPath };
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  migrate,
};
