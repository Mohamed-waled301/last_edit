/**
 * Workshop ERP - Local Frontend Data Layer Adapter
 * Transparently delegates to IndexedDB Repositories in /src/data/.
 * Returns both `data` and specific payload keys for 100% component compatibility.
 * Zero backend server, zero network overhead, full offline availability.
 */

import {
  usersRepo,
  settingsRepo,
  suppliersRepo,
  supplierActivityRepo,
  materialsRepo,
  productsRepo,
  manufacturingRepo,
  finishingRepo,
  salesRepo,
  cashRepo,
  reportsRepo,
  backupRepo,
  auditRepo,
  itemsRepo,
  partiesRepo,
  storageRepo,
  treasuriesRepo,
  expenseCodesRepo,
  dataManagementRepo,
} from '../data';
import db from '../data/db';
import { syncPush, syncFetch, syncHydrateAll } from './apiSync';

let currentUserId = '';
let currentUserRole = '';
let currentUserFullName = '';
let currentUserOutletId = null;

// Initialize session from sessionStorage if available
try {
  if (typeof sessionStorage !== 'undefined') {
    const savedUser = sessionStorage.getItem('erp_active_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      currentUserId = parsed.id || currentUserId;
      currentUserRole = parsed.role || currentUserRole;
      currentUserFullName = parsed.full_name || currentUserFullName;
      currentUserOutletId = parsed.outlet_id || null;
    }
  }
} catch (e) {
  console.warn('Session read error:', e);
}

export function setActiveUser(userId, role, fullName, outletId = null) {
  currentUserId = userId;
  currentUserRole = role;
  if (fullName) currentUserFullName = fullName;
  currentUserOutletId = outletId;

  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('erp_active_user', JSON.stringify({
        id: currentUserId,
        role: currentUserRole,
        full_name: currentUserFullName,
        outlet_id: currentUserOutletId,
      }));
    }
  } catch (e) {
    console.warn('Session write error:', e);
  }
}

export function getActiveUser() {
  return { id: currentUserId, role: currentUserRole, full_name: currentUserFullName, outlet_id: currentUserOutletId };
}

export function clearActiveUser() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('erp_active_user');
  }
}

export const api = {
  // Session & Auth
  getActiveUser,
  setActiveUser,
  clearActiveUser,

  // Master Data: Items & Clothing Variants
  getItems: async () => {
    const list = await itemsRepo.getAll();
    return { success: true, data: list, items: list };
  },
  getItem: async (id) => {
    const item = await itemsRepo.getById(id);
    return { success: true, data: item, item };
  },
  getItemByCode: async (code) => {
    const item = await itemsRepo.getByCode(code);
    return { success: Boolean(item), data: item, item };
  },
  createItem: async (data) => {
    const res = await itemsRepo.create(data, currentUserId);
    syncPush('items', 'insert', res);
    return { success: true, data: res, item: res, message: 'تم إضافة الصنف بنجاح' };
  },
  updateItem: async (id, data) => {
    const res = await itemsRepo.update(id, data, currentUserId);
    syncPush('items', 'update', res, id);
    return { success: true, data: res, item: res, message: 'تم تحديث بيانات الصنف' };
  },
  deleteItem: async (id) => {
    const res = await itemsRepo.delete(id, currentUserId);
    syncPush('items', 'delete', { id });
    return { success: true, ...res };
  },
  getNextItemCode: async (prefix = '') => {
    const code = await itemsRepo.getNextCode(prefix);
    return { success: true, data: code, code };
  },
  getItemSizes: async () => {
    const list = await itemsRepo.getSizes();
    return { success: true, data: list, sizes: list };
  },
  createItemSize: async (data) => {
    const res = await itemsRepo.createSize(data);
    syncPush('item_sizes', 'insert', res);
    return { success: true, data: res, size: res, message: 'تم إضافة المقاس بنجاح' };
  },
  getItemColors: async () => {
    const list = await itemsRepo.getColors();
    return { success: true, data: list, colors: list };
  },
  createItemColor: async (data) => {
    const res = await itemsRepo.createColor(data);
    syncPush('item_colors', 'insert', res);
    return { success: true, data: res, color: res, message: 'تم إضافة اللون بنجاح' };
  },

  // Item Units
  getItemUnits: async () => {
    const list = await itemsRepo.getUnits();
    return { success: true, data: list, units: list };
  },
  createItemUnit: async (data) => {
    const res = await itemsRepo.createUnit(data, currentUserId);
    syncPush('item_units', 'insert', res);
    return { success: true, data: res, unit: res, message: 'تم إضافة وحدة القياس بنجاح' };
  },

  // Item & Supplier Linking (Requirement 6.2)
  getItemSuppliers: async (itemId) => {
    const list = await itemsRepo.getItemSuppliers(itemId);
    return { success: true, data: list, suppliers: list };
  },
  setItemSuppliers: async (itemId, suppliersList) => {
    await itemsRepo.setItemSuppliers(itemId, suppliersList);
    return { success: true };
  },
  getSupplierItems: async (supplierId) => {
    const list = await itemsRepo.getSupplierItems(supplierId);
    return { success: true, data: list, items: list };
  },
  setSupplierItems: async (supplierId, itemIds) => {
    await itemsRepo.setSupplierItems(supplierId, itemIds);
    return { success: true };
  },

  // Item Groups
  getItemGroups: async () => {
    const list = await itemsRepo.getItemGroups();
    return { success: true, data: list, groups: list };
  },
  getItemGroup: async (id) => {
    const group = await itemsRepo.getItemGroupById(id);
    return { success: true, data: group, group };
  },
  createItemGroup: async (data) => {
    const res = await itemsRepo.createItemGroup(data, currentUserId);
    syncPush('item_groups', 'insert', res);
    return { success: true, data: res, group: res, message: 'تم إضافة مجموعة الصنف بنجاح' };
  },
  updateItemGroup: async (id, data) => {
    const res = await itemsRepo.updateItemGroup(id, data, currentUserId);
    syncPush('item_groups', 'update', res, id);
    return { success: true, data: res, group: res, message: 'تم تحديث مجموعة الصنف بنجاح' };
  },
  deleteItemGroup: async (id) => {
    const res = await itemsRepo.deleteItemGroup(id, currentUserId);
    syncPush('item_groups', 'delete', { id });
    return { success: true, ...res };
  },

  // Item Sections
  getItemSections: async () => {
    const list = await itemsRepo.getItemSections();
    return { success: true, data: list, sections: list };
  },
  getItemSection: async (id) => {
    const sec = await itemsRepo.getItemSectionById(id);
    return { success: true, data: sec, section: sec };
  },
  createItemSection: async (data) => {
    const res = await itemsRepo.createItemSection(data, currentUserId);
    syncPush('item_sections', 'insert', res);
    return { success: true, data: res, section: res, message: 'تم إضافة قسم الصنف بنجاح' };
  },
  updateItemSection: async (id, data) => {
    const res = await itemsRepo.updateItemSection(id, data, currentUserId);
    syncPush('item_sections', 'update', res, id);
    return { success: true, data: res, section: res, message: 'تم تحديث قسم الصنف بنجاح' };
  },
  deleteItemSection: async (id) => {
    const res = await itemsRepo.deleteItemSection(id, currentUserId);
    syncPush('item_sections', 'delete', { id });
    return { success: true, ...res };
  },

  // Stock Balance Engine & Stock Card
  hasItemOperationalMovements: async (id) => {
    const hasOps = await itemsRepo.hasOperationalMovements(id);
    return { success: true, hasOperationalMovements: hasOps, data: hasOps };
  },
  getItemStockCard: async (id, filters = {}) => {
    const card = await itemsRepo.getStockCard(id, filters);
    return { success: true, data: card, ...card };
  },
  recomputeStockBalances: async () => {
    const report = await itemsRepo.recomputeAllBalances(currentUserId);
    return { success: true, data: report, ...report, message: 'تم إعادة احتساب أرصدة المخزون بالكامل بنجاح' };
  },

  // Master Data: Unified Parties (Suppliers & Customers)
  getParties: async () => {
    const list = await partiesRepo.getAll();
    return { success: true, data: list, parties: list };
  },
  getParty: async (id) => {
    const party = await partiesRepo.getById(id);
    return { success: true, data: party, party };
  },
  createParty: async (data) => {
    const res = await partiesRepo.create(data, currentUserId);
    syncPush('parties', 'insert', res);
    if (res.is_supplier) {
      syncPush('suppliers', 'insert', {
        id: res.id,
        party_id: res.id,
        name: res.name,
        phone: res.phone,
        supplier_type: res.supplier_type,
        payment_terms: res.payment_terms,
        notes: res.notes,
        is_active: 1,
      });
    }
    if (res.is_customer) {
      syncPush('customers', 'insert', {
        id: res.id,
        party_id: res.id,
        name: res.name,
        phone: res.phone,
        customer_type: res.customer_deal_type || 'cash',
        payment_terms: res.payment_terms,
        credit_limit: res.credit_limit || 0,
        notes: res.notes,
        is_active: 1,
      });
    }
    return { success: true, data: res, party: res, message: 'تم إضافة جهة التعامل بنجاح' };
  },
  updateParty: async (id, data) => {
    const res = await partiesRepo.update(id, data, currentUserId);
    syncPush('parties', 'update', res, id);
    if (res.is_supplier) {
      syncPush('suppliers', 'update', { id, party_id: id, name: res.name, phone: res.phone, notes: res.notes }, id);
    }
    if (res.is_customer) {
      syncPush('customers', 'update', { id, party_id: id, name: res.name, phone: res.phone, notes: res.notes }, id);
    }
    return { success: true, data: res, party: res, message: 'تم تحديث بيانات جهة التعامل' };
  },
  deleteParty: async (id) => {
    const res = await partiesRepo.delete(id, currentUserId);
    syncPush('parties', 'delete', { id });
    syncPush('suppliers', 'delete', { id });
    syncPush('customers', 'delete', { id });
    return { success: true, ...res };
  },
  executePartyOffset: async (partyId, amount, notes = '') => {
    const res = await partiesRepo.executeOffset(partyId, amount, notes, currentUserId);
    return { success: true, data: res, ...res, message: 'تم إجراء المقاصة وتسوية الرصيد بنجاح' };
  },
  getPartySettlements: async (partyId = null) => {
    const list = await partiesRepo.getSettlements(partyId);
    return { success: true, data: list, settlements: list };
  },

  // Storage Locations & Stock Transfers & Adjustments
  getStorageLocations: async () => {
    const list = await storageRepo.getLocations();
    return { success: true, data: list, locations: list };
  },
  createStorageLocation: async (data) => {
    const res = await storageRepo.createLocation(data, currentUserId);
    syncPush('storage_locations', 'insert', res);
    return { success: true, data: res, location: res, message: 'تم إضافة موقع التخزين بنجاح' };
  },
  updateStorageLocation: async (id, data) => {
    const res = await storageRepo.updateLocation(id, data, currentUserId);
    syncPush('storage_locations', 'update', res, id);
    return { success: true, data: res, location: res, message: 'تم تحديث موقع التخزين' };
  },
  getStockTransfers: async () => {
    const list = await storageRepo.getTransfers();
    return { success: true, data: list, transfers: list };
  },
  createStockTransfer: async (data) => {
    const res = await storageRepo.createStockTransfer(data, currentUserId);
    syncPush('stock_transfers', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم تنفيذ التحويل المخزني بنجاح' };
  },
  getStockAdjustments: async () => {
    const list = await storageRepo.getAdjustments();
    return { success: true, data: list, adjustments: list };
  },
  createStockAdjustment: async (data) => {
    const res = await storageRepo.createAdjustment(data, currentUserId);
    syncPush('stock_adjustments', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم حفظ محضر التسوية الجردية وتحديث الرصيد' };
  },

  // Treasuries & Daily Closings
  getTreasuries: async () => {
    const res = await treasuriesRepo.getTreasuries();
    const safeTreasuries = Array.isArray(res.treasuries) ? res.treasuries : [];
    const safeOutlets = Array.isArray(res.outletTreasuries) ? res.outletTreasuries : [];
    return {
      success: true,
      data: safeTreasuries,
      treasuries: safeTreasuries,
      mainTreasury: res.mainTreasury || null,
      main_treasury: res.mainTreasury || null,
      outletTreasuries: safeOutlets,
      outlet_treasuries: safeOutlets,
      mainTreasuryBalance: res.mainTreasuryBalance || 0,
      totalOutletsBalance: res.totalOutletsBalance || 0,
      aggregatedGrandTotal: res.aggregatedGrandTotal || 0,
    };
  },
  createOutletTreasury: async (outletId, name, initialBalance = 0) => {
    const res = await treasuriesRepo.createOutletTreasury(outletId, name, initialBalance, currentUserId);
    syncPush('treasury_accounts', 'insert', res);
    return { success: true, data: res, treasury: res, message: 'تم إنشاء خزينة المنفذ' };
  },
  transferOutletToMain: async (data) => {
    const res = await treasuriesRepo.transferOutletToMain(data, currentUserId);
    return { success: true, data: res, message: 'تم توريد النقدية إلى الخزينة المركزية بنجاح' };
  },
  getDailyClosings: async (outletId = null) => {
    const list = await treasuriesRepo.getDailyClosings(outletId);
    return { success: true, data: list, closings: list };
  },
  performDailyClosing: async (data) => {
    const res = await treasuriesRepo.performDailyClosing(data, currentUserId);
    syncPush('daily_closings', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم اعتماد تقفيل الوردية اليومية بنجاح' };
  },
  createDailyClosing: async (data) => {
    const res = await treasuriesRepo.performDailyClosing(data, currentUserId);
    syncPush('daily_closings', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم اعتماد تقفيل الوردية اليومية بنجاح' };
  },

  // Expense Codes & Payment Methods
  getExpenseCodes: async () => {
    const list = await expenseCodesRepo.getAll();
    return { success: true, data: list, expense_codes: list };
  },
  createExpenseCode: async (data) => {
    const res = await expenseCodesRepo.create(data, currentUserId);
    syncPush('expense_codes', 'insert', res);
    return { success: true, data: res, expense_code: res, message: 'تم إضافة كود المصروف بنجاح' };
  },
  updateExpenseCode: async (id, data) => {
    const res = await expenseCodesRepo.update(id, data, currentUserId);
    syncPush('expense_codes', 'update', res, id);
    return { success: true, data: res, expense_code: res, message: 'تم تحديث كود المصروف' };
  },
  getPaymentMethods: async () => {
    const list = await expenseCodesRepo.getPaymentMethods();
    return { success: true, data: list, payment_methods: list };
  },
  createPaymentMethod: async (data) => {
    const res = await expenseCodesRepo.createPaymentMethod(data, currentUserId);
    syncPush('payment_methods', 'insert', res);
    return { success: true, data: res, payment_method: res, message: 'تم إضافة طريقة الدفع' };
  },
  disburseExpense: async (data) => {
    const res = await cashRepo.disburseExpense(data, currentUserId);
    if (res.transaction) syncPush('cash_transactions', 'insert', res.transaction);
    return { success: true, data: res, ...res, message: 'تم صرف النقدية وقيد المعاملة بنجاح' };
  },

  // Supplier Activity Types Master Management
  getSupplierActivityTypes: async () => {
    const list = await supplierActivityRepo.getActivityTypes();
    return { success: true, data: list, types: list };
  },
  createSupplierActivityType: async (data) => {
    const res = await supplierActivityRepo.createActivityType(data, currentUserId);
    syncPush('supplier_activity_types', 'insert', res);
    return { success: true, data: res, activityType: res, message: 'تم إضافة نوع نشاط المورد بنجاح' };
  },

  // Suppliers & Purchasing
  getSuppliers: async () => {
    const list = await suppliersRepo.getAll();
    return { success: true, data: list, suppliers: list };
  },
  getSupplierStatement: async (id) => {
    const res = await suppliersRepo.getStatement(id);
    return { success: true, data: res, ...res };
  },
  createSupplier: async (data) => {
    const sup = await suppliersRepo.create(data, currentUserId);
    syncPush('suppliers', 'insert', sup);
    return { success: true, data: sup, supplier: sup, message: 'تم إضافة المورد بنجاح' };
  },
  updateSupplier: async (id, data) => {
    const sup = await suppliersRepo.update(id, data, currentUserId);
    syncPush('suppliers', 'update', sup, id);
    return { success: true, data: sup, supplier: sup, message: 'تم تحديث بيانات المورد' };
  },
  deleteSupplier: async (id) => {
    await suppliersRepo.update(id, { is_active: 0 }, currentUserId);
    syncPush('suppliers', 'update', { id, is_active: 0 }, id);
    return { success: true, message: 'تم إلغاء تفعيل المورد' };
  },

  getPurchaseOrders: async () => {
    const list = await suppliersRepo.getPurchaseOrders();
    return { success: true, data: list, purchase_orders: list };
  },
  createPurchaseOrder: async (data) => {
    const res = await suppliersRepo.createPurchaseOrder(data, currentUserId);
    syncPush('purchase_orders', 'insert', res);
    if (Array.isArray(res.items)) {
      syncPush('purchase_order_items', 'insert', res.items);
    }
    const tx = await db.cash_transactions.where('reference_id').equals(res.id).first().catch(() => null);
    if (tx) {
      syncPush('cash_transactions', 'insert', tx);
      const acc = await db.treasury_accounts.get(tx.account_id).catch(() => null);
      if (acc) syncPush('treasury_accounts', 'update', acc, acc.id);
    }
    return { success: true, data: res, ...res, message: 'تم إصدار أمر التوريد بنجاح' };
  },
  receivePurchaseOrderFull: async (poId) => {
    const res = await suppliersRepo.receivePurchaseOrderFull(poId, currentUserId);
    return { success: true, data: res, ...res, message: 'تم استلام أمر التوريد بالكامل وتحديث أرصدة المخزون وحساب المورد بنجاح' };
  },
  cancelPurchaseOrder: async (poId, reason = '') => {
    const res = await suppliersRepo.cancelPurchaseOrder(poId, reason, currentUserId);
    syncPush('purchase_orders', 'update', { id: poId, status: 'cancelled' }, poId);
    const tx = await db.cash_transactions.where('reference_id').equals(poId).reverse().first().catch(() => null);
    if (tx && tx.category === 'purchase_orders') {
      syncPush('cash_transactions', 'insert', tx);
      const acc = await db.treasury_accounts.get(tx.account_id).catch(() => null);
      if (acc) syncPush('treasury_accounts', 'update', acc, acc.id);
    }
    return { success: true, data: res, ...res, message: 'تم إلغاء أمر التوريد بنجاح' };
  },
  deletePurchaseOrder: async (poId) => {
    const res = await suppliersRepo.deletePurchaseOrder(poId, currentUserId);
    syncPush('purchase_orders', 'delete', null, poId);
    return { success: true, ...res, message: 'تم حذف أمر التوريد بنجاح' };
  },
  deleteOrder: async (orderId) => {
    const res = await suppliersRepo.deletePurchaseOrder(orderId, currentUserId);
    syncPush('purchase_orders', 'delete', null, orderId);
    return { success: true, ...res, message: 'تم حذف أمر التوريد بنجاح' };
  },
  cancelSupplierInvoice: async (invoiceId, reason = '') => {
    const res = await suppliersRepo.cancelSupplierInvoice(invoiceId, reason, currentUserId);
    syncPush('supplier_invoices', 'update', { id: invoiceId, status: 'cancelled' }, invoiceId);
    const tx = await db.cash_transactions.where('reference_id').equals(invoiceId).first().catch(() => null);
    if (tx) {
      syncPush('cash_transactions', 'insert', tx);
      const acc = await db.treasury_accounts.get(tx.account_id).catch(() => null);
      if (acc) syncPush('treasury_accounts', 'update', acc, acc.id);
    }
    return { success: true, ...res, message: 'تم إلغاء فاتورة المورد بنجاح' };
  },
  getDueInstallments: async () => {
    const list = await suppliersRepo.getDueInstallments();
    return { success: true, data: list, installments: list };
  },
  getGoodsReceipts: async () => {
    const list = await suppliersRepo.getGoodsReceipts();
    return { success: true, data: list, goods_receipts: list };
  },
  createGoodsReceipt: async (data) => {
    const res = await suppliersRepo.createGoodsReceipt(data, currentUserId);
    syncPush('goods_receipts', 'insert', res);
    if (Array.isArray(res.items)) {
      syncPush('goods_receipt_items', 'insert', res.items);
    }
    return { success: true, data: res, ...res, message: 'تم إنشاء إذن الاستلام المخزني بنجاح' };
  },
  getSupplierInvoices: async () => {
    const list = await suppliersRepo.getSupplierInvoices();
    return { success: true, data: list, invoices: list };
  },
  createSupplierInvoice: async (data) => {
    const res = await suppliersRepo.createSupplierInvoice(data, currentUserId);
    syncPush('supplier_invoices', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم تسجيل فاتورة المورد بنجاح' };
  },
  paySupplier: async (data) => {
    const res = await suppliersRepo.paySupplier(data, currentUserId);
    if (res.payment) syncPush('payments', 'insert', res.payment);
    return { success: true, data: res, ...res, message: 'تم تسجيل سند سداد المورد بنجاح' };
  },
  createSupplierReturn: async (data) => {
    const res = await suppliersRepo.createSupplierReturn(data, currentUserId);
    syncPush('supplier_returns', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم تسجيل مرتجع الخامات بنجاح' };
  },

  // Inventory & Raw Materials
  getRawMaterials: async () => {
    const list = await materialsRepo.getAll();
    return { success: true, data: list, materials: list };
  },
  createRawMaterial: async (data) => {
    const m = await materialsRepo.create(data, currentUserId);
    syncPush('materials', 'insert', m);
    return { success: true, data: m, material: m, message: 'تم إضافة الخامة بنجاح' };
  },
  updateRawMaterial: async (id, data) => {
    const m = await materialsRepo.update(id, data, currentUserId);
    syncPush('materials', 'update', m, id);
    return { success: true, data: m, material: m, message: 'تم تحديث بيانات الخامة' };
  },
  getMaterialMovements: async (id) => {
    const res = await materialsRepo.getMovements(id);
    return { success: true, data: res, ...res };
  },
  saveStockCount: async (data) => {
    const res = await materialsRepo.saveStockCount(data, currentUserId);
    syncPush('stock_counts', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم اعتماد محضر الجرد وتحديث الأرصدة بنجاح' };
  },
  getLowStockAlerts: async () => {
    const list = await materialsRepo.getLowStockAlerts();
    return { success: true, data: list, alerts: list, materials: list };
  },

  // Products & BOM
  getProducts: async () => {
    const list = await productsRepo.getAll();
    return { success: true, data: list, products: list };
  },
  getProduct: async (id) => {
    const p = await productsRepo.getById(id);
    return { success: true, data: p, product: p };
  },
  createProduct: async (data) => {
    const p = await productsRepo.create(data, currentUserId);
    syncPush('products', 'insert', p);
    if (Array.isArray(p.bom)) {
      syncPush('bom_items', 'insert', p.bom);
    }
    return { success: true, data: p, product: p, message: 'تم إنشاء المنتج وشجرة التكاليف' };
  },
  updateProduct: async (id, data) => {
    const p = await productsRepo.update(id, data, currentUserId);
    syncPush('products', 'update', p, id);
    return { success: true, data: p, product: p, message: 'تم تحديث بيانات المنتج' };
  },

  // Manufacturing & Cutting Workflow (شاشة القص)
  getProductionOrders: async () => {
    const list = await manufacturingRepo.getAll();
    return { success: true, data: list, production_orders: list };
  },
  getProductionOrder: async (id) => {
    const res = await manufacturingRepo.getById(id);
    return { success: true, data: res, order: res };
  },
  createProductionOrder: async (data) => {
    const res = await manufacturingRepo.createProductionOrder(data, currentUserId);
    syncPush('production_orders', 'insert', res);
    return { success: true, data: res, order: res, message: 'تم إصدار أمر القص والتشغيل بنجاح' };
  },
  updateProductionOrder: async (id, data) => {
    const res = await manufacturingRepo.updateProductionOrder(id, data, currentUserId);
    syncPush('production_orders', 'update', res, id);
    return { success: true, data: res, order: res, message: 'تم تحديث بيانات أمر القص بنجاح' };
  },
  completeStage1: async (id) => {
    const res = await manufacturingRepo.completeStage1(id, currentUserId);
    syncPush('production_orders', 'update', res, id);
    return { success: true, data: res, order: res, message: 'تم إتمام مرحلة التصنيع والتجميع الأولى بنجاح' };
  },
  closeProductionOrder: async (id, reason = '') => {
    const res = await manufacturingRepo.closeProductionOrder(id, reason, currentUserId);
    syncPush('production_orders', 'update', res, id);
    return { success: true, data: res, order: res, message: 'تم إقفال أمر القص بنجاح' };
  },
  addStagePayment: async (orderId, stageKey, paymentData) => {
    const res = await manufacturingRepo.addStagePayment(orderId, stageKey, paymentData, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل دفعة المرحلة بنجاح' };
  },
  getWorkshopVendors: async (stageKey = null) => {
    const list = await manufacturingRepo.getWorkshopVendors(stageKey);
    return { success: true, data: list, vendors: list };
  },
  checkCuttingNumberUnique: async (cuttingNumber, excludeId = null) => {
    await manufacturingRepo.checkCuttingNumberUnique(cuttingNumber, excludeId);
    return { success: true };
  },
  getPrintingPayments: async (orderId) => {
    const res = await manufacturingRepo.getPrintingPayments(orderId);
    return { success: true, data: res, ...res };
  },
  addPrintingPayment: async (data) => {
    const res = await manufacturingRepo.addPrintingPayment(data, currentUserId);
    syncPush('cutting_printing_payments', 'insert', res);
    return { success: true, data: res, payment: res, message: 'تم تسجيل دفعة المطبعة بنجاح' };
  },
  updatePrintingPayment: async (id, data) => {
    const res = await manufacturingRepo.updatePrintingPayment(id, data, currentUserId);
    syncPush('cutting_printing_payments', 'update', res, id);
    return { success: true, data: res, payment: res, message: 'تم تحديث دفعة المطبعة بنجاح' };
  },
  deletePrintingPayment: async (id) => {
    const res = await manufacturingRepo.deletePrintingPayment(id, currentUserId);
    syncPush('cutting_printing_payments', 'delete', { id });
    return { success: true, ...res, message: 'تم حذف دفعة المطبعة بنجاح' };
  },
  getOverheads: async () => {
    const list = await manufacturingRepo.getOverheads();
    return { success: true, data: list, overheads: list };
  },
  saveOverhead: async (data) => {
    const res = await manufacturingRepo.saveOverhead(data, currentUserId);
    syncPush('overheads', 'insert', res);
    return { success: true, data: res, overhead: res, message: 'تم حفظ مصاريف التشغيل الشهرية' };
  },

  // Outsourced Manufacturing (التصنيع لدى الغير)
  getFinishingOrders: async () => {
    const list = await finishingRepo.getAll();
    return { success: true, data: list, finishing_orders: list, outsourced_orders: list };
  },
  createFinishingOrder: async (data) => {
    const res = await finishingRepo.createFinishingOrder(data, currentUserId);
    syncPush('finishing_orders', 'insert', res);
    return { success: true, data: res, order: res, message: 'تم إصدار أمر التشغيل لدى الغير بنجاح' };
  },
  markReadyForSale: async (id) => {
    const res = await finishingRepo.markReadyForSale(id, currentUserId);
    syncPush('finishing_orders', 'update', res, id);
    return { success: true, data: res, order: res, message: 'تم استلام المنتج واعتماد الجاهزية للبيع' };
  },

  // Sales & Outlets
  getCustomers: async () => {
    const list = await salesRepo.getCustomers();
    return { success: true, data: list, customers: list };
  },
  createCustomer: async (data) => {
    const c = await salesRepo.createCustomer(data, currentUserId);
    syncPush('customers', 'insert', c);
    return { success: true, data: c, customer: c, message: 'تم إضافة العميل بنجاح' };
  },
  getCustomerStatement: async (id) => {
    const res = await salesRepo.getCustomerStatement(id);
    return { success: true, data: res, ...res };
  },
  getOutlets: async () => {
    const list = await salesRepo.getOutlets();
    return { success: true, data: list, outlets: list };
  },
  getOutlet: async (id) => {
    const o = await salesRepo.getOutlet(id);
    return { success: true, data: o, outlet: o };
  },
  createOutlet: async (data) => {
    const o = await salesRepo.createOutlet(data, currentUserId);
    syncPush('sales_outlets', 'insert', o);
    return { success: true, data: o, outlet: o, message: 'تم إضافة المعرض أو المنفذ بنجاح' };
  },
  updateOutlet: async (id, data) => {
    const o = await salesRepo.updateOutlet(id, data, currentUserId);
    syncPush('sales_outlets', 'update', o);
    return { success: true, data: o, outlet: o, message: 'تم تحديث بيانات المنفذ بنجاح' };
  },
  deleteOutlet: async (id) => {
    const res = await salesRepo.deleteOutlet(id, currentUserId);
    syncPush('sales_outlets', 'delete', { id });
    return { success: true, ...res };
  },
  getSalesInvoices: async (outletId = null) => {
    // Check if current user is cashier restricted to specific outlet
    const userOutletId = currentUserRole === 'cashier' ? currentUserOutletId : (outletId || null);
    const list = await salesRepo.getSalesInvoices(userOutletId);
    return { success: true, data: list, invoices: list };
  },
  getSalesReport: async (filters = {}) => {
    const res = await salesRepo.getSalesReport(filters);
    return { success: true, data: res.customerRows, ...res };
  },
  createSalesInvoice: async (data) => {
    const res = await salesRepo.createSalesInvoice(data, currentUserId);
    syncPush('sales_invoices', 'insert', res);
    if (Array.isArray(res.items)) {
      syncPush('sales_invoice_items', 'insert', res.items);
    }
    const tx = await db.cash_transactions.where('reference_id').equals(res.id).first().catch(() => null);
    if (tx) {
      syncPush('cash_transactions', 'insert', tx);
      const acc = await db.treasury_accounts.get(tx.account_id).catch(() => null);
      if (acc) syncPush('treasury_accounts', 'update', acc, acc.id);
    }
    return { success: true, data: res, invoice: res, message: 'تم إصدار فاتورة المبيعات بنجاح' };
  },
  cancelSalesInvoice: async (invoiceId, reason = '') => {
    const res = await salesRepo.cancelSalesInvoice(invoiceId, reason, currentUserId);
    syncPush('sales_invoices', 'update', { id: invoiceId, status: 'cancelled' }, invoiceId);
    const tx = await db.cash_transactions.where('reference_id').equals(invoiceId).first().catch(() => null);
    if (tx) {
      syncPush('cash_transactions', 'insert', tx);
      const acc = await db.treasury_accounts.get(tx.account_id).catch(() => null);
      if (acc) syncPush('treasury_accounts', 'update', acc, acc.id);
    }
    return { success: true, ...res, message: 'تم إلغاء فاتورة المبيعات بنجاح' };
  },
  cancelInvoice: async (invoiceId, reason = '') => {
    const supInv = await db.supplier_invoices.get(invoiceId).catch(() => null);
    if (supInv) {
      return api.cancelSupplierInvoice(invoiceId, reason);
    }
    return api.cancelSalesInvoice(invoiceId, reason);
  },
  collectCustomerPayment: async (data) => {
    const res = await salesRepo.collectPayment(data, currentUserId);
    if (res.payment) syncPush('customer_payments', 'insert', res.payment);
    return { success: true, data: res, ...res, message: 'تم تسجيل سند التحصيل بنجاح' };
  },
  createCustomerReturn: async (data) => {
    const res = await salesRepo.createCustomerReturn(data, currentUserId);
    syncPush('customer_returns', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم تسجيل مرتجع المبيعات بنجاح' };
  },

  // Cash & Banks
  getAccounts: async () => {
    const list = await cashRepo.getAccounts();
    const safeList = Array.isArray(list) ? list : [];
    let totalCash = 0;
    let totalBank = 0;
    for (const a of safeList) {
      const bal = Number(a.current_balance) || 0;
      if (a.account_type === 'treasury') totalCash += bal;
      else totalBank += bal;
    }
    const grandTotal = Number((totalCash + totalBank).toFixed(2));
    const payload = {
      accounts: safeList,
      totalCash: Number(totalCash.toFixed(2)),
      totalBank: Number(totalBank.toFixed(2)),
      grandTotal,
    };
    return {
      success: true,
      data: safeList,
      accounts: safeList,
      ...payload,
    };
  },
  createAccount: async (data) => {
    const a = await cashRepo.createAccount(data, currentUserId);
    syncPush('treasury_accounts', 'insert', a);
    return { success: true, data: a, account: a, message: 'تم إضافة الحساب المالي' };
  },
  getTransactions: async (params = '') => {
    const list = await cashRepo.getTransactions();
    return { success: true, data: list, transactions: list };
  },
  recordCashTransaction: async (data) => {
    const res = await cashRepo.recordTransaction(data, currentUserId);
    syncPush('cash_transactions', 'insert', res);
    return { success: true, data: res, ...res, message: 'تم تسجيل الحركة المالية بنجاح' };
  },
  transferCash: async (data) => {
    const res = await cashRepo.transfer(data, currentUserId);
    if (res.outTx) syncPush('cash_transactions', 'insert', res.outTx);
    if (res.inTx) syncPush('cash_transactions', 'insert', res.inTx);
    return { success: true, data: res, ...res, message: 'تم تحويل النقدية بنجاح' };
  },

  // Supplier Payments & Customer Receipts (Requirement 2)
  recordSupplierPayment: async (data) => {
    const res = await cashRepo.recordSupplierPayment(data, currentUserId);
    syncPush('payments', 'insert', { id: res.paymentId });
    syncPush('cash_transactions', 'insert', { id: res.txNumber });
    return { success: true, data: res, ...res, message: 'تم إصدار سند سداد دفعة المورد وتخفيض رصيده والخزينة بنجاح' };
  },
  recordCustomerReceipt: async (data) => {
    const res = await cashRepo.recordCustomerReceipt(data, currentUserId);
    syncPush('customer_payments', 'insert', { id: res.receiptId });
    syncPush('cash_transactions', 'insert', { id: res.txNumber });
    return { success: true, data: res, ...res, message: 'تم إصدار سند استلام نقدية العميل وتوريدها للخزينة بنجاح' };
  },
  cancelSupplierPayment: async (paymentId, reason = '') => {
    const res = await cashRepo.cancelSupplierPayment(paymentId, reason, currentUserId);
    syncPush('payments', 'update', { id: paymentId, status: 'cancelled' }, paymentId);
    return { success: true, ...res, message: 'تم إلغاء سند صرف دفعة المورد وقيد العملية العكسية بالخزينة بنجاح' };
  },
  cancelCustomerReceipt: async (receiptId, reason = '') => {
    const res = await cashRepo.cancelCustomerReceipt(receiptId, reason, currentUserId);
    syncPush('customer_payments', 'update', { id: receiptId, status: 'cancelled' }, receiptId);
    return { success: true, ...res, message: 'تم إلغاء سند استلام نقدية العميل وقيد العملية العكسية بالخزينة بنجاح' };
  },
  getSupplierPayments: async () => {
    const list = await db.payments.reverse().sortBy('created_at');
    const parties = await db.parties.toArray();
    const accounts = await db.treasury_accounts.toArray();
    const pMap = new Map(parties.map(p => [p.id, p]));
    const aMap = new Map(accounts.map(a => [a.id, a]));

    const enriched = list.map(p => ({
      ...p,
      supplier_name: pMap.get(p.supplier_id)?.name || p.supplier_id,
      supplier_code: pMap.get(p.supplier_id)?.code || '',
      account_name: aMap.get(p.account_id)?.name || p.account_id
    }));
    return { success: true, data: enriched, payments: enriched };
  },
  getCustomerReceipts: async () => {
    const list = await db.customer_payments.reverse().sortBy('created_at');
    const parties = await db.parties.toArray();
    const accounts = await db.treasury_accounts.toArray();
    const pMap = new Map(parties.map(p => [p.id, p]));
    const aMap = new Map(accounts.map(a => [a.id, a]));

    const enriched = list.map(p => ({
      ...p,
      customer_name: pMap.get(p.customer_id)?.name || p.customer_id,
      customer_code: pMap.get(p.customer_id)?.code || '',
      account_name: aMap.get(p.account_id)?.name || p.account_id
    }));
    return { success: true, data: enriched, receipts: enriched };
  },


  // Reports & Dashboard
  getDashboard: async () => {
    const dash = await reportsRepo.getDashboard(currentUserRole);
    return { success: true, data: dash, dashboard: dash };
  },
  getCostBreakdown: async () => {
    const cb = await reportsRepo.getCostBreakdown();
    return { success: true, data: cb, cost_breakdown: cb };
  },
  getProductsReport: async () => {
    const pr = await reportsRepo.getProductsReport();
    return { success: true, data: pr, productsReport: pr };
  },
  getProfitability: async () => {
    const prof = await reportsRepo.getProfitability();
    return { success: true, data: { byProduct: prof, byOutlet: [] }, profitability: prof };
  },
  getDebtAging: async () => {
    const da = await reportsRepo.getDebtAging();
    return { success: true, data: { suppliers: da.supplierAging, customers: da.customerAging }, ...da };
  },

  // Users, Audit & Settings
  getUsers: async () => {
    const list = await usersRepo.getAll();
    return { success: true, data: list, users: list };
  },
  getAuditLogs: async () => {
    const list = await auditRepo.getAll();
    return { success: true, data: list, audit_logs: list };
  },
  getSettings: async () => {
    const s = await settingsRepo.getSettings();
    return { success: true, data: s, settings: s };
  },
  updateSettings: async (data) => {
    const s = await settingsRepo.updateSettings(data, currentUserId);
    syncPush('settings', 'update', s, 1);
    return { success: true, data: s, settings: s, message: 'تم تحديث الإعدادات بنجاح' };
  },

  // Backup & Safety
  createBackup: async () => await backupRepo.exportAllData(),
  importBackup: async (content) => await backupRepo.importAllData(content, currentUserId),
  loadDemoData: async () => await backupRepo.loadDemoData(currentUserId),
  clearAllData: async () => await backupRepo.clearAllData(currentUserId),
  getBackups: async () => ({ success: true, data: [], backups: [] }),

  // Data Management (إدارة البيانات - CEO Only)
  getDataTables: async () => {
    const list = await dataManagementRepo.getTables();
    return { success: true, data: list, tables: list };
  },
  getTableRecords: async (tableName) => {
    const list = await dataManagementRepo.getTableRecords(tableName);
    return { success: true, data: list, records: list };
  },
  getDataRecord: async (tableName, id) => {
    const rec = await dataManagementRepo.getRecord(tableName, id);
    return { success: true, data: rec, record: rec };
  },
  createDataRecord: async (tableName, data, reason = '') => {
    const rec = await dataManagementRepo.createRecord(tableName, data, reason);
    syncPush(tableName, 'insert', rec);
    return { success: true, data: rec, record: rec, message: 'تم حفظ السجل بنجاح' };
  },
  updateDataRecord: async (tableName, id, data, reason = '') => {
    const rec = await dataManagementRepo.updateRecord(tableName, id, data, reason);
    syncPush(tableName, 'update', rec, id);
    return { success: true, data: rec, record: rec, message: 'تم تحديث بيانات السجل بنجاح' };
  },
  deleteDataRecord: async (tableName, id, reason = '') => {
    await dataManagementRepo.deleteRecord(tableName, id, reason);
    syncPush(tableName, 'delete', null, id);
    return { success: true, message: 'تم حذف السجل بنجاح' };
  },
  checkRecordReferences: async (tableName, id) => {
    const res = await dataManagementRepo.checkRecordReferences(tableName, id);
    return { success: true, ...res };
  },
  getAuditLogsFiltered: async (filters = {}) => {
    const logs = await dataManagementRepo.getAuditLogs(filters);
    return { success: true, data: logs, audit_logs: logs };
  },

  // Real-Time Hostinger Database Sync
  syncPush,
  syncFetch,
  syncHydrateAll,
};

export { syncPush, syncFetch, syncHydrateAll };
export default api;


