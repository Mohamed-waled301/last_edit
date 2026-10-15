import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import db from '../../data/db';
import { dataManagementRepo } from '../../data';
import { setActiveUser, getActiveUser } from '../../services/api';

describe('Data Management (إدارة البيانات) - CEO Security & Audit', () => {
  beforeEach(async () => {
    await db.open();
    await db.items.clear();
    await db.audit_log.clear();
    await db.bom_items.clear();
    await db.treasury_accounts.clear();
    await db.cash_transactions.clear();
    // Default to owner (CEO)
    setActiveUser('usr-owner', 'owner', 'المدير التنفيذي');
  });

  it('allows CEO to retrieve dynamic list of all tables from Dexie schema', async () => {
    const tables = await dataManagementRepo.getTables();
    expect(Array.isArray(tables)).toBe(true);
    expect(tables.length).toBeGreaterThan(15);
    const itemTable = tables.find((t) => t.name === 'items');
    expect(itemTable).toBeDefined();
    expect(itemTable?.label).toBe('الأصناف الرئيسية');
  });

  it('allows CEO to create, update and write to audit log automatically', async () => {
    const created = await dataManagementRepo.createRecord(
      'items',
      {
        id: 'itm-test-01',
        code: 'ITM-999',
        name: 'قماش كتان بيج فاخر',
        cost_price: 150,
      },
      'إضافة صنف للتجربة'
    );

    expect(created.id).toBe('itm-test-01');
    const stored = await db.items.get('itm-test-01');
    expect(stored?.name).toBe('قماش كتان بيج فاخر');

    // Check audit log was written
    const logs = await db.audit_log.toArray();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const lastLog = logs[logs.length - 1];
    expect(lastLog.entity_type).toBe('items');
    expect(lastLog.action).toBe('add');
    expect(lastLog.entity_id).toBe('itm-test-01');
  });

  it('STRICTLY rejects non-CEO attempts to modify data and writes security audit log', async () => {
    // Switch to non-CEO role (cashier or storekeeper)
    setActiveUser('usr-cashier', 'cashier', 'أمين الصندوق');

    await expect(
      dataManagementRepo.createRecord('items', {
        id: 'itm-hacker-01',
        name: 'محاولة اختراق',
      })
    ).rejects.toThrow('غير مصرح');

    // Verify security violation was logged
    const logs = await db.audit_log.where('action').equals('UNAUTHORIZED_DATA_ACCESS').toArray();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].user_id).toBe('usr-cashier');
  });

  it('prevents direct modification or deletion of the audit_log table itself (read-only)', async () => {
    await expect(
      dataManagementRepo.deleteRecord('audit_log', 'any-id', 'attempt')
    ).rejects.toThrow('لا يمكن حذف أي سجل من سجل التعديلات');

    await expect(
      dataManagementRepo.createRecord('audit_log', { id: 'aud-fake' }, 'attempt')
    ).rejects.toThrow('سجل التعديلات مخصص للقراءة فقط');
  });

  it('blocks deletion when record is referenced by another table (Foreign Key Integrity)', async () => {
    // Create an item
    await dataManagementRepo.createRecord('items', {
      id: 'itm-master-parent',
      code: 'ITM-PARENT',
      name: 'قماش صوف إيطالي',
    });

    // Create a BOM item referencing this item
    await db.bom_items.add({
      id: 'bom-01',
      product_id: 'prd-shirt-01',
      raw_material_id: 'itm-master-parent',
    });

    // Attempting to delete this item must be blocked
    await expect(
      dataManagementRepo.deleteRecord('items', 'itm-master-parent')
    ).rejects.toThrow('لا يمكن حذف هذا السجل لوجود سجلات مرتبطة به');
  });
});
