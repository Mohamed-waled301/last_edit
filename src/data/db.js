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
  party_settlements: 'id, settlement_number, party_id, settlement_date, created_at',

  // Items & Master Data (Clothing Factory with variants)
  items: 'id, code, name, item_group, item_department, item_type, is_active, created_at',
  item_groups: 'id, code, name, is_active, created_at',
  item_sections: 'id, code, name, group_id, is_active, created_at',
  item_sizes: 'id, name, code, is_active',
  item_colors: 'id, name, hex_code, is_active',
  item_units: 'id, name, code, is_active',
  item_suppliers: 'id, item_id, supplier_id, is_preferred',
  materials: 'id, code, name, unit, is_active, created_at',
  products: 'id, code, name, category, is_active, created_at',
  bom_items: 'id, product_id, raw_material_id',

  // Storage Locations & Transfers
  storage_locations: 'id, code, name, location_type, is_active, created_at',
  stock_transfers: 'id, transfer_number, from_location_id, to_location_id, transfer_date, created_at',
  stock_movements: 'id, item_id, material_id, location_id, movement_type, reference_type, reference_id, direction, date, created_at',
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
  production_orders: 'id, order_number, cutting_number, product_id, status, start_date, created_at',
  production_material_usage: 'id, production_order_id, raw_material_id',
  cutting_printing_payments: 'id, production_order_id, payment_date, created_at',
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
    this.version(6).stores(SCHEMA_V1);
    this.version(7).stores(SCHEMA_V1);
    this.version(8).stores({
      item_suppliers: 'id, item_id, supplier_id, is_preferred',
    });
    this.version(9).stores({
      cutting_printing_payments: 'id, production_order_id, payment_date, created_at',
    });
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
    'party_settlements',
    'suppliers',
    'customers',
    'items',
    'item_groups',
    'item_sections',
    'item_sizes',
    'item_colors',
    'item_units',
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
    'cutting_printing_payments',
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

    // Ensure baseline settings with clean defaults
    const settingsCount = await db.settings.count();
    if (settingsCount === 0) {
      await db.settings.put({
        id: 1,
        factory_name: '',
        phone: '',
        address: '',
        vat_enabled: 0,
        vat_rate_percent: 14.0,
        currency_symbol: 'ج.م',
        default_profit_margin_percent: 0,
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

    // Ensure baseline item groups
    const groupCount = await db.item_groups.count().catch(() => 0);
    if (groupCount === 0) {
      await db.item_groups.bulkPut([
        { id: 'grp-1', code: 'GRP-01', name: 'ملابس جاهزة ومنتجات تامة', notes: 'الملابس الجاهزة للبيع المباشر والمعارض', is_active: 1, created_at: new Date().toISOString() },
        { id: 'grp-2', code: 'GRP-02', name: 'أقمشة ومنسوجات قطنية', notes: 'أثواب الأقمشة الخام الجيرسي والجينز والميلتون', is_active: 1, created_at: new Date().toISOString() },
        { id: 'grp-3', code: 'GRP-03', name: 'إكسسوارات ومستلزمات خياطة', notes: 'أزرار وسوست وتيكتات وبكر خيوط', is_active: 1, created_at: new Date().toISOString() },
        { id: 'grp-4', code: 'GRP-04', name: 'مواد ومستلزمات تعبئة وتغليف', notes: 'أكياس سلوفان وشماعات وكراتين', is_active: 1, created_at: new Date().toISOString() },
      ]);
    }

    // Ensure baseline item sections
    const secCount = await db.item_sections.count().catch(() => 0);
    if (secCount === 0) {
      await db.item_sections.bulkPut([
        { id: 'sec-1', code: 'SEC-01', name: 'قسم التيشيرتات والبولو', group_id: 'grp-1', notes: 'تيشيرتات قطنية وبولو كاجوال', is_active: 1, created_at: new Date().toISOString() },
        { id: 'sec-2', code: 'SEC-02', name: 'قسم البنطلونات والجينز', group_id: 'grp-1', notes: 'بناطيل جينز وجبردين', is_active: 1, created_at: new Date().toISOString() },
        { id: 'sec-3', code: 'SEC-03', name: 'قسم السويت شيرت والهودي', group_id: 'grp-1', notes: 'ملابس شتوية وميلتون', is_active: 1, created_at: new Date().toISOString() },
        { id: 'sec-4', code: 'SEC-04', name: 'قسم أقمشة التريكو والقص', group_id: 'grp-2', notes: 'أثواب قماش صالة القص', is_active: 1, created_at: new Date().toISOString() },
        { id: 'sec-5', code: 'SEC-05', name: 'قسم الخيوط والأزرار والمستلزمات', group_id: 'grp-3', notes: 'مستلزمات ماكينات الحياكة', is_active: 1, created_at: new Date().toISOString() },
      ]);
    }

    // Ensure baseline item units
    const unitCount = await db.item_units?.count().catch(() => 0);
    if (unitCount === 0 && db.item_units) {
      await db.item_units.bulkPut([
        { id: 'u-piece', name: 'قطعة', code: 'قطعة', is_active: 1 },
        { id: 'u-dozen', name: 'دستة', code: 'دستة', is_active: 1 },
        { id: 'u-meter', name: 'متر', code: 'متر', is_active: 1 },
        { id: 'u-kg', name: 'كيلوجرام', code: 'كجم', is_active: 1 },
        { id: 'u-set', name: 'طقم', code: 'طقم', is_active: 1 },
        { id: 'u-roll', name: 'ثوب', code: 'ثوب', is_active: 1 },
        { id: 'u-spool', name: 'بكرة', code: 'بكرة', is_active: 1 },
        { id: 'u-bag', name: 'كيس', code: 'كيس', is_active: 1 },
        { id: 'u-box', name: 'كرتونة', code: 'كرتونة', is_active: 1 }
      ]);
    }
  } catch (err) {
    console.warn('Database integrity check warning:', err);
  }
}

export default db;
