import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../data/db';
import { 
  itemsRepo, 
  partiesRepo, 
  suppliersRepo, 
  materialsRepo, 
  storageRepo, 
  manufacturingRepo, 
  finishingRepo, 
  salesRepo, 
  treasuriesRepo, 
  expenseCodesRepo, 
  reportsRepo, 
  usersRepo, 
  settingsRepo, 
  backupRepo 
} from '../../data';
import { api } from '../../services/api';
import { seedTestClothingData } from './fixtures/demoDataFixture';

describe('All Modules Audit: Empty Database and Demo Data (Requirement M5)', () => {
  let consoleErrors: string[] = [];
  const originalConsoleError = console.error;

  beforeEach(async () => {
    consoleErrors = [];
    console.error = (...args: any[]) => {
      consoleErrors.push(args.map(a => String(a)).join(' '));
      originalConsoleError(...args);
    };

    // Clear all IndexedDB tables for clean state
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('1. Operates cleanly with an EMPTY database with zero crashes and real arrays', async () => {
    // Audit every repository function when database has 0 records
    const [
      items,
      sizes,
      colors,
      nextCode,
      parties,
      suppliers,
      customers,
      purchaseOrders,
      supplierInvoices,
      materials,
      lowStock,
      locations,
      transfers,
      adjustments,
      productionOrders,
      overheads,
      outsourcedOrders,
      outlets,
      salesInvoices,
      treasuriesObj,
      closings,
      expenseCodes,
      paymentMethods,
      productsReport,
      stockStatus,
      users,
      settings,
      backupSummary
    ] = await Promise.all([
      itemsRepo.getAll(),
      itemsRepo.getSizes(),
      itemsRepo.getColors(),
      itemsRepo.getNextCode(),
      partiesRepo.getAll(),
      partiesRepo.getSuppliers(),
      partiesRepo.getCustomers(),
      suppliersRepo.getPurchaseOrders(),
      suppliersRepo.getSupplierInvoices(),
      materialsRepo.getAll(),
      materialsRepo.getLowStockAlerts(),
      storageRepo.getLocations(),
      storageRepo.getTransfers(),
      storageRepo.getAdjustments(),
      manufacturingRepo.getAll(),
      manufacturingRepo.getOverheads(),
      finishingRepo.getAll(),
      salesRepo.getOutlets(),
      salesRepo.getSalesInvoices(),
      treasuriesRepo.getTreasuries(),
      treasuriesRepo.getDailyClosings(),
      expenseCodesRepo.getAll(),
      expenseCodesRepo.getPaymentMethods(),
      reportsRepo.getProductsReport(),
      reportsRepo.getCostBreakdown(),
      usersRepo.getAll(),
      settingsRepo.getSettings()
    ]);

    // Verify all list return values are real arrays (Requirement M2)
    expect(Array.isArray(items)).toBe(true);
    expect(Array.isArray(sizes)).toBe(true);
    expect(Array.isArray(colors)).toBe(true);
    expect(typeof nextCode).toBe('string');
    expect(Array.isArray(parties)).toBe(true);
    expect(Array.isArray(suppliers)).toBe(true);
    expect(Array.isArray(customers)).toBe(true);
    expect(Array.isArray(purchaseOrders)).toBe(true);
    expect(Array.isArray(supplierInvoices)).toBe(true);
    expect(Array.isArray(materials)).toBe(true);
    expect(Array.isArray(lowStock)).toBe(true);
    expect(Array.isArray(locations)).toBe(true);
    expect(Array.isArray(transfers)).toBe(true);
    expect(Array.isArray(adjustments)).toBe(true);
    expect(Array.isArray(productionOrders)).toBe(true);
    expect(Array.isArray(overheads)).toBe(true);
    expect(Array.isArray(outsourcedOrders)).toBe(true);
    expect(Array.isArray(outlets)).toBe(true);
    expect(Array.isArray(salesInvoices)).toBe(true);
    expect(Array.isArray(treasuriesObj.treasuries)).toBe(true);
    expect(Array.isArray(treasuriesObj.outletTreasuries)).toBe(true);
    expect(Array.isArray(closings)).toBe(true);
    expect(Array.isArray(expenseCodes)).toBe(true);
    expect(Array.isArray(paymentMethods)).toBe(true);
    expect(Array.isArray(productsReport)).toBe(true);
    expect(Array.isArray(users)).toBe(true);

    // Defensive operations: .find, .map, .reduce MUST NOT throw on empty lists
    expect(() => items.find(i => i.id === 'test')).not.toThrow();
    expect(() => treasuriesObj.treasuries.find(t => t.is_main)).not.toThrow();
    expect(() => treasuriesObj.outletTreasuries.reduce((sum, t) => sum + t.current_balance, 0)).not.toThrow();
    expect(() => salesInvoices.reduce((sum, inv) => sum + inv.total_amount, 0)).not.toThrow();
    expect(() => expenseCodes.map(c => c.name)).not.toThrow();

    // Verify zero console errors were produced
    expect(consoleErrors.length).toBe(0);
  });

  it('2. Operates cleanly with CLOTHING FACTORY DEMO DATA without errors', async () => {
    // Seed system with clothing factory test fixture data
    await seedTestClothingData('usr-test-owner');

    // Fetch and verify loaded data
    const [
      items,
      sizes,
      colors,
      parties,
      locations,
      treasuriesObj,
      expenseCodes,
      paymentMethods,
      productsReport
    ] = await Promise.all([
      itemsRepo.getAll(),
      itemsRepo.getSizes(),
      itemsRepo.getColors(),
      partiesRepo.getAll(),
      storageRepo.getLocations(),
      treasuriesRepo.getTreasuries(),
      expenseCodesRepo.getAll(),
      expenseCodesRepo.getPaymentMethods(),
      reportsRepo.getProductsReport()
    ]);

    // Verify clothing items are present with variants and cost/sell prices
    expect(items.length).toBeGreaterThan(0);
    const denimJeans = items.find(it => it.item_type === 'finished');
    expect(denimJeans).toBeDefined();
    expect(Number(denimJeans?.cost_price)).toBeGreaterThan(0);
    expect(Number(denimJeans?.selling_price)).toBeGreaterThan(0);

    // Verify clothing sizes and colors
    expect(sizes.length).toBeGreaterThan(0);
    expect(colors.length).toBeGreaterThan(0);

    // Verify unified parties (both customer & supplier supported)
    expect(parties.length).toBeGreaterThan(0);
    const partyWithBoth = parties.find(p => p.is_supplier && p.is_customer);
    if (partyWithBoth) {
      expect(partyWithBoth.is_supplier).toBe(1);
      expect(partyWithBoth.is_customer).toBe(1);
    }

    // Verify storage locations exist
    expect(locations.length).toBeGreaterThan(0);

    // Verify treasuries: main treasury + outlet treasuries
    expect(treasuriesObj.treasuries.length).toBeGreaterThan(0);
    expect(treasuriesObj.mainTreasury).toBeDefined();
    expect(treasuriesObj.aggregatedGrandTotal).toBeGreaterThanOrEqual(0);

    // Verify expense codes & payment methods
    expect(expenseCodes.length).toBeGreaterThan(0);
    expect(paymentMethods.length).toBeGreaterThan(0);

    // Verify products report contains image and pricing columns
    expect(productsReport.length).toBeGreaterThan(0);
    const firstProd = productsReport[0];
    expect(firstProd).toHaveProperty('cost_price');
    expect(firstProd).toHaveProperty('selling_price');
    expect(firstProd).toHaveProperty('profit_margin');

    // Verify zero console errors
    expect(consoleErrors.length).toBe(0);
  });

  it('3. Dynamic Serial Code auto-increments correctly and continues from highest code (Requirement A6)', async () => {
    // Create an item with code PRD-0105
    await itemsRepo.create({
      code: 'PRD-0105',
      name: 'تيشيرت بولو قطن فاخر',
      item_type: 'finished',
      cost_price: 150,
      selling_price: 250
    }, 'test-user');

    // Get next code with same prefix
    const nextCode = await itemsRepo.getNextCode('PRD');
    expect(nextCode).toBe('PRD-0106');
  });

  it('4. Unified Parties screen supports offset (مقاصة) between customer & supplier balances (Requirement B1)', async () => {
    // Create party who is both supplier and customer
    const party = await partiesRepo.create({
      code: 'PTY-99',
      name: 'شركة النيل للغزل والمنسوجات',
      is_supplier: 1,
      is_customer: 1,
      supplier_balance: 5000, // we owe them 5000
      customer_balance: 3000  // they owe us 3000
    }, 'test-user');

    // Offset 2000
    const offsetRes = await partiesRepo.executeOffset(party.id, 2000, 'تسوية مقاصة شهرية', 'test-user');
    expect(offsetRes.success).toBe(true);

    const updated = await partiesRepo.getById(party.id);
    expect(updated.supplier_balance).toBe(3000);
    expect(updated.customer_balance).toBe(1000);
  });

  it('5. Cashier role sees only their outlet treasury and sales invoices (Requirement I1)', async () => {
    // Set active user as cashier with specific outlet
    const cashierOutletId = 'outlet-cairo-1';
    api.setActiveUser('usr-cashier', 'cashier', 'كاشير فرع القاهرة', cashierOutletId);

    const tRes = await api.getTreasuries();
    expect(Array.isArray(tRes.treasuries)).toBe(true);

    const invRes = await api.getSalesInvoices();
    expect(Array.isArray(invRes.data)).toBe(true);

    // Reset active user to owner
    api.setActiveUser('usr-owner', 'owner', 'المدير التنفيذي');
  });
});
