import db from '../db';
import auditRepo from './auditRepo';

export const expenseCodesRepo = {
  /**
   * 1. Expense Codes (أكواد المصروفات)
   */
  async getAll() {
    return await db.expense_codes.filter(e => e.is_active === 1).toArray();
  },

  async create(data, userId = 'usr-accountant') {
    const id = `expc-${Date.now()}`;
    const code = data.code || `EXP-${Date.now().toString().slice(-4)}`;
    const record = {
      id,
      code,
      name: data.name,
      default_amount: Math.max(0, Number(data.default_amount) || 0),
      category: data.category || 'operating',
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.expense_codes.add(record);
    await auditRepo.log(userId, 'CREATE_EXPENSE_CODE', 'expense_codes', id, null, record);
    return record;
  },

  async update(id, data, userId = 'usr-accountant') {
    const current = await db.expense_codes.get(id);
    if (!current) throw new Error('كود المصروف غير موجود');
    const updated = {
      ...current,
      name: data.name ?? current.name,
      code: data.code ?? current.code,
      default_amount: data.default_amount !== undefined ? Math.max(0, Number(data.default_amount) || 0) : current.default_amount,
      category: data.category ?? current.category,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };
    await db.expense_codes.put(updated);
    await auditRepo.log(userId, 'UPDATE_EXPENSE_CODE', 'expense_codes', id, current, updated);
    return updated;
  },

  /**
   * 2. Payment Methods (طرق الدفع للموردين والعملاء)
   */
  async getPaymentMethods() {
    return await db.payment_methods.filter(p => p.is_active === 1).toArray();
  },

  async createPaymentMethod(data, userId = 'usr-accountant') {
    const id = `pm-${Date.now()}`;
    const method = {
      id,
      name: data.name,
      code: data.code || `PM-${Date.now().toString().slice(-4)}`,
      notes: data.notes || '',
      is_active: 1
    };
    await db.payment_methods.add(method);
    await auditRepo.log(userId, 'CREATE_PAYMENT_METHOD', 'payment_methods', id, null, method);
    return method;
  },

  async updatePaymentMethod(id, data, userId = 'usr-accountant') {
    const current = await db.payment_methods.get(id);
    if (!current) throw new Error('طريقة الدفع غير موجودة');
    const updated = {
      ...current,
      name: data.name ?? current.name,
      code: data.code ?? current.code,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };
    await db.payment_methods.put(updated);
    return updated;
  }
};

export default expenseCodesRepo;
