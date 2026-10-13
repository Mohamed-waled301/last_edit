import db, { ensureDatabaseIntegrity } from '../db';
import * as XLSX from 'xlsx';
import settingsRepo from './settingsRepo';
import auditRepo from './auditRepo';

export const backupRepo = {
  /**
   * In-memory JSON backup payload object for all Dexie tables
   */
  async getBackupPayload() {
    const tableNames = db.tables.map(t => t.name);
    const backupData = {};

    for (const name of tableNames) {
      backupData[name] = await db.table(name).toArray();
    }

    return {
      app: 'ClothingFactoryERP',
      version: 4,
      exportedAt: new Date().toISOString(),
      tablesCount: tableNames.length,
      data: backupData,
    };
  },

  /**
   * 1. Export ALL Dexie tables into a single JSON file and trigger browser download.
   */
  async exportAllData() {
    const payload = await this.getBackupPayload();

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة_احتياطية_مصنع_الملابس_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Record last backup timestamp
    await settingsRepo.recordBackupTime();
    return { success: true, timestamp: payload.exportedAt };
  },

  /**
   * 2. Import JSON backup file and restore all Dexie tables inside an atomic transaction.
   */
  async importAllData(jsonContent, userId = 'usr-owner') {
    let parsed;
    try {
      parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    } catch {
      throw new Error('ملف النسخة الاحتياطية غير صالح (ملف تالف)');
    }

    if (!parsed || !parsed.data) {
      throw new Error('صيغة ملف النسخة الاحتياطية غير معتمدة');
    }

    await ensureDatabaseIntegrity();
    const backupData = parsed.data;
    const tableNames = db.tables.map(t => t.name);

    await db.transaction('rw', db.tables, async () => {
      // Clear existing records
      for (const table of db.tables) {
        await table.clear();
      }

      // Restore each table
      for (const name of tableNames) {
        if (Array.isArray(backupData[name]) && backupData[name].length > 0) {
          await db.table(name).bulkAdd(backupData[name]);
        }
      }
    });

    await auditRepo.log(userId, 'RESTORE_BACKUP', 'system', 'all', null, { importedAt: new Date().toISOString() });
    return { success: true };
  },

  /**
   * 3. Load realistic Clothing Factory Demo Data
   */
  async loadDemoData(userId = 'usr-owner') {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    await ensureDatabaseIntegrity();

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }

      // 1. Enterprise Profile & Settings
      await db.settings.put({
        id: 1,
        factory_name: 'مصنع النيل الحديث للملابس الجاهزة والمنسوجات',
        phone: '01012345678',
        address: 'المنطقة الصناعية B3 - مجمع مصانع الغزل والنسيج - مدينة العاشر من رمضان',
        vat_enabled: 1,
        vat_rate_percent: 14.0,
        currency_symbol: 'ج.م',
        last_backup_date: now,
        notice_dismissed: false,
      });

      // 2. Outlets & Showrooms
      await db.sales_outlets.bulkAdd([
        { id: 'out-1', name: 'منفذ بيع المصنع (العاشر من رمضان)', location: 'مجمع المصانع - العاشر من رمضان', contact_phone: '01009876541', price_markup_percent: 0, notes: 'منفذ البيع المباشر بسعر المصنع وتوريد طلبيات الجملة', is_active: 1, created_at: now },
        { id: 'out-2', name: 'معرض وسط البلد للملابس (القاهرة)', location: 'شارع طلعت حرب - وسط البلد - القاهرة', contact_phone: '01229876542', price_markup_percent: 10, notes: 'صالة العرض الرئيسية للأزياء والملابس الجاهزة وتجارة التجزئة', is_active: 1, created_at: now },
        { id: 'out-3', name: 'معرض سيتي ستارز (مدينة نصر)', location: 'المول التجاري - الدور الثاني - مدينة نصر', contact_phone: '01119876543', price_markup_percent: 15, notes: 'فرع المبيعات الحصري لأحدث كولكشن كاجوال وجينز', is_active: 1, created_at: now },
      ]);

      // 3. Corporate Users & Roles (including outlet cashier)
      await db.users.bulkAdd([
        { id: 'usr-owner', username: 'owner', full_name: 'م. خالد المنشاوي (الرئيس التنفيذي)', password_hash: '1234', role: 'owner', outlet_id: null, is_active: 1, created_at: now },
        { id: 'usr-purchasing', username: 'purchasing', full_name: 'أ. مروان الشريف (مدير المشتريات ومستلزمات الإنتاج)', password_hash: '1234', role: 'purchasing', outlet_id: null, is_active: 1, created_at: now },
        { id: 'usr-storekeeper', username: 'storekeeper', full_name: 'أ. أيمن القاضي (مدير مستودع الأقمشة والملابس)', password_hash: '1234', role: 'storekeeper', outlet_id: null, is_active: 1, created_at: now },
        { id: 'usr-production', username: 'production', full_name: 'م. يوسف النجار (مدير صالة القص والتشغيل)', password_hash: '1234', role: 'production', outlet_id: null, is_active: 1, created_at: now },
        { id: 'usr-accountant', username: 'accountant', full_name: 'أ. طارق عبد الرحمن (المدير المالي)', password_hash: '1234', role: 'accountant', outlet_id: null, is_active: 1, created_at: now },
        { id: 'usr-cashier', username: 'cashier', full_name: 'أ. سارة عادل (كاشير معرض وسط البلد)', password_hash: '1234', role: 'cashier', outlet_id: 'out-2', is_active: 1, created_at: now },
      ]);

      // 4. Treasuries (Main aggregating treasury + one per outlet)
      await db.treasury_accounts.bulkAdd([
        { id: 'acc-main', name: 'الخزينة المركزية الرئيسية - إدارة المصنع', account_type: 'treasury', outlet_id: null, is_main: 1, current_balance: 185000, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
        { id: 'acc-cib', name: 'حساب العمليات التشغيلية - البنك التجاري الدولي', account_type: 'bank', outlet_id: null, is_main: 0, current_balance: 620000, bank_account_number: '010992384756', bank_name: 'البنك التجاري الدولي', is_active: 1, created_at: now },
        { id: 'acc-out-1', name: 'خزينة منفذ بيع المصنع (العاشر من رمضان)', account_type: 'treasury', outlet_id: 'out-1', is_main: 0, current_balance: 42000, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
        { id: 'acc-out-2', name: 'خزينة معرض وسط البلد (القاهرة)', account_type: 'treasury', outlet_id: 'out-2', is_main: 0, current_balance: 38500, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
        { id: 'acc-out-3', name: 'خزينة معرض سيتي ستارز (مدينة نصر)', account_type: 'treasury', outlet_id: 'out-3', is_main: 0, current_balance: 55000, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
      ]);

      // 5. Storage Locations
      await db.storage_locations.bulkAdd([
        { id: 'loc-1', code: 'LOC-FAB-01', name: 'مستودع الأقمشة والغزول الرئيسي', location_type: 'fabric', notes: 'تخزين أثواب الأقمشة القطنية والجينز والملتون', is_active: 1, created_at: now },
        { id: 'loc-2', code: 'LOC-ACC-02', name: 'مخزن مستلزمات الخياطة والإكسسوارات', location_type: 'accessories', notes: 'الأزرار، السوست، خيوط الحياكة، والبادجات', is_active: 1, created_at: now },
        { id: 'loc-3', code: 'LOC-FIN-03', name: 'مستودع الملابس التامة الجاهزة للبيع', location_type: 'warehouse', notes: 'المنتجات الجاهزة المعبأة والمكوية', is_active: 1, created_at: now },
        { id: 'loc-4', code: 'LOC-SHW-04', name: 'مخزن صالة عرض وسط البلد', location_type: 'outlet', notes: 'بضاعة المعرض للبيع الفوري', is_active: 1, created_at: now },
      ]);

      // 6. Master Data: Sizes & Colors
      await db.item_sizes.bulkAdd([
        { id: 'sz-1', name: 'صغير', code: 'S', is_active: 1 },
        { id: 'sz-2', name: 'وسط', code: 'M', is_active: 1 },
        { id: 'sz-3', name: 'كبير', code: 'L', is_active: 1 },
        { id: 'sz-4', name: 'كبير جداً', code: 'XL', is_active: 1 },
        { id: 'sz-5', name: '2 إكس', code: 'XXL', is_active: 1 },
        { id: 'sz-6', name: '30', code: '30', is_active: 1 },
        { id: 'sz-7', name: '32', code: '32', is_active: 1 },
        { id: 'sz-8', name: '34', code: '34', is_active: 1 },
        { id: 'sz-9', name: '36', code: '36', is_active: 1 },
      ]);

      await db.item_colors.bulkAdd([
        { id: 'clr-1', name: 'أبيض ناصع', hex_code: '#FFFFFF', is_active: 1 },
        { id: 'clr-2', name: 'أسود ملكي', hex_code: '#000000', is_active: 1 },
        { id: 'clr-3', name: 'كحلي داكن', hex_code: '#001F3F', is_active: 1 },
        { id: 'clr-4', name: 'رمادي ميلانج', hex_code: '#7F8C8D', is_active: 1 },
        { id: 'clr-5', name: 'أزرق جينز كلاسيك', hex_code: '#2C3E50', is_active: 1 },
        { id: 'clr-6', name: 'زيتي عسكري', hex_code: '#4B5320', is_active: 1 },
        { id: 'clr-7', name: 'نبيتي شتوي', hex_code: '#780000', is_active: 1 },
      ]);

      // 7. Expense Codes
      await db.expense_codes.bulkAdd([
        { id: 'expc-1', code: 'EXP-RENT-01', name: 'إيجار صالة التشغيل والمصنع', default_amount: 35000, category: 'operating', notes: 'إيجار شهري لصالة القص والخياطة', is_active: 1, created_at: now },
        { id: 'expc-2', code: 'EXP-ELEC-02', name: 'فاتورة الكهرباء الصناعية وقوى المحركات', default_amount: 12000, category: 'utilities', notes: 'كهرباء ماكينات الخياطة والمكابس', is_active: 1, created_at: now },
        { id: 'expc-3', code: 'EXP-MAINT-03', name: 'صيانة ماكينات الخياطة والأوفر والمكابس', default_amount: 3500, category: 'maintenance', notes: 'قطع غيار إبر وكروشيهات وزيوت ماكينات', is_active: 1, created_at: now },
        { id: 'expc-4', code: 'EXP-TRANS-04', name: 'نقل وشحن بضاعة ومعارض وطلبيات', default_amount: 2000, category: 'logistics', notes: 'سيارات نقل وتوزيع بين المصنع والمعارض', is_active: 1, created_at: now },
        { id: 'expc-5', code: 'EXP-HOSP-05', name: 'بوفيه وضيافة ومستلزمات نظافة العمال', default_amount: 1500, category: 'general', notes: 'مشروبات وضيافة ونظافة المصنع', is_active: 1, created_at: now },
        { id: 'expc-6', code: 'EXP-TIPS-06', name: 'إكراميات وتعتيق وتحميل أثواب الأقمشة', default_amount: 800, category: 'general', notes: 'نثريات تحميل وتنزيل الأقمشة', is_active: 1, created_at: now },
      ]);

      // 8. Payment Methods
      await db.payment_methods.bulkAdd([
        { id: 'pm-1', name: 'نقداً (كاش)', code: 'CASH', notes: 'دفع نقدي فوري بالخزينة', is_active: 1 },
        { id: 'pm-2', name: 'تحويل بنكي فوري', code: 'BANK', notes: 'تحويل بنكي على حساب المؤسسة CIB', is_active: 1 },
        { id: 'pm-3', name: 'شيك بنكي تجاري', code: 'CHEQUE', notes: 'شيك مصرفي آجل أو مسطر', is_active: 1 },
        { id: 'pm-4', name: 'محفظة إلكترونية (إنستاباي / فودافون كاش)', code: 'WALLET', notes: 'دفع إلكتروني لحظي بالهاتف', is_active: 1 },
      ]);

      // 9. Master Data: Item Groups & Item Sections
      await db.item_groups.bulkAdd([
        { id: 'grp-1', code: 'GRP-FAB', name: 'أقمشة ومنسوجات', description: 'أثواب الأقمشة القطنية والشتوية والجينز', is_active: 1, created_at: now },
        { id: 'grp-2', code: 'GRP-ACC', name: 'إكسسوارات ومستلزمات', description: 'الأزرار والسوست والبادجات وأكياس التعبئة', is_active: 1, created_at: now },
        { id: 'grp-3', code: 'GRP-THD', name: 'خيوط حياكة', description: 'بكر خيوط الخياطة والأوفر عالية الشد', is_active: 1, created_at: now },
        { id: 'grp-4', code: 'GRP-CAS', name: 'ملابس صيفية كاجوال', description: 'تيشيرتات بولو ورجالي', is_active: 1, created_at: now },
        { id: 'grp-5', code: 'GRP-JNS', name: 'بناطيل جينز ودنيم', description: 'بناطيل جينز سليم فيت ومطاطية', is_active: 1, created_at: now },
        { id: 'grp-6', code: 'GRP-WNT', name: 'ملابس شتوية ثقيلة', description: 'سويت شيرت وهودي مبطن', is_active: 1, created_at: now },
      ]);

      await db.item_sections.bulkAdd([
        { id: 'sec-1', code: 'SEC-FAB', name: 'قسم الأقمشة والغزول', group_id: 'grp-1', is_active: 1, created_at: now },
        { id: 'sec-2', code: 'SEC-ACC', name: 'قسم مستلزمات الخياطة', group_id: 'grp-2', is_active: 1, created_at: now },
        { id: 'sec-3', code: 'SEC-FIN', name: 'قسم الملابس التامة', group_id: 'grp-4', is_active: 1, created_at: now },
      ]);

      // 10. Unified Parties (Suppliers, Customers, Both)
      await db.parties.bulkAdd([
        { id: 'pty-1', code: 'PRT-SUP-01', name: 'مصنع النيل للغزل والنسيج والأقمشة القطنية', phone: '0226901122', address: 'المحلة الكبرى - المنطقة الصناعية', tax_number: '210-458-991', is_supplier: 1, is_customer: 0, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, supplied_all_items: 0, supplied_items: ['mat-1', 'mat-2', 'mat-3'], notes: 'توريد أثواب أقمشة سنجل جيرسي وميلتون وجبردين قطن 100%', is_active: 1, created_at: now },
        { id: 'pty-2', code: 'PRT-SUP-02', name: 'الأهرام لتصنيع وتجارة إكسسوارات وسوست الملابس', phone: '01098877665', address: 'شبرا الخيمة - القليوبية', tax_number: '315-890-442', is_supplier: 1, is_customer: 0, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, supplied_all_items: 0, supplied_items: ['mat-4', 'mat-5', 'mat-6', 'mat-7', 'mat-8'], notes: 'أزرار، سوست نحاس وعظم، خيوط بوليستر، بادجات وتيكتات', is_active: 1, created_at: now },
        { id: 'pty-3', code: 'PRT-SUP-03', name: 'الدلتا لخدمات التطريز الآلي والطباعة السلك سكرين', phone: '01122334488', address: 'العاشر من رمضان - مجمع الصناعات B2', tax_number: '402-119-763', is_supplier: 1, is_customer: 0, supplier_type: 'service', payment_terms: 'cash', credit_limit: 0, supplied_all_items: 1, notes: 'مورد خدمة - تشغيل لدى الغير: تطريز كمبيوتر وطباعة سلك سكرين وربر', is_active: 1, created_at: now },
        { id: 'pty-4', code: 'PRT-SUP-04', name: 'المصرية الألمانية لمغاسل وتجهيز وصباغة الجينز', phone: '01200445566', address: 'أبو رواش - المنطقة الصناعية - الجيزة', tax_number: '501-772-831', is_supplier: 1, is_customer: 0, supplier_type: 'service', payment_terms: 'credit', credit_limit: 0, supplied_all_items: 1, notes: 'مورد خدمة - تشغيل لدى الغير: غسيل إنزيم، تبييض ثلجي، وكرمشة حرارية للجينز', is_active: 1, created_at: now },
        { id: 'pty-5', code: 'PRT-BOTH-05', name: 'شركة طيبة للملابس الجاهزة وتوزيع الجملة', phone: '01019988771', address: 'العتبة - وسط البلد - القاهرة', tax_number: '612-334-550', is_supplier: 1, is_customer: 1, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 250000, supplier_opening_balance: 15000, customer_opening_balance: 35000, supplied_all_items: 1, notes: 'شريك استراتيجي: نشتري منهم أقمشة مستوردة ونبيع لهم ملابس تامة جاهزة (مورد وعميل - يسمح بالمقاصة)', is_active: 1, created_at: now },
        { id: 'pty-6', code: 'PRT-CUST-06', name: 'مجموعة فاشون لاند للمتاجر وسلاسل التوزيع', phone: '0223891000', address: 'مدينة نصر - المنطقة الأولى - القاهرة', tax_number: '710-440-120', is_supplier: 0, is_customer: 1, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 180000, customer_opening_balance: 0, notes: 'عميل رئيسي - طلبيات جملة دورية لكولكشن الصيف والشتاء', is_active: 1, created_at: now },
        { id: 'pty-7', code: 'PRT-CUST-07', name: 'سلسلة متاجر كاجوال كلوب', phone: '01009876543', address: 'المهندسين - شارع لبنان - الجيزة', tax_number: '820-550-230', is_supplier: 0, is_customer: 1, supplier_type: 'goods', payment_terms: 'credit', credit_limit: 200000, customer_opening_balance: 0, notes: 'عميل معتمد لتوزيع البناطيل الجينز والتيشيرتات البولو', is_active: 1, created_at: now },
      ]);

      // Sync into legacy suppliers and customers tables
      await db.suppliers.bulkAdd([
        { id: 'pty-1', name: 'مصنع النيل للغزل والنسيج والأقمشة القطنية', phone: '0226901122', address: 'المحلة الكبرى', tax_number: '210-458-991', supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, notes: 'توريد أقمشة قطنية', is_active: 1, created_at: now },
        { id: 'pty-2', name: 'الأهرام لتصنيع وتجارة إكسسوارات وسوست الملابس', phone: '01098877665', address: 'شبرا الخيمة', tax_number: '315-890-442', supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, notes: 'مستلزمات خياطة', is_active: 1, created_at: now },
        { id: 'pty-3', name: 'الدلتا لخدمات التطريز الآلي والطباعة السلك سكرين', phone: '01122334488', address: 'العاشر من رمضان', tax_number: '402-119-763', supplier_type: 'service', payment_terms: 'cash', credit_limit: 0, notes: 'تطريز وطباعة ملابس', is_active: 1, created_at: now },
        { id: 'pty-4', name: 'المصرية الألمانية لمغاسل وتجهيز وصباغة الجينز', phone: '01200445566', address: 'أبو رواش', tax_number: '501-772-831', supplier_type: 'service', payment_terms: 'credit', credit_limit: 0, notes: 'مغسلة جينز وتشغيل خارجي', is_active: 1, created_at: now },
        { id: 'pty-5', name: 'شركة طيبة للملابس الجاهزة وتوزيع الجملة', phone: '01019988771', address: 'العتبة', tax_number: '612-334-550', supplier_type: 'goods', payment_terms: 'credit', credit_limit: 0, notes: 'مورد أقمشة مستوردة وعميل', is_active: 1, created_at: now },
      ]);

      await db.customers.bulkAdd([
        { id: 'pty-5', name: 'شركة طيبة للملابس الجاهزة وتوزيع الجملة', phone: '01019988771', address: 'العتبة', tax_number: '612-334-550', customer_type: 'local', payment_terms: 'credit', credit_limit: 250000, notes: 'عميل جملة ومورد أقمشة', is_active: 1, created_at: now },
        { id: 'pty-6', name: 'مجموعة فاشون لاند للمتاجر وسلاسل التوزيع', phone: '0223891000', address: 'مدينة نصر', tax_number: '710-440-120', customer_type: 'local', payment_terms: 'credit', credit_limit: 180000, notes: 'عميل جملة ملابس', is_active: 1, created_at: now },
        { id: 'pty-7', name: 'سلسلة متاجر كاجوال كلوب', phone: '01009876543', address: 'المهندسين', tax_number: '820-550-230', customer_type: 'local', payment_terms: 'credit', credit_limit: 200000, notes: 'عميل توزيع بناطيل جينز وتيشيرتات', is_active: 1, created_at: now },
      ]);

      // 10. Raw Materials (خامات الملابس ومستلزمات الإنتاج)
      await db.materials.bulkAdd([
        { id: 'mat-1', code: 'RAW-FAB-01', name: 'قماش سنجل جيرسي قطن 100% ممشط 180 جم', unit: 'كجم', current_stock: 450, min_stock_alert: 80, average_cost: 180, last_purchase_price: 180, location_in_warehouse: 'مستودع الأقمشة - رصيف A1', notes: 'قماش تيشيرتات قطني عالي الجودة معالج ضد الانكماش', is_active: 1, created_at: now },
        { id: 'mat-2', code: 'RAW-DEN-02', name: 'قماش جينز قطن مدعم ليكرا 12 أونصة إنديغو', unit: 'متر', current_stock: 620, min_stock_alert: 120, average_cost: 130, last_purchase_price: 130, location_in_warehouse: 'مستودع الأقمشة - حامل B2', notes: 'قماش بنطلونات جينز مطاطي مريح وثقيل', is_active: 1, created_at: now },
        { id: 'mat-3', code: 'RAW-MLT-03', name: 'قماش ميلتون مبطن شتوي ثقيل 320 جم ميلانج', unit: 'كجم', current_stock: 320, min_stock_alert: 60, average_cost: 210, last_purchase_price: 210, location_in_warehouse: 'مستودع الأقمشة - رصيف A3', notes: 'خامة تصنيع السويت شيرت والهودي الشتوي', is_active: 1, created_at: now },
        { id: 'mat-4', code: 'RAW-BTN-04', name: 'أزرار بولو وقميص بوليستر 4 خرم مقاوم للحرارة', unit: 'كيس', current_stock: 120, min_stock_alert: 25, average_cost: 45, last_purchase_price: 45, location_in_warehouse: 'مخزن المستلزمات - درج C1', notes: 'كيس يحتوي على 144 زرار معالج للكي', is_active: 1, created_at: now },
        { id: 'mat-5', code: 'RAW-ZIP-05', name: 'سحابات جينز معدنية نحاس صلب 15 سم لوك أوتوماتيك', unit: 'قطعة', current_stock: 480, min_stock_alert: 100, average_cost: 12, last_purchase_price: 12, location_in_warehouse: 'مخزن المستلزمات - رف C2', notes: 'سوست جينز يابانية معتمدة عالية المتانة', is_active: 1, created_at: now },
        { id: 'mat-6', code: 'RAW-THD-06', name: 'بكر خيوط حياكة بوليستر 40/2 تركي عالي الشد', unit: 'بكرة', current_stock: 180, min_stock_alert: 30, average_cost: 35, last_purchase_price: 35, location_in_warehouse: 'مخزن المستلزمات - رف C3', notes: 'خيوط ماكينات الأوفر والدرزة السنجر', is_active: 1, created_at: now },
        { id: 'mat-7', code: 'RAW-BAG-07', name: 'أكياس تغليف سلوفان مطبوعة باللوجو بشريط لاصق', unit: 'كيس', current_stock: 2500, min_stock_alert: 400, average_cost: 1.5, last_purchase_price: 1.5, location_in_warehouse: 'مخزن التعبئة والكي - رف D1', notes: 'أكياس تغليف قطيفة وحماية المنتج التام', is_active: 1, created_at: now },
        { id: 'mat-8', code: 'RAW-LBL-08', name: 'تيكت غسيل وماركة قطن منسوج مع مقاسات', unit: 'قطعة', current_stock: 1800, min_stock_alert: 300, average_cost: 2.2, last_purchase_price: 2.2, location_in_warehouse: 'مخزن المستلزمات - درج D2', notes: 'بطاقات منسوجة تتضمن تعليمات الغسيل واللوجو', is_active: 1, created_at: now },
      ]);

      // Sync raw materials into items table
      await db.items.bulkAdd([
        { id: 'mat-1', code: 'RAW-FAB-01', name: 'قماش سنجل جيرسي قطن 100% ممشط 180 جم', item_group: 'أقمشة ومنسوجات', group_id: 'grp-1', item_department: 'قسم الأقمشة والغزول', section_id: 'sec-1', item_type: 'raw_material', image: '', unit: 'كجم', cost_price: 180, selling_price: 180, profit_margin_percent: 0, min_issue_qty: 20, opening_balance: 450, current_stock: 450, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-2', code: 'RAW-DEN-02', name: 'قماش جينز قطن مدعم ليكرا 12 أونصة إنديغو', item_group: 'أقمشة ومنسوجات', group_id: 'grp-1', item_department: 'قسم الأقمشة والغزول', section_id: 'sec-1', item_type: 'raw_material', image: '', unit: 'متر', cost_price: 130, selling_price: 130, profit_margin_percent: 0, min_issue_qty: 30, opening_balance: 620, current_stock: 620, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-3', code: 'RAW-MLT-03', name: 'قماش ميلتون مبطن شتوي ثقيل 320 جم ميلانج', item_group: 'أقمشة ومنسوجات', group_id: 'grp-1', item_department: 'قسم الأقمشة والغزول', section_id: 'sec-1', item_type: 'raw_material', image: '', unit: 'كجم', cost_price: 210, selling_price: 210, profit_margin_percent: 0, min_issue_qty: 25, opening_balance: 320, current_stock: 320, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-4', code: 'RAW-BTN-04', name: 'أزرار بولو وقميص بوليستر 4 خرم مقاوم للحرارة', item_group: 'إكسسوارات ومستلزمات', group_id: 'grp-2', item_department: 'قسم مستلزمات الخياطة', section_id: 'sec-2', item_type: 'raw_material', image: '', unit: 'كيس', cost_price: 45, selling_price: 45, profit_margin_percent: 0, min_issue_qty: 5, opening_balance: 120, current_stock: 120, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-5', code: 'RAW-ZIP-05', name: 'سحابات جينز معدنية نحاس صلب 15 سم لوك أوتوماتيك', item_group: 'إكسسوارات ومستلزمات', group_id: 'grp-2', item_department: 'قسم مستلزمات الخياطة', section_id: 'sec-2', item_type: 'raw_material', image: '', unit: 'قطعة', cost_price: 12, selling_price: 12, profit_margin_percent: 0, min_issue_qty: 20, opening_balance: 480, current_stock: 480, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-6', code: 'RAW-THD-06', name: 'بكر خيوط حياكة بوليستر 40/2 تركي عالي الشد', item_group: 'خيوط حياكة', group_id: 'grp-3', item_department: 'قسم مستلزمات الخياطة', section_id: 'sec-2', item_type: 'raw_material', image: '', unit: 'بكرة', cost_price: 35, selling_price: 35, profit_margin_percent: 0, min_issue_qty: 10, opening_balance: 180, current_stock: 180, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-7', code: 'RAW-BAG-07', name: 'أكياس تغليف سلوفان مطبوعة باللوجو بشريط لاصق', item_group: 'إكسسوارات ومستلزمات', group_id: 'grp-2', item_department: 'قسم مستلزمات الخياطة', section_id: 'sec-2', item_type: 'raw_material', image: '', unit: 'كيس', cost_price: 1.5, selling_price: 1.5, profit_margin_percent: 0, min_issue_qty: 100, opening_balance: 2500, current_stock: 2500, has_variants: 0, variants: [], is_active: 1, created_at: now },
        { id: 'mat-8', code: 'RAW-LBL-08', name: 'تيكت غسيل وماركة قطن منسوج مع مقاسات', item_group: 'إكسسوارات ومستلزمات', group_id: 'grp-2', item_department: 'قسم مستلزمات الخياطة', section_id: 'sec-2', item_type: 'raw_material', image: '', unit: 'قطعة', cost_price: 2.2, selling_price: 2.2, profit_margin_percent: 0, min_issue_qty: 50, opening_balance: 1800, current_stock: 1800, has_variants: 0, variants: [], is_active: 1, created_at: now },
      ]);

      // 11. Finished Clothing Products with Clothing Variants (Sizes & Colors)
      const poloVariants = [
        { id: 'var-polo-1', size: 'M (وسط)', color: 'أبيض ناصع', sku: '1001-M-WHT', opening_balance: 25, current_stock: 25 },
        { id: 'var-polo-2', size: 'L (كبير)', color: 'أبيض ناصع', sku: '1001-L-WHT', opening_balance: 35, current_stock: 35 },
        { id: 'var-polo-3', size: 'XL (كبير جداً)', color: 'أبيض ناصع', sku: '1001-XL-WHT', opening_balance: 30, current_stock: 30 },
        { id: 'var-polo-4', size: 'M (وسط)', color: 'كحلي داكن', sku: '1001-M-NVY', opening_balance: 25, current_stock: 25 },
        { id: 'var-polo-5', size: 'L (كبير)', color: 'كحلي داكن', sku: '1001-L-NVY', opening_balance: 40, current_stock: 40 },
        { id: 'var-polo-6', size: 'XL (كبير جداً)', color: 'كحلي داكن', sku: '1001-XL-NVY', opening_balance: 30, current_stock: 30 },
      ];
      const totalPoloStock = poloVariants.reduce((s, v) => s + v.current_stock, 0);

      const jeansVariants = [
        { id: 'var-jns-1', size: '30 (بنطلون)', color: 'أزرق جينز كلاسيك', sku: '1002-30-BLU', opening_balance: 15, current_stock: 15 },
        { id: 'var-jns-2', size: '32 (بنطلون)', color: 'أزرق جينز كلاسيك', sku: '1002-32-BLU', opening_balance: 35, current_stock: 35 },
        { id: 'var-jns-3', size: '34 (بنطلون)', color: 'أزرق جينز كلاسيك', sku: '1002-34-BLU', opening_balance: 40, current_stock: 40 },
        { id: 'var-jns-4', size: '36 (بنطلون)', color: 'أزرق جينز كلاسيك', sku: '1002-36-BLU', opening_balance: 30, current_stock: 30 },
      ];
      const totalJeansStock = jeansVariants.reduce((s, v) => s + v.current_stock, 0);

      const hoodieVariants = [
        { id: 'var-hod-1', size: 'L (كبير)', color: 'رمادي ميلانج', sku: '1003-L-GRY', opening_balance: 25, current_stock: 25 },
        { id: 'var-hod-2', size: 'XL (كبير جداً)', color: 'رمادي ميلانج', sku: '1003-XL-GRY', opening_balance: 30, current_stock: 30 },
        { id: 'var-hod-3', size: 'XXL (2 إكس)', color: 'رمادي ميلانج', sku: '1003-XXL-GRY', opening_balance: 20, current_stock: 20 },
        { id: 'var-hod-4', size: 'L (كبير)', color: 'زيتي عسكري', sku: '1003-L-OLV', opening_balance: 20, current_stock: 20 },
      ];
      const totalHoodieStock = hoodieVariants.reduce((s, v) => s + v.current_stock, 0);

      await db.items.bulkAdd([
        {
          id: 'prd-1',
          code: '1001',
          name: 'تيشيرت بولو رجالي قطن 100% مطرز',
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
          min_issue_qty: 50,
          opening_balance: totalPoloStock,
          current_stock: totalPoloStock,
          has_variants: 1,
          variants: poloVariants,
          notes: 'تيشيرت قطن ممشط بياقة مضلعة ومطرز بشعار الماركة بدقة',
          is_active: 1,
          created_at: now
        },
        {
          id: 'prd-2',
          code: '1002',
          name: 'بنطلون جينز كاجوال سليم فيت مطاطي',
          item_group: 'بناطيل جينز ودنيم',
          group_id: 'grp-5',
          item_department: 'قسم الملابس التامة',
          section_id: 'sec-3',
          item_type: 'finished',
          image: '',
          unit: 'قطعة',
          cost_price: 220,
          selling_price: 420,
          profit_margin_percent: 90.91,
          min_issue_qty: 30,
          opening_balance: totalJeansStock,
          current_stock: totalJeansStock,
          has_variants: 1,
          variants: jeansVariants,
          notes: 'جينز 12 أونصة معالج بغسيل إنزيم وكرمشة خفيفة مريحة',
          is_active: 1,
          created_at: now
        },
        {
          id: 'prd-3',
          code: '1003',
          name: 'سويت شيرت هودي شتوي ميلتون مبطن',
          item_group: 'ملابس شتوية ثقيلة',
          group_id: 'grp-6',
          item_department: 'قسم الملابس التامة',
          section_id: 'sec-3',
          item_type: 'finished',
          image: '',
          unit: 'قطعة',
          cost_price: 280,
          selling_price: 520,
          profit_margin_percent: 85.71,
          min_issue_qty: 40,
          opening_balance: totalHoodieStock,
          current_stock: totalHoodieStock,
          has_variants: 1,
          variants: hoodieVariants,
          notes: 'هودي شتوي بجيب كانغارو وكابيشو مبطن بطانة داخلية دافئة',
          is_active: 1,
          created_at: now
        },
      ]);

      // Sync into products table for compatibility
      await db.products.bulkAdd([
        { id: 'prd-1', code: '1001', name: 'تيشيرت بولو رجالي قطن 100% مطرز', category: 'ملابس صيفية كاجوال', unit: 'قطعة', target_profit_margin_percent: 45, current_finished_stock: totalPoloStock, cost_price: 135, selling_price: 250, notes: '', is_active: 1, created_at: now },
        { id: 'prd-2', code: '1002', name: 'بنطلون جينز كاجوال سليم فيت مطاطي', category: 'بناطيل جينز ودنيم', unit: 'قطعة', target_profit_margin_percent: 48, current_finished_stock: totalJeansStock, cost_price: 220, selling_price: 420, notes: '', is_active: 1, created_at: now },
        { id: 'prd-3', code: '1003', name: 'سويت شيرت هودي شتوي ميلتون مبطن', category: 'ملابس شتوية ثقيلة', unit: 'قطعة', target_profit_margin_percent: 46, current_finished_stock: totalHoodieStock, cost_price: 280, selling_price: 520, notes: '', is_active: 1, created_at: now },
      ]);

      // 12. Clothing Bills of Materials (BOM) with fabric waste percentage
      await db.bom_items.bulkAdd([
        // BOM for prd-1: Polo T-Shirt (0.35 kg single jersey + 8% cutting waste)
        { id: 'bom-1', product_id: 'prd-1', raw_material_id: 'mat-1', quantity_per_unit: 0.35, waste_percent: 8, notes: 'قماش سنجل جيرسي ممشط (هالك قص وتعشيق باترون 8%)' },
        { id: 'bom-2', product_id: 'prd-1', raw_material_id: 'mat-4', quantity_per_unit: 0.02, waste_percent: 2, notes: 'أزرار بولو (3 أزرار للقطعة من الكيس)' },
        { id: 'bom-3', product_id: 'prd-1', raw_material_id: 'mat-6', quantity_per_unit: 0.05, waste_percent: 1, notes: 'خيوط حياكة بوليستر' },
        { id: 'bom-4', product_id: 'prd-1', raw_material_id: 'mat-7', quantity_per_unit: 1.0, waste_percent: 0, notes: 'كيس تغليف سلوفان مطبوع' },
        { id: 'bom-5', product_id: 'prd-1', raw_material_id: 'mat-8', quantity_per_unit: 1.0, waste_percent: 0, notes: 'تيكت غسيل وماركة قطن' },

        // BOM for prd-2: Jeans (1.35 meters denim + 10% cutting waste)
        { id: 'bom-6', product_id: 'prd-2', raw_material_id: 'mat-2', quantity_per_unit: 1.35, waste_percent: 10, notes: 'قماش جينز 12 أونصة إنديغو (هالك تعشيق 10%)' },
        { id: 'bom-7', product_id: 'prd-2', raw_material_id: 'mat-5', quantity_per_unit: 1.0, waste_percent: 1, notes: 'سوستة جينز نحاس 15 سم' },
        { id: 'bom-8', product_id: 'prd-2', raw_material_id: 'mat-6', quantity_per_unit: 0.12, waste_percent: 2, notes: 'خيوط حياكة بوليستر ثقيلة' },
        { id: 'bom-9', product_id: 'prd-2', raw_material_id: 'mat-7', quantity_per_unit: 1.0, waste_percent: 0, notes: 'كيس تغليف شفاف' },
        { id: 'bom-10', product_id: 'prd-2', raw_material_id: 'mat-8', quantity_per_unit: 1.0, waste_percent: 0, notes: 'تيكت جلد وماركة الجينز' },

        // BOM for prd-3: Hoodie (0.75 kg milton + 7% cutting waste)
        { id: 'bom-11', product_id: 'prd-3', raw_material_id: 'mat-3', quantity_per_unit: 0.75, waste_percent: 7, notes: 'قماش ميلتون مبطن شتوي 320 جم (هالك قص 7%)' },
        { id: 'bom-12', product_id: 'prd-3', raw_material_id: 'mat-6', quantity_per_unit: 0.10, waste_percent: 2, notes: 'خيوط خياطة أوفر وسنجر' },
        { id: 'bom-13', product_id: 'prd-3', raw_material_id: 'mat-7', quantity_per_unit: 1.0, waste_percent: 0, notes: 'كيس تغليف كبير' },
        { id: 'bom-14', product_id: 'prd-3', raw_material_id: 'mat-8', quantity_per_unit: 1.0, waste_percent: 0, notes: 'تيكت ماركة هودي' },
      ]);

      // 13. Monthly Operating Overheads
      await db.overheads.put({
        id: 'ovh-2026-10',
        month_year: '2026-10',
        electricity_cost: 12000,
        water_cost: 1500,
        rent_cost: 35000,
        depreciation_cost: 8000,
        other_expenses: 6500,
        total_overhead: 63000,
        estimated_machine_hours: 600,
        hourly_overhead_rate: 105.00,
        notes: 'تكاليف الطاقة والإيجار واستهلاك ماكينات صالة القص والتشغيل لشهر أكتوبر 2026',
        created_at: now,
      });

      // 14. Purchasing: Purchase Orders, Receipts, Invoices, Payments
      await db.purchase_orders.bulkAdd([
        {
          id: 'po-1',
          po_number: 'PO-2026-001',
          supplier_id: 'pty-1',
          payment_terms: 'credit',
          credit_days: 30,
          due_date: '2026-10-30',
          order_date: '2026-09-25',
          expected_date: '2026-09-29',
          subtotal: 54000,
          discount_percent: 5,
          discount_value: 2700,
          additional_expenses: 1200,
          total_amount: 50100,
          grand_total: 50100,
          installments: [
            { due_date: '2026-10-15', amount: 25000, notes: 'دفعة أولى بعد فحص واستلام الأقمشة' },
            { due_date: '2026-10-30', amount: 25100, notes: 'دفعة ثانية نهائية' },
          ],
          status: 'received',
          notes: 'توريد أثواب قماش سنجل جيرسي قطن مصري 100% عالي التمشيط',
          created_by: 'usr-purchasing',
          created_at: now
        },
        {
          id: 'po-2',
          po_number: 'PO-2026-002',
          supplier_id: 'pty-2',
          payment_terms: 'cash',
          credit_days: 0,
          due_date: null,
          order_date: '2026-09-28',
          expected_date: '2026-10-02',
          subtotal: 18000,
          discount_percent: 0,
          discount_value: 0,
          additional_expenses: 500,
          total_amount: 17500,
          grand_total: 17500,
          status: 'received',
          notes: 'مستلزمات خياطة وسوست وأزرار وبكر خيوط تركي',
          created_by: 'usr-purchasing',
          created_at: now
        }
      ]);

      await db.purchase_order_items.bulkAdd([
        { id: 'poi-1', po_id: 'po-1', material_id: 'mat-1', quantity_ordered: 300, unit_price: 180, total_price: 54000 },
        { id: 'poi-2', po_id: 'po-2', material_id: 'mat-5', quantity_ordered: 500, unit_price: 12, total_price: 6000 },
        { id: 'poi-3', po_id: 'po-2', material_id: 'mat-6', quantity_ordered: 200, unit_price: 35, total_price: 7000 },
        { id: 'poi-4', po_id: 'po-2', material_id: 'mat-4', quantity_ordered: 110, unit_price: 45, total_price: 4950 },
      ]);

      await db.goods_receipts.bulkAdd([
        { id: 'grn-1', grn_number: 'GRN-2026-001', po_id: 'po-1', supplier_id: 'pty-1', receipt_date: '2026-09-28', receiver_name: 'أمين مستودع الأقمشة', notes: 'تم فحص وزن أثواب الأقمشة والتأكد من مطابقة اللون والنعومة', created_by: 'usr-storekeeper', created_at: now },
        { id: 'grn-2', grn_number: 'GRN-2026-002', po_id: 'po-2', supplier_id: 'pty-2', receipt_date: '2026-10-01', receiver_name: 'أمين مخزن المستلزمات', notes: 'استلام وفحص السوست والأزرار والخيوط', created_by: 'usr-storekeeper', created_at: now },
      ]);

      await db.goods_receipt_items.bulkAdd([
        { id: 'gri-1', grn_id: 'grn-1', material_id: 'mat-1', quantity_received: 300, unit_cost: 180, total_cost: 54000 },
        { id: 'gri-2', grn_id: 'grn-2', material_id: 'mat-5', quantity_received: 500, unit_cost: 12, total_cost: 6000 },
        { id: 'gri-3', grn_id: 'grn-2', material_id: 'mat-6', quantity_received: 200, unit_cost: 35, total_cost: 7000 },
      ]);

      await db.supplier_invoices.bulkAdd([
        { id: 'sinv-1', invoice_number: 'INV-SUP-501', supplier_id: 'pty-1', grn_id: 'grn-1', po_id: 'po-1', invoice_date: '2026-09-29', due_date: '2026-10-29', subtotal: 54000, tax_amount: 0, total_amount: 54000, paid_amount: 30000, status: 'partially_paid', notes: 'فاتورة توريد قماش سنجل جيرسي - مسدد 30 ألف ج.م والباقي آجل', created_by: 'usr-accountant', created_at: now },
        { id: 'sinv-2', invoice_number: 'INV-SUP-502', supplier_id: 'pty-2', grn_id: 'grn-2', po_id: 'po-2', invoice_date: '2026-10-01', due_date: null, subtotal: 17500, tax_amount: 0, total_amount: 17500, paid_amount: 17500, status: 'paid', notes: 'فاتورة مستلزمات خياطة مسددة نقداً', created_by: 'usr-accountant', created_at: now },
      ]);

      await db.payments.bulkAdd([
        { id: 'spay-1', payment_number: 'PAY-SUP-101', supplier_id: 'pty-1', invoice_id: 'sinv-1', account_id: 'acc-cib', amount: 30000, payment_date: '2026-09-30', payment_method: 'bank_transfer', notes: 'تحويل بنكي CIB دفعة تحت الحساب لمصنع النيل للأقمشة', created_by: 'usr-accountant', created_at: now },
        { id: 'spay-2', payment_number: 'PAY-SUP-102', supplier_id: 'pty-2', invoice_id: 'sinv-2', account_id: 'acc-main', amount: 17500, payment_date: '2026-10-01', payment_method: 'cash', notes: 'سداد نقدي من الخزينة المركزية لشركة الأهرام للإكسسوارات', created_by: 'usr-accountant', created_at: now },
      ]);

      // 15. Manufacturing: Production Orders with Clothing Stages (Cutting -> Sewing -> Ironing)
      await db.production_orders.bulkAdd([
        {
          id: 'po-mfg-1',
          order_number: 'ORD-MFG-2026-101',
          product_id: 'prd-1',
          batch_quantity: 100,
          start_date: '2026-09-26',
          completion_date: '2026-10-01',
          status: 'stage1_completed',
          location_type: 'inside',
          labor_type: 'piece_rate',
          cutting_labor: 1500,
          sewing_labor: 4000,
          ironing_packing_labor: 1000,
          total_labor_cost: 6500,
          machine_hours: 40,
          allocated_overhead_cost: 4200,
          total_material_cost: 6768, // (100 * 0.35 * 1.08 * 180) + accessories
          total_stage1_cost: 17468,
          unit_stage1_cost: 174.68,
          notes: 'تشغيل دفعة 100 تيشيرت بولو - مراحل القص والتجميع الخياطة الداخلية مكتملة بنجاح',
          created_by: 'usr-production',
          created_at: now
        },
        {
          id: 'po-mfg-2',
          order_number: 'ORD-MFG-2026-102',
          product_id: 'prd-2',
          batch_quantity: 80,
          start_date: '2026-10-02',
          completion_date: null,
          status: 'in_production',
          location_type: 'inside',
          labor_type: 'piece_rate',
          cutting_labor: 2000,
          sewing_labor: 6400,
          ironing_packing_labor: 1200,
          total_labor_cost: 9600,
          machine_hours: 50,
          allocated_overhead_cost: 5250,
          total_material_cost: 16800,
          total_stage1_cost: 31650,
          unit_stage1_cost: 395.63,
          notes: 'تشغيل 80 بنطلون جينز كاجوال - قيد التجميع على ماكينات الخياطة',
          created_by: 'usr-production',
          created_at: now
        }
      ]);

      await db.production_material_usage.bulkAdd([
        { id: 'pmu-1', production_order_id: 'po-mfg-1', raw_material_id: 'mat-1', standard_quantity: 37.8, actual_quantity: 37.8, unit_cost: 180, total_cost: 6804 },
        { id: 'pmu-2', production_order_id: 'po-mfg-1', raw_material_id: 'mat-4', standard_quantity: 2.04, actual_quantity: 2.04, unit_cost: 45, total_cost: 91.8 },
      ]);

      // 16. Outsourced Manufacturing Orders (التصنيع لدى الغير)
      await db.finishing_orders.bulkAdd([
        {
          id: 'out-ord-1',
          finishing_number: 'ORD-OUT-2026-101',
          production_order_id: 'po-mfg-1',
          product_id: 'prd-1',
          finishing_quantity: 100,
          status: 'ready_for_sale', // Completed and sent to inventory
          supplier_id: 'pty-3', // الدلتا لخدمات التطريز (مورد خدمة)
          external_factory_name: 'الدلتا لخدمات التطريز الآلي والطباعة السلك سكرين',
          service_type: 'تطريز كمبيوتر آلي للصدر والياقة',
          stage1_transferred_cost: 17468,
          finishing_labor_fee: 2500, // 25 EGP per piece
          service_fee: 2500,
          transport_cost: 300,
          materials_cost: 200,
          total_finishing_stage_cost: 3000,
          total_outsourced_stage_cost: 3000,
          final_total_batch_cost: 20468, // 17468 internal + 3000 outsourced
          final_unit_cost: 204.68,
          transfer_date: '2026-10-02',
          completion_date: '2026-10-05',
          notes: 'تم استلام الدفعة من مصنع التطريز بجودة ممتازة وتم إدخالها لمستودع الملابس الجاهزة',
          created_by: 'usr-production',
          created_at: now
        }
      ]);

      // 17. Sales Invoices & Customer Receipts
      await db.sales_invoices.bulkAdd([
        {
          id: 'sls-1',
          invoice_number: 'INV-SLS-2026-001',
          customer_id: 'pty-6',
          outlet_id: 'out-2',
          payment_terms: 'credit',
          invoice_date: '2026-10-03',
          due_date: '2026-11-03',
          is_export: 0,
          currency: 'EGP',
          exchange_rate: 1.0,
          subtotal: 37500,
          tax_amount: 5250,
          shipping_expense: 500,
          customs_expense: 0,
          commission_expense: 0,
          total_selling_expenses: 500,
          total_invoice_amount: 42750,
          total_cogs: 20468,
          net_profit: 16532,
          paid_amount: 20000,
          status: 'partially_paid',
          notes: 'توريد دفعة تيشيرتات بولو رجالي لمعرض فاشون لاند بموجب أمر توريد رقم 44',
          created_by: 'usr-accountant',
          created_at: now
        },
        {
          id: 'sls-2',
          invoice_number: 'INV-SLS-2026-002',
          customer_id: 'pty-7',
          outlet_id: 'out-2',
          payment_terms: 'cash',
          invoice_date: '2026-10-05',
          due_date: null, // Cash invoice: NO DUE DATE
          is_export: 0,
          currency: 'EGP',
          exchange_rate: 1.0,
          subtotal: 21000,
          tax_amount: 2940,
          shipping_expense: 0,
          customs_expense: 0,
          commission_expense: 0,
          total_selling_expenses: 0,
          total_invoice_amount: 23940,
          total_cogs: 11000,
          net_profit: 10000,
          paid_amount: 23940,
          status: 'paid',
          notes: 'مبيعات كاش فورية من معرض وسط البلد',
          created_by: 'usr-cashier',
          created_at: now
        }
      ]);

      await db.sales_invoice_items.bulkAdd([
        {
          id: 'sii-1',
          invoice_id: 'sls-1',
          product_id: 'prd-1',
          variant_id: 'var-polo-2',
          quantity: 150,
          price_before_discount: 260,
          discount_value: 10,
          unit_selling_price: 250,
          unit_cost: 136.45,
          total_price: 37500,
          total_cost: 20468,
          item_net_profit: 16532
        },
        {
          id: 'sii-2',
          invoice_id: 'sls-2',
          product_id: 'prd-2',
          variant_id: 'var-jns-2',
          quantity: 50,
          price_before_discount: 430,
          discount_value: 10,
          unit_selling_price: 420,
          unit_cost: 220,
          total_price: 21000,
          total_cost: 11000,
          item_net_profit: 10000
        }
      ]);

      await db.customer_payments.bulkAdd([
        {
          id: 'cpay-1',
          receipt_number: 'REC-SLS-201',
          customer_id: 'pty-6',
          invoice_id: 'sls-1',
          account_id: 'acc-out-2',
          amount: 20000,
          payment_date: '2026-10-04',
          payment_method: 'cash',
          notes: 'تحصيل دفعة نقدية مسددة في خزينة معرض وسط البلد',
          created_by: 'usr-accountant',
          created_at: now
        },
        {
          id: 'cpay-2',
          receipt_number: 'REC-SLS-202',
          customer_id: 'pty-7',
          invoice_id: 'sls-2',
          account_id: 'acc-out-2',
          amount: 23940,
          payment_date: '2026-10-05',
          payment_method: 'cash',
          notes: 'تحصيل فوري لفاتورة كاش معرض وسط البلد',
          created_by: 'usr-cashier',
          created_at: now
        }
      ]);

      // 18. Stock Adjustments (Shortage: waste & samples, Addition)
      await db.stock_adjustments.bulkAdd([
        {
          id: 'adj-1',
          adjustment_number: 'ADJ-1001',
          item_id: 'mat-1',
          variant_id: null,
          location_id: 'loc-1',
          adjustment_type: 'shortage',
          sub_type: 'waste',
          quantity: 5,
          quantity_delta: -5,
          previous_balance: 455,
          new_balance: 450,
          reason: 'هالك قص وقماش تالف في بداية ثوب الغزل',
          notes: 'تم استبعاد 5 كجم قماش هالك بدون أي أثر مالي',
          financial_impact: 0,
          adjustment_date: today,
          created_by: 'usr-storekeeper',
          created_at: now
        },
        {
          id: 'adj-2',
          adjustment_number: 'ADJ-1002',
          item_id: 'prd-1',
          variant_id: 'var-polo-1',
          location_id: 'loc-3',
          adjustment_type: 'shortage',
          sub_type: 'samples',
          quantity: 2,
          quantity_delta: -2,
          previous_balance: 27,
          new_balance: 25,
          reason: 'عينات تسويق وتطوير للموسم الجديد',
          notes: 'عينات مرسلة للمصممين بدون أثر مالي',
          financial_impact: 0,
          adjustment_date: today,
          created_by: 'usr-storekeeper',
          created_at: now
        }
      ]);

      // 19. Cash Transactions Ledger
      await db.cash_transactions.bulkAdd([
        { id: 'tx-1', tx_number: 'TXN-001', account_id: 'acc-cib', tx_type: 'outflow', category: 'supplier_payment', amount: 30000, balance_after: 620000, reference_type: 'supplier_invoices', reference_id: 'sinv-1', description: 'سداد تحويل بنكي CIB لمصنع النيل للأقمشة', created_by: 'usr-accountant', created_at: now },
        { id: 'tx-2', tx_number: 'TXN-002', account_id: 'acc-main', tx_type: 'outflow', category: 'supplier_payment', amount: 18500, balance_after: 185000, reference_type: 'supplier_invoices', reference_id: 'sinv-2', description: 'سداد نقدي من الخزينة المركزية لشركة الأهرام للإكسسوارات', created_by: 'usr-accountant', created_at: now },
        { id: 'tx-3', tx_number: 'TXN-003', account_id: 'acc-out-2', tx_type: 'inflow', category: 'sales', amount: 20000, balance_after: 20000, reference_type: 'sales_invoices', reference_id: 'sls-1', description: 'تحصيل دفعة نقدية من معرض وسط البلد', created_by: 'usr-accountant', created_at: now },
        { id: 'tx-4', tx_number: 'TXN-004', account_id: 'acc-out-2', tx_type: 'inflow', category: 'sales', amount: 23940, balance_after: 38500, reference_type: 'sales_invoices', reference_id: 'sls-2', description: 'تحصيل كاش مبيعات معرض وسط البلد', created_by: 'usr-cashier', created_at: now },
      ]);

      // 20. Stock Movements Ledger (Direction: in / out for receipts, sales, adjustments)
      await db.stock_movements.bulkAdd([
        { id: 'mov-1', item_id: 'mat-1', movement_type: 'purchase_receipt', direction: 'in', location_id: 'loc-1', quantity: 300, unit_cost: 180, reference_type: 'goods_receipts', reference_id: 'grn-1', notes: 'استلام أمر شراء PO-2026-001', date: '2026-09-28', created_at: now },
        { id: 'mov-2', item_id: 'mat-5', movement_type: 'purchase_receipt', direction: 'in', location_id: 'loc-2', quantity: 500, unit_cost: 12, reference_type: 'goods_receipts', reference_id: 'grn-2', notes: 'استلام أمر شراء PO-2026-002', date: '2026-10-01', created_at: now },
        { id: 'mov-3', item_id: 'mat-6', movement_type: 'purchase_receipt', direction: 'in', location_id: 'loc-2', quantity: 200, unit_cost: 35, reference_type: 'goods_receipts', reference_id: 'grn-2', notes: 'استلام أمر شراء PO-2026-002', date: '2026-10-01', created_at: now },
        { id: 'mov-4', item_id: 'prd-1', variant_id: 'var-polo-2', movement_type: 'sales_issue', direction: 'out', location_id: 'loc-3', quantity: 150, unit_cost: 136.45, reference_type: 'sales_invoices', reference_id: 'sls-1', notes: 'صرف مبيعات فاتورة INV-SLS-2026-001', date: '2026-10-03', created_at: now },
        { id: 'mov-5', item_id: 'prd-2', variant_id: 'var-jns-2', movement_type: 'sales_issue', direction: 'out', location_id: 'loc-4', quantity: 50, unit_cost: 220, reference_type: 'sales_invoices', reference_id: 'sls-2', notes: 'صرف مبيعات فاتورة INV-SLS-2026-002', date: '2026-10-05', created_at: now },
        { id: 'mov-6', item_id: 'mat-1', movement_type: 'stock_adjustment', direction: 'out', location_id: 'loc-1', quantity: 5, unit_cost: 180, reference_type: 'stock_adjustments', reference_id: 'adj-1', notes: 'هالك قص وعيوب نسيج', date: today, created_at: now },
      ]);
    });

    await auditRepo.log(userId, 'LOAD_DEMO_DATA', 'system', 'all', null, { seededAt: now, dataset: 'Clothing_Factory_ERP_v4' });
    return { success: true };
  },

  /**
   * 4. Clear all database data.
   */
  async clearAllData(userId = 'usr-owner') {
    await ensureDatabaseIntegrity();

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });

    await ensureDatabaseIntegrity();
    return { success: true };
  },

  /**
   * 5. Export table/report data to Excel (.xlsx) using SheetJS.
   */
  exportToExcel(dataArray, fileName = 'تقرير_مصنع_الملابس', sheetName = 'البيانات') {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      alert('لا توجد بيانات متاحة للتصدير');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataArray);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Apply RTL view to worksheet
    if (!worksheet['!views']) worksheet['!views'] = [];
    worksheet['!views'].push({ rightToLeft: true });

    XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  /**
   * 6. Check and request persistent browser storage.
   */
  async checkStoragePersistence() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          const granted = await navigator.storage.persist();
          return granted;
        }
        return true;
      } catch (e) {
        console.warn('Storage persist request error:', e);
        return false;
      }
    }
    return false;
  }
};

export default backupRepo;
