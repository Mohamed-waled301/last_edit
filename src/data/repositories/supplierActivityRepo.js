import db from '../db';
import auditRepo from './auditRepo';

export const BASE_SUPPLIER_ACTIVITY_TYPES = [
  { id: 'sat-materials', name: 'توريد خامات ومستلزمات إنتاج', code: 'materials', is_default: 1, is_active: 1 },
  { id: 'sat-printing', name: 'طباعة', code: 'printing', is_default: 1, is_active: 1 },
  { id: 'sat-embroidery', name: 'تطريز', code: 'embroidery', is_default: 1, is_active: 1 },
  { id: 'sat-sewing', name: 'حياكة', code: 'sewing', is_default: 1, is_active: 1 }
];

export const supplierActivityRepo = {
  /**
   * Ensures base default activity types are present in Dexie
   */
  async ensureBaseTypesSeeded() {
    if (!db.supplier_activity_types) return;
    try {
      const count = await db.supplier_activity_types.count();
      if (count === 0) {
        const seeded = BASE_SUPPLIER_ACTIVITY_TYPES.map((t) => ({
          ...t,
          created_at: new Date().toISOString()
        }));
        await db.supplier_activity_types.bulkPut(seeded);
      }
    } catch (err) {
      console.warn('Warning during ensureBaseTypesSeeded:', err);
    }
  },

  /**
   * Get all supplier activity types.
   * Automatically seeds with the 4 base default types if empty.
   */
  async getActivityTypes() {
    if (!db.supplier_activity_types) {
      return [...BASE_SUPPLIER_ACTIVITY_TYPES];
    }

    try {
      await this.ensureBaseTypesSeeded();
      const list = await db.supplier_activity_types.filter((t) => t.is_active === 1).toArray();
      return list && list.length > 0 ? list : [...BASE_SUPPLIER_ACTIVITY_TYPES];
    } catch (err) {
      console.warn('Error fetching supplier activity types:', err);
      return [...BASE_SUPPLIER_ACTIVITY_TYPES];
    }
  },

  /**
   * Create a new supplier activity type dynamically.
   * Validates non-empty name and rejects duplicates (Arabic validation messages).
   */
  async createActivityType(data, userId = 'usr-purchasing') {
    const rawName = typeof data === 'string' ? data : (data?.name || '');
    const name = rawName.trim();
    if (!name) {
      throw new Error('اسم نوع النشاط مطلوب');
    }

    if (db.supplier_activity_types) {
      await this.ensureBaseTypesSeeded();

      const existing = await db.supplier_activity_types
        .filter((t) => t.is_active === 1 && t.name.trim().toLowerCase() === name.toLowerCase())
        .first()
        .catch(() => null);

      if (existing) {
        throw new Error('نوع نشاط المورد مسجل مسبقاً');
      }

      const newType = {
        id: (typeof data === 'object' && data.id) ? data.id : `sat-${Date.now()}`,
        name,
        code: (typeof data === 'object' && data.code ? data.code : name).trim(),
        is_default: 0,
        is_active: 1,
        created_at: new Date().toISOString()
      };

      await db.supplier_activity_types.add(newType);
      await auditRepo.log(userId, 'CREATE_SUPPLIER_ACTIVITY_TYPE', 'supplier_activity_types', newType.id, null, newType).catch(() => {});
      return newType;
    }

    return {
      id: `sat-${Date.now()}`,
      name,
      code: name,
      is_default: 0,
      is_active: 1,
      created_at: new Date().toISOString()
    };
  }
};

export default supplierActivityRepo;
