import Dexie, { Table } from 'dexie';

export const DB_NAME: string;
export const SCHEMA_V1: Record<string, string>;

export class WorkshopDatabase extends Dexie {
  [key: string]: any;
  users: Table<any, any>;
  audit_log: Table<any, any>;
  settings: Table<any, any>;
  treasury_accounts: Table<any, any>;
  cash_transactions: Table<any, any>;
  expense_codes: Table<any, any>;
  daily_closings: Table<any, any>;
  payment_methods: Table<any, any>;
  parties: Table<any, any>;
  suppliers: Table<any, any>;
  customers: Table<any, any>;
  party_settlements: Table<any, any>;
  items: Table<any, any>;
  item_groups: Table<any, any>;
  item_sections: Table<any, any>;
  item_sizes: Table<any, any>;
  item_colors: Table<any, any>;
  item_units: Table<any, any>;
  item_suppliers: Table<any, any>;
  materials: Table<any, any>;
  products: Table<any, any>;
  bom_items: Table<any, any>;
  storage_locations: Table<any, any>;
  stock_transfers: Table<any, any>;
  stock_movements: Table<any, any>;
  stock_adjustments: Table<any, any>;
  stock_counts: Table<any, any>;
  stock_count_items: Table<any, any>;
  purchase_orders: Table<any, any>;
  purchase_order_items: Table<any, any>;
  goods_receipts: Table<any, any>;
  goods_receipt_items: Table<any, any>;
  supplier_invoices: Table<any, any>;
  payments: Table<any, any>;
  supplier_returns: Table<any, any>;
  production_orders: Table<any, any>;
  production_material_usage: Table<any, any>;
  cutting_printing_payments: Table<any, any>;
  outsourced_orders: Table<any, any>;
  finishing_orders: Table<any, any>;
  finishing_materials: Table<any, any>;
  overheads: Table<any, any>;
  sales_outlets: Table<any, any>;
  sales_invoices: Table<any, any>;
  sales_invoice_items: Table<any, any>;
  customer_payments: Table<any, any>;
  customer_returns: Table<any, any>;
}

export const db: WorkshopDatabase;
export function resetDatabase(): Promise<void>;
export function clearAllData(): Promise<void>;
export function exportDatabase(): Promise<any>;
export function importDatabase(data: any): Promise<void>;
export function ensureDatabaseIntegrity(): Promise<void>;

export default db;
