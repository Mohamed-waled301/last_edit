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
  materialsRepo,
  productsRepo,
  manufacturingRepo,
  finishingRepo,
  salesRepo,
  cashRepo,
  reportsRepo,
  backupRepo,
  auditRepo,
} from '../data';

let currentUserId = 'usr-owner';
let currentUserRole = 'owner';
let currentUserFullName = 'المعلم إبراهيم الأصيل';

// Initialize session from sessionStorage if available
try {
  const savedUser = sessionStorage.getItem('erp_active_user');
  if (savedUser) {
    const parsed = JSON.parse(savedUser);
    currentUserId = parsed.id || currentUserId;
    currentUserRole = parsed.role || currentUserRole;
    currentUserFullName = parsed.full_name || currentUserFullName;
  }
} catch (e) {
  console.warn('Session read error:', e);
}

export function setActiveUser(userId, role, fullName) {
  currentUserId = userId;
  currentUserRole = role;
  if (fullName) currentUserFullName = fullName;

  try {
    sessionStorage.setItem('erp_active_user', JSON.stringify({
      id: currentUserId,
      role: currentUserRole,
      full_name: currentUserFullName,
    }));
  } catch (e) {
    console.warn('Session write error:', e);
  }
}

export function getActiveUser() {
  return { id: currentUserId, role: currentUserRole, full_name: currentUserFullName };
}

export function clearActiveUser() {
  sessionStorage.removeItem('erp_active_user');
}

export const api = {
  // Session & Auth
  getActiveUser,
  setActiveUser,
  clearActiveUser,

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
    return { success: true, data: sup, supplier: sup, message: 'تم إضافة المورد بنجاح' };
  },
  updateSupplier: async (id, data) => {
    const sup = await suppliersRepo.update(id, data, currentUserId);
    return { success: true, data: sup, supplier: sup, message: 'تم تحديث بيانات المورد' };
  },
  deleteSupplier: async (id) => {
    await suppliersRepo.update(id, { is_active: 0 }, currentUserId);
    return { success: true, message: 'تم إلغاء تفعيل المورد' };
  },

  getPurchaseOrders: async () => {
    const list = await suppliersRepo.getPurchaseOrders();
    return { success: true, data: list, purchase_orders: list };
  },
  createPurchaseOrder: async (data) => {
    const res = await suppliersRepo.createPurchaseOrder(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم إصدار أمر التوريد بنجاح' };
  },
  getGoodsReceipts: async () => {
    const list = await suppliersRepo.getGoodsReceipts();
    return { success: true, data: list, goods_receipts: list };
  },
  createGoodsReceipt: async (data) => {
    const res = await suppliersRepo.createGoodsReceipt(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم إنشاء إذن الاستلام المخزني بنجاح' };
  },
  getSupplierInvoices: async () => {
    const list = await suppliersRepo.getSupplierInvoices();
    return { success: true, data: list, invoices: list };
  },
  createSupplierInvoice: async (data) => {
    const res = await suppliersRepo.createSupplierInvoice(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل فاتورة المورد بنجاح' };
  },
  paySupplier: async (data) => {
    const res = await suppliersRepo.paySupplier(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل سند سداد المورد بنجاح' };
  },
  createSupplierReturn: async (data) => {
    const res = await suppliersRepo.createSupplierReturn(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل مرتجع الخامات بنجاح' };
  },

  // Inventory & Raw Materials
  getRawMaterials: async () => {
    const list = await materialsRepo.getAll();
    return { success: true, data: list, materials: list };
  },
  createRawMaterial: async (data) => {
    const m = await materialsRepo.create(data, currentUserId);
    return { success: true, data: m, material: m, message: 'تم إضافة الخامة بنجاح' };
  },
  updateRawMaterial: async (id, data) => {
    const m = await materialsRepo.update(id, data, currentUserId);
    return { success: true, data: m, material: m, message: 'تم تحديث بيانات الخامة' };
  },
  getMaterialMovements: async (id) => {
    const list = await materialsRepo.getMovements(id);
    return { success: true, data: list, movements: list };
  },
  saveStockCount: async (data) => {
    const res = await materialsRepo.saveStockCount(data, currentUserId);
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
    return { success: true, data: p, product: p, message: 'تم إنشاء المنتج وشجرة التكاليف' };
  },
  updateProduct: async (id, data) => {
    const p = await productsRepo.update(id, data, currentUserId);
    return { success: true, data: p, product: p, message: 'تم تحديث بيانات المنتج' };
  },

  // Manufacturing Stage 1
  getProductionOrders: async () => {
    const list = await manufacturingRepo.getAll();
    return { success: true, data: list, production_orders: list };
  },
  createProductionOrder: async (data) => {
    const res = await manufacturingRepo.createProductionOrder(data, currentUserId);
    return { success: true, data: res, order: res, message: 'تم إصدار أمر التصنيع بنجاح' };
  },
  completeStage1: async (id) => {
    const res = await manufacturingRepo.completeStage1(id, currentUserId);
    return { success: true, data: res, order: res, message: 'تم إتمام مرحلة النجارة 1 بنجاح' };
  },
  getOverheads: async () => {
    const list = await manufacturingRepo.getOverheads();
    return { success: true, data: list, overheads: list };
  },
  saveOverhead: async (data) => {
    const res = await manufacturingRepo.saveOverhead(data, currentUserId);
    return { success: true, data: res, overhead: res, message: 'تم حفظ مصاريف التشغيل الشهرية' };
  },

  // Finishing Stage 2
  getFinishingOrders: async () => {
    const list = await finishingRepo.getAll();
    return { success: true, data: list, finishing_orders: list };
  },
  createFinishingOrder: async (data) => {
    const res = await finishingRepo.createFinishingOrder(data, currentUserId);
    return { success: true, data: res, order: res, message: 'تم إنشاء أمر التشطيب بنجاح' };
  },
  markReadyForSale: async (id) => {
    const res = await finishingRepo.markReadyForSale(id, currentUserId);
    return { success: true, data: res, order: res, message: 'تم اعتماد جاهزية المنتج للبيع' };
  },

  // Sales & Outlets
  getCustomers: async () => {
    const list = await salesRepo.getCustomers();
    return { success: true, data: list, customers: list };
  },
  createCustomer: async (data) => {
    const c = await salesRepo.createCustomer(data, currentUserId);
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
  createOutlet: async (data) => {
    const o = await salesRepo.createOutlet(data, currentUserId);
    return { success: true, data: o, outlet: o, message: 'تم إضافة المعرض أو المنفذ' };
  },
  getSalesInvoices: async () => {
    const list = await salesRepo.getSalesInvoices();
    return { success: true, data: list, invoices: list };
  },
  createSalesInvoice: async (data) => {
    const res = await salesRepo.createSalesInvoice(data, currentUserId);
    return { success: true, data: res, invoice: res, message: 'تم إصدار فاتورة المبيعات بنجاح' };
  },
  collectCustomerPayment: async (data) => {
    const res = await salesRepo.collectPayment(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل سند التحصيل بنجاح' };
  },
  createCustomerReturn: async (data) => {
    const res = await salesRepo.createCustomerReturn(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل مرتجع المبيعات بنجاح' };
  },

  // Cash & Banks
  getAccounts: async () => {
    const list = await cashRepo.getAccounts();
    let totalCash = 0;
    let totalBank = 0;
    for (const a of list) {
      const bal = Number(a.current_balance) || 0;
      if (a.account_type === 'treasury') totalCash += bal;
      else totalBank += bal;
    }
    const grandTotal = Number((totalCash + totalBank).toFixed(2));
    const payload = {
      accounts: list,
      totalCash: Number(totalCash.toFixed(2)),
      totalBank: Number(totalBank.toFixed(2)),
      grandTotal,
    };
    return {
      success: true,
      data: payload,
      accounts: list,
      ...payload,
    };
  },
  createAccount: async (data) => {
    const a = await cashRepo.createAccount(data, currentUserId);
    return { success: true, data: a, account: a, message: 'تم إضافة الحساب المالي' };
  },
  getTransactions: async (params = '') => {
    const list = await cashRepo.getTransactions();
    return { success: true, data: list, transactions: list };
  },
  recordCashTransaction: async (data) => {
    const res = await cashRepo.recordTransaction(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تسجيل الحركة المالية بنجاح' };
  },
  transferCash: async (data) => {
    const res = await cashRepo.transfer(data, currentUserId);
    return { success: true, data: res, ...res, message: 'تم تحويل النقدية بنجاح' };
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
    return { success: true, data: s, settings: s, message: 'تم تحديث الإعدادات بنجاح' };
  },

  // Backup & Safety
  createBackup: async () => await backupRepo.exportAllData(),
  importBackup: async (content) => await backupRepo.importAllData(content, currentUserId),
  loadDemoData: async () => await backupRepo.loadDemoData(currentUserId),
  clearAllData: async () => await backupRepo.clearAllData(currentUserId),
  getBackups: async () => ({ success: true, data: [], backups: [] }),
};

export default api;
