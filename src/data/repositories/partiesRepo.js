import db from '../db';
import BalanceCalculator, {
  resolveOpeningBalance,
  resolveOpeningType,
  normalizeOpeningBalance,
  normalizeAccountNature,
  DEFAULT_SUPPLIER_OPENING_TYPE,
  DEFAULT_CUSTOMER_OPENING_TYPE,
} from '../../logic/balances';
import auditRepo from './auditRepo';

/**
 * Normalize opening-balance payload into canonical side-specific fields.
 * Accepts both the new side-specific keys and the legacy generic keys so that
 * existing records / older clients gracefully fall back to 0.
 */
function normalizePartyOpenings(data = {}, current = null) {
  const get = (key, fallback) => (data[key] !== undefined ? data[key] : fallback);
  const curSup = current ? resolveOpeningBalance(current, 'supplier') : 0;
  const curCust = current ? resolveOpeningBalance(current, 'customer') : 0;
  const curSupType = current ? resolveOpeningType(current, 'supplier') : DEFAULT_SUPPLIER_OPENING_TYPE;
  const curCustType = current ? resolveOpeningType(current, 'customer') : DEFAULT_CUSTOMER_OPENING_TYPE;

  // Generic single-value form (used by quick supplier/customer modals)
  const genericBalance = data.opening_balance !== undefined ? normalizeOpeningBalance(data.opening_balance) : null;
  const genericType = data.opening_balance_type ?? data.openingBalanceType ?? null;

  let supplierOpening = data.supplier_opening_balance !== undefined
    ? normalizeOpeningBalance(data.supplier_opening_balance)
    : (genericBalance !== null ? genericBalance : curSup);
  let customerOpening = data.customer_opening_balance !== undefined
    ? normalizeOpeningBalance(data.customer_opening_balance)
    : (genericBalance !== null ? genericBalance : curCust);

  // Legacy aliases
  if (data.supplier_balance !== undefined && data.supplier_opening_balance === undefined && genericBalance === null && !current) {
    supplierOpening = normalizeOpeningBalance(data.supplier_balance);
  }
  if (data.customer_balance !== undefined && data.customer_opening_balance === undefined && genericBalance === null && !current) {
    customerOpening = normalizeOpeningBalance(data.customer_balance);
  }
  if (data.initial_supplier_balance !== undefined && data.supplier_opening_balance === undefined) {
    supplierOpening = normalizeOpeningBalance(data.initial_supplier_balance);
  }
  if (data.initial_customer_balance !== undefined && data.customer_opening_balance === undefined) {
    customerOpening = normalizeOpeningBalance(data.initial_customer_balance);
  }

  const supplierType = normalizeAccountNature(
    get('supplier_opening_type', get('supplierOpeningType', genericType ?? curSupType)),
    DEFAULT_SUPPLIER_OPENING_TYPE
  );
  const customerType = normalizeAccountNature(
    get('customer_opening_type', get('customerOpeningType', genericType ?? curCustType)),
    DEFAULT_CUSTOMER_OPENING_TYPE
  );
  const genericResolvedType = normalizeAccountNature(
    genericType ?? (data.is_supplier && !data.is_customer ? supplierType : customerType),
    curSupType
  );

  return {
    supplierOpening,
    customerOpening,
    supplierType,
    customerType,
    genericBalance: genericBalance !== null ? genericBalance : null,
    genericType: genericResolvedType,
  };
}

/**
 * Compute final ledger balances for a party:
 * Supplier Current = Opening + Credit Purchases - Cash Out (payments)
 * Customer Current = Opening + Credit Sales - Cash In (receipts)
 */
function withComputedBalances(party, bal) {
  const supplierOpening = resolveOpeningBalance(party, 'supplier');
  const customerOpening = resolveOpeningBalance(party, 'customer');
  const finalSup = normalizeOpeningBalance(supplierOpening + bal.supplierBalance);
  const finalCust = normalizeOpeningBalance(customerOpening + bal.customerBalance);
  const finalNet = Number((finalCust - finalSup).toFixed(2));
  const finalMaxOffset = Math.max(0, Number(Math.min(finalSup, finalCust).toFixed(2)));

  return {
    ...party,
    supplier_opening_balance: supplierOpening,
    customer_opening_balance: customerOpening,
    supplier_opening_type: resolveOpeningType(party, 'supplier'),
    customer_opening_type: resolveOpeningType(party, 'customer'),
    opening_balance: Number(party.opening_balance) || 0,
    opening_balance_type: party.opening_balance_type || (party.is_supplier && !party.is_customer
      ? resolveOpeningType(party, 'supplier')
      : resolveOpeningType(party, 'customer')),
    supplier_balance: finalSup,
    customer_balance: finalCust,
    net_balance: finalNet,
    max_offset_amount: finalMaxOffset,
    is_both: party.is_supplier === 1 && party.is_customer === 1
  };
}

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

      // Transactional balances only (invoices/payments/returns); the opening
      // itself is added once inside withComputedBalances.
      const bal = BalanceCalculator.calculateUnifiedPartyBalance(
        pSupInvoices,
        pSupReturns,
        pCustInvoices,
        pCustReturns
      );

      return withComputedBalances(party, bal);
    });
  },

  async getSuppliers() {
    const all = await this.getAll();
    return all.filter(p => p.is_supplier === 1);
  },

  async getCustomers() {
    const all = await this.getAll();
    return all.filter(p => p.is_customer === 1);
  },

  async getById(id) {
    const party = await db.parties.get(id);
    if (!party) return null;

    const supInvoices = await db.supplier_invoices.where('supplier_id').equals(id).toArray();
    const supReturns = await db.supplier_returns.where('supplier_id').equals(id).toArray();
    const custInvoices = await db.sales_invoices.where('customer_id').equals(id).toArray();
    const custReturns = await db.customer_returns.where('customer_id').equals(id).toArray();

    // Transactional balances only; the opening is added once in withComputedBalances.
    const bal = BalanceCalculator.calculateUnifiedPartyBalance(
      supInvoices,
      supReturns,
      custInvoices,
      custReturns
    );

    return withComputedBalances(party, bal);
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
    const customerDealType = isCustomer ? (data.customer_deal_type || 'cash') : 'cash';
    const creditLimit = (isCustomer && customerDealType === 'credit') ? (Math.max(0, Number(data.credit_limit) || 0)) : 0; // Credit customers only!
    const openings = normalizePartyOpenings(data, null);

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
      customer_deal_type: customerDealType,
      payment_terms: data.payment_terms || 'cash',
      credit_limit: creditLimit, // Exists on customer side only; no supplier ceiling
      // Opening balances (رصيد أول المدة) + account nature (دائن/مدين)
      opening_balance: openings.genericBalance !== null
        ? openings.genericBalance
        : (isSupplier && !isCustomer ? openings.supplierOpening : openings.customerOpening),
      opening_balance_type: data.opening_balance_type
        || (isCustomer && !isSupplier ? openings.customerType : openings.supplierType),
      supplier_opening_balance: isSupplier ? openings.supplierOpening : 0,
      supplier_opening_type: openings.supplierType,
      customer_opening_balance: isCustomer ? openings.customerOpening : 0,
      customer_opening_type: openings.customerType,
      supplier_balance: isSupplier ? openings.supplierOpening : 0,
      customer_balance: isCustomer ? openings.customerOpening : 0,
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
          opening_balance: party.supplier_opening_balance,
          opening_balance_type: party.supplier_opening_type,
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
          customer_deal_type: customerDealType,
          payment_terms: customerDealType === 'credit' ? 'credit' : (party.payment_terms || 'cash'),
          credit_limit: creditLimit,
          opening_balance: party.customer_opening_balance,
          opening_balance_type: party.customer_opening_type,
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
    const customerDealType = isCustomer 
      ? (data.customer_deal_type ?? current.customer_deal_type ?? (current.payment_terms === 'credit' && current.credit_limit > 0 ? 'credit' : 'cash')) 
      : 'cash';
    const creditLimit = (isCustomer && customerDealType === 'credit')
      ? (data.credit_limit !== undefined ? Math.max(0, Number(data.credit_limit) || 0) : (current.credit_limit || 0))
      : 0;
    const openings = normalizePartyOpenings(data, current);

    const updated = {
      ...current,
      name: data.name ?? current.name,
      phone: data.phone ?? current.phone,
      address: data.address ?? current.address,
      tax_number: data.tax_number ?? current.tax_number,
      is_supplier: isSupplier,
      is_customer: isCustomer,
      supplier_type: data.supplier_type ?? current.supplier_type,
      customer_deal_type: customerDealType,
      payment_terms: data.payment_terms ?? current.payment_terms,
      credit_limit: creditLimit,
      opening_balance: data.opening_balance !== undefined
        ? normalizeOpeningBalance(data.opening_balance)
        : (current.opening_balance ?? 0),
      opening_balance_type: normalizeAccountNature(
        data.opening_balance_type ?? current.opening_balance_type ?? openings.genericType,
        isCustomer && !isSupplier ? openings.customerType : openings.supplierType
      ),
      supplier_opening_balance: isSupplier
        ? (data.supplier_opening_balance !== undefined || data.opening_balance !== undefined
          ? openings.supplierOpening
          : resolveOpeningBalance(current, 'supplier'))
        : 0,
      supplier_opening_type: openings.supplierType,
      customer_opening_balance: isCustomer
        ? (data.customer_opening_balance !== undefined || data.opening_balance !== undefined
          ? openings.customerOpening
          : resolveOpeningBalance(current, 'customer'))
        : 0,
      customer_opening_type: openings.customerType,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };
    // Keep legacy snapshot fields in sync so older statements still resolve the opening.
    if (isSupplier) {
      updated.supplier_balance = updated.supplier_opening_balance;
      updated.initial_supplier_balance = updated.supplier_opening_balance;
    } else {
      updated.supplier_balance = 0;
    }
    if (isCustomer) {
      updated.customer_balance = updated.customer_opening_balance;
      updated.initial_customer_balance = updated.customer_opening_balance;
    } else {
      updated.customer_balance = 0;
    }

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
          opening_balance: updated.supplier_opening_balance,
          opening_balance_type: updated.supplier_opening_type,
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
          customer_deal_type: customerDealType,
          payment_terms: customerDealType === 'credit' ? 'credit' : (updated.payment_terms || 'cash'),
          credit_limit: creditLimit,
          opening_balance: updated.customer_opening_balance,
          opening_balance_type: updated.customer_opening_type,
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

    await db.transaction('rw', [db.parties, db.payments, db.customer_payments, db.audit_log], async () => {
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

      // 3. Deduct from stored party opening balances if present
      const rawParty = await db.parties.get(partyId);
      if (rawParty) {
        for (const key of ['supplier_opening_balance', 'customer_opening_balance', 'supplier_balance', 'customer_balance', 'initial_supplier_balance', 'initial_customer_balance', 'opening_balance']) {
          if (rawParty[key] != null) {
            rawParty[key] = Math.max(0, Number(rawParty[key] || 0) - numAmount);
          }
        }
        await db.parties.put(rawParty);
      }
    });

    await auditRepo.log(userId, 'EXECUTE_OFFSET', 'parties', partyId, null, {
      offsetNumber,
      amount: numAmount,
      partyName: party.name
    });

    return { success: true, offsetNumber, amount: numAmount };
  },

  async delete(id, userId = 'usr-accountant') {
    const current = await db.parties.get(id);
    if (!current) throw new Error('جهة التعامل غير موجودة');

    // Check sales invoices
    const salesCount = await db.sales_invoices.where('customer_id').equals(id).count();
    if (salesCount > 0) {
      throw new Error(`لا يمكن حذف جهة التعامل "${current.name}" لوجود (${salesCount}) فاتورة مبيعات مرتبطة بها. يمكنك تعطيل الحساب بدلاً من حذفه.`);
    }

    // Check supplier invoices
    const supInvCount = await db.supplier_invoices.where('supplier_id').equals(id).count();
    if (supInvCount > 0) {
      throw new Error(`لا يمكن حذف جهة التعامل "${current.name}" لوجود (${supInvCount}) فاتورة مشتريات مرتبطة بها.`);
    }

    // Check payments
    const payCount = await db.payments.where('supplier_id').equals(id).count();
    if (payCount > 0) {
      throw new Error(`لا يمكن حذف جهة التعامل "${current.name}" لوجود (${payCount}) سند صرف مسجل لها.`);
    }

    // Check customer payments
    const custPayCount = await db.customer_payments.where('customer_id').equals(id).count();
    if (custPayCount > 0) {
      throw new Error(`لا يمكن حذف جهة التعامل "${current.name}" لوجود (${custPayCount}) سند تحصيل مسجل لها.`);
    }

    // Check purchase orders
    const poCount = await db.purchase_orders.where('supplier_id').equals(id).count();
    if (poCount > 0) {
      throw new Error(`لا يمكن حذف جهة التعامل "${current.name}" لوجود (${poCount}) أمر شراء مسجل باسمها.`);
    }

    await db.transaction('rw', [db.parties, db.suppliers, db.customers], async () => {
      await db.parties.delete(id);
      await db.suppliers.delete(id);
      await db.customers.delete(id);
    });

    await auditRepo.log(userId, 'DELETE_PARTY', 'parties', id, current, null);
    return { success: true, message: `تم حذف جهة التعامل "${current.name}" بنجاح` };
  }
};

export default partiesRepo;
