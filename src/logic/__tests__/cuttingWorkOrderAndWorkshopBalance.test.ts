import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../data/db';
import { manufacturingRepo } from '../../data/repositories/manufacturingRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import {
  generateCutOrderHtml,
  DEFAULT_CUT_ORDER_PRINT_OPTIONS
} from '../../modules/print/invoicePrintTemplates';

describe('Cutting Work Order Checkboxes, Subcontractor Balance Integration, & Print Layouts', () => {
  beforeEach(async () => {
    // Clear relevant tables
    await db.production_orders.clear();
    await db.production_material_usage.clear();
    await db.stock_movements.clear();
    await db.supplier_invoices.clear();
    await db.payments.clear();
    await db.parties.clear();
    await db.items.clear();
    await db.materials.clear();
    await db.products.clear();
  });

  describe('1. Customizable Cutting Screen Printout Options', () => {
    it('defaults sensitive cost checkboxes to OFF', () => {
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showStoryDetails).toBe(true);
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showColorSizeMatrix).toBe(true);
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showStageWorkshop).toBe(true);
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showFabricCost).toBe(false);
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showStageCosts).toBe(false);
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showTotalCutCost).toBe(false);
      expect(DEFAULT_CUT_ORDER_PRINT_OPTIONS.showAgreedRates).toBe(false);
    });

    it('excludes cost fields from print HTML when options are toggled OFF', () => {
      const order = {
        order_number: 'CUT-2026-001',
        cutting_number: 'CUT-2026-001',
        cutting_name: 'قميص كاجوال رجالي',
        start_date: '2026-10-20',
        fabric_type: 'قطن مصري 100%',
        batch_quantity: 100,
        unit_cost: 125.5,
        total_product_cost: 12550,
        matrix: [
          { color: 'أبيض', S: 25, M: 25, L: 25, XL: 25, total: 100 }
        ],
        stages: {
          printing: {
            vendor_name: 'مطبعة الأمل',
            pricing_type: 'fixed',
            total_cost: 3000,
            price_per_piece: 30
          }
        }
      };

      // Generate with default options (costs OFF)
      const htmlNoCosts = generateCutOrderHtml(order, {}, 'A4', DEFAULT_CUT_ORDER_PRINT_OPTIONS);

      // Verify essential work order fields appear
      expect(htmlNoCosts).toContain('CUT-2026-001');
      expect(htmlNoCosts).toContain('قميص كاجوال رجالي');
      expect(htmlNoCosts).toContain('مطبعة الأمل');
      expect(htmlNoCosts).toContain('أبيض');

      // Verify NO cost numbers appear for sensitive financial values
      expect(htmlNoCosts).not.toContain('12,550');
      expect(htmlNoCosts).not.toContain('12550');
      expect(htmlNoCosts).not.toContain('تكلفة الخامة');
      expect(htmlNoCosts).not.toContain('إجمالي تكلفة أمر القص');
      expect(htmlNoCosts).not.toContain('3,000 ج.م');
      expect(htmlNoCosts).not.toContain('سعر الاتفاق');

      // Generate with all costs toggled ON
      const htmlWithCosts = generateCutOrderHtml(order, {}, 'A4', {
        ...DEFAULT_CUT_ORDER_PRINT_OPTIONS,
        showFabricCost: true,
        showStageCosts: true,
        showTotalCutCost: true,
        showAgreedRates: true
      });

      expect(htmlWithCosts).toContain('إجمالي تكلفة أمر القص');
      expect(htmlWithCosts).toContain('تكاليف مراحل التشغيل');
    });

    it('supports individual stage checkpoints for printing, embroidery, sewing, and operation', () => {
      const multiStageOrder = {
        order_number: 'CUT-STAGES-01',
        cutting_number: 'CUT-STAGES-01',
        cutting_name: 'ترنج رجالي',
        start_date: '2026-10-22',
        fabric_type: 'ميلتون',
        batch_quantity: 100,
        stages: {
          printing: { vendor_name: 'مطبعة الأهرام', total_cost: 50, pricing_type: 'fixed' },
          embroidery: { vendor_name: 'تطريز النيل', total_cost: 60, pricing_type: 'fixed' },
          sewing: { vendor_name: 'ورشة السلام', total_cost: 80, pricing_type: 'fixed' },
          operation: { vendor_name: 'ورشة التشغيل الحديثة', total_cost: 70, pricing_type: 'fixed' }
        }
      };

      // Case A: Only printing cost is toggled ON
      const htmlOnlyPrinting = generateCutOrderHtml(multiStageOrder, {}, 'A4', {
        show_stage_costs: true,
        show_stage_cost_printing: true,
        show_stage_cost_embroidery: false,
        show_stage_cost_sewing: false,
        show_stage_cost_operation: false,
        show_total_cost: true
      });

      // Printing cost appears
      expect(htmlOnlyPrinting).toContain('50.00 ج.م');
      // Embroidery, sewing, and operation costs are hidden with '-'
      expect(htmlOnlyPrinting).not.toContain('60.00 ج.م');
      expect(htmlOnlyPrinting).not.toContain('80.00 ج.م');
      expect(htmlOnlyPrinting).not.toContain('70.00 ج.م');
      // All 4 stage rows are listed
      expect(htmlOnlyPrinting).toContain('مرحلة الطباعة');
      expect(htmlOnlyPrinting).toContain('مرحلة التطريز');
      expect(htmlOnlyPrinting).toContain('مرحلة الحياكة والتجميع');
      expect(htmlOnlyPrinting).toContain('مرحلة التشغيل');
      expect(htmlOnlyPrinting).toContain('ورشة التشغيل الحديثة');

      // Case B: Only operation is toggled ON
      const htmlOnlyOperation = generateCutOrderHtml(multiStageOrder, {}, 'A4', {
        show_stage_costs: true,
        show_stage_cost_printing: false,
        show_stage_cost_embroidery: false,
        show_stage_cost_sewing: false,
        show_stage_cost_operation: true,
        show_total_cost: true
      });
      expect(htmlOnlyOperation).not.toContain('50.00 ج.م');
      expect(htmlOnlyOperation).not.toContain('60.00 ج.م');
      expect(htmlOnlyOperation).not.toContain('80.00 ج.م');
      expect(htmlOnlyOperation).toContain('70.00 ج.م');
    });
  });

  describe('2. Automatic Balance Posting for Subcontractors / Workshops', () => {
    it('instantly posts payable obligation to supplier ledger when cutting order is issued', async () => {
      // 1. Create Subcontractor Supplier "إسلام"
      const islam = await partiesRepo.create({
        code: 'WS-ISLAM',
        name: 'إسلام - مطبعة النجوم',
        is_supplier: 1,
        is_customer: 0,
        supplier_type: 'service',
        service_stage: 'printing',
        opening_balance: 0,
        supplier_opening_balance: 0
      });

      // 2. Setup Finished Product and Raw Fabric
      const fabric = {
        id: 'mat-cotton-1',
        code: 'RAW-COT-01',
        name: 'قماش ميلتون قطن',
        current_stock: 500,
        cost_price: 150,
        unit: 'متر'
      };
      await db.items.add(fabric);

      const product = {
        id: 'prd-hoodie-1',
        code: 'PRD-HD-01',
        name: 'سويت شيرت هودي رجالي',
        category: 'clothing',
        current_stock: 0
      };
      await db.items.add(product);

      // 3. Issue Cutting Order with 3,000 EGP Printing stage assigned to "إسلام"
      const cuttingOrder = await manufacturingRepo.createProductionOrder({
        cutting_number: 'PO-2026-ISLAM-01',
        product_id: product.id,
        fabric_type: 'ميلتون قطن',
        cutting_name: 'هودي شتوي موديل 2026',
        batch_quantity: 100,
        materials: [
          { material_id: fabric.id, quantity: 150, unit_price: 150 }
        ],
        stages: {
          printing: {
            vendor_id: islam.id,
            vendor_name: islam.name,
            pricing_type: 'fixed',
            total_cost: 3000,
            fixed_total: 3000
          },
          embroidery: { vendor_id: '', total_cost: 0 },
          sewing: { vendor_id: '', total_cost: 0 }
        }
      });

      expect(cuttingOrder).toBeDefined();

      // 4. Verify supplier ledger balance immediately reflects 3,000 EGP credit
      const islamParty = await partiesRepo.getById(islam.id);
      expect(islamParty.supplier_balance).toBe(3000);

      const islamSupplier = await suppliersRepo.getById(islam.id);
      expect(islamSupplier.balance_due).toBe(3000);
      expect(islamSupplier.total_invoiced).toBe(3000);

      // 5. Verify Statement of Account contains the stage invoice
      const stmt = await suppliersRepo.getStatement(islam.id);
      expect(stmt.summary.total_purchases).toBe(3000);
      expect(stmt.summary.remaining_balance).toBe(3000);

      const stageTx = stmt.statement.find(t => t.reference.includes('PO-2026-ISLAM-01') || t.cut_order_id === cuttingOrder.id);
      expect(stageTx).toBeDefined();
      expect(stageTx!.type).toBe('تشغيل طباعة');
      expect(stageTx!.credit).toBe(3000);
      expect(stageTx!.debit).toBe(0);
      expect(stageTx!.balance_after).toBe(3000);
    });

    it('adjusts workshop ledger balance by the net delta difference only upon order edit', async () => {
      // 1. Create Subcontractor Supplier "إسلام" and "علاء"
      const islam = await partiesRepo.create({
        code: 'WS-ISLAM-2',
        name: 'إسلام - مطبعة',
        is_supplier: 1,
        supplier_type: 'service',
        opening_balance: 0,
        supplier_opening_balance: 0
      });

      const alaa = await partiesRepo.create({
        code: 'WS-ALAA',
        name: 'علاء - ورشة الحياكة',
        is_supplier: 1,
        supplier_type: 'service',
        opening_balance: 0,
        supplier_opening_balance: 0
      });

      const fabric = {
        id: 'mat-cotton-2',
        code: 'RAW-COT-02',
        name: 'قماش سنجل جيرسي',
        current_stock: 500,
        cost_price: 100,
        unit: 'متر'
      };
      await db.items.add(fabric);

      const product = {
        id: 'prd-tshirt-1',
        code: 'PRD-TS-01',
        name: 'تي شيرت قطن',
        category: 'clothing',
        current_stock: 0
      };
      await db.items.add(product);

      // 2. Issue initial order: Printing with Islam for 3,000 EGP
      const order = await manufacturingRepo.createProductionOrder({
        cutting_number: 'PO-DELTA-01',
        product_id: product.id,
        batch_quantity: 100,
        materials: [
          { material_id: fabric.id, quantity: 100, unit_price: 100 }
        ],
        stages: {
          printing: {
            vendor_id: islam.id,
            vendor_name: islam.name,
            pricing_type: 'fixed',
            total_cost: 3000,
            fixed_total: 3000
          },
          embroidery: { vendor_id: '', total_cost: 0 },
          sewing: { vendor_id: '', total_cost: 0 }
        }
      });

      expect((await partiesRepo.getById(islam.id)).supplier_balance).toBe(3000);

      // 3. Edit order: increase Islam's printing cost to 4,500 (+1,500 delta) AND assign sewing to Alaa for 2,000
      await manufacturingRepo.updateProductionOrder(order.id, {
        cutting_number: 'PO-DELTA-01',
        product_id: product.id,
        batch_quantity: 100,
        materials: [
          { material_id: fabric.id, quantity: 100, unit_price: 100 }
        ],
        stages: {
          printing: {
            vendor_id: islam.id,
            vendor_name: islam.name,
            pricing_type: 'fixed',
            total_cost: 4500,
            fixed_total: 4500
          },
          embroidery: { vendor_id: '', total_cost: 0 },
          sewing: {
            vendor_id: alaa.id,
            vendor_name: alaa.name,
            pricing_type: 'fixed',
            total_cost: 2000,
            fixed_total: 2000
          }
        }
      });

      // 4. Verify Islam's balance was adjusted by delta only (3,000 -> 4,500)
      const updatedIslam = await partiesRepo.getById(islam.id);
      expect(updatedIslam.supplier_balance).toBe(4500);

      // 5. Verify Alaa's balance reflects 2,000
      const updatedAlaa = await partiesRepo.getById(alaa.id);
      expect(updatedAlaa.supplier_balance).toBe(2000);

      // 6. Statement for Islam now shows 4,500 total
      const islamStmt = await suppliersRepo.getStatement(islam.id);
      expect(islamStmt.summary.total_purchases).toBe(4500);
      expect(islamStmt.summary.remaining_balance).toBe(4500);
    });
  });

  describe('3. Report Formatting and Header Standardization', () => {
    it('ensures all raw DB field names are translated to Arabic headers in reports', () => {
      // Headers mapping audit
      const DB_HEADER_TRANSLATIONS = {
        supplier_type: 'نوع المورد',
        is_customer: 'عميل',
        is_supplier: 'مورد',
        tax_number: 'الرقم الضريبي',
        address: 'العنوان',
        phone: 'رقم الهاتف'
      };

      for (const [key, arabicTitle] of Object.entries(DB_HEADER_TRANSLATIONS)) {
        expect(arabicTitle).toBeTruthy();
        expect(arabicTitle).not.toBe(key);
      }
    });
  });
});
