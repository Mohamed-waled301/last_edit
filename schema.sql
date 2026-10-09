-- ========================================================================
-- Apex Enterprise ERP - Complete MySQL Database Schema
-- Encoding: UTF-8 Unicode (utf8mb4_unicode_ci) for complete Arabic support
-- ========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Core Users and Roles
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'owner',
  `outlet_id` VARCHAR(64) DEFAULT NULL,
  `pin_hash` VARCHAR(255) DEFAULT NULL,
  `pin_salt` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Audit and Activity Log
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` VARCHAR(64) NOT NULL,
  `old_data` LONGTEXT DEFAULT NULL,
  `new_data` LONGTEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_user` (`user_id`),
  INDEX `idx_audit_entity` (`entity_type`, `entity_id`),
  INDEX `idx_audit_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. System and Enterprise Settings
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT NOT NULL PRIMARY KEY DEFAULT 1,
  `factory_name` VARCHAR(255) NOT NULL DEFAULT 'مجموعة القمة للصناعات والأنظمة الذكية',
  `phone` VARCHAR(50) DEFAULT '',
  `address` TEXT DEFAULT NULL,
  `vat_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `vat_rate_percent` DECIMAL(5,2) NOT NULL DEFAULT 14.00,
  `currency_symbol` VARCHAR(20) NOT NULL DEFAULT 'ج.م',
  `cost_method` VARCHAR(50) NOT NULL DEFAULT 'weighted_average',
  `last_backup_date` DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Treasuries and Bank Accounts
CREATE TABLE IF NOT EXISTS `treasury_accounts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `account_type` VARCHAR(50) NOT NULL DEFAULT 'treasury',
  `outlet_id` VARCHAR(64) DEFAULT NULL,
  `account_number` VARCHAR(100) DEFAULT NULL,
  `current_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `is_main` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_treasury_outlet` (`outlet_id`),
  INDEX `idx_treasury_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Cash Transactions
CREATE TABLE IF NOT EXISTS `cash_transactions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `tx_number` VARCHAR(100) NOT NULL UNIQUE,
  `account_id` VARCHAR(64) NOT NULL,
  `tx_type` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `category` VARCHAR(100) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `reference_type` VARCHAR(50) DEFAULT NULL,
  `reference_id` VARCHAR(64) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cash_account` (`account_id`),
  INDEX `idx_cash_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Expense Codes Guide
CREATE TABLE IF NOT EXISTS `expense_codes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `category` VARCHAR(100) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Daily Closings
CREATE TABLE IF NOT EXISTS `daily_closings` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `outlet_id` VARCHAR(64) DEFAULT NULL,
  `treasury_id` VARCHAR(64) NOT NULL,
  `closing_date` DATE NOT NULL,
  `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `cash_in` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `cash_out` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `closing_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `actual_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `difference` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'closed',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_closings_date` (`closing_date`),
  INDEX `idx_closings_outlet` (`outlet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Payment Methods
CREATE TABLE IF NOT EXISTS `payment_methods` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Unified Parties (Suppliers and Customers)
CREATE TABLE IF NOT EXISTS `parties` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(50) DEFAULT '',
  `address` TEXT DEFAULT NULL,
  `tax_number` VARCHAR(50) DEFAULT '',
  `is_supplier` TINYINT(1) NOT NULL DEFAULT 0,
  `is_customer` TINYINT(1) NOT NULL DEFAULT 0,
  `deal_type` VARCHAR(50) NOT NULL DEFAULT 'cash',
  `payment_terms` VARCHAR(50) NOT NULL DEFAULT 'cash',
  `credit_limit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `current_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'credit',
  `supplier_opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `supplier_opening_type` VARCHAR(10) NOT NULL DEFAULT 'credit',
  `customer_opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `customer_opening_type` VARCHAR(10) NOT NULL DEFAULT 'debit',
  `notes` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_parties_supplier` (`is_supplier`),
  INDEX `idx_parties_customer` (`is_customer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9b. Opening balances for existing deployments: run these manually once
-- (fresh installs already include the columns above via CREATE TABLE):
-- ALTER TABLE `parties` ADD COLUMN `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE `parties` ADD COLUMN `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'credit';
-- ALTER TABLE `parties` ADD COLUMN `supplier_opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE `parties` ADD COLUMN `supplier_opening_type` VARCHAR(10) NOT NULL DEFAULT 'credit';
-- ALTER TABLE `parties` ADD COLUMN `customer_opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE `parties` ADD COLUMN `customer_opening_type` VARCHAR(10) NOT NULL DEFAULT 'debit';
-- ALTER TABLE `suppliers` ADD COLUMN `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE `suppliers` ADD COLUMN `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'credit';
-- ALTER TABLE `customers` ADD COLUMN `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00;
-- ALTER TABLE `customers` ADD COLUMN `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'debit';

-- 10. Legacy Suppliers Compatibility Table
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `party_id` VARCHAR(64) DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(50) DEFAULT '',
  `supplier_type` VARCHAR(50) DEFAULT 'materials',
  `payment_terms` VARCHAR(50) DEFAULT 'cash',
  `credit_limit` DECIMAL(15,2) DEFAULT 0.00,
  `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'credit',
  `notes` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Legacy Customers Compatibility Table
CREATE TABLE IF NOT EXISTS `customers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `party_id` VARCHAR(64) DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(50) DEFAULT '',
  `customer_type` VARCHAR(50) DEFAULT 'retail',
  `payment_terms` VARCHAR(50) DEFAULT 'cash',
  `credit_limit` DECIMAL(15,2) DEFAULT 0.00,
  `opening_balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `opening_balance_type` VARCHAR(10) NOT NULL DEFAULT 'debit',
  `notes` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Master Items Catalog
CREATE TABLE IF NOT EXISTS `items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(200) NOT NULL,
  `item_group` VARCHAR(100) DEFAULT NULL,
  `item_department` VARCHAR(100) DEFAULT NULL,
  `item_type` VARCHAR(50) NOT NULL DEFAULT 'raw_material',
  `unit` VARCHAR(50) NOT NULL DEFAULT 'piece',
  `cost_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `selling_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `current_stock` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `min_stock` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `notes` TEXT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_items_group` (`item_group`),
  INDEX `idx_items_type` (`item_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Item Sizes
CREATE TABLE IF NOT EXISTS `item_sizes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(50) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Item Colors
CREATE TABLE IF NOT EXISTS `item_colors` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `hex_code` VARCHAR(20) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Raw Materials
CREATE TABLE IF NOT EXISTS `materials` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(200) NOT NULL,
  `unit` VARCHAR(50) NOT NULL DEFAULT 'meter',
  `current_stock` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `min_stock` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `avg_unit_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Products and Models
CREATE TABLE IF NOT EXISTS `products` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(200) NOT NULL,
  `category` VARCHAR(100) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `target_price` DECIMAL(15,2) DEFAULT 0.00,
  `cost_price` DECIMAL(15,2) DEFAULT 0.00,
  `labor_hours` DECIMAL(10,2) DEFAULT 0.00,
  `machine_hours` DECIMAL(10,2) DEFAULT 0.00,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Bill of Materials (BOM)
CREATE TABLE IF NOT EXISTS `bom_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `product_id` VARCHAR(64) NOT NULL,
  `raw_material_id` VARCHAR(64) NOT NULL,
  `quantity_needed` DECIMAL(15,4) NOT NULL,
  `scrap_percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `stage` VARCHAR(50) NOT NULL DEFAULT 'production',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_bom_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Storage Locations
CREATE TABLE IF NOT EXISTS `storage_locations` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `code` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `location_type` VARCHAR(50) NOT NULL DEFAULT 'warehouse',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Stock Transfers
CREATE TABLE IF NOT EXISTS `stock_transfers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `transfer_number` VARCHAR(100) NOT NULL UNIQUE,
  `from_location_id` VARCHAR(64) NOT NULL,
  `to_location_id` VARCHAR(64) NOT NULL,
  `transfer_date` DATE NOT NULL,
  `items_count` INT NOT NULL DEFAULT 0,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Stock Movements Log
CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `material_id` VARCHAR(64) NOT NULL,
  `location_id` VARCHAR(64) DEFAULT NULL,
  `movement_type` VARCHAR(50) NOT NULL,
  `quantity` DECIMAL(15,3) NOT NULL,
  `unit_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `reference_type` VARCHAR(50) DEFAULT NULL,
  `reference_id` VARCHAR(64) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_movements_material` (`material_id`),
  INDEX `idx_movements_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Stock Adjustments
CREATE TABLE IF NOT EXISTS `stock_adjustments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `adjustment_number` VARCHAR(100) NOT NULL UNIQUE,
  `adjustment_type` VARCHAR(50) NOT NULL,
  `sub_type` VARCHAR(50) DEFAULT NULL,
  `adjustment_date` DATE NOT NULL,
  `location_id` VARCHAR(64) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. Periodic Stock Counts
CREATE TABLE IF NOT EXISTS `stock_counts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `count_date` DATE NOT NULL,
  `location_id` VARCHAR(64) DEFAULT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 23. Stock Count Items
CREATE TABLE IF NOT EXISTS `stock_count_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `count_id` VARCHAR(64) NOT NULL,
  `material_id` VARCHAR(64) NOT NULL,
  `system_qty` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `counted_qty` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `difference_qty` DECIMAL(15,3) NOT NULL DEFAULT 0.000,
  `unit_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_difference_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  INDEX `idx_count_items_count` (`count_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 24. Purchase Orders
CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `po_number` VARCHAR(100) NOT NULL UNIQUE,
  `supplier_id` VARCHAR(64) NOT NULL,
  `order_date` DATE NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
  `total_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_po_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 25. Purchase Order Items
CREATE TABLE IF NOT EXISTS `purchase_order_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `po_id` VARCHAR(64) NOT NULL,
  `material_id` VARCHAR(64) NOT NULL,
  `quantity` DECIMAL(15,3) NOT NULL,
  `unit_price` DECIMAL(15,2) NOT NULL,
  `total_cost` DECIMAL(15,2) NOT NULL,
  INDEX `idx_po_items_po` (`po_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 26. Goods Receipts (GRN)
CREATE TABLE IF NOT EXISTS `goods_receipts` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `grn_number` VARCHAR(100) NOT NULL UNIQUE,
  `po_id` VARCHAR(64) DEFAULT NULL,
  `supplier_id` VARCHAR(64) NOT NULL,
  `receipt_date` DATE NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_grn_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 27. Goods Receipt Items
CREATE TABLE IF NOT EXISTS `goods_receipt_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `grn_id` VARCHAR(64) NOT NULL,
  `material_id` VARCHAR(64) NOT NULL,
  `received_quantity` DECIMAL(15,3) NOT NULL,
  `unit_cost` DECIMAL(15,2) NOT NULL,
  INDEX `idx_grn_items_grn` (`grn_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 28. Supplier Invoices
CREATE TABLE IF NOT EXISTS `supplier_invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(100) NOT NULL UNIQUE,
  `supplier_id` VARCHAR(64) NOT NULL,
  `grn_id` VARCHAR(64) DEFAULT NULL,
  `po_id` VARCHAR(64) DEFAULT NULL,
  `invoice_date` DATE NOT NULL,
  `due_date` DATE DEFAULT NULL,
  `subtotal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `paid_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'unpaid',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sinvoice_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 29. Supplier Payments
CREATE TABLE IF NOT EXISTS `payments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `payment_number` VARCHAR(100) NOT NULL UNIQUE,
  `supplier_id` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) DEFAULT NULL,
  `account_id` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `payment_date` DATE NOT NULL,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'cash',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_payments_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 30. Supplier Returns
CREATE TABLE IF NOT EXISTS `supplier_returns` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `return_number` VARCHAR(100) NOT NULL UNIQUE,
  `supplier_id` VARCHAR(64) NOT NULL,
  `material_id` VARCHAR(64) NOT NULL,
  `quantity` DECIMAL(15,3) NOT NULL,
  `unit_price` DECIMAL(15,2) NOT NULL,
  `total_amount` DECIMAL(15,2) NOT NULL,
  `return_date` DATE NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 31. Production Orders
CREATE TABLE IF NOT EXISTS `production_orders` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `order_number` VARCHAR(100) NOT NULL UNIQUE,
  `product_id` VARCHAR(64) NOT NULL,
  `target_quantity` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'in_progress',
  `start_date` DATE NOT NULL,
  `completion_date` DATE DEFAULT NULL,
  `labor_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `overhead_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `material_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `unit_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_production_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 32. Production Material Usage
CREATE TABLE IF NOT EXISTS `production_material_usage` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `production_order_id` VARCHAR(64) NOT NULL,
  `raw_material_id` VARCHAR(64) NOT NULL,
  `quantity_used` DECIMAL(15,3) NOT NULL,
  `unit_cost` DECIMAL(15,2) NOT NULL,
  `total_cost` DECIMAL(15,2) NOT NULL,
  INDEX `idx_pmu_order` (`production_order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 33. Outsourced Orders (التشغيل لدى الغير)
CREATE TABLE IF NOT EXISTS `outsourced_orders` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `order_number` VARCHAR(100) NOT NULL UNIQUE,
  `production_order_id` VARCHAR(64) DEFAULT NULL,
  `supplier_id` VARCHAR(64) NOT NULL,
  `operation_type` VARCHAR(100) NOT NULL,
  `quantity` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `cost_per_unit` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'sent',
  `transfer_date` DATE NOT NULL,
  `return_date` DATE DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_outsourced_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 34. Finishing Orders
CREATE TABLE IF NOT EXISTS `finishing_orders` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `finishing_number` VARCHAR(100) NOT NULL UNIQUE,
  `production_order_id` VARCHAR(64) DEFAULT NULL,
  `product_id` VARCHAR(64) NOT NULL,
  `quantity` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'in_finishing',
  `transfer_date` DATE NOT NULL,
  `completion_date` DATE DEFAULT NULL,
  `finishing_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `unit_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 35. Finishing Materials
CREATE TABLE IF NOT EXISTS `finishing_materials` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `finishing_order_id` VARCHAR(64) NOT NULL,
  `raw_material_id` VARCHAR(64) NOT NULL,
  `quantity_used` DECIMAL(15,3) NOT NULL,
  `unit_cost` DECIMAL(15,2) NOT NULL,
  `total_cost` DECIMAL(15,2) NOT NULL,
  INDEX `idx_finishing_order` (`finishing_order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 36. Overheads
CREATE TABLE IF NOT EXISTS `overheads` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `month_year` VARCHAR(20) NOT NULL UNIQUE,
  `rent` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `electricity` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `indirect_labor` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `maintenance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `depreciation` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `other` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `working_hours_per_month` DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  `hourly_rate` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 37. Sales Outlets and Showrooms
CREATE TABLE IF NOT EXISTS `sales_outlets` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `location` VARCHAR(255) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 38. Sales Invoices
CREATE TABLE IF NOT EXISTS `sales_invoices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_number` VARCHAR(100) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) NOT NULL,
  `outlet_id` VARCHAR(64) DEFAULT NULL,
  `invoice_date` DATE NOT NULL,
  `due_date` DATE DEFAULT NULL,
  `subtotal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `discount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `tax_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `paid_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'unpaid',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sinvoice_customer` (`customer_id`),
  INDEX `idx_sinvoice_outlet` (`outlet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 39. Sales Invoice Items
CREATE TABLE IF NOT EXISTS `sales_invoice_items` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `invoice_id` VARCHAR(64) NOT NULL,
  `product_id` VARCHAR(64) DEFAULT NULL,
  `variant_id` VARCHAR(64) DEFAULT NULL,
  `quantity` DECIMAL(15,2) NOT NULL,
  `unit_price` DECIMAL(15,2) NOT NULL,
  `total_price` DECIMAL(15,2) NOT NULL,
  `unit_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  INDEX `idx_sitems_invoice` (`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 40. Customer Payments
CREATE TABLE IF NOT EXISTS `customer_payments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `receipt_number` VARCHAR(100) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) DEFAULT NULL,
  `account_id` VARCHAR(64) NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `payment_date` DATE NOT NULL,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'cash',
  `notes` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cpayments_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 41. Customer Returns
CREATE TABLE IF NOT EXISTS `customer_returns` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `return_number` VARCHAR(100) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) NOT NULL,
  `invoice_id` VARCHAR(64) DEFAULT NULL,
  `product_id` VARCHAR(64) DEFAULT NULL,
  `quantity` DECIMAL(15,2) NOT NULL,
  `unit_price` DECIMAL(15,2) NOT NULL,
  `total_amount` DECIMAL(15,2) NOT NULL,
  `return_date` DATE NOT NULL,
  `reason` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
