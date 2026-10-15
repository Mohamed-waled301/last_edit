import db, { ensureDatabaseIntegrity } from '../db';
import * as XLSX from 'xlsx';
import settingsRepo from './settingsRepo';
import auditRepo from './auditRepo';
import { getActiveEdition, getActiveEditionConfig, validateBackupCompatibility } from '../../editions/editionConfig';

export const backupRepo = {
  /**
   * In-memory JSON backup payload object for all Dexie tables
   */
  async getBackupPayload() {
    const tableNames = db.tables.map(t => t.name);
    const backupData = {};

    for (const name of tableNames) {
      backupData[name] = await db.table(name).toArray();
    }

    const activeEdition = getActiveEdition();
    const config = getActiveEditionConfig();

    return {
      app: 'CodeSystemsERP',
      edition: activeEdition,
      editionName: config.nameArabic,
      version: 5,
      exportedAt: new Date().toISOString(),
      tablesCount: tableNames.length,
      data: backupData,
    };
  },

  /**
   * 1. Export ALL Dexie tables into a single JSON file and trigger browser download.
   */
  async exportAllData() {
    const payload = await this.getBackupPayload();

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    const prefix = payload.edition === 'standard' ? 'نسخة_احتياطية_الاصدار_القياسي' : 'نسخة_احتياطية_مصنع_الملابس';
    a.download = `${prefix}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Record last backup timestamp
    await settingsRepo.recordBackupTime();
    return { success: true, timestamp: payload.exportedAt };
  },

  /**
   * 2. Import JSON backup file and restore all Dexie tables inside an atomic transaction.
   */
  async importAllData(jsonContent, userId = 'usr-owner') {
    let parsed;
    try {
      parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    } catch {
      throw new Error('ملف النسخة الاحتياطية غير صالح (ملف تالف)');
    }

    if (!parsed || !parsed.data) {
      throw new Error('صيغة ملف النسخة الاحتياطية غير معتمدة');
    }

    // Reject cross-edition restore attempts with clear Arabic explanation
    const validation = validateBackupCompatibility(parsed.edition, getActiveEdition());
    if (!validation.compatible) {
      throw new Error(validation.message);
    }

    await ensureDatabaseIntegrity();
    const backupData = parsed.data;
    const tableNames = db.tables.map(t => t.name);

    await db.transaction('rw', db.tables, async () => {
      // Clear existing records
      for (const table of db.tables) {
        await table.clear();
      }

      // Restore each table
      for (const name of tableNames) {
        if (Array.isArray(backupData[name]) && backupData[name].length > 0) {
          await db.table(name).bulkAdd(backupData[name]);
        }
      }
    });

    await auditRepo.log(userId, 'RESTORE_BACKUP', 'system', 'all', null, { importedAt: new Date().toISOString() });
    return { success: true };
  },


  /**
   * 4. Clear all database data.
   */
  async clearAllData(userId = 'usr-owner') {
    await ensureDatabaseIntegrity();

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });

    await ensureDatabaseIntegrity();
    return { success: true };
  },

  /**
   * 5. Export table/report data to Excel (.xlsx) using SheetJS.
   */
  exportToExcel(dataArray, fileName = 'تقرير_مصنع_الملابس', sheetName = 'البيانات') {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      alert('لا توجد بيانات متاحة للتصدير');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataArray);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Apply RTL view to worksheet
    if (!worksheet['!views']) worksheet['!views'] = [];
    worksheet['!views'].push({ rightToLeft: true });

    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  /**
   * 6. Check and request persistent browser storage.
   */
  async checkStoragePersistence() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          const granted = await navigator.storage.persist();
          return granted;
        }
        return true;
      } catch (e) {
        console.warn('Storage persist request error:', e);
        return false;
      }
    }
    return false;
  },

  /**
   * 7. Native Local SQLite Database Backup (Electron)
   */
  async backupSqliteDatabase() {
    if (typeof window !== 'undefined' && window.electronAPI?.db) {
      const targetPath = await window.electronAPI.db.chooseBackupLocation();
      if (!targetPath) return { canceled: true };
      const res = await window.electronAPI.db.backup(targetPath);
      if (!res.success) throw new Error(res.error || 'فشل حفظ النسخة الاحتياطية لقاعدة البيانات');
      await settingsRepo.recordBackupTime();
      return { success: true, targetPath };
    }
    return this.exportAllData();
  },

  /**
   * 8. Native Local SQLite Database Restore (Electron)
   */
  async restoreSqliteDatabase() {
    if (typeof window !== 'undefined' && window.electronAPI?.db) {
      const sourcePath = await window.electronAPI.db.chooseRestoreFile();
      if (!sourcePath) return { canceled: true };
      const res = await window.electronAPI.db.restore(sourcePath);
      if (!res.success) throw new Error(res.error || 'فشل استرجاع قاعدة البيانات من الملف المحدد');
      return { success: true, ...res };
    }
    throw new Error('الاسترجاع المباشر متاح داخل تطبيق سطح المكتب');
  }
};

export default backupRepo;
