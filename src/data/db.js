import Dexie from 'dexie';

/**
 * Apex Enterprise ERP - In-Browser IndexedDB Database via Dexie
 * Complete offline-first storage with automatic migration & recovery.
 */
export const DB_NAME = 'ApexEnterpriseERP_DB_v2';

export const SCHEMA_V1 = {
  users: 'id, username, role, is_active, created_at',
  audit_log: 'id, user_id, action, entity_type, entity_id, created_at',
  settings: 'id',
  treasury_accounts: 'id, name, account_type, is_active, created_at',
  cash_transactions: 'id, tx_number, account_id, tx_type, category, reference_type, reference_id, created_at',
  suppliers: 'id, name, phone, payment_terms, is_active, created_at',
  materials: 'id, code, name, unit, is_active, created_at',
  purchase_orders: 'id, po_number, supplier_id, order_date, status, created_at',
  purchase_order_items: 'id, po_id, material_id',
  goods_receipts: 'id, grn_number, po_id, supplier_id, receipt_date, created_at',
  goods_receipt_items: 'id, grn_id, material_id',
  supplier_invoices: 'id, invoice_number, supplier_id, grn_id, po_id, invoice_date, due_date, status, created_at',
  payments: 'id, payment_number, supplier_id, invoice_id, account_id, payment_date, created_at',
  supplier_returns: 'id, return_number, supplier_id, material_id, return_date, created_at',
  stock_movements: 'id, material_id, movement_type, reference_type, reference_id, created_at',
  stock_counts: 'id, count_date, status, created_at',
  stock_count_items: 'id, count_id, material_id',
  products: 'id, code, name, category, is_active, created_at',
  bom_items: 'id, product_id, raw_material_id',
  overheads: 'id, month_year, created_at',
  production_orders: 'id, order_number, product_id, status, start_date, created_at',
  production_material_usage: 'id, production_order_id, raw_material_id',
  finishing_orders: 'id, finishing_number, production_order_id, product_id, status, transfer_date, created_at',
  finishing_materials: 'id, finishing_order_id, raw_material_id',
  sales_outlets: 'id, name, is_active, created_at',
  customers: 'id, name, phone, customer_type, payment_terms, is_active, created_at',
  sales_invoices: 'id, invoice_number, customer_id, outlet_id, invoice_date, due_date, status, created_at',
  sales_invoice_items: 'id, invoice_id, product_id, finishing_order_id',
  customer_payments: 'id, receipt_number, customer_id, invoice_id, account_id, payment_date, created_at',
  customer_returns: 'id, return_number, customer_id, invoice_id, product_id, return_date, created_at',
};

export class WorkshopDatabase extends Dexie {
  constructor() {
    super(DB_NAME);

    // Initial schema with all 26 tables
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V1);
  }
}

export const db = new WorkshopDatabase();

// Silently cleanup any legacy broken database from previous builds
try {
  if (typeof window !== 'undefined' && window.indexedDB) {
    Dexie.delete('WorkshopERP_DB').catch(() => {});
  }
} catch (e) {}

/**
 * Ensures that all declared object stores exist in the underlying IndexedDB database.
 * If the database was created by an older version with missing tables or if a NotFoundError
 * occurs, this function automatically upgrades or re-creates the database cleanly.
 */
export async function ensureDatabaseIntegrity() {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
    const backend = db.backendDB();
    if (backend) {
      const existingStores = backend.objectStoreNames;
      const allRequired = Object.keys(SCHEMA_V1);
      const missing = allRequired.filter(s => !existingStores.contains(s));
      if (missing.length > 0) {
        console.warn('Missing object stores detected in IndexedDB, auto-recovering database:', missing);
        db.close();
        await Dexie.delete(DB_NAME);
        await db.open();
        console.log('Database successfully re-created with all required stores.');
      }
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
