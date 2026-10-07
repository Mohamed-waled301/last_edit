import Dexie from 'dexie';

/**
 * Apex Enterprise ERP - In-Browser IndexedDB Database via Dexie
 * Complete offline-first storage for Clothing Factory operations.
 */
export const DB_NAME = 'ApexEnterpriseERP_DB_v4';

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

  // Manufacturing & Outsourcing (التصنيع والتشغيل لدى الغير)
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
  }
}

export const db = new WorkshopDatabase();

// Silently cleanup legacy databases
try {
  if (typeof window !== 'undefined' && window.indexedDB) {
    Dexie.delete('WorkshopERP_DB').catch(() => {});
    Dexie.delete('ApexEnterpriseERP_DB').catch(() => {});
    Dexie.delete('ApexEnterpriseERP_DB_v2').catch(() => {});
  }
} catch (e) {}

/**
 * Ensures that all declared object stores exist in the underlying IndexedDB database.
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
