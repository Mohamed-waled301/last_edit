import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EDITIONS,
  getActiveEdition,
  getActiveEditionConfig,
  isFeatureEnabled,
  validateBackupCompatibility,
  EditionId,
} from '../editionConfig';

describe('Part C: Product Split into Two Editions (Cutting & Standard)', () => {
  const originalEnv = process.env.EDITION;

  afterEach(() => {
    process.env.EDITION = originalEnv;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('__APP_EDITION_OVERRIDE__');
    }
  });

  describe('1. Edition Configurations & Differentiation', () => {
    it('defines cutting edition with correct metadata, app ID, DB, and feature flags', () => {
      const cutting = EDITIONS.cutting;
      expect(cutting).toBeDefined();
      expect(cutting.id).toBe('cutting');
      expect(cutting.appId).toBe('com.codesystems.cutting.app');
      expect(cutting.dbName).toBe('ApexEnterpriseERP_DB_v5');
      expect(cutting.userDataDirName).toBe('code-systems');
      expect(cutting.features.cutting).toBe(true);
      expect(cutting.features.stages).toBe(true);
      expect(cutting.features.manufacturing).toBe(true);
      expect(cutting.features.cutOrderReports).toBe(true);
    });

    it('defines standard edition with correct metadata, app ID, DB, and feature flags', () => {
      const standard = EDITIONS.standard;
      expect(standard).toBeDefined();
      expect(standard.id).toBe('standard');
      expect(standard.appId).toBe('com.codesystems.standard.app');
      expect(standard.dbName).toBe('CodeSystemsStandard_DB_v1');
      expect(standard.userDataDirName).toBe('code-systems-standard');
      expect(standard.features.cutting).toBe(false);
      expect(standard.features.stages).toBe(false);
      expect(standard.features.manufacturing).toBe(false);
      expect(standard.features.cutOrderReports).toBe(false);
    });

    it('ensures appIds and dbNames are strictly distinct between editions', () => {
      expect(EDITIONS.cutting.appId).not.toBe(EDITIONS.standard.appId);
      expect(EDITIONS.cutting.dbName).not.toBe(EDITIONS.standard.dbName);
      expect(EDITIONS.cutting.userDataDirName).not.toBe(EDITIONS.standard.userDataDirName);
    });
  });

  describe('2. Active Edition Detection & Runtime Feature Flagging', () => {
    it('detects standard edition when EDITION=standard', () => {
      process.env.EDITION = 'standard';
      expect(getActiveEdition()).toBe('standard');
      expect(getActiveEditionConfig().id).toBe('standard');
      expect(isFeatureEnabled('cutting')).toBe(false);
      expect(isFeatureEnabled('manufacturing')).toBe(false);
      expect(isFeatureEnabled('stages')).toBe(false);
    });

    it('detects cutting edition when EDITION=cutting', () => {
      process.env.EDITION = 'cutting';
      expect(getActiveEdition()).toBe('cutting');
      expect(getActiveEditionConfig().id).toBe('cutting');
      expect(isFeatureEnabled('cutting')).toBe(true);
      expect(isFeatureEnabled('manufacturing')).toBe(true);
      expect(isFeatureEnabled('stages')).toBe(true);
    });

    it('supports runtime override via localStorage for client-side testing', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('__APP_EDITION_OVERRIDE__', 'standard');
        expect(getActiveEdition()).toBe('standard');
        expect(isFeatureEnabled('cutting')).toBe(false);

        window.localStorage.setItem('__APP_EDITION_OVERRIDE__', 'cutting');
        expect(getActiveEdition()).toBe('cutting');
        expect(isFeatureEnabled('cutting')).toBe(true);
      }
    });
  });

  describe('3. Cross-Edition Backup & Restore Safety Guard', () => {
    it('allows restoring cutting backup into cutting edition', () => {
      const res = validateBackupCompatibility('cutting', 'cutting');
      expect(res.compatible).toBe(true);
      expect(res.message).toBeUndefined();
    });

    it('allows restoring standard backup into standard edition', () => {
      const res = validateBackupCompatibility('standard', 'standard');
      expect(res.compatible).toBe(true);
      expect(res.message).toBeUndefined();
    });

    it('rejects restoring cutting backup into standard edition with Arabic error explanation', () => {
      const res = validateBackupCompatibility('cutting', 'standard');
      expect(res.compatible).toBe(false);
      expect(res.message).toContain('لا يمكن استعادة هذه النسخة الاحتياطية');
      expect(res.message).toContain('إصدار مصانع الملابس وقص وتشغيل المراحل');
      expect(res.message).toContain('الإصدار التجاري والمخزني القياسي');
    });

    it('rejects restoring standard backup into cutting edition with Arabic error explanation', () => {
      const res = validateBackupCompatibility('standard', 'cutting');
      expect(res.compatible).toBe(false);
      expect(res.message).toContain('لا يمكن استعادة هذه النسخة الاحتياطية');
      expect(res.message).toContain('الإصدار التجاري والمخزني القياسي');
      expect(res.message).toContain('إصدار مصانع الملابس وقص وتشغيل المراحل');
    });

    it('treats legacy backups (without edition field) as cutting edition', () => {
      // Legacy v1-v4 backups have undefined edition
      const intoCutting = validateBackupCompatibility(undefined, 'cutting');
      expect(intoCutting.compatible).toBe(true);

      const intoStandard = validateBackupCompatibility(undefined, 'standard');
      expect(intoStandard.compatible).toBe(false);
      expect(intoStandard.message).toContain('لا يمكن استعادة هذه النسخة الاحتياطية');
    });
  });
});
