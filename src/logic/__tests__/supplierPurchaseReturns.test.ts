import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../data/db';
import { suppliersRepo } from '../../data/repositories/suppliersRepo';
import { getEntityCurrentBalance } from '../../services/balanceService';
import { generatePurchaseReturnHtml } from '../../modules/print/invoicePrintTemplates';
import { getTodayDateString } from '../../utils/formatters';
import fs from 'fs';
import path from 'path';

describe('Supplier / Purchase Returns Module (مرتجعات المشتريات للموردين والجهات)', () => {
  beforeEach(async () => {
    await db.open();
    if (db.supplier_returns) await db.supplier_returns.clear();
    if (db.suppliers) await db.suppliers.clear();
    if (db.parties) await db.parties.clear();
    if (db.items) await db.items.clear();
    if (db.materials) await db.materials.clear();
    if (db.stock_movements) await db.stock_movements.clear();
    if (db.supplier_invoices) await db.supplier_invoices.clear();
    if (db.purchase_orders) await db.purchase_orders.clear();
    if (db.payments) await db.payments.clear();
    if (db.treasury_accounts) await db.treasury_accounts.clear();
    if (db.cash_transactions) await db.cash_transactions.clear();
  });

  const setupTestSupplier = async (openingBalance = 10000) => {
    const supplierId = `sup-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const supplier = {
      id: supplierId,
      name: 'شركة النسيج الملكي الحديث',
      phone: '01012345678',
      code: 'SUP-001',
      supplier_type: 'raw_materials',
      opening_balance: openingBalance,
      opening_balance_type: 'credit', // Credit = our liability to supplier
      payment_terms: 'credit',
      is_active: 1,
      is_supplier: 1,
      created_at: new Date().toISOString()
    };
    await db.suppliers.put(supplier);
    await db.parties.put(supplier);
    return supplier;
  };

  const setupTestTreasury = async (initialBalance = 5000) => {
    const treasury = {
      id: 'acc-main',
      name: 'الخزينة الرئيسية للمصنع',
      account_type: 'treasury',
      is_main: 1,
      current_balance: initialBalance,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.treasury_accounts.put(treasury);
    return treasury;
  };

  const setupTestItem = async (name, currentStock, costPrice, code = 'ITM-01') => {
    const id = `itm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const item = {
      id,
      code,
      name,
      item_type: 'raw',
      color: 'أزرق داكن',
      size: 'قياسي',
      unit: 'متر',
      current_stock: currentStock,
      cost_price: costPrice,
      last_purchase_price: costPrice,
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.items.put(item);
    await db.materials.put(item);
    return item;
  };

  // -------------------------------------------------------------
  // Test 1: Purchase Return Creation & Multi-Item Matrix
  // -------------------------------------------------------------
  it('1. Creates purchase return with multi-item matrix and RET-PUR numbering', async () => {
    const supplier = await setupTestSupplier(15000);
    const fabric = await setupTestItem('قماش كريب صالونا تركي', 100, 120, 'FAB-001');
    const buttons = await setupTestItem('أزرار صدف طبيعي', 500, 2.5, 'BTN-001');

    const returnPayload = {
      supplier_id: supplier.id,
      invoice_id: 'PO-2026-009',
      return_date: getTodayDateString(),
      reason: 'غير مطابق للمواصفات الفنية',
      notes: 'تم فحص الشحنة ورفضها لوجود تباين في درجات اللون وتلف بالأزرار',
      refund_method: 'deduct_balance',
      items: [
        {
          item_id: fabric.id,
          item_name: fabric.name,
          item_code: fabric.code,
          color: 'كحلي',
          size: 'عرض 150 سم',
          unit: 'متر',
          quantity: 20,
          unit_price: 120,
          reason: 'درجة اللون مختلفة عن العينة المعتمدة'
        },
        {
          item_id: buttons.id,
          item_name: buttons.name,
          item_code: buttons.code,
          color: 'طبيعي',
          size: '18 مم',
          unit: 'قطعة',
          quantity: 100,
          unit_price: 2.5,
          reason: 'كسور وعيوب تصنيع'
        }
      ]
    };

    const res = await suppliersRepo.createSupplierReturn(returnPayload);
    expect(res.success).toBe(true);
    expect(res.returnNumber).toMatch(/^RET-PUR-/);

    // Verify stored record in Dexie
    const stored = await db.supplier_returns.get(res.returnId);
    expect(stored).toBeDefined();
    expect(stored.supplier_id).toBe(supplier.id);
    expect(stored.invoice_id).toBe('PO-2026-009');
    expect(stored.items).toHaveLength(2);

    // Total refund: (20 * 120) + (100 * 2.5) = 2400 + 250 = 2650 ج.م
    expect(stored.total_amount).toBe(2650);
    expect(stored.refund_amount).toBe(2650);
    expect(stored.quantity).toBe(120);
    expect(stored.refund_method).toBe('deduct_balance');
    expect(stored.reason).toBe('غير مطابق للمواصفات الفنية');
  });

  // -------------------------------------------------------------
  // Test 2: Inventory Stock Decrease & Movements
  // -------------------------------------------------------------
  it('2. Instantly deducts returned quantities from inventory and logs stock_movements', async () => {
    const supplier = await setupTestSupplier(8000);
    const fabric = await setupTestItem('قماش شيفون فرنسي', 60, 95, 'CHF-01');
    const thread = await setupTestItem('خيوط حياكة بوليستر 40/2', 40, 25, 'THR-01');

    expect(fabric.current_stock).toBe(60);
    expect(thread.current_stock).toBe(40);

    const res = await suppliersRepo.createSupplierReturn({
      supplier_id: supplier.id,
      return_date: getTodayDateString(),
      reason: 'عيوب تصنيع وتلفيات',
      items: [
        {
          item_id: fabric.id,
          item_name: fabric.name,
          quantity: 15,
          unit_price: 95
        },
        {
          item_id: thread.id,
          item_name: thread.name,
          quantity: 10,
          unit_price: 25
        }
      ]
    });

    expect(res.success).toBe(true);

    // Verify stocks in items and materials tables
    const updatedFabric = await db.items.get(fabric.id);
    const updatedThread = await db.items.get(thread.id);
    expect(updatedFabric.current_stock).toBe(45); // 60 - 15 = 45
    expect(updatedThread.current_stock).toBe(30); // 40 - 10 = 30

    // Verify stock_movements table
    const movements = await db.stock_movements.where('reference_id').equals(res.returnId).toArray();
    expect(movements).toHaveLength(2);

    const fabricMove = movements.find(m => m.item_id === fabric.id);
    expect(fabricMove).toBeDefined();
    expect(fabricMove.direction).toBe('out');
    expect(fabricMove.movement_type).toBe('purchase_return');
    expect(fabricMove.quantity).toBe(15);
    expect(fabricMove.quantity_change).toBe(-15);
    expect(fabricMove.new_balance).toBe(45);

    const threadMove = movements.find(m => m.item_id === thread.id);
    expect(threadMove).toBeDefined();
    expect(threadMove.direction).toBe('out');
    expect(threadMove.quantity_change).toBe(-10);
    expect(threadMove.new_balance).toBe(30);
  });

  // -------------------------------------------------------------
  // Test 3: Inventory Validation - Prevents Returning More Than Available
  // -------------------------------------------------------------
  it('3. Throws explicit error when return quantity exceeds available warehouse stock', async () => {
    const supplier = await setupTestSupplier(5000);
    const fabric = await setupTestItem('قماش دانتيل فاخر', 10, 200, 'DNT-01');

    await expect(
      suppliersRepo.createSupplierReturn({
        supplier_id: supplier.id,
        return_date: getTodayDateString(),
        items: [
          {
            item_id: fabric.id,
            item_name: fabric.name,
            quantity: 15, // available is only 10!
            unit_price: 200
          }
        ]
      })
    ).rejects.toThrow(/الرصيد المتاح بالمخزن.*أقل من الكمية المراد ردها/);

    // Ensure stock remained unchanged
    const itmAfter = await db.items.get(fabric.id);
    expect(itmAfter.current_stock).toBe(10);
  });

  // -------------------------------------------------------------
  // Test 4: Financial Ledger & Statement of Account Parity
  // -------------------------------------------------------------
  it('4. Updates supplier Statement of Account immediately with deduction and running balance', async () => {
    // Supplier initial debt: 10,000 ج.م
    const supplier = await setupTestSupplier(10000);
    const fabric = await setupTestItem('قماش ستان حرير', 100, 50, 'SAT-01');

    // Return 40 meters @ 50 ج.م = 2000 ج.م deduction
    const res = await suppliersRepo.createSupplierReturn({
      supplier_id: supplier.id,
      return_date: getTodayDateString(),
      reason: 'زيادة عن الكميات المطلوبة بأمر الشراء',
      refund_method: 'deduct_balance',
      items: [
        {
          item_id: fabric.id,
          item_name: fabric.name,
          quantity: 40,
          unit_price: 50
        }
      ]
    });

    // Check balanceService
    const bal = await getEntityCurrentBalance(supplier.id);
    expect(bal.supplierOpening).toBe(10000);
    expect(bal.supplierReturns).toBe(2000);
    // Net liability: 10000 (opening) - 2000 (return) = 8000 ج.م
    expect(bal.supplierBalance).toBe(8000);

    // Check Statement of Account ledger
    const stmt = await suppliersRepo.getStatement(supplier.id);
    expect(stmt.balance_due).toBe(8000);
    expect(stmt.summary.remaining_balance).toBe(8000);

    // Verify statement entries
    const returnTx = stmt.statement.find(t => t.reference === res.returnNumber);
    expect(returnTx).toBeDefined();
    expect(returnTx.debit).toBe(2000);
    expect(returnTx.credit).toBe(0);
    expect(returnTx.balance_after).toBe(8000);
  });

  // -------------------------------------------------------------
  // Test 5: Immediate Cash Refund & Treasury Inflow
  // -------------------------------------------------------------
  it('5. Handles immediate cash refund by increasing treasury balance and recording cash transaction', async () => {
    const supplier = await setupTestSupplier(6000);
    const treasury = await setupTestTreasury(4000); // 4000 cash before
    const fabric = await setupTestItem('كتان تركي أصلي', 50, 100, 'LIN-01');

    // Supplier refunds 1500 ج.م cash immediately
    const res = await suppliersRepo.createSupplierReturn({
      supplier_id: supplier.id,
      return_date: getTodayDateString(),
      reason: 'استرداد نقدي فوري بموجب محضر فحص',
      refund_method: 'cash_refund',
      account_id: treasury.id,
      items: [
        {
          item_id: fabric.id,
          item_name: fabric.name,
          quantity: 15,
          unit_price: 100
        }
      ]
    });

    expect(res.success).toBe(true);

    // Treasury balance should increase by 1500: 4000 + 1500 = 5500 ج.م
    const updatedTreasury = await db.treasury_accounts.get(treasury.id);
    expect(updatedTreasury.current_balance).toBe(5500);

    // Cash transactions should have an inflow record
    const cashTx = await db.cash_transactions.where('reference_id').equals(res.returnId).first();
    expect(cashTx).toBeDefined();
    expect(cashTx.tx_type).toBe('inflow');
    expect(cashTx.amount).toBe(1500);
    expect(cashTx.balance_after).toBe(5500);

    // Statement of Account: shows both the return debit and the cash refund credit
    const stmt = await suppliersRepo.getStatement(supplier.id);
    const cashEntry = stmt.statement.find(t => t.reference === `CASH-${res.returnNumber}`);
    expect(cashEntry).toBeDefined();
    expect(cashEntry.credit).toBe(1500);
  });

  // -------------------------------------------------------------
  // Test 6: Printout A4 Voucher Layout, 100% Arabic & Triple Signatures
  // -------------------------------------------------------------
  it('6. Generates professional A4 printout voucher with 100% Arabic, signatures footer, and ZERO English words', () => {
    const mockReturnDoc = {
      id: 'ret-pur-101',
      return_number: 'RET-PUR-2026-0001',
      supplier_name: 'شركة النسيج الملكي الحديث',
      supplier_code: 'SUP-001',
      supplier_phone: '01012345678',
      invoice_number: 'INV-PUR-2026-44',
      return_date: getTodayDateString(),
      refund_method: 'deduct_balance',
      reason: 'غير مطابق للمواصفات الفنية المعتمدة',
      notes: 'تمت المعاينة بحضور مندوب الجودة ومندوب المورد وتأكيد الرد',
      total_amount: 3500,
      items: [
        {
          item_name: 'قماش صوف كشمير إيطالي',
          item_code: 'WOL-99',
          color: 'رمادي غامق',
          size: 'طاقة 30 متر',
          unit: 'متر',
          quantity: 25,
          unit_price: 140,
          total_price: 3500,
          reason: 'تلف بحواف القماش'
        }
      ]
    };

    const settings = {
      factory_name: 'الشركة المصرية العالمية لصناعة الملابس',
      phone: '0223456789',
      address: 'المنطقة الصناعية الثالثة، السادس من أكتوبر'
    };

    const html = generatePurchaseReturnHtml(mockReturnDoc, settings, 'a4');

    // Core Title and Company Header
    expect(html).toContain('إذن مرتجع بضاعة لمورد');
    expect(html).toContain('الشركة المصرية العالمية لصناعة الملابس');
    expect(html).toContain('0223456789');

    // Metadata
    expect(html).toContain('RET-PUR-2026-0001');
    expect(html).toContain('شركة النسيج الملكي الحديث');
    expect(html).toContain('INV-PUR-2026-44');
    expect(html).toContain('خصم من رصيد المورد');

    // Items Table Headers
    expect(html).toContain('بيان الصنف / الخامة المرتجعة');
    expect(html).toContain('الكمية');
    expect(html).toContain('سعر الوحدة');
    expect(html).toContain('الإجمالي');
    expect(html).toContain('قماش صوف كشمير إيطالي');
    expect(html).toContain('ج.م');

    // Signatures Footer
    expect(html).toContain('المحاسب المسؤول');
    expect(html).toContain('أمين المخزن (المسلم)');
    expect(html).toContain('المدير المالي');
    expect(html).toContain('اعتماد الإدارة');
    expect(html).toContain('استلام مندوب المورد / توقيع المستلم');

    // Strict Rule Checks: ZERO English Words in document
    expect(html).not.toContain('code systems ERP');
    expect(html).not.toContain('Purchase');
    expect(html).not.toContain('Return');
    expect(html).not.toContain('Supplier');
    expect(html).not.toContain('Quantity');

    // Zero Emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\p{Extended_Pictographic}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });

  // -------------------------------------------------------------
  // Test 7: Zero Placeholders Rule on PurchaseReturnFormPage
  // -------------------------------------------------------------
  it('7. Strictly verifies zero placeholder attributes in PurchaseReturnFormPage.jsx', () => {
    const formPath = path.resolve(__dirname, '../../modules/returns/PurchaseReturnFormPage.jsx');
    const content = fs.readFileSync(formPath, 'utf8');

    expect(content).not.toMatch(/\bplaceholder\s*=/i);
  });
});
