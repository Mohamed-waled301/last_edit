/**
 * Code Systems ERP - Editions Configuration Engine
 * Defines compile-time and runtime edition variants from a single unified codebase.
 * Supported Editions:
 *   1. 'cutting'  - Full Apparel Manufacturing & Workshop Stage Management (القص والتشغيل والمراحل)
 *   2. 'standard' - Commercial, Wholesale & Retail ERP without cutting workshop orders (الإصدار القياسي للتجارة والمخازن)
 */

export type EditionId = 'cutting' | 'standard';

export interface EditionFeatures {
  cutting: boolean;
  stages: boolean;
  manufacturing: boolean;
  workshops: boolean;
  cutOrderReports: boolean;
}

export interface EditionConfig {
  id: EditionId;
  name: string;
  nameArabic: string;
  appTitle: string;
  appId: string;
  dbName: string;
  userDataDirName: string;
  features: EditionFeatures;
}

export const EDITIONS: Record<EditionId, EditionConfig> = {
  cutting: {
    id: 'cutting',
    name: 'Apparel Cutting & Manufacturing Edition',
    nameArabic: 'إصدار مصانع الملابس وقص وتشغيل المراحل',
    appTitle: 'code systems - إصدار القص وتشغيل المراحل',
    appId: 'com.codesystems.cutting.app',
    dbName: 'ApexEnterpriseERP_DB_v5',
    userDataDirName: 'code-systems', // Preserves existing user data seamlessly
    features: {
      cutting: true,
      stages: true,
      manufacturing: true,
      workshops: true,
      cutOrderReports: true,
    },
  },
  standard: {
    id: 'standard',
    name: 'Standard Commercial & Inventory Edition',
    nameArabic: 'الإصدار التجاري والمخزني القياسي',
    appTitle: 'code systems - الإصدار القياسي',
    appId: 'com.codesystems.standard.app',
    dbName: 'CodeSystemsStandard_DB_v1',
    userDataDirName: 'code-systems-standard',
    features: {
      cutting: false,
      stages: false,
      manufacturing: false,
      workshops: false,
      cutOrderReports: false,
    },
  },
};

/**
 * Returns the currently active edition ID.
 * Priority: localStorage override > process.env.EDITION > compile-time __EDITION__ > 'cutting'
 */
export function getActiveEdition(): EditionId {
  // 1. Runtime override (for testing, e2e, dynamic switching)
  if (typeof window !== 'undefined' && window.localStorage) {
    const override = window.localStorage.getItem('__APP_EDITION_OVERRIDE__');
    if (override === 'standard' || override === 'cutting') {
      return override as EditionId;
    }
  }

  // 2. Process env (in Node/Vitest/Electron/Vite runtime)
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.EDITION === 'standard' || process.env.VITE_EDITION === 'standard') {
      return 'standard';
    }
    if (process.env.EDITION === 'cutting' || process.env.VITE_EDITION === 'cutting') {
      return 'cutting';
    }
  }

  // 3. Compile-time define injected by Vite
  if (typeof __EDITION__ !== 'undefined' && __EDITION__) {
    return __EDITION__;
  }

  return 'cutting';
}

/**
 * Returns the active edition configuration object.
 */
export function getActiveEditionConfig(): EditionConfig {
  const edition = getActiveEdition();
  return EDITIONS[edition] || EDITIONS.cutting;
}

/**
 * Checks whether a specific feature is enabled in the active edition.
 */
export function isFeatureEnabled(feature: keyof EditionFeatures): boolean {
  const config = getActiveEditionConfig();
  return Boolean(config.features[feature]);
}

/**
 * Validates cross-edition backup compatibility.
 * Rejects restoring a cutting backup into standard edition or vice versa.
 */
export function validateBackupCompatibility(
  backupEdition: string | undefined | null,
  activeEdition: EditionId = getActiveEdition()
): { compatible: boolean; message?: string } {
  // If backup does not specify an edition (legacy v1-v4 backups), treat as 'cutting'
  const sourceEdition: EditionId = (backupEdition === 'standard') ? 'standard' : 'cutting';

  if (sourceEdition !== activeEdition) {
    const sourceName = EDITIONS[sourceEdition]?.nameArabic || sourceEdition;
    const currentName = EDITIONS[activeEdition]?.nameArabic || activeEdition;
    return {
      compatible: false,
      message: `لا يمكن استعادة هذه النسخة الاحتياطية لأنها خاصة بـ (${sourceName}) بينما البرنامج الحالي يعمل بنظام (${currentName}). استعادة بيانات إصدار مختلف قد تؤدي إلى تعارض في سجلات الحسابات والمراحل.`,
    };
  }

  return { compatible: true };
}
