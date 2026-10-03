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
   * 3. Load realistic Egyptian workshop demo data.
   */
  async loadDemoData(userId = 'usr-owner') {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }

      // 1. Settings
      await db.settings.put({
        id: 1,
        factory_name: 'ورشة ومصنع الأصيل للمصنوعات الخشبية والمعدنية',
        phone: '01001234567',
        address: 'المنطقة الصناعية - المناصرة ودمياط',
        vat_enabled: 1,
        vat_rate_percent: 14.0,
        currency_symbol: 'ج.م',
        last_backup_date: now,
        notice_dismissed: false,
      });

      // 2. Users (Plain demo passwords / PINs: 1234)
      await db.users.bulkAdd([
        { id: 'usr-owner', username: 'owner', full_name: 'المعلم إبراهيم الأصيل (صاحب الورشة)', password_hash: '1234', role: 'owner', is_active: 1, created_at: now },
        { id: 'usr-purchasing', username: 'purchasing', full_name: 'أ / طارق مسعد (مسؤول المشتريات)', password_hash: '1234', role: 'purchasing', is_active: 1, created_at: now },
        { id: 'usr-storekeeper', username: 'storekeeper', full_name: 'عم حمودة (أمين المخزن)', password_hash: '1234', role: 'storekeeper', is_active: 1, created_at: now },
        { id: 'usr-production', username: 'production', full_name: 'الأسطى مجدي (مدير الإنتاج والورشة)', password_hash: '1234', role: 'production', is_active: 1, created_at: now },
        { id: 'usr-accountant', username: 'accountant', full_name: 'أ / عادل فهمي (المحاسب)', password_hash: '1234', role: 'accountant', is_active: 1, created_at: now },
      ]);

      // 3. Treasury Accounts
      await db.treasury_accounts.bulkAdd([
        { id: 'acc-1', name: 'خزنة الورشة النقدية (الرئيسية)', account_type: 'treasury', current_balance: 85000, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
        { id: 'acc-2', name: 'حساب البنك الأهلي المصري', account_type: 'bank', current_balance: 340000, bank_account_number: '1002345678901', bank_name: 'البنك الأهلي - فرع دمياط', is_active: 1, created_at: now },
        { id: 'acc-3', name: 'خزنة معرض المناصرة', account_type: 'treasury', current_balance: 25000, bank_account_number: '', bank_name: '', is_active: 1, created_at: now },
      ]);

      // 4. Suppliers
      await db.suppliers.bulkAdd([
        { id: 'sup-1', name: 'شركة الأهرام للأخشاب (المعلم فتحي الباشا)', phone: '01001234567', address: 'السبتية - القاهرة', tax_number: '100-200-300', payment_terms: 'credit_30', credit_limit: 150000, notes: 'المورد الرئيسي لخشب الزان والأرو المستورد', is_active: 1, created_at: now },
        { id: 'sup-2', name: 'مؤسسة الوفاء للبويات وخامات التشطيب (الحاج صبري)', phone: '01112223344', address: 'العتبة - القاهرة', tax_number: '200-300-400', payment_terms: 'credit_60', credit_limit: 80000, notes: 'دهانات بوليستر، صنفره، معجون، ثنر', is_active: 1, created_at: now },
        { id: 'sup-3', name: 'ورشة ومسبك النور لتشغيل وطلاء المعادن (تشغيل خارجي)', phone: '01223334455', address: 'قليوب - القليوبية', tax_number: '', payment_terms: 'cash', credit_limit: 50000, notes: 'مقاول خدمة تصنيع ودهان ليزر للأرجل المعدنية', is_active: 1, created_at: now },
      ]);

      // 5. Raw Materials
      await db.materials.bulkAdd([
        { id: 'mat-1', code: 'RAW-WOD-01', name: 'لوح خشب زان روماني مجفف 2 بوصة', unit: 'لوح', current_stock: 50, min_stock_alert: 10, average_cost: 1800, location_in_warehouse: 'عنبر الأخشاب - رف أ-1', notes: 'درجة أولى مجفف', is_active: 1, created_at: now },
        { id: 'mat-2', code: 'RAW-MDF-02', name: 'لوح إم دي إف تايلاندي 18 ملم', unit: 'لوح', current_stock: 80, min_stock_alert: 15, average_cost: 950, location_in_warehouse: 'عنبر الألواح - رف ب-3', notes: 'أخضر مقاوم للرطوبة', is_active: 1, created_at: now },
        { id: 'mat-3', code: 'RAW-PNT-03', name: 'جالون دهان بوليستر وبويه فرن تركي', unit: 'لتر', current_stock: 30, min_stock_alert: 5, average_cost: 450, location_in_warehouse: 'مخزن الكيماويات والدهان', notes: 'عالي اللمعة مقاوم للخدش', is_active: 1, created_at: now },
        { id: 'mat-4', code: 'RAW-FIT-04', name: 'طقم مفصلات هيدروليك إيطالي سوفت', unit: 'طقم', current_stock: 120, min_stock_alert: 25, average_cost: 120, location_in_warehouse: 'مخزن الإكسسوار - درج 4', notes: 'إيطالي أصلي باكم', is_active: 1, created_at: now },
        { id: 'mat-5', code: 'RAW-FAB-05', name: 'قماش تنجيد قطيفة معالج ضد البقع', unit: 'متر', current_stock: 14, min_stock_alert: 20, average_cost: 280, location_in_warehouse: 'دولاب الأقمشة والجلود', notes: 'الرصيد تحت حد الأمان المطلوب!', is_active: 1, created_at: now },
        { id: 'mat-6', code: 'RAW-STL-06', name: 'حوامل وأرجل ستانلس مدهب ليزر', unit: 'قطعة', current_stock: 40, min_stock_alert: 10, average_cost: 350, location_in_warehouse: 'عنبر التجميع المعدني', notes: 'ستانلس 304', is_active: 1, created_at: now },
      ]);

      // 6. Products
      await db.products.bulkAdd([
        { id: 'prd-1', code: 'PRD-CHR-01', name: 'كرسي صالون كابوتونيه ملكي موديل 2026', category: 'صالونات وأنتريهات', unit: 'قطعة', target_profit_margin_percent: 35, current_finished_stock: 8, notes: 'شاسيه خشب زان وتنجيد قطيفة تركي', is_active: 1, created_at: now },
        { id: 'prd-2', code: 'PRD-DSK-02', name: 'مكتب مودرن خشب زان وإم دي إف مع أدراج', category: 'أثاث مكتبي', unit: 'قطعة', target_profit_margin_percent: 30, current_finished_stock: 5, notes: 'مكتب مقاس 160 سم مع درج سحري', is_active: 1, created_at: now },
      ]);

      // 7. BOM Items
      await db.bom_items.bulkAdd([
        { id: 'bom-1', product_id: 'prd-1', raw_material_id: 'mat-1', quantity_per_unit: 0.35, waste_percent: 8, notes: 'هيكل ونجارة الكرسي (زان)' },
        { id: 'bom-2', product_id: 'prd-1', raw_material_id: 'mat-5', quantity_per_unit: 1.4, waste_percent: 5, notes: 'قماش التنجيد للضهر والقاعدة' },
        { id: 'bom-3', product_id: 'prd-1', raw_material_id: 'mat-3', quantity_per_unit: 0.4, waste_percent: 5, notes: 'دهان الهيكل والتلميع' },
        { id: 'bom-4', product_id: 'prd-2', raw_material_id: 'mat-2', quantity_per_unit: 1.2, waste_percent: 5, notes: 'المسطح والأجناب (إم دي إف)' },
        { id: 'bom-5', product_id: 'prd-2', raw_material_id: 'mat-1', quantity_per_unit: 0.3, waste_percent: 5, notes: 'شاسيه التقويات والقواطع (زان)' },
        { id: 'bom-6', product_id: 'prd-2', raw_material_id: 'mat-4', quantity_per_unit: 2.0, waste_percent: 0, notes: 'مفصلات ومجر الأدراج الهيدروليك' },
        { id: 'bom-7', product_id: 'prd-2', raw_material_id: 'mat-3', quantity_per_unit: 0.6, waste_percent: 5, notes: 'دهان خارجي' },
      ]);

      // 8. Overheads
      await db.overheads.put({
        id: 'ovh-2026-10',
        month_year: '2026-10',
        electricity_cost: 4500,
        water_cost: 600,
        rent_cost: 12000,
        depreciation_cost: 3500,
        other_expenses: 1400,
        total_overhead: 22000,
        estimated_machine_hours: 440,
        hourly_overhead_rate: 50,
        notes: 'مصاريف تشغيل شهر أكتوبر 2026',
        created_at: now,
      });

      // 9. Sales Outlets
      await db.sales_outlets.bulkAdd([
        { id: 'out-1', name: 'معرض المناصرة الرئيسي', location: 'شارع بورسعيد - المناصرة - القاهرة', contact_phone: '01009876543', price_markup_percent: 0, notes: 'المنفذ الرئيسي المباشر للورشة', is_active: 1, created_at: now },
        { id: 'out-2', name: 'فرع معرض التجمع الخامس', location: 'مول الداون تاون - التجمع الخامس', contact_phone: '01229876543', price_markup_percent: 15, notes: 'معرض النخبة للعملاء المميزين', is_active: 1, created_at: now },
      ]);

      // 10. Customers
      await db.customers.bulkAdd([
        { id: 'cust-1', name: 'معرض قصر الموبيليا (الأستاذ محمود الدسوقي)', phone: '01011223344', address: 'مدينة نصر - القاهرة', tax_number: '450-100-200', customer_type: 'local', payment_terms: 'credit', credit_limit: 200000, notes: 'عميل جملة منتظم - سداد كل 45 يوم', is_active: 1, created_at: now },
        { id: 'cust-2', name: 'شركة الدلتا للتوريدات الفندقية', phone: '01200334455', address: 'سموحة - الإسكندرية', tax_number: '550-200-300', customer_type: 'local', payment_terms: 'credit', credit_limit: 300000, notes: 'مشاريع فرش فنادق وقرى سياحية', is_active: 1, created_at: now },
      ]);

      // 11. Initial Purchasing Records
      await db.purchase_orders.put({
        id: 'po-1',
        po_number: 'PO-2026-001',
        supplier_id: 'sup-1',
        order_date: '2026-09-20',
        expected_date: '2026-09-25',
        total_amount: 36000,
        status: 'received',
        notes: 'توريد دفعة خشب زان روماني للورشة',
        created_by: 'usr-purchasing',
        created_at: now,
      });

      await db.purchase_order_items.put({
        id: 'poi-1',
        po_id: 'po-1',
        material_id: 'mat-1',
        quantity_ordered: 20,
        unit_price: 1800,
        total_price: 36000,
      });

      await db.goods_receipts.put({
        id: 'grn-1',
        grn_number: 'GRN-2026-001',
        po_id: 'po-1',
        supplier_id: 'sup-1',
        receipt_date: '2026-09-24',
        receiver_name: 'عم حمودة (أمين المخزن)',
        notes: 'تم الفحص والاستلام ومطابقة المقاسات بالورشة',
        created_by: 'usr-storekeeper',
        created_at: now,
      });

      await db.goods_receipt_items.put({
        id: 'gri-1',
        grn_id: 'grn-1',
        material_id: 'mat-1',
        quantity_received: 20,
        unit_cost: 1800,
        total_cost: 36000,
      });

      await db.supplier_invoices.put({
        id: 'sinv-1',
        invoice_number: 'INV-SUP-101',
        supplier_id: 'sup-1',
        grn_id: 'grn-1',
        po_id: 'po-1',
        invoice_date: '2026-09-25',
        due_date: '2026-10-25',
        subtotal: 36000,
        tax_amount: 5040,
        total_amount: 41040,
        paid_amount: 20000,
        status: 'partially_paid',
        notes: 'فاتورة خشب زان - تم سداد دفعة مقدمة والباقي آجل 30 يوم',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.payments.put({
        id: 'spay-1',
        payment_number: 'PAY-SUP-001',
        supplier_id: 'sup-1',
        invoice_id: 'sinv-1',
        account_id: 'acc-1',
        amount: 20000,
        payment_date: '2026-09-26',
        payment_method: 'cash',
        notes: 'دفعة نقدية كاش من الخزنة للمعلم فتحي الباشا',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // 12. Initial Sales Invoice Example
      await db.sales_invoices.put({
        id: 'sls-1',
        invoice_number: 'INV-SLS-2026-001',
        customer_id: 'cust-1',
        outlet_id: 'out-1',
        invoice_date: today,
        due_date: null,
        is_export: 0,
        currency: 'EGP',
        exchange_rate: 1.0,
        subtotal: 28000,
        tax_amount: 3920,
        shipping_expense: 500,
        customs_expense: 0,
        commission_expense: 0,
        total_selling_expenses: 500,
        total_invoice_amount: 31920,
        total_cogs: 18500,
        net_profit: 9000,
        paid_amount: 15000,
        status: 'partially_paid',
        notes: 'توريد عدد 8 كراسي صالون ملكي لمعرض قصر الموبيليا',
        created_by: 'usr-accountant',
        created_at: now,
      });

      await db.sales_invoice_items.put({
        id: 'sii-1',
        invoice_id: 'sls-1',
        product_id: 'prd-1',
        quantity: 8,
        unit_cost: 2312.5,
        unit_selling_price: 3500,
        total_price: 28000,
        total_cost: 18500,
        item_net_profit: 9500,
      });

      await db.customer_payments.put({
        id: 'cpay-1',
        receipt_number: 'REC-SLS-001',
        customer_id: 'cust-1',
        invoice_id: 'sls-1',
        account_id: 'acc-1',
        amount: 15000,
        payment_date: today,
        payment_method: 'cash',
        notes: 'عربون واستلام دفعة أولى كاش من قصر الموبيليا',
        created_by: 'usr-accountant',
        created_at: now,
      });

      // 13. Cash Ledger Initial Transactions
      await db.cash_transactions.bulkAdd([
        {
          id: 'tx-1',
          tx_number: 'TXN-2026-001',
          account_id: 'acc-1',
          tx_type: 'outflow',
          category: 'supplier_payment',
          amount: 20000,
          balance_after: 85000,
          reference_type: 'supplier_invoices',
          reference_id: 'sinv-1',
          description: 'سداد دفعة تحت الحساب لشركة الأهرام للأخشاب',
          created_by: 'usr-accountant',
          created_at: now,
        },
        {
          id: 'tx-2',
          tx_number: 'TXN-2026-002',
          account_id: 'acc-1',
          tx_type: 'inflow',
          category: 'customer_payment',
          amount: 15000,
          balance_after: 100000,
          reference_type: 'sales_invoices',
          reference_id: 'sls-1',
          description: 'دفعة نقدية من معرض قصر الموبيليا',
          created_by: 'usr-accountant',
          created_at: now,
        }
      ]);

      // Stock movements
      await db.stock_movements.put({
        id: 'sm-1',
        material_id: 'mat-1',
        movement_type: 'purchase_in',
        reference_type: 'GRN',
        reference_id: 'grn-1',
        quantity_change: 20,
        unit_cost: 1800,
        new_balance: 50,
        notes: 'وارد مشتريات إذن استلام GRN-2026-001',
        created_by: 'usr-storekeeper',
        created_at: now,
      });
    });

    await auditRepo.log(userId, 'LOAD_DEMO_DATA', 'system', 'all', null, { seededAt: now });
    return { success: true };
  },

  /**
   * 4. Clear all database data (with double confirmation in UI).
   */
  async clearAllData(userId = 'usr-owner') {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
    return { success: true };
  },

  /**
   * 5. Export table/report data to Excel (.xlsx) using SheetJS.
   */
  exportToExcel(dataArray, fileName = 'تقرير_الورشة', sheetName = 'البيانات') {
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
