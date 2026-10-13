-- ========================================================================
-- Apex Apparel ERP - Complete SQLite Local Database Schema
-- Migration: 001_initial_schema.sql
-- ========================================================================

CREATE TABLE IF NOT EXISTS `schema_version` (
  `version` INTEGER PRIMARY KEY,
  `applied_at` TEXT NOT NULL,
  `description` TEXT NOT NULL
);

-- Table: audit_log
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` TEXT PRIMARY KEY,
  `user_id` TEXT NOT NULL,
  `action` TEXT NOT NULL,
  `entity_type` TEXT NOT NULL,
  `entity_id` TEXT NOT NULL,
  `old_data` TEXT,
  `new_data` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE INDEX IF NOT EXISTS `idx_audit_user` ON `audit_log` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_audit_entity` ON `audit_log` (`entity_type`, `entity_id`);
CREATE INDEX IF NOT EXISTS `idx_audit_date` ON `audit_log` (`created_at`);

-- Table: bom_items
CREATE TABLE IF NOT EXISTS `bom_items` (
  `id` TEXT PRIMARY KEY,
  `product_id` TEXT NOT NULL,
  `raw_material_id` TEXT NOT NULL,
  `quantity_needed` NUMERIC NOT NULL,
  `scrap_percentage` NUMERIC NOT NULL DEFAULT '0.00',
  `stage` TEXT NOT NULL DEFAULT 'production',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE INDEX IF NOT EXISTS `idx_bom_product` ON `bom_items` (`product_id`);

-- Table: cash_transactions
CREATE TABLE IF NOT EXISTS `cash_transactions` (
  `id` TEXT PRIMARY KEY,
  `tx_number` TEXT NOT NULL,
  `account_id` TEXT NOT NULL,
  `tx_type` TEXT NOT NULL,
  `amount` NUMERIC NOT NULL DEFAULT '0.00',
  `category` TEXT NOT NULL,
  `description` TEXT,
  `reference_type` TEXT,
  `reference_id` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `tx_number` ON `cash_transactions` (`tx_number`);
CREATE INDEX IF NOT EXISTS `idx_cash_account` ON `cash_transactions` (`account_id`);
CREATE INDEX IF NOT EXISTS `idx_cash_date` ON `cash_transactions` (`created_at`);

-- Table: customer_payments
CREATE TABLE IF NOT EXISTS `customer_payments` (
  `id` TEXT PRIMARY KEY,
  `receipt_number` TEXT NOT NULL,
  `customer_id` TEXT NOT NULL,
  `invoice_id` TEXT,
  `account_id` TEXT NOT NULL,
  `amount` NUMERIC NOT NULL DEFAULT '0.00',
  `payment_date` TEXT NOT NULL,
  `payment_method` TEXT NOT NULL DEFAULT 'cash',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `receipt_number` ON `customer_payments` (`receipt_number`);
CREATE INDEX IF NOT EXISTS `idx_cpayments_customer` ON `customer_payments` (`customer_id`);

-- Table: customer_returns
CREATE TABLE IF NOT EXISTS `customer_returns` (
  `id` TEXT PRIMARY KEY,
  `return_number` TEXT NOT NULL,
  `customer_id` TEXT NOT NULL,
  `invoice_id` TEXT,
  `product_id` TEXT,
  `quantity` NUMERIC NOT NULL,
  `unit_price` NUMERIC NOT NULL,
  `total_amount` NUMERIC NOT NULL,
  `return_date` TEXT NOT NULL,
  `reason` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `return_number` ON `customer_returns` (`return_number`);

-- Table: customers
CREATE TABLE IF NOT EXISTS `customers` (
  `id` TEXT PRIMARY KEY,
  `party_id` TEXT,
  `name` TEXT NOT NULL,
  `phone` TEXT DEFAULT '',
  `customer_type` TEXT DEFAULT 'retail',
  `payment_terms` TEXT DEFAULT 'cash',
  `credit_limit` NUMERIC DEFAULT '0.00',
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);


-- Table: daily_closings
CREATE TABLE IF NOT EXISTS `daily_closings` (
  `id` TEXT PRIMARY KEY,
  `outlet_id` TEXT,
  `treasury_id` TEXT NOT NULL,
  `closing_date` TEXT NOT NULL,
  `opening_balance` NUMERIC NOT NULL DEFAULT '0.00',
  `cash_in` NUMERIC NOT NULL DEFAULT '0.00',
  `cash_out` NUMERIC NOT NULL DEFAULT '0.00',
  `closing_balance` NUMERIC NOT NULL DEFAULT '0.00',
  `actual_balance` NUMERIC NOT NULL DEFAULT '0.00',
  `difference` NUMERIC NOT NULL DEFAULT '0.00',
  `status` TEXT NOT NULL DEFAULT 'closed',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE INDEX IF NOT EXISTS `idx_closings_date` ON `daily_closings` (`closing_date`);
CREATE INDEX IF NOT EXISTS `idx_closings_outlet` ON `daily_closings` (`outlet_id`);

-- Table: expense_codes
CREATE TABLE IF NOT EXISTS `expense_codes` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `category` TEXT,
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `expense_codes` (`code`);

-- Table: finishing_materials
CREATE TABLE IF NOT EXISTS `finishing_materials` (
  `id` TEXT PRIMARY KEY,
  `finishing_order_id` TEXT NOT NULL,
  `raw_material_id` TEXT NOT NULL,
  `quantity_used` NUMERIC NOT NULL,
  `unit_cost` NUMERIC NOT NULL,
  `total_cost` NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_finishing_order` ON `finishing_materials` (`finishing_order_id`);

-- Table: finishing_orders
CREATE TABLE IF NOT EXISTS `finishing_orders` (
  `id` TEXT PRIMARY KEY,
  `finishing_number` TEXT NOT NULL,
  `production_order_id` TEXT,
  `product_id` TEXT NOT NULL,
  `quantity` NUMERIC NOT NULL DEFAULT '0.00',
  `status` TEXT NOT NULL DEFAULT 'in_finishing',
  `transfer_date` TEXT NOT NULL,
  `completion_date` TEXT,
  `finishing_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `total_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `unit_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `finishing_number` ON `finishing_orders` (`finishing_number`);

-- Table: goods_receipt_items
CREATE TABLE IF NOT EXISTS `goods_receipt_items` (
  `id` TEXT PRIMARY KEY,
  `grn_id` TEXT NOT NULL,
  `material_id` TEXT NOT NULL,
  `received_quantity` NUMERIC NOT NULL,
  `unit_cost` NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_grn_items_grn` ON `goods_receipt_items` (`grn_id`);

-- Table: goods_receipts
CREATE TABLE IF NOT EXISTS `goods_receipts` (
  `id` TEXT PRIMARY KEY,
  `grn_number` TEXT NOT NULL,
  `po_id` TEXT,
  `supplier_id` TEXT NOT NULL,
  `receipt_date` TEXT NOT NULL,
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `grn_number` ON `goods_receipts` (`grn_number`);
CREATE INDEX IF NOT EXISTS `idx_grn_supplier` ON `goods_receipts` (`supplier_id`);

-- Table: item_colors
CREATE TABLE IF NOT EXISTS `item_colors` (
  `id` TEXT PRIMARY KEY,
  `name` TEXT NOT NULL,
  `hex_code` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);


-- Table: item_sizes
CREATE TABLE IF NOT EXISTS `item_sizes` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `item_sizes` (`code`);

-- Table: items
CREATE TABLE IF NOT EXISTS `items` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `item_group` TEXT,
  `item_department` TEXT,
  `item_type` TEXT NOT NULL DEFAULT 'raw_material',
  `unit` TEXT NOT NULL DEFAULT 'piece',
  `cost_price` NUMERIC NOT NULL DEFAULT '0.00',
  `selling_price` NUMERIC NOT NULL DEFAULT '0.00',
  `current_stock` NUMERIC NOT NULL DEFAULT '0.000',
  `min_stock` NUMERIC NOT NULL DEFAULT '0.000',
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()',
  `updated_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `items` (`code`);
CREATE INDEX IF NOT EXISTS `idx_items_group` ON `items` (`item_group`);
CREATE INDEX IF NOT EXISTS `idx_items_type` ON `items` (`item_type`);

-- Table: materials
CREATE TABLE IF NOT EXISTS `materials` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `unit` TEXT NOT NULL DEFAULT 'meter',
  `current_stock` NUMERIC NOT NULL DEFAULT '0.000',
  `min_stock` NUMERIC NOT NULL DEFAULT '0.000',
  `avg_unit_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `materials` (`code`);

-- Table: outsourced_orders
CREATE TABLE IF NOT EXISTS `outsourced_orders` (
  `id` TEXT PRIMARY KEY,
  `order_number` TEXT NOT NULL,
  `production_order_id` TEXT,
  `supplier_id` TEXT NOT NULL,
  `operation_type` TEXT NOT NULL,
  `quantity` NUMERIC NOT NULL DEFAULT '0.00',
  `cost_per_unit` NUMERIC NOT NULL DEFAULT '0.00',
  `total_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `status` TEXT NOT NULL DEFAULT 'sent',
  `transfer_date` TEXT NOT NULL,
  `return_date` TEXT,
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `order_number` ON `outsourced_orders` (`order_number`);
CREATE INDEX IF NOT EXISTS `idx_outsourced_supplier` ON `outsourced_orders` (`supplier_id`);

-- Table: overheads
CREATE TABLE IF NOT EXISTS `overheads` (
  `id` TEXT PRIMARY KEY,
  `month_year` TEXT NOT NULL,
  `rent` NUMERIC NOT NULL DEFAULT '0.00',
  `electricity` NUMERIC NOT NULL DEFAULT '0.00',
  `indirect_labor` NUMERIC NOT NULL DEFAULT '0.00',
  `maintenance` NUMERIC NOT NULL DEFAULT '0.00',
  `depreciation` NUMERIC NOT NULL DEFAULT '0.00',
  `other` NUMERIC NOT NULL DEFAULT '0.00',
  `total_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `working_hours_per_month` NUMERIC NOT NULL DEFAULT '200.00',
  `hourly_rate` NUMERIC NOT NULL DEFAULT '0.00',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `month_year` ON `overheads` (`month_year`);

-- Table: parties
CREATE TABLE IF NOT EXISTS `parties` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `phone` TEXT DEFAULT '',
  `address` TEXT,
  `tax_number` TEXT DEFAULT '',
  `is_supplier` INTEGER NOT NULL DEFAULT '0',
  `is_customer` INTEGER NOT NULL DEFAULT '0',
  `deal_type` TEXT NOT NULL DEFAULT 'cash',
  `payment_terms` TEXT NOT NULL DEFAULT 'cash',
  `credit_limit` NUMERIC NOT NULL DEFAULT '0.00',
  `current_balance` NUMERIC NOT NULL DEFAULT '0.00',
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()',
  `updated_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `parties` (`code`);
CREATE INDEX IF NOT EXISTS `idx_parties_supplier` ON `parties` (`is_supplier`);
CREATE INDEX IF NOT EXISTS `idx_parties_customer` ON `parties` (`is_customer`);

-- Table: payment_methods
CREATE TABLE IF NOT EXISTS `payment_methods` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `payment_methods` (`code`);

-- Table: payments
CREATE TABLE IF NOT EXISTS `payments` (
  `id` TEXT PRIMARY KEY,
  `payment_number` TEXT NOT NULL,
  `supplier_id` TEXT NOT NULL,
  `invoice_id` TEXT,
  `account_id` TEXT NOT NULL,
  `amount` NUMERIC NOT NULL DEFAULT '0.00',
  `payment_date` TEXT NOT NULL,
  `payment_method` TEXT NOT NULL DEFAULT 'cash',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `payment_number` ON `payments` (`payment_number`);
CREATE INDEX IF NOT EXISTS `idx_payments_supplier` ON `payments` (`supplier_id`);

-- Table: production_material_usage
CREATE TABLE IF NOT EXISTS `production_material_usage` (
  `id` TEXT PRIMARY KEY,
  `production_order_id` TEXT NOT NULL,
  `raw_material_id` TEXT NOT NULL,
  `quantity_used` NUMERIC NOT NULL,
  `unit_cost` NUMERIC NOT NULL,
  `total_cost` NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_pmu_order` ON `production_material_usage` (`production_order_id`);

-- Table: production_orders
CREATE TABLE IF NOT EXISTS `production_orders` (
  `id` TEXT PRIMARY KEY,
  `order_number` TEXT NOT NULL,
  `product_id` TEXT NOT NULL,
  `target_quantity` NUMERIC NOT NULL DEFAULT '0.00',
  `status` TEXT NOT NULL DEFAULT 'in_progress',
  `start_date` TEXT NOT NULL,
  `completion_date` TEXT,
  `labor_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `overhead_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `material_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `total_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `unit_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `order_number` ON `production_orders` (`order_number`);
CREATE INDEX IF NOT EXISTS `idx_production_product` ON `production_orders` (`product_id`);

-- Table: products
CREATE TABLE IF NOT EXISTS `products` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `category` TEXT,
  `description` TEXT,
  `target_price` NUMERIC DEFAULT '0.00',
  `cost_price` NUMERIC DEFAULT '0.00',
  `labor_hours` NUMERIC DEFAULT '0.00',
  `machine_hours` NUMERIC DEFAULT '0.00',
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `products` (`code`);

-- Table: purchase_order_items
CREATE TABLE IF NOT EXISTS `purchase_order_items` (
  `id` TEXT PRIMARY KEY,
  `po_id` TEXT NOT NULL,
  `material_id` TEXT NOT NULL,
  `quantity` NUMERIC NOT NULL,
  `unit_price` NUMERIC NOT NULL,
  `total_cost` NUMERIC NOT NULL
);

CREATE INDEX IF NOT EXISTS `idx_po_items_po` ON `purchase_order_items` (`po_id`);

-- Table: purchase_orders
CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` TEXT PRIMARY KEY,
  `po_number` TEXT NOT NULL,
  `supplier_id` TEXT NOT NULL,
  `order_date` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'pending',
  `total_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `po_number` ON `purchase_orders` (`po_number`);
CREATE INDEX IF NOT EXISTS `idx_po_supplier` ON `purchase_orders` (`supplier_id`);

-- Table: sales_invoice_items
CREATE TABLE IF NOT EXISTS `sales_invoice_items` (
  `id` TEXT PRIMARY KEY,
  `invoice_id` TEXT NOT NULL,
  `product_id` TEXT,
  `variant_id` TEXT,
  `quantity` NUMERIC NOT NULL,
  `unit_price` NUMERIC NOT NULL,
  `total_price` NUMERIC NOT NULL,
  `unit_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `total_cost` NUMERIC NOT NULL DEFAULT '0.00'
);

CREATE INDEX IF NOT EXISTS `idx_sitems_invoice` ON `sales_invoice_items` (`invoice_id`);

-- Table: sales_invoices
CREATE TABLE IF NOT EXISTS `sales_invoices` (
  `id` TEXT PRIMARY KEY,
  `invoice_number` TEXT NOT NULL,
  `customer_id` TEXT NOT NULL,
  `outlet_id` TEXT,
  `invoice_date` TEXT NOT NULL,
  `due_date` TEXT,
  `subtotal` NUMERIC NOT NULL DEFAULT '0.00',
  `discount` NUMERIC NOT NULL DEFAULT '0.00',
  `tax_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `total_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `paid_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `status` TEXT NOT NULL DEFAULT 'unpaid',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `invoice_number` ON `sales_invoices` (`invoice_number`);
CREATE INDEX IF NOT EXISTS `idx_sinvoice_customer` ON `sales_invoices` (`customer_id`);
CREATE INDEX IF NOT EXISTS `idx_sinvoice_outlet` ON `sales_invoices` (`outlet_id`);

-- Table: sales_outlets
CREATE TABLE IF NOT EXISTS `sales_outlets` (
  `id` TEXT PRIMARY KEY,
  `name` TEXT NOT NULL,
  `location` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);


-- Table: settings
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INTEGER PRIMARY KEY DEFAULT '1',
  `factory_name` TEXT NOT NULL DEFAULT 'مجموعة القمة للصناعات والأنظمة الذكية',
  `phone` TEXT DEFAULT '',
  `address` TEXT,
  `vat_enabled` INTEGER NOT NULL DEFAULT '1',
  `vat_rate_percent` NUMERIC NOT NULL DEFAULT '14.00',
  `currency_symbol` TEXT NOT NULL DEFAULT 'ج.م',
  `cost_method` TEXT NOT NULL DEFAULT 'weighted_average',
  `last_backup_date` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()',
  `updated_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);


-- Table: stock_adjustments
CREATE TABLE IF NOT EXISTS `stock_adjustments` (
  `id` TEXT PRIMARY KEY,
  `adjustment_number` TEXT NOT NULL,
  `adjustment_type` TEXT NOT NULL,
  `sub_type` TEXT,
  `adjustment_date` TEXT NOT NULL,
  `location_id` TEXT,
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `adjustment_number` ON `stock_adjustments` (`adjustment_number`);

-- Table: stock_count_items
CREATE TABLE IF NOT EXISTS `stock_count_items` (
  `id` TEXT PRIMARY KEY,
  `count_id` TEXT NOT NULL,
  `material_id` TEXT NOT NULL,
  `system_qty` NUMERIC NOT NULL DEFAULT '0.000',
  `counted_qty` NUMERIC NOT NULL DEFAULT '0.000',
  `difference_qty` NUMERIC NOT NULL DEFAULT '0.000',
  `unit_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `total_difference_cost` NUMERIC NOT NULL DEFAULT '0.00'
);

CREATE INDEX IF NOT EXISTS `idx_count_items_count` ON `stock_count_items` (`count_id`);

-- Table: stock_counts
CREATE TABLE IF NOT EXISTS `stock_counts` (
  `id` TEXT PRIMARY KEY,
  `count_date` TEXT NOT NULL,
  `location_id` TEXT,
  `status` TEXT NOT NULL DEFAULT 'draft',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);


-- Table: stock_movements
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` TEXT PRIMARY KEY,
  `material_id` TEXT NOT NULL,
  `location_id` TEXT,
  `movement_type` TEXT NOT NULL,
  `quantity` NUMERIC NOT NULL,
  `unit_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `total_cost` NUMERIC NOT NULL DEFAULT '0.00',
  `reference_type` TEXT,
  `reference_id` TEXT,
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE INDEX IF NOT EXISTS `idx_movements_material` ON `stock_movements` (`material_id`);
CREATE INDEX IF NOT EXISTS `idx_movements_date` ON `stock_movements` (`created_at`);

-- Table: stock_transfers
CREATE TABLE IF NOT EXISTS `stock_transfers` (
  `id` TEXT PRIMARY KEY,
  `transfer_number` TEXT NOT NULL,
  `from_location_id` TEXT NOT NULL,
  `to_location_id` TEXT NOT NULL,
  `transfer_date` TEXT NOT NULL,
  `items_count` INTEGER NOT NULL DEFAULT '0',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `transfer_number` ON `stock_transfers` (`transfer_number`);

-- Table: storage_locations
CREATE TABLE IF NOT EXISTS `storage_locations` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `location_type` TEXT NOT NULL DEFAULT 'warehouse',
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `code` ON `storage_locations` (`code`);

-- Table: supplier_invoices
CREATE TABLE IF NOT EXISTS `supplier_invoices` (
  `id` TEXT PRIMARY KEY,
  `invoice_number` TEXT NOT NULL,
  `supplier_id` TEXT NOT NULL,
  `grn_id` TEXT,
  `po_id` TEXT,
  `invoice_date` TEXT NOT NULL,
  `due_date` TEXT,
  `subtotal` NUMERIC NOT NULL DEFAULT '0.00',
  `tax_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `total_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `paid_amount` NUMERIC NOT NULL DEFAULT '0.00',
  `status` TEXT NOT NULL DEFAULT 'unpaid',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `invoice_number` ON `supplier_invoices` (`invoice_number`);
CREATE INDEX IF NOT EXISTS `idx_sinvoice_supplier` ON `supplier_invoices` (`supplier_id`);

-- Table: supplier_returns
CREATE TABLE IF NOT EXISTS `supplier_returns` (
  `id` TEXT PRIMARY KEY,
  `return_number` TEXT NOT NULL,
  `supplier_id` TEXT NOT NULL,
  `material_id` TEXT NOT NULL,
  `quantity` NUMERIC NOT NULL,
  `unit_price` NUMERIC NOT NULL,
  `total_amount` NUMERIC NOT NULL,
  `return_date` TEXT NOT NULL,
  `reason` TEXT,
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `return_number` ON `supplier_returns` (`return_number`);

-- Table: suppliers
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` TEXT PRIMARY KEY,
  `party_id` TEXT,
  `name` TEXT NOT NULL,
  `phone` TEXT DEFAULT '',
  `supplier_type` TEXT DEFAULT 'materials',
  `payment_terms` TEXT DEFAULT 'cash',
  `credit_limit` NUMERIC DEFAULT '0.00',
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);


-- Table: treasury_accounts
CREATE TABLE IF NOT EXISTS `treasury_accounts` (
  `id` TEXT PRIMARY KEY,
  `name` TEXT NOT NULL,
  `account_type` TEXT NOT NULL DEFAULT 'treasury',
  `outlet_id` TEXT,
  `account_number` TEXT,
  `current_balance` NUMERIC NOT NULL DEFAULT '0.00',
  `is_main` INTEGER NOT NULL DEFAULT '0',
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()',
  `updated_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE INDEX IF NOT EXISTS `idx_treasury_outlet` ON `treasury_accounts` (`outlet_id`);
CREATE INDEX IF NOT EXISTS `idx_treasury_active` ON `treasury_accounts` (`is_active`);

-- Table: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` TEXT PRIMARY KEY,
  `username` TEXT NOT NULL,
  `full_name` TEXT NOT NULL,
  `role` TEXT NOT NULL DEFAULT 'owner',
  `outlet_id` TEXT,
  `pin_hash` TEXT,
  `pin_salt` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()',
  `updated_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE INDEX IF NOT EXISTS `idx_users_role` ON `users` (`role`);
CREATE INDEX IF NOT EXISTS `idx_users_active` ON `users` (`is_active`);

-- Table: item_groups
CREATE TABLE IF NOT EXISTS `item_groups` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_item_groups_code` ON `item_groups` (`code`);

-- Table: item_sections
CREATE TABLE IF NOT EXISTS `item_sections` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `group_id` TEXT,
  `notes` TEXT,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_item_sections_code` ON `item_sections` (`code`);
CREATE INDEX IF NOT EXISTS `idx_item_sections_group` ON `item_sections` (`group_id`);

-- Table: item_units
CREATE TABLE IF NOT EXISTS `item_units` (
  `id` TEXT PRIMARY KEY,
  `code` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `is_active` INTEGER NOT NULL DEFAULT '1',
  `created_at` TEXT NOT NULL DEFAULT 'current_timestamp()'
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_item_units_code` ON `item_units` (`code`);
