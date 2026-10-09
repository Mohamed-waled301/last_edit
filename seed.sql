-- ========================================================================
-- Apex Enterprise ERP - Baseline Clean Seed Script
-- ZERO mock products, ZERO mock suppliers, ZERO mock sales.
-- Only essential system setup records to start fresh.
-- ========================================================================

SET NAMES utf8mb4;

-- 1. Initial System Settings
INSERT INTO `settings` (
  `id`, `factory_name`, `phone`, `address`, `vat_enabled`, `vat_rate_percent`, `currency_symbol`, `cost_method`, `created_at`
) VALUES (
  1,
  'مجموعة القمة للصناعات والأنظمة الذكية',
  '',
  '',
  1,
  14.00,
  'ج.م',
  'weighted_average',
  NOW()
) ON DUPLICATE KEY UPDATE `id` = 1;

-- 2. Baseline Main Treasury
INSERT INTO `treasury_accounts` (
  `id`, `name`, `account_type`, `outlet_id`, `account_number`, `current_balance`, `is_main`, `is_active`, `created_at`
) VALUES (
  'tr-main',
  'الخزينة الرئيسية',
  'treasury',
  NULL,
  'TR-001',
  0.00,
  1,
  1,
  NOW()
) ON DUPLICATE KEY UPDATE `id` = 'tr-main';

-- 3. Default Cash Payment Method
INSERT INTO `payment_methods` (
  `id`, `code`, `name`, `is_active`, `created_at`
) VALUES (
  'pm-cash',
  'cash',
  'نقدي',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE `id` = 'pm-cash';

-- 4. Baseline Main Storage Location
INSERT INTO `storage_locations` (
  `id`, `code`, `name`, `location_type`, `is_active`, `created_at`
) VALUES (
  'loc-main',
  'LOC-01',
  'المستودع الرئيسي للمصنع',
  'warehouse',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE `id` = 'loc-main';

-- 5. Standard Clothing Item Sizes Catalog
INSERT INTO `item_sizes` (`id`, `code`, `name`, `is_active`, `created_at`) VALUES
('size-s', 'S', 'Small', 1, NOW()),
('size-m', 'M', 'Medium', 1, NOW()),
('size-l', 'L', 'Large', 1, NOW()),
('size-xl', 'XL', 'X-Large', 1, NOW()),
('size-2xl', '2XL', '2X-Large', 1, NOW()),
('size-3xl', '3XL', '3X-Large', 1, NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;

-- 6. Standard Colors Catalog
INSERT INTO `item_colors` (`id`, `name`, `hex_code`, `is_active`, `created_at`) VALUES
('col-black', 'أسود', '#000000', 1, NOW()),
('col-white', 'أبيض', '#FFFFFF', 1, NOW()),
('col-navy', 'كحلي', '#000080', 1, NOW()),
('col-gray', 'رمادي', '#808080', 1, NOW()),
('col-beige', 'بيج', '#F5F5DC', 1, NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;
