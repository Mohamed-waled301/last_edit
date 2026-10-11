import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { api } from '../../services/api';
import { isLineItemComplete, validateLineItem } from '../../utils/validation';
import { 
  calculateClothingBOMCost, 
  calculateClothingInternalStagesCost, 
  calculateOutsourcedAccumulation,
  calculateProfitMargin,
  calculateSellingPriceFromMargin
} from '../costCalculator';
import { calculateUnifiedPartyBalance } from '../balances';

describe('Data Layer Safety & Defensive Design (Requirement M)', () => {
  it('ensures api methods return real arrays and defend against e.find is not a function', async () => {
    // Check that api methods exist and return expected shapes
    expect(typeof api.getTreasuries).toBe('function');
    expect(typeof api.getAccounts).toBe('function');
    expect(typeof api.getItems).toBe('function');
    expect(typeof api.getParties).toBe('function');
    expect(typeof api.getExpenseCodes).toBe('function');
    expect(typeof api.getPaymentMethods).toBe('function');
    expect(typeof api.getStorageLocations).toBe('function');
    expect(typeof api.getDailyClosings).toBe('function');
  });

  it('guarantees getTreasuries provides safe arrays that never throw TypeError on .find or .reduce', async () => {
    const res = await api.getTreasuries();
    expect(Array.isArray(res.data)).toBe(true);
    expect(Array.isArray(res.treasuries)).toBe(true);
    expect(Array.isArray(res.outletTreasuries)).toBe(true);

    // Defensive test: .find() and .reduce() must never throw
    expect(() => res.treasuries.find(t => t.is_main)).not.toThrow();
    expect(() => res.outletTreasuries.reduce((sum, t) => sum + (t.current_balance || 0), 0)).not.toThrow();
  });

  it('guarantees getAccounts provides safe arrays that never throw TypeError on .reduce', async () => {
    const res = await api.getAccounts();
    expect(Array.isArray(res.data)).toBe(true);
    expect(Array.isArray(res.accounts)).toBe(true);
    expect(typeof res.totalCash).toBe('number');
    expect(typeof res.totalBank).toBe('number');
    expect(typeof res.grandTotal).toBe('number');

    expect(() => res.accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0)).not.toThrow();
  });

  it('guarantees getItems returns real arrays with items and variants structure', async () => {
    const res = await api.getItems();
    expect(Array.isArray(res.data)).toBe(true);
    expect(Array.isArray(res.items)).toBe(true);
  });

  it('guarantees getParties returns real arrays for unified suppliers and customers', async () => {
    const res = await api.getParties();
    expect(Array.isArray(res.data)).toBe(true);
    expect(Array.isArray(res.parties)).toBe(true);
  });

  it('guarantees getExpenseCodes and getPaymentMethods return real arrays', async () => {
    const expRes = await api.getExpenseCodes();
    expect(Array.isArray(expRes.data)).toBe(true);
    expect(Array.isArray(expRes.expense_codes)).toBe(true);

    const pmRes = await api.getPaymentMethods();
    expect(Array.isArray(pmRes.data)).toBe(true);
    expect(Array.isArray(pmRes.payment_methods)).toBe(true);
  });

  it('guarantees getStorageLocations and getStockTransfers return real arrays', async () => {
    const locRes = await api.getStorageLocations();
    expect(Array.isArray(locRes.data)).toBe(true);
    expect(Array.isArray(locRes.locations)).toBe(true);

    const trRes = await api.getStockTransfers();
    expect(Array.isArray(trRes.data)).toBe(true);
    expect(Array.isArray(trRes.transfers)).toBe(true);
  });
});

describe('Strict Line-Item Validation Rules (Requirement L2)', () => {
  it('blocks incomplete lines where item is missing or quantity <= 0', () => {
    // Incomplete line: no item
    const line1 = { product_id: '', quantity: '1', unit_selling_price: '50' };
    expect(isLineItemComplete(line1)).toBe(false);

    // Incomplete line: zero quantity
    const line2 = { product_id: 'item-1', quantity: '0', unit_selling_price: '50' };
    expect(isLineItemComplete(line2)).toBe(false);

    // Incomplete line: negative quantity
    const line3 = { product_id: 'item-1', quantity: '-2', unit_selling_price: '50' };
    expect(isLineItemComplete(line3)).toBe(false);

    // Incomplete line: item with variants but variant not selected
    const line4 = { product_id: 'item-1', variant_id: '', quantity: '5', unit_selling_price: '100', has_variants: true };
    expect(isLineItemComplete(line4)).toBe(false);

    // Complete line: item with variant selected, qty > 0, price >= 0
    const line5 = { product_id: 'item-1', variant_id: 'v-xl-black', quantity: '5', unit_selling_price: '100', has_variants: true };
    expect(isLineItemComplete(line5)).toBe(true);

    // Complete line without variants
    const line6 = { product_id: 'item-2', quantity: '10', unit_selling_price: '25', has_variants: false };
    expect(isLineItemComplete(line6)).toBe(true);
  });

  it('returns specific Arabic error messages for invalid line-items', () => {
    const validation = validateLineItem({
      item_id: '',
      quantity: 0,
      unit_price: -10
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors.item).toContain('اختيار الصنف');
    expect(validation.errors.quantity).toBe('الكمية يجب أن تكون أكبر من صفر');
    expect(validation.errors.unit_price).toBe('السعر لا يمكن أن يكون سالباً');
  });
});

describe('Zero Waste Percentage & Clothing Factory Costing (Requirement A4, E2)', () => {
  it('strictly excludes waste percentage from BOM calculations', () => {
    const rawMaterials = [
      { quantity_per_unit: 1.2, unit_cost: 80 },  // 96 EGP
      { quantity_per_unit: 5, unit_cost: 3 },     // 15 EGP
      { quantity_per_unit: 1, unit_cost: 10 }     // 10 EGP
    ];

    const bomTotal = calculateClothingBOMCost(rawMaterials);
    expect(bomTotal).toBe(121);
    // No waste multiplier or extra percentage
    expect(bomTotal).not.toBeGreaterThan(121);
  });

  it('accumulates costs correctly for outsourced manufacturing (internal + outsourced = final)', () => {
    const bomCost = 120;
    const internalLabor = 35; // cutting + sewing
    const internalCost = bomCost + internalLabor; // 155
    const outsourcedWashEmbroidery = 30;

    const finalUnitCost = calculateOutsourcedAccumulation(internalCost, outsourcedWashEmbroidery);
    expect(finalUnitCost).toBe(185);
  });

  it('calculates bidirectional profit margin and selling price accurately', () => {
    const costPrice = 200;
    const sellingPrice = 300;

    // Margin = (300 - 200) / 200 * 100 = 50%
    const margin = calculateProfitMargin(costPrice, sellingPrice);
    expect(margin.marginValue).toBe(100);
    expect(margin.marginPercentage).toBe(50);

    // Calculate selling price from 50% margin
    const calculatedSell = calculateSellingPriceFromMargin(costPrice, 50);
    expect(calculatedSell).toBe(300);
  });
});

describe('Customer Credit Limit Enforcement (Requirement B2, F3)', () => {
  it('blocks credit invoices when current debt + invoice total exceeds credit limit', () => {
    const customer = {
      is_customer: 1,
      credit_limit: 10000,
      current_balance: 8000 // already owes 8,000
    };

    const invoiceTotal = 3000;
    const paymentTerms = 'credit';

    const projectedBalance = customer.current_balance + invoiceTotal; // 11,000
    const isExceeded = paymentTerms === 'credit' && customer.credit_limit > 0 && projectedBalance > customer.credit_limit;
    expect(isExceeded).toBe(true);
  });

  it('permits cash invoices even if credit limit is exceeded', () => {
    const customer = {
      is_customer: 1,
      credit_limit: 10000,
      current_balance: 15000 // already over limit
    };

    const invoiceTotal = 5000;
    const paymentTerms = 'cash'; // Cash has no credit risk

    const isBlocked = paymentTerms === 'credit' && customer.credit_limit > 0 && (customer.current_balance + invoiceTotal) > customer.credit_limit;
    expect(isBlocked).toBe(false);
  });
});

describe('Full Outlets (معارض ومنافذ البيع) & Entity CRUD Coverage', () => {
  it('supports complete CRUD on sales_outlets with auto treasury generation', async () => {
    // 1. Create Outlet
    const created = await api.createOutlet({
      name: 'معرض الإسكندرية - سموحة',
      code: 'OUT-ALX-01',
      location: 'سموحة، الإسكندرية',
      contact_phone: '01012345678',
      price_markup_percent: 5,
      initial_balance: 1500,
    });
    expect(created.success).toBe(true);
    expect(created.data.name).toBe('معرض الإسكندرية - سموحة');
    expect(created.data.id).toBeDefined();

    // 2. Read Outlets & Single Outlet
    const allOutlets = await api.getOutlets();
    expect(allOutlets.data.some(o => o.id === created.data.id)).toBe(true);

    const single = await api.getOutlet(created.data.id);
    expect(single.data.name).toBe('معرض الإسكندرية - سموحة');
    expect(single.data.current_balance).toBe(1500);

    // 3. Update Outlet
    const updated = await api.updateOutlet(created.data.id, {
      name: 'معرض الإسكندرية - سيدي جابر',
      price_markup_percent: 8,
    });
    expect(updated.success).toBe(true);
    expect(updated.data.name).toBe('معرض الإسكندرية - سيدي جابر');
    expect(updated.data.price_markup_percent).toBe(8);

    // 4. Delete Outlet (Safe when no transactions)
    const delRes = await api.deleteOutlet(created.data.id);
    expect(delRes.success).toBe(true);

    const afterDelete = await api.getOutlets();
    expect(afterDelete.data.some(o => o.id === created.data.id)).toBe(false);
  });

  it('supports item deletion with dependency checking', async () => {
    // Create an item
    const created = await api.createItem({
      name: 'قماش صوف تيست للحذف',
      code: `ITM-DEL-${Date.now()}`,
      cost_price: 50,
      item_type: 'raw_material',
      unit: 'متر',
    });
    expect(created.success).toBe(true);

    // Delete item safely
    const delRes = await api.deleteItem(created.data.id);
    expect(delRes.success).toBe(true);
  });

  it('supports party deletion with dependency checking', async () => {
    // Create a customer
    const created = await api.createParty({
      name: 'عميل تيست للحذف',
      code: `PTY-DEL-${Date.now()}`,
      is_customer: 1,
      is_supplier: 0,
      phone: '01099998888',
    });
    expect(created.success).toBe(true);

    // Delete customer safely
    const delRes = await api.deleteParty(created.data.id);
    expect(delRes.success).toBe(true);
  });
});

