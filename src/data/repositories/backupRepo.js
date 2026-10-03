import db from '../db';
import * as XLSX from 'xlsx';
import settingsRepo from './settingsRepo';
import auditRepo from './auditRepo';

export const backupRepo = {
  /**
   * 1. Export ALL Dexie tables into a single JSON file and trigger browser download.
   */
  async exportAllData() {
    const tableNames = db.tables.map(t => t.name);
    const backupData = {};

    for (const name of tableNames) {
      backupData[name] = await db.table(name).toArray();
    }

    const payload = {
      app: 'WorkshopERP',
      version: 1,
      exportedAt: new Date().toISOString(),
      tablesCount: tableNames.length,
      data: backupData,
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة_احتياطية_ERP_${dateStr}.json`;
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
      throw new Error('ملف النسخة الاحتياطية غير صالح (JSON تالف)');
    }

    if (!parsed || !parsed.data) {
      throw new Error('صيغة ملف النسخة الاحتياطية غير معتمدة');
    }

    const backupData = parsed.data;
    const tableNames = db.tables.map(t => t.name);
    const availableTables = db.tables.filter(t => !db.backendDB() || db.backendDB().objectStoreNames.contains(t.name));

    await db.transaction('rw', availableTables, async () => {
      // Clear existing records
      for (const table of availableTables) {
        await table.clear();
      }

      // Restore each table
      for (const name of tableNames) {
        if (Array.isArray(backupData[name]) && backupData[name].length > 0) {
          const tableExists = !db.backendDB() || db.backendDB().objectStoreNames.contains(name);
          if (tableExists) {
            await db.table(name).bulkAdd(backupData[name]);
          }
        }
      }
    });

    await auditRepo.log(userId, 'RESTORE_BACKUP', 'system', 'all', null, { importedAt: new Date().toISOString() });
    return { success: true };
  },

  /**
   * 3. Load realistic professional Enterprise ERP demo data.
   */
  async loadDemoData(userId = 'usr-owner') {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Ensure database is fully open with all stores ready
    if (!db.isOpen()) {
      await db.open();
    }
    const availableTables = db.tables.filter(t => !db.backendDB() || db.backendDB().objectStoreNames.contains(t.name));

    await db.transaction('rw', availableTables, async () => {
      for (const table of availableTables) {
        await table.clear();
      }

      // 1. Enterprise Profile & Settings
      await db.settings.put({
        id: 1,
        factory_name: 'مجموعة القمة للصناعات المتطورة والأنظمة الذكية (Apex Enterprise)',
        phone: '+20 2 2450 8899',
        address: 'المنطقة الصناعية الثالثة - مجمع الأنظمة المتقدمة - مدينة العاشر من رمضان',
        vat_enabled: 1,
        vat_rate_percent: 14.0,
        currency_symbol: 'ج.م',
        last_backup_date: now,
        notice_dismissed: false,
      });

      // 2. Corporate Users & Organizational Hierarchy (Default PIN: 1234)
      await db.users.bulkAdd([
        { id: 'usr-owner', username: 'owner', full_name: 'م. خالد المنشاوي (الرئيس التنفيذي - CEO)', password_hash: '1234', role: 'owner', is_active: 1, created_at: now },
        { id: 'usr-purchasing', username: 'purchasing', full_name: 'أ. مروان الشريف (مدير المشتريات وسلاسل الإمداد)', password_hash: '1234', role: 'purchasing', is_active: 1, created_at: now },
        { id: 'usr-storekeeper', username: 'storekeeper', full_name: 'أ. أيمن القاضي (مدير المستودعات واللوجستيات)', password_hash: '1234', role: 'storekeeper', is_active: 1, created_at: now },
        { id: 'usr-production', username: 'production', full_name: 'م. يوسف النجار (مدير العمليات والتصنيع الهندسي)', password_hash: '1234', role: 'production', is_active: 1, created_at: now },
        { id: 'usr-accountant', username: 'accountant', full_name: 'أ. طارق عبد الرحمن (المدير المالي والمراقب المالي - CFO)', password_hash: '1234', role: 'accountant', is_active: 1, created_at: now },
      ]);

      // 3. Treasury & Corporate Bank Accounts
      await db.treasury_accounts.bulkAdd([
        { id: 'acc-1', name: 'الخزينة النقدية المركزية - المقر الرئيسي', account_type: 'treasury', current_balance: 101500, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
        { id: 'acc-2', name: 'حساب العمليات التشغيلية - البنك التجاري الدولي (CIB)', account_type: 'bank', current_balance: 865000, bank_account_number: 'EG65CIB000000010992384756', bank_name: 'Commercial International Bank - فرع التجمع', is_active: 1, created_at: now },
        { id: 'acc-3', name: 'حساب النقد الأجنبي والاستيراد (USD) - بنك QNB', account_type: 'bank', current_balance: 420000, bank_account_number: 'EG12QNB000000030881923411', bank_name: 'QNB Alahli - الفرع الرئيسي', is_active: 1, created_at: now },
        { id: 'acc-4', name: 'خزينة المركز اللوجستي ومنافذ التوزيع B2B', account_type: 'treasury', current_balance: 62500, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
      ]);

      // 4. Strategic Enterprise Suppliers
      await db.suppliers.bulkAdd([
        { id: 'sup-1', name: 'الشركة الدولية للمكونات الإلكترونية والتحكم الآلي (Siemens & Schneider Dist.)', phone: '0226901122', address: 'المنطقة الحرة - مدينة نصر - القاهرة', tax_number: '210-458-991', payment_terms: 'credit_30', credit_limit: 450000, notes: 'مورد معتمد للوحات التحكم، الميكروكنترولر، والحساسات الرقمية الصناعية', is_active: 1, created_at: now },
        { id: 'sup-2', name: 'المصرية الألمانية للمعادن والسبائك الهندسية (EG-Ger Metals Corp)', phone: '01098877665', address: 'المنطقة الصناعية الرابعة - مدينة 6 أكتوبر', tax_number: '315-890-442', payment_terms: 'credit_60', credit_limit: 600000, notes: 'توريد قطاعات الألمنيوم المقوى AL-6063، الواح الستانلس ستيل 316L الهندسية', is_active: 1, created_at: now },
        { id: 'sup-3', name: 'مجمع الصناعات البوليمرية والمواد المركبة (Polymax Advanced Enclosures)', phone: '01122334488', address: 'العاشر من رمضان - مجمع الصناعات البلاستيكية B2', tax_number: '402-119-763', payment_terms: 'credit_30', credit_limit: 300000, notes: 'هياكل وحاويات بوليمرية معيارية مقاومة للهب وعوامل الطقس IP66/IP67', is_active: 1, created_at: now },
        { id: 'sup-4', name: 'المتحدة للتصنيع الدقيق وقطع الليزر CNC (Precision Laser & Machining Lab)', phone: '01200445566', address: 'أبو رواش - المنطقة الصناعية - الجيزة', tax_number: '501-772-831', payment_terms: 'cash', credit_limit: 150000, notes: 'شريك خدمات تصنيع خارجي: تشغيل خراطة وتفريز CNC فائق الدقة، ومعالجات كهرواستاتيكية', is_active: 1, created_at: now },
        { id: 'sup-5', name: 'جلوبال تيك للكابلات والأنظمة الكهروضوئية (GlobalTech Wiring Systems)', phone: '0227918844', address: 'المعادي الجديدة - القاهرة', tax_number: '612-334-550', payment_terms: 'credit_45', credit_limit: 250000, notes: 'حزم كابلات مدرعة، كابلات بيانات عالية السرعة، وموصلات صناعية ذهبية معتمدة', is_active: 1, created_at: now },
      ]);

      // 5. Raw Materials & Engineering Components
      await db.materials.bulkAdd([
        { id: 'mat-1', code: 'RAW-MCU-01', name: 'وحدة معالجة مركزية صناعية وميكروكنترولر 32-bit Cortex Dual Core', unit: 'قطعة', current_stock: 180, min_stock_alert: 30, average_cost: 650, location_in_warehouse: 'مخزن الإلكترونيات - عنبر A - خزانة ESD-12', notes: 'مكون إلكتروني رئيسي معتمد للأنظمة الذكية والمتحكمات', is_active: 1, created_at: now },
        { id: 'mat-2', code: 'RAW-ALM-02', name: 'قواطع وهيكل ألمنيوم مؤكسد صناعي مقوى AL-6063 T6 (متر طولي)', unit: 'متر', current_stock: 420, min_stock_alert: 75, average_cost: 210, location_in_warehouse: 'مستودع المعادن الثقيلة - قطاع B - حامل B-04', notes: 'قطاعات إنشائية خفيفة الوزن فائقة المتانة والتحمل الحراري', is_active: 1, created_at: now },
        { id: 'mat-3', code: 'RAW-ENC-03', name: 'حاوية خارجية بوليمرية مدرعة عازلة ومقاومة للعوامل الجوية IP66', unit: 'وحدة', current_stock: 95, min_stock_alert: 20, average_cost: 420, location_in_warehouse: 'مخزن الهياكل - عنبر C - رف C-02', notes: 'بولي كربونايت مدعم بالألياف مقاوم للأشعة فوق البنفسجية والصدمات', is_active: 1, created_at: now },
        { id: 'mat-4', code: 'RAW-DISP-04', name: 'شاشة لمس صناعية تفاعلية 10.1 بوصة عالية الدقة IPS Rugged Panel', unit: 'قطعة', current_stock: 12, min_stock_alert: 25, average_cost: 1450, location_in_warehouse: 'مخزن البصريات والمكونات الحساسة - خزنة OPT-03', notes: 'تنبيه: الرصيد الحالي تحت حد الأمان الأدنى! يتطلب إصدار أمر شراء عاجل', is_active: 1, created_at: now },
        { id: 'mat-5', code: 'RAW-PWR-05', name: 'مزود طاقة صناعي ذكي عالي الكفاءة 24V DC / 10A Smart Power Hub', unit: 'وحدة', current_stock: 65, min_stock_alert: 15, average_cost: 580, location_in_warehouse: 'مخزن القوى الكهربائية - عنبر D - رف D-01', notes: 'كفاءة طاقة 94% مزود بحماية ذكية ضد التموجات وقصر الدائرة', is_active: 1, created_at: now },
        { id: 'mat-6', code: 'RAW-CAB-06', name: 'حزمة كابلات وموصلات شيلد صناعية عالية التردد ومقاومة للحرارة', unit: 'طقم', current_stock: 240, min_stock_alert: 50, average_cost: 95, location_in_warehouse: 'مخزن الأسلاك والمستلزمات - درج W-15', notes: 'حماية كهرومغناطيسية كاملة EMI Shielding ضد التشويش', is_active: 1, created_at: now },
        { id: 'mat-7', code: 'RAW-SNS-07', name: 'طقم مجسات قياس ذكية رقمية لدرجة الحرارة والضغط والاهتزاز IoT', unit: 'طقم', current_stock: 8, min_stock_alert: 15, average_cost: 340, location_in_warehouse: 'مخزن الحساسات الدقيقة - رف S-05', notes: 'تنبيه: وشك النفاد، مطلوب لتشغيل مشاريع المراقبة الميدانية الجارية', is_active: 1, created_at: now },
        { id: 'mat-8', code: 'RAW-COAT-08', name: 'بودرة طلاء كهرواستاتيكي حراري ومعالجة نانوية مضادة للتآكل', unit: 'كجم', current_stock: 160, min_stock_alert: 30, average_cost: 180, location_in_warehouse: 'مستودع الكيماويات والطلاء - غرفة عازلة F-01', notes: 'طبقة حماية نهائية فائقة المقاومة للملوحة والمواد الكيميائية', is_active: 1, created_at: now },
      ]);

      // 6. Finished Products & Enterprise Systems
      await db.products.bulkAdd([
        { id: 'prd-1', code: 'PRD-CTRL-500', name: 'نظام التحكم الصناعي والأتمتة الذكية Apex Industrial Controller IC-500', category: 'أنظمة التحكم والأتمتة', unit: 'وحدة', target_profit_margin_percent: 38, current_finished_stock: 14, notes: 'متحكم أتمتة صناعي متكامل لخطوط الإنتاج ومحطات التشغيل الحيوية', is_active: 1, created_at: now },
        { id: 'prd-2', code: 'PRD-WKST-200', name: 'محطة العمل والتحكم الميدانية المتنقلة Apex Rugged Workstation WS-200', category: 'محطات التحكم والشاشات الصناعية', unit: 'وحدة', target_profit_margin_percent: 32, current_finished_stock: 9, notes: 'محطة متطورة مدمجة بشاشة تفاعلية وهيكل ألمنيوم مؤكسد ومصدر طاقة داخلي', is_active: 1, created_at: now },
        { id: 'prd-3', code: 'PRD-PWR-80', name: 'لوحة توزيع الطاقة الذكية ومراقبة الأحمال Smart Power Panel SP-80', category: 'لوحات توزيع القوى', unit: 'لوحة', target_profit_margin_percent: 35, current_finished_stock: 6, notes: 'لوحة توزيع أحمال رقمية تدعم بروتوكولات الاتصال الصناعي Modbus/TCP', is_active: 1, created_at: now },
      ]);

      // 7. Bills of Materials (BOM)
      await db.bom_items.bulkAdd([
        // BOM for prd-1: Apex Controller IC-500
        { id: 'bom-1', product_id: 'prd-1', raw_material_id: 'mat-1', quantity_per_unit: 1.0, waste_percent: 1, notes: 'المعالج المركزي ولوحة التحكم الأساسية' },
        { id: 'bom-2', product_id: 'prd-1', raw_material_id: 'mat-3', quantity_per_unit: 1.0, waste_percent: 0, notes: 'الحاوية البوليمرية العازلة IP66' },
        { id: 'bom-3', product_id: 'prd-1', raw_material_id: 'mat-5', quantity_per_unit: 1.0, waste_percent: 2, notes: 'وحدة تزويد الطاقة المستقرة 24V' },
        { id: 'bom-4', product_id: 'prd-1', raw_material_id: 'mat-6', quantity_per_unit: 1.0, waste_percent: 3, notes: 'حزمة كابلات التوصيل الداخلي والشيلد' },
        { id: 'bom-5', product_id: 'prd-1', raw_material_id: 'mat-7', quantity_per_unit: 1.0, waste_percent: 1, notes: 'طقم مجسات القياس الذكية الميدانية' },
        { id: 'bom-6', product_id: 'prd-1', raw_material_id: 'mat-8', quantity_per_unit: 0.5, waste_percent: 5, notes: 'معالجة سطحية وعزل حراري بالنانو' },

        // BOM for prd-2: Rugged Workstation WS-200
        { id: 'bom-7', product_id: 'prd-2', raw_material_id: 'mat-2', quantity_per_unit: 4.5, waste_percent: 4, notes: 'هيكل وشاسيه الألمنيوم المؤكسد المقوى' },
        { id: 'bom-8', product_id: 'prd-2', raw_material_id: 'mat-4', quantity_per_unit: 1.0, waste_percent: 1, notes: 'شاشة اللمس الصناعية التفاعلية 10.1 بوصة' },
        { id: 'bom-9', product_id: 'prd-2', raw_material_id: 'mat-1', quantity_per_unit: 1.0, waste_percent: 0, notes: 'المعالج المركزي المدمج' },
        { id: 'bom-10', product_id: 'prd-2', raw_material_id: 'mat-5', quantity_per_unit: 1.0, waste_percent: 0, notes: 'مزود الطاقة الصناعي' },
        { id: 'bom-11', product_id: 'prd-2', raw_material_id: 'mat-6', quantity_per_unit: 2.0, waste_percent: 5, notes: 'الضفائر والكابلات الداخلية للبيانات' },
        { id: 'bom-12', product_id: 'prd-2', raw_material_id: 'mat-8', quantity_per_unit: 1.2, waste_percent: 5, notes: 'طلاء الهيكل الخارجي كهرواستاتيكياً' },

        // BOM for prd-3: Smart Power Panel SP-80
        { id: 'bom-13', product_id: 'prd-3', raw_material_id: 'mat-2', quantity_per_unit: 3.0, waste_percent: 3, notes: 'قواطع وتثبيتات شاسيه اللوحة' },
        { id: 'bom-14', product_id: 'prd-3', raw_material_id: 'mat-3', quantity_per_unit: 2.0, waste_percent: 1, notes: 'أبواب وكبائن الحماية العازلة' },
        { id: 'bom-15', product_id: 'prd-3', raw_material_id: 'mat-5', quantity_per_unit: 2.0, waste_percent: 0, notes: 'محولات ومزودات الطاقة المزدوجة' },
        { id: 'bom-16', product_id: 'prd-3', raw_material_id: 'mat-6', quantity_per_unit: 3.0, waste_percent: 4, notes: 'حزم توزيع التيار وقواطع الإشارة' },
      ]);

      // 8. Monthly Operating Overheads
      await db.overheads.put({
        id: 'ovh-2026-10',
        month_year: '2026-10',
        electricity_cost: 38500,
        water_cost: 3200,
        rent_cost: 65000,
        depreciation_cost: 28000,
        other_expenses: 14500,
        total_overhead: 149200,
        estimated_machine_hours: 1200,
        hourly_overhead_rate: 124.33,
        notes: 'مصاريف التشغيل الصناعي والطاقة والصيانة لشهر أكتوبر 2026',
        created_at: now,
      });

      // 9. Enterprise Distribution Hubs & Outlets
      await db.sales_outlets.bulkAdd([
        { id: 'out-1', name: 'المركز اللوجستي ومستودع التوزيع المركزي (العاشر من رمضان)', location: 'المجمع اللوجستي للصناعات المتقدمة - العاشر من رمضان', contact_phone: '01009876543', price_markup_percent: 0, notes: 'المستودع الرئيسي والشحن المباشر للمشاريع المؤسسية والحكومية', is_active: 1, created_at: now },
        { id: 'out-2', name: 'مركز مبيعات الحلول الهندسية والمشاريع (القاهرة الجديدة)', location: 'مجمع مكاتب بارك ستريت - التجمع الخامس - القاهرة', contact_phone: '01229876543', price_markup_percent: 10, notes: 'صالة العرض واستقبال كبار عملاء قطاع المشروعات والشركات (Corporate & B2B)', is_active: 1, created_at: now },
        { id: 'out-3', name: 'فرع التوزيع والخدمات اللوجستية (المنطقة الاقتصادية - السويس)', location: 'العين السخنة - المنطقة الاقتصادية الخاصة', contact_phone: '01119876543', price_markup_percent: 5, notes: 'منفذ التوزيع المخصص لخدمة مشاريع الموانئ والمصانع البتروكيماوية وطلبات التصدير', is_active: 1, created_at: now },
      ]);

      // 10. Corporate B2B Clients & Institutional Customers
      await db.customers.bulkAdd([
        { id: 'cust-1', name: 'الشركة المصرية لتطوير البنية التحتية والشبكات الذكية', phone: '0223891000', address: 'القرية الذكية - طريق الإسكندرية الصحراوي', tax_number: '710-440-120', customer_type: 'local', payment_terms: 'credit', credit_limit: 850000, notes: 'عميل استراتيجي - عقود توريد سنوية لمشروعات الأتمتة الوطنية ومحطات المراقبة', is_active: 1, created_at: now },
        { id: 'cust-2', name: 'مجموعة أوراسكوم للصناعات والحلول الهندسية المتكاملة', phone: '0224619000', address: 'أبراج نايل سيتي - بولاق - القاهرة', tax_number: '820-550-230', customer_type: 'local', payment_terms: 'credit', credit_limit: 1200000, notes: 'توريدات أنظمة تحكم ومحطات مراقبة ميدانية لمشاريع المدن الذكية ومحطات المعالجة', is_active: 1, created_at: now },
        { id: 'cust-3', name: 'شركة النيل للاتصالات وتقنية المعلومات (Nile Telecom Systems)', phone: '01019988771', address: 'مدينة نصر - المنطقة الأولى - القاهرة', tax_number: '930-660-340', customer_type: 'local', payment_terms: 'credit', credit_limit: 500000, notes: 'مشروعات تحديث مراكز البيانات وأبراج التغطية ومحطات الطاقة الاحتياطية', is_active: 1, created_at: now },
        { id: 'cust-4', name: 'شركة الخليج للأنظمة الصناعية (Gulf Industrial Technologies LLC)', phone: '+97143990011', address: 'المنطقة الحرة - جبل علي - دبي - الإمارات', tax_number: 'AE-99230188', customer_type: 'export', payment_terms: 'credit', credit_limit: 1500000, notes: 'عميل تصدير إقليمي معتمد - خطابات اعتماد مستندية واعتمادات بنكية L/C', is_active: 1, created_at: now },
      ]);

      // 11. Multi-Supplier Purchasing Procurement Cycles
      // PO-1: Microcontrollers
      await db.purchase_orders.put({
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_id: 'sup-1',
        order_date: '2026-09-15',
        expected_date: '2026-09-20',
        total_amount: 130000,
        status: 'received',
        notes: 'توريد دفعة وحدات معالجة مركزية صناعية وميكروكنترولر 32-bit Cortex Dual Core',
        created_by: 'usr-purchasing',
        created_at: now,
      });

      await db.purchase_order_items.put({
        id: 'poi-1',
        po_id: 'po-1',
        material_id: 'mat-1',
        quantity_ordered: 200,
        unit_price: 650,
        total_price: 130000,
      });

      await db.goods_receipts.put({
        id: 'grn-1',
        grn_number: 'GRN-2026-001',
        po_id: 'po-1',
        supplier_id: 'sup-1',
        receipt_date: '2026-09-18',
        receiver_name: 'أ. أيمن القاضي (مدير المستودعات)',
        notes: 'تم فحص الشحنة واختبار العينات العشوائية في مختبر الجودة الإلكتروني ومطابقتها للمواصفات',
        created_by: 'usr-storekeeper',
        created_at: now,
      });

      await db.goods_receipt_items.put({
        id: 'gri-1',
        grn_id: 'grn-1',
        material_id: 'mat-1',
        quantity_received: 200,
        unit_cost: 650,
        total_cost: 130000,
      });

      await db.supplier_invoices.put({
        id: 'sinv-1',
        invoice_number: 'INV-SUP-8801',
        supplier_id: 'sup-1',
        grn_id: 'grn-1',
        po_id: 'po-1',
        invoice_date: '2026-09-19',
        due_date: '2026-10-19',
        subtotal: 130000,
        tax_amount: 18200,
        total_amount: 148200,
        paid_amount: 100000,
        status: 'partially_paid',
        notes: 'فاتورة توريد ميكروكنترولر - تم سداد 100 ألف ج.م عبر تحويل CIB والباقي يستحق 19 أكتوبر',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.payments.put({
        id: 'spay-1',
        payment_number: 'PAY-SUP-001',
        supplier_id: 'sup-1',
        invoice_id: 'sinv-1',
        account_id: 'acc-2',
        amount: 100000,
        payment_date: '2026-09-20',
        payment_method: 'bank_transfer',
        notes: 'تحويل بنكي صادر من حساب CIB لصالح المورد شركة سيمنز وشنايدر',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // PO-2: Aluminum Extrusions
      await db.purchase_orders.put({
        id: 'po-2',
        po_number: 'PO-2026-002',
        supplier_id: 'sup-2',
        order_date: '2026-09-22',
        expected_date: '2026-09-26',
        total_amount: 84000,
        status: 'received',
        notes: 'توريد قطاعات وهياكل ألمنيوم مؤكسد صناعي مقوى AL-6063 T6',
        created_by: 'usr-purchasing',
        created_at: now,
      });

      await db.purchase_order_items.put({
        id: 'poi-2',
        po_id: 'po-2',
        material_id: 'mat-2',
        quantity_ordered: 400,
        unit_price: 210,
        total_price: 84000,
      });

      await db.goods_receipts.put({
        id: 'grn-2',
        grn_number: 'GRN-2026-002',
        po_id: 'po-2',
        supplier_id: 'sup-2',
        receipt_date: '2026-09-24',
        receiver_name: 'أ. أيمن القاضي (مدير المستودعات)',
        notes: 'فحص الأبعاد الهندسية وسماكة الأكسدة السطحية ومطابقتها للمعايير الألمانية',
        created_by: 'usr-storekeeper',
        created_at: now,
      });

      await db.goods_receipt_items.put({
        id: 'gri-2',
        grn_id: 'grn-2',
        material_id: 'mat-2',
        quantity_received: 400,
        unit_cost: 210,
        total_cost: 84000,
      });

      await db.supplier_invoices.put({
        id: 'sinv-2',
        invoice_number: 'INV-SUP-8802',
        supplier_id: 'sup-2',
        grn_id: 'grn-2',
        po_id: 'po-2',
        invoice_date: '2026-09-25',
        due_date: '2026-10-25',
        subtotal: 84000,
        tax_amount: 11760,
        total_amount: 95760,
        paid_amount: 0,
        status: 'unpaid',
        notes: 'فاتورة سداد آجل 30 يوم تستحق السداد بتاريخ 25 أكتوبر 2026',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // PO-3: Polymer Enclosures
      await db.purchase_orders.put({
        id: 'po-3',
        po_number: 'PO-2026-003',
        supplier_id: 'sup-3',
        order_date: '2026-09-27',
        expected_date: '2026-09-30',
        total_amount: 42000,
        status: 'received',
        notes: 'توريد حاويات بوليمرية مدرعة عازلة ومقاومة للعوامل الجوية IP66',
        created_by: 'usr-purchasing',
        created_at: now,
      });

      await db.purchase_order_items.put({
        id: 'poi-3',
        po_id: 'po-3',
        material_id: 'mat-3',
        quantity_ordered: 100,
        unit_price: 420,
        total_price: 42000,
      });

      await db.goods_receipts.put({
        id: 'grn-3',
        grn_number: 'GRN-2026-003',
        po_id: 'po-3',
        supplier_id: 'sup-3',
        receipt_date: '2026-09-29',
        receiver_name: 'أ. أيمن القاضي (مدير المستودعات)',
        notes: 'تم الاستلام وإيداعها بالمستودع بمطابقة اختبارات العزل',
        created_by: 'usr-storekeeper',
        created_at: now,
      });

      await db.goods_receipt_items.put({
        id: 'gri-3',
        grn_id: 'grn-3',
        material_id: 'mat-3',
        quantity_received: 100,
        unit_cost: 420,
        total_cost: 42000,
      });

      await db.supplier_invoices.put({
        id: 'sinv-3',
        invoice_number: 'INV-SUP-8803',
        supplier_id: 'sup-3',
        grn_id: 'grn-3',
        po_id: 'po-3',
        invoice_date: '2026-09-29',
        due_date: '2026-10-15',
        subtotal: 42000,
        tax_amount: 5880,
        total_amount: 47880,
        paid_amount: 25000,
        status: 'partially_paid',
        notes: 'فاتورة حاويات بوليمرية - مسدد جزء نقداً من الخزينة المركزية',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.payments.put({
        id: 'spay-2',
        payment_number: 'PAY-SUP-002',
        supplier_id: 'sup-3',
        invoice_id: 'sinv-3',
        account_id: 'acc-1',
        amount: 25000,
        payment_date: '2026-09-30',
        payment_method: 'cash',
        notes: 'صرف نقدي من الخزينة المركزية دفعة تحت الحساب لمجمع البوليمرات',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // 12. Multi-Stage Production Orders (Manufacturing Work Orders)
      // Order 1: Stage 1 Completed (Apex Controller IC-500)
      await db.production_orders.put({
        id: 'mfg-1',
        order_number: 'ORD-MFG-2026-001',
        product_id: 'prd-1',
        batch_quantity: 20,
        start_date: '2026-09-10',
        completion_date: '2026-09-22',
        status: 'stage1_completed',
        location_type: 'inside',
        labor_type: 'hourly',
        labor_hours: 48,
        labor_hourly_rate: 150,
        total_labor_cost: 7200,
        machine_hours: 36,
        allocated_overhead_cost: 4475.88,
        total_material_cost: 41800,
        total_stage1_cost: 53475.88,
        unit_stage1_cost: 2673.79,
        notes: 'أمر تشغيل وإنتاج الدفعة الأولى من متحكمات Apex Controller IC-500',
        created_by: 'usr-production',
        created_at: now,
      });

      // Material usage for mfg-1
      await db.production_material_usage.bulkAdd([
        { id: 'pmu-1-1', production_order_id: 'mfg-1', raw_material_id: 'mat-1', standard_quantity: 20.2, actual_quantity: 20.2, unit_cost: 650, total_cost: 13130 },
        { id: 'pmu-1-2', production_order_id: 'mfg-1', raw_material_id: 'mat-3', standard_quantity: 20.0, actual_quantity: 20.0, unit_cost: 420, total_cost: 8400 },
        { id: 'pmu-1-3', production_order_id: 'mfg-1', raw_material_id: 'mat-5', standard_quantity: 20.4, actual_quantity: 20.4, unit_cost: 580, total_cost: 11832 },
        { id: 'pmu-1-4', production_order_id: 'mfg-1', raw_material_id: 'mat-6', standard_quantity: 20.6, actual_quantity: 20.6, unit_cost: 95, total_cost: 1957 },
        { id: 'pmu-1-5', production_order_id: 'mfg-1', raw_material_id: 'mat-7', standard_quantity: 20.2, actual_quantity: 20.2, unit_cost: 340, total_cost: 6868 },
      ]);

      // Order 2: Active in Production (Rugged Workstation WS-200)
      await db.production_orders.put({
        id: 'mfg-2',
        order_number: 'ORD-MFG-2026-002',
        product_id: 'prd-2',
        batch_quantity: 10,
        start_date: '2026-09-28',
        completion_date: null,
        status: 'in_production',
        location_type: 'inside',
        labor_type: 'hourly',
        labor_hours: 30,
        labor_hourly_rate: 160,
        total_labor_cost: 4800,
        machine_hours: 24,
        allocated_overhead_cost: 2983.92,
        total_material_cost: 32500,
        total_stage1_cost: 40283.92,
        unit_stage1_cost: 4028.39,
        notes: 'دفعة محطات العمل الميدانية قيد التجميع والاختبار الميكانيكي على خط الإنتاج',
        created_by: 'usr-production',
        created_at: now,
      });

      await db.production_material_usage.bulkAdd([
        { id: 'pmu-2-1', production_order_id: 'mfg-2', raw_material_id: 'mat-2', standard_quantity: 46.8, actual_quantity: 46.8, unit_cost: 210, total_cost: 9828 },
        { id: 'pmu-2-2', production_order_id: 'mfg-2', raw_material_id: 'mat-4', standard_quantity: 10.1, actual_quantity: 10.1, unit_cost: 1450, total_cost: 14645 },
        { id: 'pmu-2-3', production_order_id: 'mfg-2', raw_material_id: 'mat-1', standard_quantity: 10.0, actual_quantity: 10.0, unit_cost: 650, total_cost: 6500 },
        { id: 'pmu-2-4', production_order_id: 'mfg-2', raw_material_id: 'mat-6', standard_quantity: 21.0, actual_quantity: 21.0, unit_cost: 95, total_cost: 1995 },
      ]);

      // 13. Finishing & Quality Inspection Orders
      // FO-1: Completed into finished goods inventory
      await db.finishing_orders.put({
        id: 'fo-1',
        finishing_number: 'ORD-FIN-2026-001',
        production_order_id: 'mfg-1',
        product_id: 'prd-1',
        finishing_quantity: 20,
        status: 'completed_to_inventory',
        stage1_transferred_cost: 53475.88,
        finishing_materials_cost: 1800,
        finishing_labor_fee: 3500,
        transport_cost: 800,
        total_finishing_stage_cost: 6100,
        final_total_cost: 59575.88,
        final_unit_cost: 2978.79,
        transfer_date: '2026-09-23',
        notes: 'المعايرة الرقمية النهائية، اختبارات العزل والجهد العالي، والتغليف الصناعي المعياري',
        created_by: 'usr-production',
        created_at: now,
      });

      await db.finishing_materials.put({
        id: 'fm-1',
        finishing_order_id: 'fo-1',
        raw_material_id: 'mat-8',
        quantity: 10,
        unit_cost: 180,
        total_cost: 1800,
      });

      // FO-2: Currently in finishing line
      await db.finishing_orders.put({
        id: 'fo-2',
        finishing_number: 'ORD-FIN-2026-002',
        production_order_id: 'mfg-2',
        product_id: 'prd-2',
        finishing_quantity: 5,
        status: 'in_finishing',
        stage1_transferred_cost: 20141.95,
        finishing_materials_cost: 900,
        finishing_labor_fee: 1800,
        transport_cost: 400,
        total_finishing_stage_cost: 3100,
        final_total_cost: 23241.95,
        final_unit_cost: 4648.39,
        transfer_date: today,
        notes: 'مرحلة الطلاء الكهرواستاتيكي، تثبيت الشاشات التفاعلية، واختبارات الصدمات',
        created_by: 'usr-production',
        created_at: now,
      });

      await db.finishing_materials.put({
        id: 'fm-2',
        finishing_order_id: 'fo-2',
        raw_material_id: 'mat-8',
        quantity: 5,
        unit_cost: 180,
        total_cost: 900,
      });

      // 14. Enterprise Sales Invoices & Customer Receipts
      // Invoice 1: Local Infrastructure Project
      await db.sales_invoices.put({
        id: 'sls-1',
        invoice_number: 'INV-SLS-2026-001',
        customer_id: 'cust-1',
        outlet_id: 'out-1',
        invoice_date: '2026-09-28',
        due_date: '2026-10-28',
        is_export: 0,
        currency: 'EGP',
        exchange_rate: 1.0,
        subtotal: 105000,
        tax_amount: 14700,
        shipping_expense: 2500,
        customs_expense: 0,
        commission_expense: 0,
        total_selling_expenses: 2500,
        total_invoice_amount: 122200,
        total_cogs: 62000,
        net_profit: 40500,
        paid_amount: 80000,
        status: 'partially_paid',
        notes: 'توريد وتسليم أجهزة التحكم الصناعي الذكي لمشروع محطات المراقبة القومية',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.sales_invoice_items.put({
        id: 'sii-1',
        invoice_id: 'sls-1',
        product_id: 'prd-1',
        quantity: 6,
        unit_cost: 10333.33,
        unit_selling_price: 17500,
        total_price: 105000,
        total_cost: 62000,
        item_net_profit: 40500,
      });

      await db.customer_payments.put({
        id: 'cpay-1',
        receipt_number: 'REC-SLS-001',
        customer_id: 'cust-1',
        invoice_id: 'sls-1',
        account_id: 'acc-2',
        amount: 80000,
        payment_date: '2026-09-29',
        payment_method: 'bank_transfer',
        notes: 'تحويل بنكي وارد على حساب CIB دفعة أولى بموجب محضر التسليم الابتدائي',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // Invoice 2: Orascom Engineering Solutions (Paid in full)
      await db.sales_invoices.put({
        id: 'sls-2',
        invoice_number: 'INV-SLS-2026-002',
        customer_id: 'cust-2',
        outlet_id: 'out-2',
        invoice_date: '2026-10-01',
        due_date: '2026-11-01',
        is_export: 0,
        currency: 'EGP',
        exchange_rate: 1.0,
        subtotal: 168000,
        tax_amount: 23520,
        shipping_expense: 3000,
        customs_expense: 0,
        commission_expense: 0,
        total_selling_expenses: 3000,
        total_invoice_amount: 194520,
        total_cogs: 104000,
        net_profit: 61000,
        paid_amount: 194520,
        status: 'paid',
        notes: 'تسليم محطات العمل الميدانية المتنقلة بكامل ملحقاتها وشاشات اللمس',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.sales_invoice_items.put({
        id: 'sii-2',
        invoice_id: 'sls-2',
        product_id: 'prd-2',
        quantity: 4,
        unit_cost: 26000,
        unit_selling_price: 42000,
        total_price: 168000,
        total_cost: 104000,
        item_net_profit: 61000,
      });

      await db.customer_payments.put({
        id: 'cpay-2',
        receipt_number: 'REC-SLS-002',
        customer_id: 'cust-2',
        invoice_id: 'sls-2',
        account_id: 'acc-2',
        amount: 194520,
        payment_date: '2026-10-02',
        payment_method: 'bank_transfer',
        notes: 'سداد كامل قيمة الفاتورة عبر تحويل مصرفي معتمد CIB',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // Invoice 3: Export Contract (Gulf Industrial Technologies - Dubai)
      await db.sales_invoices.put({
        id: 'sls-3',
        invoice_number: 'INV-EXP-2026-001',
        customer_id: 'cust-4',
        outlet_id: 'out-3',
        invoice_date: '2026-10-02',
        due_date: '2026-11-15',
        is_export: 1,
        currency: 'USD',
        exchange_rate: 48.50,
        subtotal: 242500,
        tax_amount: 0,
        shipping_expense: 8500,
        customs_expense: 4000,
        commission_expense: 0,
        total_selling_expenses: 12500,
        total_invoice_amount: 255000,
        total_cogs: 135000,
        net_profit: 95000,
        paid_amount: 100000,
        status: 'partially_paid',
        notes: 'تصدير شحنة وحدات تحكم ولوحات توزيع طاقة ذكية لمشروع دبي الجنوب - اعتماد بنكي LC',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.sales_invoice_items.put({
        id: 'sii-3',
        invoice_id: 'sls-3',
        product_id: 'prd-1',
        quantity: 10,
        unit_cost: 13500,
        unit_selling_price: 24250,
        total_price: 242500,
        total_cost: 135000,
        item_net_profit: 95000,
      });

      await db.customer_payments.put({
        id: 'cpay-3',
        receipt_number: 'REC-EXP-001',
        customer_id: 'cust-4',
        invoice_id: 'sls-3',
        account_id: 'acc-3',
        amount: 100000,
        payment_date: '2026-10-03',
        payment_method: 'bank_transfer',
        notes: 'دفعة مقدمة محولة لحساب النقد الأجنبي QNB بالدولار',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // 15. Comprehensive Multi-Account Cash & Banking Ledger
      await db.cash_transactions.bulkAdd([
        {
          id: 'tx-1',
          tx_number: 'TXN-2026-001',
          account_id: 'acc-2',
          tx_type: 'outflow',
          category: 'supplier_payment',
          amount: 100000,
          balance_after: 690480,
          reference_type: 'supplier_invoices',
          reference_id: 'sinv-1',
          description: 'سداد تحويل بنكي CIB لصالح المورد شركة سيمنز وشنايدر إلكتريك',
          created_by: 'usr-accountant',
          created_at: now,
        },
        {
          id: 'tx-2',
          tx_number: 'TXN-2026-002',
          account_id: 'acc-1',
          tx_type: 'outflow',
          category: 'supplier_payment',
          amount: 25000,
          balance_after: 120000,
          reference_type: 'supplier_invoices',
          reference_id: 'sinv-3',
          description: 'دفعة نقدية مسددة من الخزينة الرئيسية لمجمع الصناعات البوليمرية',
          created_by: 'usr-accountant',
          created_at: now,
        },
        {
          id: 'tx-3',
          tx_number: 'TXN-2026-003',
          account_id: 'acc-2',
          tx_type: 'inflow',
          category: 'customer_payment',
          amount: 80000,
          balance_after: 770480,
          reference_type: 'sales_invoices',
          reference_id: 'sls-1',
          description: 'تحويل بنكي وارد من الشركة المصرية لتطوير البنية التحتية',
          created_by: 'usr-accountant',
          created_at: now,
        },
        {
          id: 'tx-4',
          tx_number: 'TXN-2026-004',
          account_id: 'acc-2',
          tx_type: 'inflow',
          category: 'customer_payment',
          amount: 194520,
          balance_after: 865000,
          reference_type: 'sales_invoices',
          reference_id: 'sls-2',
          description: 'سداد كامل فاتورة محطات العمل الميدانية من مجموعة أوراسكوم',
          created_by: 'usr-accountant',
          created_at: now,
        },
        {
          id: 'tx-5',
          tx_number: 'TXN-2026-005',
          account_id: 'acc-3',
          tx_type: 'inflow',
          category: 'customer_payment',
          amount: 100000,
          balance_after: 420000,
          reference_type: 'sales_invoices',
          reference_id: 'sls-3',
          description: 'دفعة اعتماد مستندي تصدير بالعملة الأجنبية من شركة الخليج للأنظمة الصناعية',
          created_by: 'usr-accountant',
          created_at: now,
        },
        {
          id: 'tx-6',
          tx_number: 'TXN-2026-006',
          account_id: 'acc-1',
          tx_type: 'outflow',
          category: 'expense',
          amount: 18500,
          balance_after: 101500,
          reference_type: 'general_expense',
          reference_id: 'exp-2026-01',
          description: 'صيانة دورية لخطوط الإنتاج والتجميع ومعايرة أجهزة الفحص بمختبر الجودة',
          created_by: 'usr-accountant',
          created_at: now,
        },
      ]);

      // 16. Detailed Material Stock Movements & Traceability
      await db.stock_movements.bulkAdd([
        {
          id: 'sm-1',
          material_id: 'mat-1',
          movement_type: 'purchase_in',
          reference_type: 'GRN',
          reference_id: 'grn-1',
          quantity_change: 200,
          unit_cost: 650,
          new_balance: 180,
          notes: 'وارد مشتريات إذن فحص واستلام GRN-2026-001',
          created_by: 'usr-storekeeper',
          created_at: now,
        },
        {
          id: 'sm-2',
          material_id: 'mat-2',
          movement_type: 'purchase_in',
          reference_type: 'GRN',
          reference_id: 'grn-2',
          quantity_change: 400,
          unit_cost: 210,
          new_balance: 420,
          notes: 'وارد مشتريات إذن استلام قطاعات الألمنيوم GRN-2026-002',
          created_by: 'usr-storekeeper',
          created_at: now,
        },
        {
          id: 'sm-3',
          material_id: 'mat-3',
          movement_type: 'purchase_in',
          reference_type: 'GRN',
          reference_id: 'grn-3',
          quantity_change: 100,
          unit_cost: 420,
          new_balance: 95,
          notes: 'وارد مشتريات إذن استلام الحاويات البوليمرية GRN-2026-003',
          created_by: 'usr-storekeeper',
          created_at: now,
        },
      ]);
    });

    await auditRepo.log(userId, 'LOAD_DEMO_DATA', 'system', 'all', null, { seededAt: now, dataset: 'Enterprise_Apex_ERP_v2' });
    return { success: true };
  },

  /**
   * 4. Clear all database data (with double confirmation in UI).
   */
  async clearAllData(userId = 'usr-owner') {
    if (!db.isOpen()) {
      await db.open();
    }
    const availableTables = db.tables.filter(t => !db.backendDB() || db.backendDB().objectStoreNames.contains(t.name));

    await db.transaction('rw', availableTables, async () => {
      for (const table of availableTables) {
        await table.clear();
      }
    });
    return { success: true };
  },

  /**
   * 5. Export table/report data to Excel (.xlsx) using SheetJS.
   */
  exportToExcel(dataArray, fileName = 'تقرير_المؤسسة', sheetName = 'البيانات') {
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
