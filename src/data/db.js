import Dexie from 'dexie';

/**
 * Apex Enterprise ERP - In-Browser IndexedDB Database via Dexie
 * Complete offline-first storage for Clothing Factory operations.
 */
export const DB_NAME = 'ApexEnterpriseERP_DB_v5';

export const SCHEMA_V1 = {
  // Core System & Security
  users: 'id, username, role, outlet_id, is_active, created_at',
  audit_log: 'id, user_id, action, entity_type, entity_id, created_at',
  settings: 'id',

  // Treasuries & Cash
  treasury_accounts: 'id, name, account_type, outlet_id, is_main, is_active, created_at',
  cash_transactions: 'id, tx_number, account_id, tx_type, category, reference_type, reference_id, created_at',
  expense_codes: 'id, code, name, is_active, created_at',
  daily_closings: 'id, outlet_id, treasury_id, closing_date, status, created_at',
  payment_methods: 'id, name, code, is_active',

  // Parties & Partners (Unified Suppliers & Customers)
  parties: 'id, code, name, is_supplier, is_customer, is_active, created_at',
  suppliers: 'id, name, phone, supplier_type, payment_terms, is_active, created_at',
  customers: 'id, name, phone, customer_type, payment_terms, is_active, created_at',

  // Items & Master Data (Clothing Factory with variants)
  items: 'id, code, name, item_group, item_department, item_type, is_active, created_at',
  item_sizes: 'id, name, code, is_active',
  item_colors: 'id, name, hex_code, is_active',
  materials: 'id, code, name, unit, is_active, created_at',
  products: 'id, code, name, category, is_active, created_at',
  bom_items: 'id, product_id, raw_material_id',

  // Storage Locations & Transfers
  storage_locations: 'id, code, name, location_type, is_active, created_at',
  stock_transfers: 'id, transfer_number, from_location_id, to_location_id, transfer_date, created_at',
  stock_movements: 'id, material_id, location_id, movement_type, reference_type, reference_id, created_at',
  stock_adjustments: 'id, adjustment_number, adjustment_type, sub_type, adjustment_date, created_at',
  stock_counts: 'id, count_date, status, created_at',
  stock_count_items: 'id, count_id, material_id',

  // Purchasing & Suppliers
  purchase_orders: 'id, po_number, supplier_id, order_date, status, created_at',
  purchase_order_items: 'id, po_id, material_id',
  goods_receipts: 'id, grn_number, po_id, supplier_id, receipt_date, created_at',
  goods_receipt_items: 'id, grn_id, material_id',
  supplier_invoices: 'id, invoice_number, supplier_id, grn_id, po_id, invoice_date, due_date, status, created_at',
  payments: 'id, payment_number, supplier_id, invoice_id, account_id, payment_date, created_at',
  supplier_returns: 'id, return_number, supplier_id, material_id, return_date, created_at',

  // Manufacturing & Outsourcing
  production_orders: 'id, order_number, product_id, status, start_date, created_at',
  production_material_usage: 'id, production_order_id, raw_material_id',
  outsourced_orders: 'id, order_number, production_order_id, supplier_id, status, transfer_date, created_at',
  finishing_orders: 'id, finishing_number, production_order_id, product_id, status, transfer_date, created_at',
  finishing_materials: 'id, finishing_order_id, raw_material_id',
  overheads: 'id, month_year, created_at',

  // Sales & Outlets
  sales_outlets: 'id, name, is_active, created_at',
  sales_invoices: 'id, invoice_number, customer_id, outlet_id, invoice_date, due_date, status, created_at',
  sales_invoice_items: 'id, invoice_id, product_id, variant_id',
  customer_payments: 'id, receipt_number, customer_id, invoice_id, account_id, payment_date, created_at',
  customer_returns: 'id, return_number, customer_id, invoice_id, product_id, return_date, created_at',
};

export class WorkshopDatabase extends Dexie {
  constructor() {
    super(DB_NAME);

    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V1);
    this.version(3).stores(SCHEMA_V1);
    this.version(4).stores(SCHEMA_V1);
    this.version(5).stores(SCHEMA_V1);
  }
}

export const db = new WorkshopDatabase();

// Silently cleanup legacy databases in the browser
try {
  if (typeof window !== 'undefined' && window.indexedDB) {
    window.indexedDB.deleteDatabase('ApexEnterpriseERP_DB_v4');
    window.indexedDB.deleteDatabase('ApexEnterpriseERP_DB_v3');
    window.indexedDB.deleteDatabase('ApexEnterpriseERP_DB_v2');
    window.indexedDB.deleteDatabase('ApexEnterpriseERP_DB');
    window.indexedDB.deleteDatabase('WorkshopERP_DB');
    Dexie.delete('ApexEnterpriseERP_DB_v4').catch(() => {});
    Dexie.delete('ApexEnterpriseERP_DB_v3').catch(() => {});
    Dexie.delete('ApexEnterpriseERP_DB_v2').catch(() => {});
    Dexie.delete('ApexEnterpriseERP_DB').catch(() => {});
    Dexie.delete('WorkshopERP_DB').catch(() => {});
  }
} catch (e) {}

/**
 * Wipes all dummy, mock, and operational data from all tables to enforce clean zero baseline.
 */
export async function purgeAllMockData() {
  if (!db.isOpen()) {
    await db.open();
  }
  const tablesToClear = [
    'parties',
    'suppliers',
    'customers',
    'items',
    'item_sizes',
    'item_colors',
    'materials',
    'products',
    'bom_items',
    'purchase_orders',
    'purchase_order_items',
    'goods_receipts',
    'goods_receipt_items',
    'supplier_invoices',
    'payments',
    'supplier_returns',
    'production_orders',
    'production_material_usage',
    'outsourced_orders',
    'finishing_orders',
    'finishing_materials',
    'overheads',
    'sales_invoices',
    'sales_invoice_items',
    'customer_payments',
    'customer_returns',
    'stock_movements',
    'stock_transfers',
    'stock_adjustments',
    'stock_counts',
    'stock_count_items',
    'cash_transactions',
    'daily_closings',
    'expense_codes',
    'sales_outlets',
    'audit_log',
  ];

  await db.transaction('rw', db.tables, async () => {
    for (const name of tablesToClear) {
      if (db[name]) {
        await db[name].clear();
      }
    }
    if (db.treasury_accounts) {
      const accounts = await db.treasury_accounts.toArray();
      for (const acc of accounts) {
        await db.treasury_accounts.update(acc.id, { current_balance: 0 });
      }
    }
  });
}

/**
 * Ensures that all declared object stores exist in the underlying IndexedDB database,
 * purges any legacy demo data, and initializes a clean 0-data baseline.
 */
export async function ensureDatabaseIntegrity() {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
    if (typeof window !== 'undefined' && window.indexedDB) {
      Dexie.delete('ApexEnterpriseERP_DB_v4').catch(() => {});
      Dexie.delete('ApexEnterpriseERP_DB_v3').catch(() => {});
    }

    const backend = db.backendDB();
    if (backend) {
      const existingStores = backend.objectStoreNames;
      const allRequired = Object.keys(SCHEMA_V1);
      const missing = allRequired.filter((s) => !existingStores.contains(s));
      if (missing.length > 0) {
        console.warn('Missing object stores detected in IndexedDB, auto-recovering database:', missing);
        db.close();
        await Dexie.delete(DB_NAME);
        await db.open();
      }
    }

    // Auto-detect and purge any legacy mock/demo records
    const hasMockParty = await db.parties.where('id').startsWith('pty-').first().catch(() => null);
    const hasMockCode = await db.parties.where('code').startsWith('PRT-').first().catch(() => null);
    const hasMockItem = await db.items.where('id').startsWith('prd-').first().catch(() => null);
    const hasMockMat = await db.materials.where('id').startsWith('mat-').first().catch(() => null);

    if (hasMockParty || hasMockCode || hasMockItem || hasMockMat) {
      console.warn('Purging legacy mock records from database...');
      await purgeAllMockData();
    }

    // Ensure baseline single owner user exists
    const usersCount = await db.users.count();
    if (usersCount === 0) {
      await db.users.put({
        id: 'usr-owner',
        username: 'owner',
        full_name: 'المدير العام',
        password_hash: '1234',
        role: 'owner',
        is_active: 1,
        created_at: new Date().toISOString(),
      });
    }

    // Ensure baseline settings with clean defaults
    const settingsCount = await db.settings.count();
    if (settingsCount === 0) {
      await db.settings.put({
        id: 1,
        factory_name: 'مؤسسة مصنع الملابس',
        phone: '',
        address: '',
        vat_enabled: 0,
        vat_rate_percent: 14.0,
        currency_symbol: 'ج.م',
        last_backup_date: null,
        notice_dismissed: false,
      });
    }

    // Ensure primary treasury with 0 balance
    const treasuryCount = await db.treasury_accounts.count();
    if (treasuryCount === 0) {
      await db.treasury_accounts.put({
        id: 'acc-main',
        name: 'الخزينة الرئيسية',
        account_type: 'treasury',
        outlet_id: null,
        is_main: 1,
        current_balance: 0,
        bank_account_number: '',
        bank_name: '',
        is_active: 1,
        created_at: new Date().toISOString(),
      });
    }

    // Ensure primary storage location
    const locCount = await db.storage_locations.count();
    if (locCount === 0) {
      await db.storage_locations.put({
        id: 'loc-main',
        code: 'LOC-01',
        name: 'المخزن الرئيسي',
        location_type: 'warehouse',
        notes: '',
        is_active: 1,
        created_at: new Date().toISOString(),
      });
    }

    // Ensure primary payment method
    const pmCount = await db.payment_methods.count();
    if (pmCount === 0) {
      await db.payment_methods.put({
        id: 'pm-cash',
        name: 'نقداً',
        code: 'CASH',
        notes: '',
        is_active: 1,
      });
    }
  } catch (err) {
    console.error('Database integrity check error, applying auto-recovery:', err);
    try {
      db.close();
      await Dexie.delete(DB_NAME);
      await db.open();
    } catch (recoverErr) {
      console.error('Failed to auto-recover IndexedDB:', recoverErr);
    }
  }
}

export default db;
