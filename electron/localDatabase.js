const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

class LocalDatabaseManager {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.dbPath = path.join(userDataPath, 'apex-erp.db');
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.db = null;
  }

  getDb() {
    if (!this.db) {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('busy_timeout = 5000');

      // Run pending migrations automatically
      this.runMigrations();
    }
    return this.db;
  }

  query(sql, params = []) {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    return stmt.all(...(Array.isArray(params) ? params : [params]));
  }

  get(sql, params = []) {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    return stmt.get(...(Array.isArray(params) ? params : [params])) || null;
  }

  run(sql, params = []) {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    return stmt.run(...(Array.isArray(params) ? params : [params]));
  }

  exec(sql) {
    const db = this.getDb();
    return db.exec(sql);
  }

  executeTransaction(operations = []) {
    const db = this.getDb();
    const runTx = db.transaction((ops) => {
      const results = [];
      for (const op of ops) {
        if (!op || !op.sql) continue;
        const stmt = db.prepare(op.sql);
        const params = op.params || [];
        if (op.type === 'query') {
          results.push(stmt.all(...params));
        } else if (op.type === 'get') {
          results.push(stmt.get(...params) || null);
        } else {
          results.push(stmt.run(...params));
        }
      }
      return results;
    });
    return runTx(operations);
  }

  runMigrations() {
    const db = this.db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS \`schema_version\` (
        \`version\` INTEGER PRIMARY KEY,
        \`applied_at\` TEXT NOT NULL,
        \`description\` TEXT NOT NULL
      );
    `);

    const appliedRows = db.prepare('SELECT version FROM `schema_version`').all();
    const appliedSet = new Set(appliedRows.map((r) => r.version));

    if (!fs.existsSync(this.migrationsDir)) {
      return { appliedCount: 0 };
    }

    const migrationFiles = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of migrationFiles) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const versionNum = parseInt(match[1], 10);
      const description = match[2];

      if (appliedSet.has(versionNum)) {
        continue;
      }

      const filePath = path.join(this.migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      const applyMigration = db.transaction(() => {
        db.exec(sqlContent);
        db.prepare(
          'INSERT INTO `schema_version` (version, applied_at, description) VALUES (?, ?, ?)'
        ).run(versionNum, new Date().toISOString(), description);
      });

      applyMigration();
      appliedSet.add(versionNum);
      appliedCount++;
    }

    return { appliedCount };
  }

  checkIntegrity() {
    try {
      const db = this.getDb();
      const rows = db.pragma('integrity_check');
      const isOk = rows.length === 1 && rows[0].integrity_check === 'ok';
      return {
        ok: isOk,
        details: rows.map((r) => r.integrity_check),
      };
    } catch (err) {
      return {
        ok: false,
        details: [err.message],
      };
    }
  }

  async backupDatabase(targetPath) {
    try {
      const db = this.getDb();
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await db.backup(targetPath);
      return { success: true, targetPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async restoreDatabase(sourcePath) {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: 'ملف النسخة الاحتياطية غير موجود' };
      }

      // 1. Verify backup file integrity before restoring
      const testDb = new Database(sourcePath, { readonly: true });
      const integrity = testDb.pragma('integrity_check');
      testDb.close();

      if (!integrity || integrity[0]?.integrity_check !== 'ok') {
        return { success: false, error: 'ملف النسخة الاحتياطية تالف أو غير صالح' };
      }

      // 2. Create automatic pre-restore safety backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const preRestorePath = path.join(this.userDataPath, `apex-erp.pre-restore-${timestamp}.db`);

      if (this.db) {
        await this.db.backup(preRestorePath);
        this.db.close();
        this.db = null;
      }

      // 3. Remove existing WAL and SHM files to ensure clean state
      const walPath = `${this.dbPath}-wal`;
      const shmPath = `${this.dbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      // 4. Copy source over dbPath
      fs.copyFileSync(sourcePath, this.dbPath);

      // 5. Reopen and verify
      const restoredDb = this.getDb();
      const postCheck = restoredDb.pragma('integrity_check');

      if (!postCheck || postCheck[0]?.integrity_check !== 'ok') {
        return { success: false, error: 'فشل التحقق من قاعدة البيانات بعد الاسترجاع' };
      }

      return {
        success: true,
        preRestoreBackupPath: preRestorePath,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // Auto-backup safeguard (keeps last 10 backups)
  async autoBackupOnClose(backupDirectory) {
    try {
      const dir = backupDirectory || path.join(this.userDataPath, 'backups');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const fileName = `apex-erp-backup-${dateStr}.db`;
      const targetPath = path.join(dir, fileName);

      await this.backupDatabase(targetPath);

      // Retain only last 10 backups
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('apex-erp-backup-') && f.endsWith('.db'))
        .map((f) => {
          const full = path.join(dir, f);
          const stat = fs.statSync(full);
          return { name: f, path: full, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 10) {
        const toDelete = files.slice(10);
        for (const item of toDelete) {
          try {
            fs.unlinkSync(item.path);
          } catch {}
        }
      }

      return { success: true, targetPath };
    } catch (err) {
      console.warn('[AutoBackup SQLite] Error:', err.message);
      return { success: false, error: err.message };
    }
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

module.exports = {
  LocalDatabaseManager,
};
