const fs = require('fs');
const path = require('path');

function resolveNativeBinding() {
  const isAsar = __dirname.includes('app.asar');
  const unpackedDir = __dirname.replace('app.asar', 'app.asar.unpacked');

  const candidates = [
    // 1. Unpacked asar path beside file (standard electron-builder unpacked)
    path.join(unpackedDir, 'better_sqlite3.node'),
    // 2. Direct beside file (dev mode or unpacked)
    !isAsar ? path.join(__dirname, 'better_sqlite3.node') : null,
    // 3. process.resourcesPath unpacked locations
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'better_sqlite3.node') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node') : null,
    // 4. Relative build/Release (dev mode fallback)
    path.join(__dirname, '..', 'build', 'Release', 'better_sqlite3.node'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate.includes('app.asar') && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 5. If inside asar and not found unpacked, extract it to a physical location so dlopen/LoadLibrary can load it
  const insideAsar = path.join(__dirname, 'better_sqlite3.node');
  if (fs.existsSync(insideAsar)) {
    try {
      if (!fs.existsSync(unpackedDir)) fs.mkdirSync(unpackedDir, { recursive: true });
      const targetUnpacked = path.join(unpackedDir, 'better_sqlite3.node');
      fs.copyFileSync(insideAsar, targetUnpacked);
      if (fs.existsSync(targetUnpacked)) return targetUnpacked;
    } catch {}

    try {
      const os = require('os');
      const tempDir = path.join(os.tmpdir(), 'code-systems-native');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const targetTemp = path.join(tempDir, 'better_sqlite3.node');
      if (!fs.existsSync(targetTemp) || fs.statSync(targetTemp).size !== fs.statSync(insideAsar).size) {
        fs.copyFileSync(insideAsar, targetTemp);
      }
      if (fs.existsSync(targetTemp)) return targetTemp;
    } catch {}
  }

  return null;
}

function createSqliteConnection(dbPath, customOptions = {}) {
  const nativeBinding = resolveNativeBinding();

  try {
    const BetterSqlite3 = require('better-sqlite3');
    const opts = { ...customOptions };
    if (nativeBinding && !opts.nativeBinding) {
      opts.nativeBinding = nativeBinding;
    }
    try {
      return new BetterSqlite3(dbPath, opts);
    } catch (bindErr) {
      if (opts.nativeBinding) {
        delete opts.nativeBinding;
        return new BetterSqlite3(dbPath, opts);
      }
      throw bindErr;
    }
  } catch (betterSqliteErr) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const syncDb = new DatabaseSync(dbPath, customOptions);
      return wrapNodeSqlite(syncDb);
    } catch {
      throw betterSqliteErr;
    }
  }
}

function wrapNodeSqlite(syncDb) {
  return {
    pragma(query) {
      if (!query) return [];
      const trimmed = query.trim();
      if (trimmed.toLowerCase().startsWith('integrity_check')) {
        return syncDb.prepare('PRAGMA integrity_check').all();
      }
      syncDb.exec(`PRAGMA ${trimmed}`);
      return [];
    },
    prepare(sql) {
      const stmt = syncDb.prepare(sql);
      return {
        all(...params) {
          const flat = Array.isArray(params[0]) && params.length === 1 ? params[0] : params;
          return stmt.all(...flat);
        },
        get(...params) {
          const flat = Array.isArray(params[0]) && params.length === 1 ? params[0] : params;
          return stmt.get(...flat) || null;
        },
        run(...params) {
          const flat = Array.isArray(params[0]) && params.length === 1 ? params[0] : params;
          return stmt.run(...flat);
        },
      };
    },
    exec(sql) {
      return syncDb.exec(sql);
    },
    transaction(fn) {
      return (...args) => {
        syncDb.exec('BEGIN IMMEDIATE');
        try {
          const result = fn(...args);
          syncDb.exec('COMMIT');
          return result;
        } catch (err) {
          syncDb.exec('ROLLBACK');
          throw err;
        }
      };
    },
    async backup(targetPath) {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const escaped = targetPath.replace(/'/g, "''");
      syncDb.exec(`VACUUM INTO '${escaped}'`);
      return { targetPath };
    },
    close() {
      try {
        syncDb.close();
      } catch {}
    },
  };
}

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

      this.db = createSqliteConnection(this.dbPath);
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
        const statements = sqlContent
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);

        for (const stmt of statements) {
          try {
            db.exec(stmt + ';');
          } catch (stmtErr) {
            if (stmtErr.message && stmtErr.message.toLowerCase().includes('duplicate column name')) {
              continue;
            }
            throw stmtErr;
          }
        }

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

  checkIntegrity(retries = 3, delayMs = 250) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const db = this.getDb();
        const rows = db.pragma('integrity_check');
        const list = Array.isArray(rows) ? rows : [rows];
        const details = list
          .map((r) => {
            if (!r) return '';
            if (typeof r === 'string') return r;
            return r.integrity_check || Object.values(r)[0] || String(r);
          })
          .filter(Boolean);

        const isOk = details.length > 0 && details.every((d) => String(d).trim().toLowerCase() === 'ok');
        if (isOk) {
          return {
            ok: true,
            details: ['ok'],
          };
        }

        // If not ok, check if this is a transient lock/busy condition
        const isBusy = details.some((d) => /busy|locked/i.test(String(d)));
        if (isBusy && attempt < retries) {
          try {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
          } catch {}
          continue;
        }

        return {
          ok: false,
          details,
        };
      } catch (err) {
        const isBusy = /busy|locked/i.test(err?.message || '');
        if (isBusy && attempt < retries) {
          try {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
          } catch {}
          continue;
        }
        if (attempt === retries) {
          return {
            ok: false,
            details: [err?.message || 'تعذر التحقق من سلامة قاعدة البيانات'],
          };
        }
      }
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
      const testDb = createSqliteConnection(sourcePath, { readonly: true });
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
