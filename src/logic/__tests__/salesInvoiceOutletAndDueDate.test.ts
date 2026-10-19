import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { salesRepo } from '../../data/repositories/salesRepo';
import { reportsRepo } from '../../data/repositories/reportsRepo';
import { settingsRepo } from '../../data/repositories/settingsRepo';
import { generateSalesInvoiceHtml } from '../../modules/print/invoicePrintTemplates';
import { getTodayDateString, addDaysToDateString } from '../../utils/formatters';

describe('Part 1: Sales Invoice Outlet and Due Date Rules', () => {
  beforeEach(async () => {
    await db.customers.clear();
    await db.items.clear();
    await db.products.clear();
    await db.sales_outlets.clear();
    await db.sales_invoices.clear();
    await db.sales_invoice_items.clear();
    await db.treasury_accounts.clear();
    await db.cash_transactions.clear();
    await db.stock_movements.clear();
    await db.settings.clear();
  });

  it('1. Saves a credit invoice with no outlet and no due date', async () => {
    // Setup customer and finished item
    const customer = await salesRepo.createCustomer({
      name: 'عميل اختبار آجل بدون منفذ',
      phone: '01011112222',
    });

    const item = {
      id: 'item-fin-1',
      code: 'PROD-101',
      name: 'قميص رجالي فاخر',
      item_type: 'finished',
      selling_price: 250,
      current_stock: 50,
    };
    await db.items.add(item);
    await db.products.add({ ...item, current_finished_stock: 50 });

    const invoice = await salesRepo.createSalesInvoice({
      customer_id: customer.id,
      outlet_id: null,
      invoice_date: getTodayDateString(),
      payment_terms: 'credit',
      due_date: null,
      items: [
        {
          product_id: item.id,
          quantity: 2,
          unit_selling_price: 250,
        },
      ],
    });

    expect(invoice).toBeDefined();
    expect(invoice.payment_terms).toBe('credit');
    expect(invoice.due_date).toBeNull();
    expect(invoice.outlet_id).toBeNull();
    expect(invoice.total_invoice_amount).toBe(500);

    // Verify it is retrieved cleanly from getSalesInvoices with label "بدون منفذ"
    const allInvoices = await salesRepo.getSalesInvoices();
    const found = allInvoices.find((i) => i.id === invoice.id);
    expect(found).toBeDefined();
    expect(found.outlet_name).toBe('بدون منفذ');
  });

  it('2. Saves a credit invoice with a due date', async () => {
    const customer = await salesRepo.createCustomer({
      name: 'عميل اختبار آجل مع تاريخ استحقاق',
      phone: '01033334444',
    });

    const item = {
      id: 'item-fin-2',
      code: 'PROD-102',
      name: 'بنطلون جينز كلاسيك',
      item_type: 'finished',
      selling_price: 400,
      current_stock: 20,
    };
    await db.items.add(item);
    await db.products.add({ ...item, current_finished_stock: 20 });

    const todayStr = getTodayDateString();
    const futureDue = addDaysToDateString(todayStr, 30);
    const invoice = await salesRepo.createSalesInvoice({
      customer_id: customer.id,
      outlet_id: null,
      invoice_date: todayStr,
      payment_terms: 'credit',
      due_date: futureDue,
      items: [
        {
          product_id: item.id,
          quantity: 1,
          unit_selling_price: 400,
        },
      ],
    });

    expect(invoice).toBeDefined();
    expect(invoice.payment_terms).toBe('credit');
    expect(invoice.due_date).toBe(futureDue);
  });

  it('3. Posts cash sales with no outlet directly to the main treasury', async () => {
    // Ensure main treasury exists
    const mainTreasury = {
      id: 'acc-main',
      name: 'الخزينة المركزية',
      account_type: 'treasury',
      is_main: 1,
      current_balance: 1000,
    };
    await db.treasury_accounts.add(mainTreasury);

    const customer = await salesRepo.createCustomer({
      name: 'عميل نقدي بدون منفذ',
      phone: '01055556666',
    });

    const item = {
      id: 'item-fin-3',
      code: 'PROD-103',
      name: 'تيشرت بولو',
      item_type: 'finished',
      selling_price: 150,
      current_stock: 30,
    };
    await db.items.add(item);
    await db.products.add({ ...item, current_finished_stock: 30 });

    const invoice = await salesRepo.createSalesInvoice({
      customer_id: customer.id,
      outlet_id: null,
      invoice_date: getTodayDateString(),
      payment_terms: 'cash',
      items: [
        {
          product_id: item.id,
          quantity: 2,
          unit_selling_price: 150,
        },
      ],
    });

    expect(invoice.status).toBe('paid');

    const updatedMain = await db.treasury_accounts.get('acc-main');
    expect(updatedMain.current_balance).toBe(1300); // 1000 + 300

    const tx = await db.cash_transactions.where('reference_id').equals(invoice.id).first();
    expect(tx).toBeDefined();
    expect(tx.account_id).toBe('acc-main');
    expect(tx.amount).toBe(300);
  });

  it('4. Debt aging lists invoices with no due date as "بدون تاريخ استحقاق" and not overdue', async () => {
    const customer = await salesRepo.createCustomer({
      name: 'عميل أعمار ديون',
      phone: '01077778888',
    });

    const item = {
      id: 'item-fin-4',
      code: 'PROD-104',
      name: 'فستان بناتي',
      item_type: 'finished',
      selling_price: 300,
      current_stock: 10,
    };
    await db.items.add(item);
    await db.products.add({ ...item, current_finished_stock: 10 });

    // Credit invoice without due date
    await salesRepo.createSalesInvoice({
      customer_id: customer.id,
      outlet_id: null,
      invoice_date: new Date().toISOString().split('T')[0],
      payment_terms: 'credit',
      due_date: null,
      items: [{ product_id: item.id, quantity: 1, unit_selling_price: 300 }],
    });

    const aging = await reportsRepo.getDebtAging();
    const custRow = aging.customerAging.find((r) => r.entity_name === customer.name);
    expect(custRow).toBeDefined();
    expect(custRow!.due_date).toBeNull();
    expect(custRow!.days_overdue).toBe(0);
    expect(custRow!.bucket).toBe('بدون تاريخ استحقاق');
  });

  it('5. Print layouts (A4 and 80mm thermal) render cleanly without a due date or outlet', () => {
    const mockInvoice = {
      id: 'sinv-test-1',
      invoice_number: 'INV-SLS-2026-9999',
      invoice_date: '2026-10-18',
      payment_terms: 'credit',
      due_date: null,
      outlet_id: null,
      outlet_name: 'بدون منفذ',
      customer_name: 'شركة النسيج الحديث',
      customer_code: 'CUST-001',
      subtotal: 1000,
      total_invoice_amount: 1000,
      paid_amount: 0,
      items: [
        {
          product_name: 'بلوزة قطنية',
          quantity: 4,
          unit_selling_price: 250,
          line_total: 1000,
        },
      ],
    };

    const settings = {
      factory_name: 'مصنع الأناقة للملابس',
      phone: '01234567890',
    };

    // A4 layout
    const a4Html = generateSalesInvoiceHtml(mockInvoice, settings, 'A4');
    expect(a4Html).toContain('INV-SLS-2026-9999');
    expect(a4Html).not.toContain('تاريخ الاستحقاق:');
    expect(a4Html).not.toContain('الفرع / المنفذ:');

    // Thermal layout
    const thermalHtml = generateSalesInvoiceHtml(mockInvoice, settings, '80mm');
    expect(thermalHtml).toContain('INV-SLS-2026-9999');
    expect(thermalHtml).not.toContain('تاريخ الاستحقاق:');
  });

  it('6. Settings defaults default_credit_days to 0', async () => {
    const settings = await settingsRepo.getSettings();
    expect(settings.default_credit_days).toBe(0);
  });
});
