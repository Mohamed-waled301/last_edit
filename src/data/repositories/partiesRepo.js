import db from '../db';
import BalanceCalculator from '../../logic/balances';
import auditRepo from './auditRepo';

export const partiesRepo = {
  /**
   * Get all parties with calculated supplier balance, customer balance, and net balance
   */
  async getAll() {
    const list = await db.parties.filter(p => p.is_active === 1).toArray();
    const supInvoices = await db.supplier_invoices.toArray();
    const supReturns = await db.supplier_returns.toArray();
    const custInvoices = await db.sales_invoices.toArray();
    const custReturns = await db.customer_returns.toArray();

    return list.map(party => {
      // Find invoices/returns linked either by party.id or legacy supplier_id/customer_id
      const pSupInvoices = supInvoices.filter(i => i.supplier_id === party.id);
      const pSupReturns = supReturns.filter(r => r.supplier_id === party.id);
      const pCustInvoices = custInvoices.filter(i => i.customer_id === party.id);
      const pCustReturns = custReturns.filter(r => r.customer_id === party.id);

      const bal = BalanceCalculator.calculateUnifiedPartyBalance(
        pSupInvoices,
        pSupReturns,
        pCustInvoices,
        pCustReturns
      );

      return {
        ...party,
        supplier_balance: bal.supplierBalance,
        customer_balance: bal.customerBalance,
        net_balance: bal.netBalance,
        max_offset_amount: bal.maxOffsetAmount,
        is_both: party.is_supplier === 1 && party.is_customer === 1
      };
    });
  },

  async getById(id) {
    const party = await db.parties.get(id);
    if (!party) return null;

    const supInvoices = await db.supplier_invoices.where('supplier_id').equals(id).toArray();
    const supReturns = await db.supplier_returns.where('supplier_id').equals(id).toArray();
    const custInvoices = await db.sales_invoices.where('customer_id').equals(id).toArray();
    const custReturns = await db.customer_returns.where('customer_id').equals(id).toArray();

    const bal = BalanceCalculator.calculateUnifiedPartyBalance(
      supInvoices,
      supReturns,
      custInvoices,
      custReturns
    );

    return {
      ...party,
      supplier_balance: bal.supplierBalance,
      customer_balance: bal.customerBalance,
      net_balance: bal.netBalance,
      max_offset_amount: bal.maxOffsetAmount,
      is_both: party.is_supplier === 1 && party.is_customer === 1
    };
  },

  /**
   * Create unified party and sync with suppliers/customers tables
   */
  async create(data, userId = 'usr-accountant') {
    const id = `pty-${Date.now()}`;
    const code = data.code || `PRT-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const isSupplier = data.is_supplier ? 1 : 0;
    const isCustomer = data.is_customer ? 1 : 0;
    const creditLimit = isCustomer ? (Math.max(0, Number(data.credit_limit) || 0)) : 0; // Customer only!

    const party = {
      id,
      code,
      name: data.name,
      phone: data.phone || '',
      address: data.address || '',
      tax_number: data.tax_number || '',
      is_supplier: isSupplier,
      is_customer: isCustomer,
      supplier_type: data.supplier_type || 'goods', // 'goods' | 'service' (تشغيل خارجي)
      payment_terms: data.payment_terms || 'cash',
      credit_limit: creditLimit, // Exists on customer side only; no supplier ceiling
      notes: data.notes || '',
      is_active: 1,
      created_at: now
    };

    await db.transaction('rw', [db.parties, db.suppliers, db.customers], async () => {
      await db.parties.add(party);

      // Sync into suppliers if marked as supplier
      if (isSupplier) {
        await db.suppliers.put({
          id,
          name: party.name,
          phone: party.phone,
          address: party.address,
          tax_number: party.tax_number,
          supplier_type: party.supplier_type,
          payment_terms: party.payment_terms,
          credit_limit: 0, // No supplier ceiling
          notes: party.notes,
          is_active: 1,
          created_at: now
        });
      }

      // Sync into customers if marked as customer
      if (isCustomer) {
        await db.customers.put({
          id,
          name: party.name,
          phone: party.phone,
          address: party.address,
          tax_number: party.tax_number,
          customer_type: 'local',
          payment_terms: party.payment_terms,
          credit_limit: creditLimit,
          notes: party.notes,
          is_active: 1,
          created_at: now
        });
      }
    });

    await auditRepo.log(userId, 'CREATE_PARTY', 'parties', id, null, party);
    return party;
  },

  async update(id, data, userId = 'usr-accountant') {
    const current = await db.parties.get(id);
    if (!current) throw new Error('جهة التعامل غير موجودة');

    const isSupplier = data.is_supplier !== undefined ? (data.is_supplier ? 1 : 0) : current.is_supplier;
    const isCustomer = data.is_customer !== undefined ? (data.is_customer ? 1 : 0) : current.is_customer;
    const creditLimit = isCustomer ? (data.credit_limit !== undefined ? Math.max(0, Number(data.credit_limit) || 0) : current.credit_limit) : 0;

    const updated = {
      ...current,
      name: data.name ?? current.name,
      phone: data.phone ?? current.phone,
      address: data.address ?? current.address,
      tax_number: data.tax_number ?? current.tax_number,
      is_supplier: isSupplier,
      is_customer: isCustomer,
      supplier_type: data.supplier_type ?? current.supplier_type,
      payment_terms: data.payment_terms ?? current.payment_terms,
      credit_limit: creditLimit,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };

    await db.transaction('rw', [db.parties, db.suppliers, db.customers], async () => {
      await db.parties.put(updated);

      if (isSupplier) {
        await db.suppliers.put({
          id,
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          tax_number: updated.tax_number,
          supplier_type: updated.supplier_type,
          payment_terms: updated.payment_terms,
          credit_limit: 0,
          notes: updated.notes,
          is_active: updated.is_active,
          created_at: current.created_at
        });
      } else {
        await db.suppliers.delete(id);
      }

      if (isCustomer) {
        await db.customers.put({
          id,
          name: updated.name,
          phone: updated.phone,
          address: updated.address,
          tax_number: updated.tax_number,
          customer_type: 'local',
          payment_terms: updated.payment_terms,
          credit_limit: creditLimit,
          notes: updated.notes,
          is_active: updated.is_active,
          created_at: current.created_at
        });
      } else {
        await db.customers.delete(id);
      }
    });

    await auditRepo.log(userId, 'UPDATE_PARTY', 'parties', id, current, updated);
    return updated;
  },

  /**
   * Perform Offset (إجراء مقاصة بين حساب المورد وحساب العميل لنفس الجهة)
   */
  async executeOffset(partyId, amount, notes = '', userId = 'usr-accountant') {
    const numAmount = Math.max(0, Number(amount) || 0);
    if (numAmount <= 0) throw new Error('مبلغ المقاصة يجب أن يكون أكبر من صفر');

    const party = await this.getById(partyId);
    if (!party) throw new Error('جهة التعامل غير موجودة');
    if (!party.is_both) throw new Error('المقاصة متاحة فقط للجهات المسجلة كمورد وعميل في نفس الوقت');

    if (numAmount > party.max_offset_amount) {
      throw new Error(`مبلغ المقاصة (${numAmount} ج.م) أكبر من أقصى مبلغ متاح للمقاصة (${party.max_offset_amount} ج.م)`);
    }

    const now = new Date().toISOString();
    const offsetId = `ofs-${Date.now()}`;
    const offsetNumber = `OFFSET-${Date.now().toString().slice(-4)}`;

    await db.transaction('rw', [db.payments, db.customer_payments, db.audit_log], async () => {
      // 1. Record offset on supplier side (as a payment settlement)
      await db.payments.add({
        id: `spay-ofs-${Date.now()}`,
        payment_number: `PAY-${offsetNumber}`,
        supplier_id: partyId,
        invoice_id: null,
        account_id: 'offset-settlement',
        amount: numAmount,
        payment_date: now.split('T')[0],
        payment_method: 'offset',
        notes: `تسوية مقاصة مع حساب العميل: ${notes || offsetNumber}`,
        created_by: userId,
        created_at: now
      });

      // 2. Record offset on customer side (as a receipt settlement)
      await db.customer_payments.add({
        id: `cpay-ofs-${Date.now()}`,
        receipt_number: `REC-${offsetNumber}`,
        customer_id: partyId,
        invoice_id: null,
        account_id: 'offset-settlement',
        amount: numAmount,
        payment_date: now.split('T')[0],
        payment_method: 'offset',
        notes: `تسوية مقاصة مع حساب المورد: ${notes || offsetNumber}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'EXECUTE_OFFSET', 'parties', partyId, null, {
      offsetNumber,
      amount: numAmount,
      partyName: party.name
    });

    return { success: true, offsetNumber, amount: numAmount };
  }
};

export default partiesRepo;
