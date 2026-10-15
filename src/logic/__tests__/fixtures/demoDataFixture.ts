import db, { ensureDatabaseIntegrity } from '../../../data/db';

/**
 * Test Fixture ONLY: Seeds clothing factory test records for automated testing suites.
 * This file is NEVER imported in production source code or shown in the UI.
 */
export async function seedTestClothingData(userId = 'usr-test-owner') {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  await ensureDatabaseIntegrity();

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }

    // Settings
    await db.settings.put({
      id: 1,
      factory_name: 'شركة الاختبار للملابس الجاهزة',
      phone: '01000000000',
      address: 'المنطقة الصناعية للاختبار',
      vat_enabled: 1,
      vat_rate_percent: 14.0,
      currency_symbol: 'ج.م',
      last_backup_date: now,
      notice_dismissed: false,
    });

    // Outlets
    await db.sales_outlets.bulkAdd([
      { id: 'out-1', name: 'منفذ المصنع', location: 'المصنع', contact_phone: '01000000001', price_markup_percent: 0, notes: '', is_active: 1, created_at: now },
      { id: 'out-2', name: 'معرض التوزيع', location: 'المعرض', contact_phone: '01000000002', price_markup_percent: 10, notes: '', is_active: 1, created_at: now },
    ]);

    // Treasuries
    await db.treasury_accounts.bulkAdd([
      { id: 'acc-main', name: 'الخزينة الرئيسية', account_type: 'treasury', outlet_id: null, is_main: 1, current_balance: 185000, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
      { id: 'acc-cib', name: 'حساب البنك', account_type: 'bank', outlet_id: null, is_main: 0, current_balance: 620000, bank_account_number: '123456', bank_name: 'البنك التجاري', is_active: 1, created_at: now },
      { id: 'acc-out-2', name: 'خزينة المعرض', account_type: 'treasury', outlet_id: 'out-2', is_main: 0, current_balance: 38500, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
    ]);

    // Locations
    await db.storage_locations.bulkAdd([
      { id: 'loc-1', code: 'LOC-1', name: 'مستودع الأقمشة', location_type: 'fabric', notes: '', is_active: 1, created_at: now },
      { id: 'loc-2', code: 'LOC-2', name: 'مخزن المستلزمات', location_type: 'accessories', notes: '', is_active: 1, created_at: now },
      { id: 'loc-3', code: 'LOC-3', name: 'مستودع الملابس التامة', location_type: 'warehouse', notes: '', is_active: 1, created_at: now },
      { id: 'loc-4', code: 'LOC-4', name: 'مخزن صالة العرض', location_type: 'outlet', notes: '', is_active: 1, created_at: now },
    ]);

    // Sizes & Colors
    await db.item_sizes.bulkAdd([
      { id: 'sz-1', name: 'صغير', code: 'S', is_active: 1 },
      { id: 'sz-2', name: 'وسط', code: 'M', is_active: 1 },
      { id: 'sz-3', name: 'كبير', code: 'L', is_active: 1 },
      { id: 'sz-4', name: 'كبير جداً', code: 'XL', is_active: 1 },
    ]);

    await db.item_colors.bulkAdd([
      { id: 'clr-1', name: 'أبيض', hex_code: '#FFFFFF', is_active: 1 },
      { id: 'clr-2', name: 'أسود', hex_code: '#000000', is_active: 1 },
      { id: 'clr-3', name: 'كحلي', hex_code: '#001F3F', is_active: 1 },
    ]);

    // Expense Codes
    await db.expense_codes.bulkAdd([
      { id: 'expc-1', code: 'EXP-1', name: 'إيجار صالة التشغيل', default_amount: 35000, category: 'operating', notes: '', is_active: 1, created_at: now },
      { id: 'expc-2', code: 'EXP-2', name: 'كهرباء صناعية', default_amount: 12000, category: 'utilities', notes: '', is_active: 1, created_at: now },
    ]);

    // Payment Methods
    await db.payment_methods.bulkAdd([
      { id: 'pm-1', name: 'نقداً', code: 'CASH', notes: '', is_active: 1 },
      { id: 'pm-2', name: 'تحويل بنكي', code: 'BANK', notes: '', is_active: 1 },
    ]);

    // Item Groups & Sections
    await db.item_groups.bulkAdd([
      { id: 'grp-1', code: 'GRP-FAB', name: 'أقمشة ومنسوجات', description: '', is_active: 1, created_at: now },
      { id: 'grp-2', code: 'GRP-ACC', name: 'إكسسوارات ومستلزمات', description: '', is_active: 1, created_at: now },
      { id: 'grp-4', code: 'GRP-CAS', name: 'ملابس صيفية كاجوال', description: '', is_active: 1, created_at: now },
      { id: 'grp-5', code: 'GRP-JNS', name: 'بناطيل جينز ودنيم', description: '', is_active: 1, created_at: now },
    ]);

    await db.item_sections.bulkAdd([
      { id: 'sec-1', code: 'SEC-FAB', name: 'قسم الأقمشة والغزول', group_id: 'grp-1', is_active: 1, created_at: now },
      { id: 'sec-2', code: 'SEC-ACC', name: 'قسم مستلزمات الخياطة', group_id: 'grp-2', is_active: 1, created_at: now },
      { id: 'sec-3', code: 'SEC-FIN', name: 'قسم الملابس التامة', group_id: 'grp-4', is_active: 1, created_at: now },
    ]);

    // Parties
    await db.parties.bulkAdd([
      { id: 'pty-sup-1', code: 'PRT-S-01', name: 'مورد أقمشة تجريبي', phone: '01000000010', address: 'موقع المورد', tax_number: '111-222-333', is_supplier: 1, is_customer: 0, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, supplied_all_items: 1, notes: '', is_active: 1, created_at: now },
      { id: 'pty-cust-1', code: 'PRT-C-01', name: 'عميل جملة تجريبي', phone: '01000000020', address: 'موقع العميل', tax_number: '444-555-666', is_supplier: 0, is_customer: 1, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 200000, customer_opening_balance: 0, notes: '', is_active: 1, created_at: now },
    ]);

    await db.suppliers.bulkAdd([
      { id: 'pty-sup-1', name: 'مورد أقمشة تجريبي', phone: '01000000010', address: 'موقع المورد', tax_number: '111-222-333', supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, notes: '', is_active: 1, created_at: now },
    ]);

    await db.customers.bulkAdd([
      { id: 'pty-cust-1', name: 'عميل جملة تجريبي', phone: '01000000020', address: 'موقع العميل', tax_number: '444-555-666', customer_type: 'local', payment_terms: 'credit', credit_limit: 200000, notes: '', is_active: 1, created_at: now },
    ]);

    // Raw Materials
    await db.materials.bulkAdd([
      { id: 'mat-test-1', code: 'RAW-1', name: 'قماش قطن جيرسي تجريبي', unit: 'كجم', current_stock: 450, min_stock_alert: 80, average_cost: 180, last_purchase_price: 180, location_in_warehouse: 'مستودع 1', notes: '', is_active: 1, created_at: now },
      { id: 'mat-test-2', code: 'RAW-2', name: 'أزرار بولو تجريبية', unit: 'كيس', current_stock: 120, min_stock_alert: 25, average_cost: 45, last_purchase_price: 45, location_in_warehouse: 'مستودع 2', notes: '', is_active: 1, created_at: now },
    ]);

    await db.items.bulkAdd([
      { id: 'mat-test-1', code: 'RAW-1', name: 'قماش قطن جيرسي تجريبي', item_group: 'أقمشة ومنسوجات', group_id: 'grp-1', item_department: 'قسم الأقمشة والغزول', section_id: 'sec-1', item_type: 'raw_material', image: '', unit: 'كجم', cost_price: 180, selling_price: 180, profit_margin_percent: 0, min_issue_qty: 20, opening_balance: 450, current_stock: 450, has_variants: 0, variants: [], is_active: 1, created_at: now },
      { id: 'mat-test-2', code: 'RAW-2', name: 'أزرار بولو تجريبية', item_group: 'إكسسوارات ومستلزمات', group_id: 'grp-2', item_department: 'قسم مستلزمات الخياطة', section_id: 'sec-2', item_type: 'raw_material', image: '', unit: 'كيس', cost_price: 45, selling_price: 45, profit_margin_percent: 0, min_issue_qty: 5, opening_balance: 120, current_stock: 120, has_variants: 0, variants: [], is_active: 1, created_at: now },
    ]);

    // Finished Items
    const poloVariants = [
      { id: 'var-p-1', size: 'M (وسط)', color: 'أبيض', sku: '1001-M', opening_balance: 25, current_stock: 25 },
      { id: 'var-p-2', size: 'L (كبير)', color: 'أبيض', sku: '1001-L', opening_balance: 35, current_stock: 35 },
    ];
    const totalPolo = 60;

    await db.items.bulkAdd([
      {
        id: 'prd-test-1',
        code: '1001',
        name: 'تيشيرت بولو تجريبي',
        item_group: 'ملابس صيفية كاجوال',
        group_id: 'grp-4',
        item_department: 'قسم الملابس التامة',
        section_id: 'sec-3',
        item_type: 'finished',
        image: '',
        unit: 'قطعة',
        cost_price: 135,
        selling_price: 250,
        profit_margin_percent: 85.19,
        min_issue_qty: 10,
        opening_balance: totalPolo,
        current_stock: totalPolo,
        has_variants: 1,
        variants: poloVariants,
        notes: '',
        is_active: 1,
        created_at: now,
      },
    ]);

    await db.products.bulkAdd([
      { id: 'prd-test-1', code: '1001', name: 'تيشيرت بولو تجريبي', category: 'ملابس صيفية كاجوال', unit: 'قطعة', target_profit_margin_percent: 45, current_finished_stock: totalPolo, cost_price: 135, selling_price: 250, notes: '', is_active: 1, created_at: now },
    ]);

    // BOM
    await db.bom_items.bulkAdd([
      { id: 'bom-t-1', product_id: 'prd-test-1', raw_material_id: 'mat-test-1', quantity_per_unit: 0.35, waste_percent: 8, notes: '' },
      { id: 'bom-t-2', product_id: 'prd-test-1', raw_material_id: 'mat-test-2', quantity_per_unit: 0.02, waste_percent: 2, notes: '' },
    ]);
  });

  return { success: true };
}
