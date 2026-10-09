-- ========================================================================
-- Apex Enterprise ERP - Baseline Clean Seed Script
-- ZERO mock data, ZERO fake records, ZERO English letters.
-- All initial balances and records are at 0.
-- ========================================================================

SET NAMES utf8mb4;

-- 1. Initial System Settings (Empty Factory Info)
INSERT INTO `settings` (
  `id`, `factory_name`, `phone`, `address`, `vat_enabled`, `vat_rate_percent`, `currency_symbol`, `cost_method`, `created_at`
) VALUES (
  1,
  '',
  '',
  '',
  0,
  0.00,
  'ج.م',
  'weighted_average',
  NOW()
) ON DUPLICATE KEY UPDATE `id` = 1;

-- 2. Baseline Main Treasury (Balance = 0.00)
INSERT INTO `treasury_accounts` (
  `id`, `name`, `account_type`, `outlet_id`, `account_number`, `current_balance`, `is_main`, `is_active`, `created_at`
) VALUES (
  'tr-main',
  'الخزينة الرئيسية',
  'treasury',
  NULL,
  '01',
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
  '01',
  'المستودع الرئيسي',
  'warehouse',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE `id` = 'loc-main';
