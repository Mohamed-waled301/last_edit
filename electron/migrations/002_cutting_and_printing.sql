-- ========================================================================
-- Apex Apparel ERP - Cutting and Printing Workflow Migration
-- Migration: 002_cutting_and_printing.sql
-- ========================================================================

ALTER TABLE `production_orders` ADD COLUMN `cutting_number` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `cutting_name` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `fabric_type` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `color` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `cutouts_1` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `cutouts_2` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `size_quantities` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `cutting_comment` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `printing_vendor` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `printing_notes` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `total_printing_cost` NUMERIC DEFAULT '0.00';
ALTER TABLE `production_orders` ADD COLUMN `embroidery_vendor` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `embroidery_notes` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `processing_vendor` TEXT;
ALTER TABLE `production_orders` ADD COLUMN `processing_notes` TEXT;

CREATE TABLE IF NOT EXISTS `cutting_printing_payments` (
  `id` TEXT PRIMARY KEY,
  `production_order_id` TEXT NOT NULL,
  `payment_number` TEXT,
  `payment_date` TEXT NOT NULL,
  `amount` NUMERIC NOT NULL DEFAULT '0.00',
  `notes` TEXT,
  `created_at` TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS `idx_cpp_order` ON `cutting_printing_payments` (`production_order_id`);
