import Dexie from 'dexie';

/**
 * Workshop ERP - In-Browser IndexedDB Database via Dexie
 * Complete offline-first storage replacing PostgreSQL.
 */
export class WorkshopDatabase extends Dexie {
  constructor() {
    super('WorkshopERP_DB');

    this.version(1).stores({
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
    });
  }
}

export const db = new WorkshopDatabase();
export default db;
