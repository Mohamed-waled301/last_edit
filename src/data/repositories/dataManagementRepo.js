import db, { SCHEMA_V1 } from '../db';
import { getActiveUser } from '../../services/api';
import { syncPush } from '../../services/apiSync';
import BalanceCalculator, { resolveOpeningBalance } from '../../logic/balances';

/**
 * Arabic names mapping for all system tables
 */
export const TABLE_METADATA = {
  items: { label: 'الأصناف الرئيسية', group: 'الأصناف والمخزون' },
  item_sizes: { label: 'مقاسات الأصناف', group: 'الأصناف والمخزون' },
  item_colors: { label: 'ألوان الأصناف', group: 'الأصناف والمخزون' },
  materials: { label: 'الخامات ومستلزمات الإنتاج', group: 'الأصناف والمخزون' },
  products: { label: 'المنتجات والموديلات', group: 'الأصناف والمخزون' },
  bom_items: { label: 'بطاقة مقادير الخامات', group: 'الأصناف والمخزون' },
  storage_locations: { label: 'مواقع ومستودعات التخزين', group: 'الأصناف والمخزون' },
  stock_movements: { label: 'حركات المخزون', group: 'الأصناف والمخزون' },
  stock_transfers: { label: 'التحويلات المخزنية', group: 'الأصناف والمخزون' },
  stock_adjustments: { label: 'تسويات الجرد المخزني', group: 'الأصناف والمخزون' },
  stock_counts: { label: 'محاضر الجرد الدوري', group: 'الأصناف والمخزون' },
  stock_count_items: { label: 'بنود محاضر الجرد', group: 'الأصناف والمخزون' },

  parties: { label: 'جهات التعامل الموحدة', group: 'العملاء والموردين' },
  suppliers: { label: 'الموردين', group: 'العملاء والموردين' },
  customers: { label: 'العملاء', group: 'العملاء والموردين' },

  purchase_orders: { label: 'أوامر الشراء', group: 'المشتريات' },
  purchase_order_items: { label: 'بنود أوامر الشراء', group: 'المشتريات' },
  goods_receipts: { label: 'أذون استلام البضاعة', group: 'المشتريات' },
  goods_receipt_items: { label: 'بنود أذون الاستلام', group: 'المشتريات' },
  supplier_invoices: { label: 'فواتير الموردين', group: 'المشتريات' },
  payments: { label: 'سندات صرف الموردين', group: 'المشتريات' },
  supplier_returns: { label: 'مرتجعات الموردين', group: 'المشتريات' },

  production_orders: { label: 'أوامر التصنيع والتشغيل', group: 'التصنيع والإنتاج' },
  production_material_usage: { label: 'صرف خامات الإنتاج', group: 'التصنيع والإنتاج' },
  outsourced_orders: { label: 'أوامر التشغيل لدى الغير', group: 'التصنيع والإنتاج' },
  finishing_orders: { label: 'أوامر التجهيز والتشطيب', group: 'التصنيع والإنتاج' },
  finishing_materials: { label: 'خامات أوامر التشطيب', group: 'التصنيع والإنتاج' },
  overheads: { label: 'التكاليف غير المباشرة', group: 'التصنيع والإنتاج' },

  sales_invoices: { label: 'فواتير المبيعات', group: 'المبيعات والخزائن' },
  sales_invoice_items: { label: 'بنود فواتير المبيعات', group: 'المبيعات والخزائن' },
  sales_outlets: { label: 'معارض ومنافذ البيع', group: 'المبيعات والخزائن' },
  customer_payments: { label: 'سندات تحصيل العملاء', group: 'المبيعات والخزائن' },
  customer_returns: { label: 'مرتجعات المبيعات', group: 'المبيعات والخزائن' },
  treasury_accounts: { label: 'حسابات الخزائن والبنوك', group: 'المبيعات والخزائن' },
  cash_transactions: { label: 'حركات النقدية والمصروفات', group: 'المبيعات والخزائن' },
  expense_codes: { label: 'بنود ودليل المصروفات', group: 'المبيعات والخزائن' },
  daily_closings: { label: 'تقفيل الورديات اليومية', group: 'المبيعات والخزائن' },
  payment_methods: { label: 'طرق الدفع والسداد', group: 'المبيعات والخزائن' },

  users: { label: 'المستخدمين والصلاحيات', group: 'إدارة النظام' },
  settings: { label: 'إعدادات النظام والمنشأة', group: 'إدارة النظام' },
  audit_log: { label: 'سجل التعديلات والرقابة', group: 'إدارة النظام' },
};

export const COLUMN_LABELS = {
  id: 'المعرف',
  code: 'الكود',
  name: 'الاسم',
  full_name: 'الاسم الكامل',
  username: 'اسم المستخدم',
  role: 'الصلاحية / الدور',
  phone: 'رقم الهاتف',
  notes: 'ملاحظات',
  status: 'الحالة',
  created_at: 'تاريخ الإنشاء',
  updated_at: 'تاريخ التعديل',
  is_active: 'مفعل',
  total_amount: 'المبلغ الإجمالي',
  paid_amount: 'المبلغ المدفوع',
  remaining_amount: 'المبلغ المتبقي',
  due_date: 'تاريخ الاستحقاق',
  invoice_date: 'تاريخ الفاتورة',
  order_date: 'تاريخ الطلب',
  cost_price: 'سعر التكلفة',
  selling_price: 'سعر البيع',
  current_balance: 'الرصيد الحالي',
  current_stock: 'رصيد المخزون',
  unit: 'الوحدة',
  action: 'العملية',
  operation: 'نوع العملية',
  entity_type: 'اسم الجدول',
  table_name: 'اسم الجدول',
  entity_id: 'معرف السجل',
  record_id: 'معرف السجل',
  user_id: 'المستخدم',
  user_name: 'اسم المستخدم',
  reason: 'السبب',
  opening_balance: 'رصيد أول المدة',
  opening_balance_type: 'طبيعة الحساب (دائن/مدين)',
  supplier_opening_balance: 'رصيد أول المدة (مورد)',
  supplier_opening_type: 'طبيعة حساب المورد',
  customer_opening_balance: 'رصيد أول المدة (عميل)',
  customer_opening_type: 'طبيعة حساب العميل',
};

/**
 * Foreign key references definitions across tables
 */
const FOREIGN_KEY_REFERENCES = {
  items: [
    { table: 'bom_items', field: 'product_id', label: 'بطاقة مقادير المنتجات' },
    { table: 'bom_items', field: 'raw_material_id', label: 'خامات بطاقة المقادير' },
    { table: 'stock_movements', field: 'material_id', label: 'حركات المخزون' },
    { table: 'purchase_order_items', field: 'material_id', label: 'بنود أوامر الشراء' },
    { table: 'sales_invoice_items', field: 'product_id', label: 'بنود فواتير المبيعات' },
    { table: 'production_orders', field: 'product_id', label: 'أوامر الإنتاج والتصنيع' },
  ],
  materials: [
    { table: 'bom_items', field: 'raw_material_id', label: 'بطاقة مقادير الخامات' },
    { table: 'stock_movements', field: 'material_id', label: 'حركات المخزون' },
    { table: 'purchase_order_items', field: 'material_id', label: 'بنود أوامر الشراء' },
    { table: 'goods_receipt_items', field: 'material_id', label: 'بنود استلام البضاعة' },
    { table: 'supplier_returns', field: 'material_id', label: 'مرتجعات الموردين' },
    { table: 'production_material_usage', field: 'raw_material_id', label: 'خامات أوامر التصنيع' },
  ],
  products: [
    { table: 'bom_items', field: 'product_id', label: 'بطاقة مقادير الخامات' },
    { table: 'sales_invoice_items', field: 'product_id', label: 'بنود فواتير المبيعات' },
    { table: 'production_orders', field: 'product_id', label: 'أوامر التصنيع' },
    { table: 'customer_returns', field: 'product_id', label: 'مرتجعات المبيعات' },
  ],
  parties: [
    { table: 'purchase_orders', field: 'supplier_id', label: 'أوامر الشراء' },
    { table: 'supplier_invoices', field: 'supplier_id', label: 'فواتير الموردين' },
    { table: 'payments', field: 'supplier_id', label: 'سندات صرف الموردين' },
    { table: 'sales_invoices', field: 'customer_id', label: 'فواتير المبيعات' },
    { table: 'customer_payments', field: 'customer_id', label: 'سندات تحصيل العملاء' },
  ],
  suppliers: [
    { table: 'purchase_orders', field: 'supplier_id', label: 'أوامر الشراء' },
    { table: 'goods_receipts', field: 'supplier_id', label: 'أذون استلام البضاعة' },
    { table: 'supplier_invoices', field: 'supplier_id', label: 'فواتير الموردين' },
    { table: 'payments', field: 'supplier_id', label: 'سندات الصرف' },
    { table: 'outsourced_orders', field: 'supplier_id', label: 'أوامر التشغيل لدى الغير' },
  ],
  customers: [
    { table: 'sales_invoices', field: 'customer_id', label: 'فواتير المبيعات' },
    { table: 'customer_payments', field: 'customer_id', label: 'سندات التحصيل' },
    { table: 'customer_returns', field: 'customer_id', label: 'مرتجعات المبيعات' },
  ],
  treasury_accounts: [
    { table: 'cash_transactions', field: 'account_id', label: 'حركات النقدية' },
    { table: 'payments', field: 'account_id', label: 'سندات الصرف' },
    { table: 'customer_payments', field: 'account_id', label: 'سندات التحصيل' },
    { table: 'daily_closings', field: 'treasury_id', label: 'تقفيل الورديات' },
  ],
  storage_locations: [
    { table: 'stock_movements', field: 'location_id', label: 'حركات المخزون' },
    { table: 'stock_transfers', field: 'from_location_id', label: 'تحويلات مخزنية صادرة' },
    { table: 'stock_transfers', field: 'to_location_id', label: 'تحويلات مخزنية واردة' },
  ],
  purchase_orders: [
    { table: 'purchase_order_items', field: 'po_id', label: 'بنود أمر الشراء' },
    { table: 'goods_receipts', field: 'po_id', label: 'أذون الاستلام' },
    { table: 'supplier_invoices', field: 'po_id', label: 'فواتير المورد' },
  ],
  sales_invoices: [
    { table: 'sales_invoice_items', field: 'invoice_id', label: 'بنود الفاتورة' },
    { table: 'customer_payments', field: 'invoice_id', label: 'سندات التحصيل المرتبطة' },
    { table: 'customer_returns', field: 'invoice_id', label: 'مرتجعات الفاتورة' },
  ],
  production_orders: [
    { table: 'production_material_usage', field: 'production_order_id', label: 'استهلاك الخامات' },
    { table: 'outsourced_orders', field: 'production_order_id', label: 'أوامر التشغيل لدى الغير' },
    { table: 'finishing_orders', field: 'production_order_id', label: 'أوامر التشطيب' },
  ],
};

/**
 * Verify CEO role at data layer.
 * Note: This is application-level control only (frontend-only app without an authenticated server).
 */
function assertCeoRole(operation = 'edit', tableName = 'system') {
  const user = getActiveUser();
  if (!user || user.role !== 'owner') {
    // Log unauthorized attempt to audit log
    try {
      db.audit_log.add({
        id: `aud-sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: user?.id || 'anonymous',
        user_name: user?.full_name || 'مستخدم غير مصرح',
        action: 'UNAUTHORIZED_DATA_ACCESS',
        operation: 'UNAUTHORIZED_DATA_ACCESS',
        entity_type: tableName,
        table_name: tableName,
        entity_id: null,
        record_id: null,
        old_data: null,
        new_data: JSON.stringify({ attempted_operation: operation, user }),
        reason: 'محاولة تعديل بيانات النظام مباشرة بدون صلاحية الإدارة العليا',
        created_at: new Date().toISOString(),
      }).catch(() => {});
    } catch (e) {}

    throw new Error('غير مصرح. هذه العملية مخصصة للإدارة العليا فقط.');
  }
}

function getRequiredTransactionStores(tableName) {
  const allNeeded = new Set([
    tableName,
    'audit_log',
    'treasury_accounts',
    'cash_transactions',
    'parties',
    'suppliers',
    'customers',
    'supplier_invoices',
    'supplier_returns',
    'sales_invoices',
    'customer_returns',
    'stock_movements',
    'materials',
    'items',
  ]);
  return Array.from(allNeeded)
    .filter((name) => db[name] != null)
    .map((name) => db[name]);
}

export const dataManagementRepo = {
  assertCeoRole,

  /**
   * Get all registered Dexie tables with counts and metadata
   */
  async getTables() {
    const tableNames = Object.keys(SCHEMA_V1);
    const tablesList = [];

    for (const name of tableNames) {
      const meta = TABLE_METADATA[name] || { label: name, group: 'أخرى' };
      let count = 0;
      try {
        if (db[name]) {
          count = await db[name].count();
        }
      } catch (e) {
        count = 0;
      }

      tablesList.push({
        name,
        label: meta.label,
        group: meta.group,
        count,
        isAuditLog: name === 'audit_log',
      });
    }

    return tablesList;
  },

  /**
   * Get records for a specific table
   */
  async getTableRecords(tableName) {
    if (!db[tableName]) {
      throw new Error(`الجدول "${tableName}" غير موجود في قاعدة البيانات.`);
    }
    return await db[tableName].toArray();
  },

  /**
   * Get single record by ID
   */
  async getRecord(tableName, id) {
    if (!db[tableName]) {
      throw new Error(`الجدول "${tableName}" غير موجود في قاعدة البيانات.`);
    }
    return await db[tableName].get(id);
  },

  /**
   * Check if a record has active foreign key references in other tables
   */
  async checkRecordReferences(tableName, id) {
    const referencesDef = FOREIGN_KEY_REFERENCES[tableName] || [];
    const activeReferences = [];

    for (const ref of referencesDef) {
      try {
        if (db[ref.table]) {
          const matching = await db[ref.table]
            .where(ref.field)
            .equals(id)
            .toArray();

          if (matching.length > 0) {
            activeReferences.push({
              table: ref.table,
              field: ref.field,
              label: ref.label,
              count: matching.length,
              sampleRecords: matching.slice(0, 5),
            });
          }
        }
      } catch (e) {
        // Fallback in-memory scan if index is not defined
        try {
          const all = await db[ref.table].toArray();
          const matching = all.filter((r) => r[ref.field] === id);
          if (matching.length > 0) {
            activeReferences.push({
              table: ref.table,
              field: ref.field,
              label: ref.label,
              count: matching.length,
              sampleRecords: matching.slice(0, 5),
            });
          }
        } catch (scanErr) {}
      }
    }

    return {
      isReferenced: activeReferences.length > 0,
      references: activeReferences,
    };
  },

  /**
   * Create record directly in a Dexie table
   */
  async createRecord(tableName, data, reason = '') {
    assertCeoRole('create', tableName);

    if (tableName === 'audit_log') {
      throw new Error('لا يمكن إضافة سجلات جديدة مباشرة في سجل التعديلات. سجل التعديلات مخصص للقراءة فقط.');
    }

    if (!db[tableName]) {
      throw new Error(`الجدول "${tableName}" غير موجود.`);
    }

    const user = getActiveUser();
    const id = data.id || `${tableName.slice(0, 4)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const finalData = {
      ...data,
      id,
      created_at: data.created_at || new Date().toISOString(),
    };

    // Shared basic validation
    if (finalData.code && typeof finalData.code === 'string') {
      const existing = await db[tableName].where('code').equals(finalData.code).first().catch(() => null);
      if (existing) {
        throw new Error(`الكود "${finalData.code}" مستخدم بالفعل في هذا الجدول.`);
      }
    }

    // Save in Dexie transaction with audit log and balance recalculation
    const stores = getRequiredTransactionStores(tableName);
    await db.transaction('rw', stores, async () => {
      await db[tableName].add(finalData);

      // Audit Log entry
      await db.audit_log.add({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id || 'usr-owner',
        user_name: user.full_name || 'الإدارة العامة',
        action: 'add',
        operation: 'add',
        entity_type: tableName,
        table_name: tableName,
        entity_id: id,
        record_id: id,
        old_data: null,
        new_data: JSON.stringify(finalData),
        reason: reason || 'إضافة سجل عبر إدارة البيانات',
        created_at: new Date().toISOString(),
      });

      // Recalculate dependent balances & costs
      await recalculateBalancesInTransaction(tableName);
    });

    syncPush(tableName, 'insert', finalData);
    return finalData;
  },

  /**
   * Update record directly in a Dexie table
   */
  async updateRecord(tableName, id, data, reason = '') {
    assertCeoRole('update', tableName);

    if (tableName === 'audit_log') {
      throw new Error('سجل التعديلات محمي ضد التعديل أو الحذف (للقراءة فقط).');
    }

    if (!db[tableName]) {
      throw new Error(`الجدول "${tableName}" غير موجود.`);
    }

    const oldRecord = await db[tableName].get(id);
    if (!oldRecord) {
      throw new Error(`السجل "${id}" غير موجود في الجدول "${tableName}".`);
    }

    // Require reason when editing closed/posted records
    const isPostedOrClosed =
      oldRecord.status === 'posted' ||
      oldRecord.status === 'closed' ||
      oldRecord.status === 'completed' ||
      oldRecord.status === 'paid';

    if (isPostedOrClosed && (!reason || !reason.trim())) {
      throw new Error('تعديل السجلات المقفلة أو المرحلة يتطلب إدخال سبب كتابي واضح ومبرر للتعديل.');
    }

    const user = getActiveUser();
    const finalData = {
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };

    // Shared validation for unique code
    if (finalData.code && finalData.code !== oldRecord.code) {
      const existing = await db[tableName].where('code').equals(finalData.code).first().catch(() => null);
      if (existing && existing.id !== id) {
        throw new Error(`الكود "${finalData.code}" مستخدم بالفعل لسجل آخر.`);
      }
    }

    // Save in transaction with audit log and balance recalculation
    const stores = getRequiredTransactionStores(tableName);
    await db.transaction('rw', stores, async () => {
      await db[tableName].put(finalData);

      // Audit Log entry
      await db.audit_log.add({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id || 'usr-owner',
        user_name: user.full_name || 'الإدارة العامة',
        action: 'edit',
        operation: 'edit',
        entity_type: tableName,
        table_name: tableName,
        entity_id: id,
        record_id: id,
        old_data: JSON.stringify(oldRecord),
        new_data: JSON.stringify(finalData),
        reason: reason || 'تعديل سجل عبر إدارة البيانات',
        created_at: new Date().toISOString(),
      });

      // Recalculate dependent balances & costs
      await recalculateBalancesInTransaction(tableName);
    });

    syncPush(tableName, 'update', finalData, id);
    return finalData;
  },

  /**
   * Delete record directly from a Dexie table with foreign key reference check
   */
  async deleteRecord(tableName, id, reason = '') {
    assertCeoRole('delete', tableName);

    if (tableName === 'audit_log') {
      throw new Error('لا يمكن حذف أي سجل من سجل التعديلات نهائياً (سجل تدقيق محمي للقراءة فقط).');
    }

    if (!db[tableName]) {
      throw new Error(`الجدول "${tableName}" غير موجود.`);
    }

    const oldRecord = await db[tableName].get(id);
    if (!oldRecord) {
      throw new Error(`السجل "${id}" غير موجود في الجدول "${tableName}".`);
    }

    // Check references before deleting
    const refCheck = await this.checkRecordReferences(tableName, id);
    if (refCheck.isReferenced) {
      const details = refCheck.references
        .map((r) => `${r.label} (${r.count} سجل)`)
        .join('، ');
      throw new Error(
        `لا يمكن حذف هذا السجل لوجود سجلات مرتبطة به في: ${details}. يرجى فك الارتباط أولاً للحفاظ على سلامة البيانات.`
      );
    }

    const user = getActiveUser();

    // Delete in transaction with audit log and balance recalculation
    const stores = getRequiredTransactionStores(tableName);
    await db.transaction('rw', stores, async () => {
      await db[tableName].delete(id);

      // Audit Log entry
      await db.audit_log.add({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: user.id || 'usr-owner',
        user_name: user.full_name || 'الإدارة العامة',
        action: 'delete',
        operation: 'delete',
        entity_type: tableName,
        table_name: tableName,
        entity_id: id,
        record_id: id,
        old_data: JSON.stringify(oldRecord),
        new_data: null,
        reason: reason || 'حذف سجل عبر إدارة البيانات',
        created_at: new Date().toISOString(),
      });

      // Recalculate dependent balances & costs
      await recalculateBalancesInTransaction(tableName);
    });

    syncPush(tableName, 'delete', null, id);
    return true;
  },

  /**
   * Get audit logs with rich filters
   */
  async getAuditLogs(filters = {}) {
    let logs = await db.audit_log.orderBy('created_at').reverse().toArray();

    if (filters.table) {
      logs = logs.filter((l) => (l.table_name || l.entity_type) === filters.table);
    }
    if (filters.operation) {
      logs = logs.filter((l) => (l.operation || l.action) === filters.operation);
    }
    if (filters.user) {
      logs = logs.filter((l) => l.user_id === filters.user || l.user_name?.includes(filters.user));
    }
    if (filters.startDate) {
      logs = logs.filter((l) => l.created_at >= filters.startDate);
    }
    if (filters.endDate) {
      logs = logs.filter((l) => l.created_at <= filters.endDate);
    }

    return logs;
  },

  /**
   * Full recalculation of all system balances and costs
   */
  async recalculateAllBalances() {
    return await recalculateBalancesInTransaction('all');
  },
};

/**
 * Recomputes all balances and costs depending on which table was modified
 */
async function recalculateBalancesInTransaction(tableName) {
  try {
    const affectsCash = ['cash_transactions', 'treasury_accounts', 'payments', 'customer_payments', 'all'].includes(tableName);
    const affectsSuppliers = ['supplier_invoices', 'payments', 'supplier_returns', 'suppliers', 'parties', 'all'].includes(tableName);
    const affectsCustomers = ['sales_invoices', 'customer_payments', 'customer_returns', 'customers', 'parties', 'all'].includes(tableName);
    const affectsStock = ['stock_movements', 'stock_adjustments', 'stock_transfers', 'goods_receipts', 'materials', 'items', 'all'].includes(tableName);

    // 1. Recalculate Treasury Accounts from Cash Transactions
    if (affectsCash && db.treasury_accounts && db.cash_transactions) {
      const accounts = await db.treasury_accounts.toArray();
      const transactions = await db.cash_transactions.toArray();

      for (const acc of accounts) {
        const accTxs = transactions.filter((t) => t.account_id === acc.id);
        let balance = Number(acc.opening_balance || 0);

        for (const tx of accTxs) {
          const amt = Number(tx.amount) || 0;
          if (tx.tx_type === 'inflow' || tx.type === 'inflow' || tx.category === 'revenue') {
            balance += amt;
          } else if (tx.tx_type === 'outflow' || tx.type === 'outflow' || tx.category === 'expense') {
            balance -= amt;
          }
        }
        await db.treasury_accounts.update(acc.id, {
          current_balance: Number(balance.toFixed(2)),
        });
      }
    }

    // 2. Recalculate Supplier Debts
    if (affectsSuppliers && db.suppliers) {
      const suppliers = await db.suppliers.toArray();
      const invoices = db.supplier_invoices ? await db.supplier_invoices.toArray() : [];
      const returns = db.supplier_returns ? await db.supplier_returns.toArray() : [];

      for (const sup of suppliers) {
        const supInvs = invoices.filter((i) => i.supplier_id === sup.id);
        const supRets = returns.filter((r) => r.supplier_id === sup.id);
        const summary = BalanceCalculator.calculateSupplierBalance(supInvs, supRets);

        await db.suppliers.update(sup.id, {
          balance_due: summary.balanceDue,
          total_invoiced: summary.totalInvoiced,
          total_paid: summary.totalPaid,
        });
      }
    }

    // 3. Recalculate Customer Receivables
    if (affectsCustomers && db.customers) {
      const customers = await db.customers.toArray();
      const invoices = db.sales_invoices ? await db.sales_invoices.toArray() : [];
      const returns = db.customer_returns ? await db.customer_returns.toArray() : [];

      for (const cust of customers) {
        const custInvs = invoices.filter((i) => i.customer_id === cust.id);
        const custRets = returns.filter((r) => r.customer_id === cust.id);
        const summary = BalanceCalculator.calculateCustomerBalance(custInvs, custRets);

        await db.customers.update(cust.id, {
          balance_due: summary.balanceDue,
          total_invoiced: summary.totalInvoiced,
          total_paid: summary.totalPaid,
        });
      }
    }

    // 4. Recalculate Unified Parties
    if ((affectsSuppliers || affectsCustomers) && db.parties) {
      const parties = await db.parties.toArray();
      const supInvs = db.supplier_invoices ? await db.supplier_invoices.toArray() : [];
      const supRets = db.supplier_returns ? await db.supplier_returns.toArray() : [];
      const custInvs = db.sales_invoices ? await db.sales_invoices.toArray() : [];
      const custRets = db.customer_returns ? await db.customer_returns.toArray() : [];
      const payments = db.payments ? await db.payments.toArray() : [];
      const custPayments = db.customer_payments ? await db.customer_payments.toArray() : [];

      for (const party of parties) {
        const sInvs = supInvs.filter((i) => i.supplier_id === party.id);
        const sRets = supRets.filter((r) => r.supplier_id === party.id);
        const cInvs = custInvs.filter((i) => i.customer_id === party.id);
        const cRets = custRets.filter((r) => r.customer_id === party.id);
        const unlinkedSup = payments.filter((p) => p.supplier_id === party.id && !p.invoice_id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const unlinkedCust = custPayments.filter((p) => p.customer_id === party.id && !p.invoice_id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const supOpening = resolveOpeningBalance(party, 'supplier');
        const custOpening = resolveOpeningBalance(party, 'customer');

        const summary = BalanceCalculator.calculateUnifiedPartyBalance(
          sInvs,
          sRets,
          cInvs,
          cRets,
          supOpening,
          custOpening,
          unlinkedSup,
          unlinkedCust
        );

        await db.parties.update(party.id, {
          supplier_balance: summary.supplierBalance,
          customer_balance: summary.customerBalance,
          net_balance: summary.netBalance,
          max_offset: summary.maxOffsetAmount,
          balance_due: party.is_supplier ? summary.supplierBalance : summary.customerBalance,
        });
      }
    }

    // 5. Recalculate Stock Balances from movements
    if (affectsStock && db.stock_movements && db.materials) {
      const materials = await db.materials.toArray();
      const movements = await db.stock_movements.toArray();

      for (const mat of materials) {
        const matMovs = movements.filter((m) => m.material_id === mat.id);
        let stock = Number(mat.opening_stock || 0);

        for (const mov of matMovs) {
          const qty = Number(mov.quantity) || 0;
          if (mov.movement_type === 'in' || mov.type === 'in') {
            stock += qty;
          } else if (mov.movement_type === 'out' || mov.type === 'out') {
            stock -= qty;
          }
        }

        await db.materials.update(mat.id, {
          current_stock: Math.max(0, stock),
        });
      }
    }
  } catch (err) {
    console.warn('Balance recalculation warning:', err);
  }
}

export default dataManagementRepo;
