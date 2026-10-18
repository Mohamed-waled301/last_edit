import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import BalanceCalculator, {
  resolveOpeningBalance,
  resolveOpeningType,
  normalizeOpeningBalance,
  normalizeAccountNature,
  DEFAULT_CUSTOMER_OPENING_TYPE,
} from '../../logic/balances';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';
import { toPiasters, fromPiasters } from '../../utils/money';

export const salesRepo = {
  async getCustomers() {
    const list = await db.customers.toArray();
    const invoices = await db.sales_invoices.toArray();
    const returns = await db.customer_returns.toArray();

    return list.map(c => {
      const custInvoices = invoices.filter(i => i.customer_id === c.id);
      const custReturns = returns.filter(r => r.customer_id === c.id);
      // Current Balance = Opening Balance + Credit Sales - Cash In / Receipts
      const opening = resolveOpeningBalance(c, 'customer');
      const bal = BalanceCalculator.calculateCustomerBalance(custInvoices, custReturns, opening);

      return {
        ...c,
        opening_balance: opening,
        opening_balance_type: resolveOpeningType(c, 'customer'),
        total_invoiced: bal.totalInvoiced,
        total_paid: bal.totalPaid,
        balance_due: bal.balanceDue,
        outstanding_balance: bal.balanceDue,
        current_balance: bal.balanceDue,
        customer_balance: bal.balanceDue,
      };
    });
  },

  async createCustomer(data, userId = 'usr-accountant') {
    const id = `cust-${Date.now()}`;
    const opening = normalizeOpeningBalance(data.opening_balance ?? data.customer_opening_balance ?? 0);
    const customer = {
      id,
      name: data.name,
      phone: data.phone || '',
      address: data.address || '',
      tax_number: data.tax_number || '',
      customer_type: data.customer_type || 'local',
      credit_limit: Number(data.credit_limit) || 0,
      opening_balance: opening,
      opening_balance_type: normalizeAccountNature(
        data.opening_balance_type ?? data.customer_opening_type,
        DEFAULT_CUSTOMER_OPENING_TYPE
      ),
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await db.customers.add(customer);
    await auditRepo.log(userId, 'CREATE_CUSTOMER', 'customers', id, null, customer);
    return customer;
  },

  async getCustomerStatement(id) {
    const customer = await db.customers.get(id);
    if (!customer) throw new Error('العميل غير موجود');

    const invoices = await db.sales_invoices.where('customer_id').equals(id).toArray();
    const payments = await db.customer_payments.where('customer_id').equals(id).toArray();
    const returns = await db.customer_returns.where('customer_id').equals(id).toArray();

    const opening = resolveOpeningBalance(customer, 'customer');
    const openingType = resolveOpeningType(customer, 'customer');
    const transactions = [];

    // Opening balance row (رصيد أول المدة) comes first chronologically
    if (opening > 0) {
      transactions.push({
        date: customer.created_at ? String(customer.created_at).split('T')[0] : '',
        type: 'رصيد أول المدة',
        reference: 'OPENING',
        description: `رصيد افتتاحي (${openingType === 'credit' ? 'دائن' : 'مدين'})`,
        debit: opening,
        credit: 0,
        raw_date: '0000-00-00T00:00:00.000Z',
        is_opening: true,
      });
    }

    for (const inv of invoices) {
      if (inv.status !== 'cancelled') {
        transactions.push({
          date: inv.invoice_date,
          type: 'فاتورة مبيعات',
          reference: inv.invoice_number,
          description: inv.notes || 'مبيعات منتجات تامة',
          debit: Number(inv.total_invoice_amount) || 0, // Customer owes us
          credit: 0,
          raw_date: inv.created_at || inv.invoice_date,
        });
      }
    }

    for (const pay of payments) {
      transactions.push({
        date: pay.payment_date,
        type: 'سند تحصيل',
        reference: pay.receipt_number,
        description: pay.notes || 'سداد دفعة نقدية/تحويل',
        debit: 0,
        credit: Number(pay.amount) || 0,
        raw_date: pay.created_at || pay.payment_date,
      });
    }

    for (const ret of returns) {
      transactions.push({
        date: ret.return_date,
        type: 'مرتجع مبيعات',
        reference: ret.return_number,
        description: ret.reason || 'رد بضاعة من العميل',
        debit: 0,
        credit: Number(ret.refund_amount) || 0,
        raw_date: ret.created_at || ret.return_date,
      });
    }

    transactions.sort((a, b) => new Date(a.raw_date).getTime() - new Date(b.raw_date).getTime());

    let runningBalance = 0;
    const ledger = transactions.map(tx => {
      runningBalance = runningBalance + tx.debit - tx.credit;
      return {
        ...tx,
        balance_after: Number(runningBalance.toFixed(2)),
      };
    });

    const activeInvoices = invoices.filter(i => i.status !== 'cancelled');
    const activeReturns = returns.filter(r => r.status !== 'cancelled');
    const activePayments = payments.filter(p => p.status !== 'cancelled');
    const unlinkedCustPaid = activePayments
      .filter(p => !p.invoice_id)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    const bal = BalanceCalculator.calculateCustomerBalance(activeInvoices, activeReturns, opening, unlinkedCustPaid);

    return {
      customer: { ...customer, opening_balance: opening, opening_balance_type: openingType, ...bal },
      statement: ledger,
      movements: ledger,
      opening_balance: opening,
      opening_balance_type: openingType,
      invoices,
      payments,
      summary: {
        opening_balance: opening,
        opening_balance_type: openingType,
        total_sales: bal.totalInvoiced || 0,
        total_collected: bal.totalPaid || 0,
        remaining_balance: bal.balanceDue || 0,
      },
      total_invoiced: bal.totalInvoiced,
      total_paid: bal.totalPaid,
      balance_due: bal.balanceDue,
    };
  },

  async getOutlets() {
    const outlets = await db.sales_outlets.toArray();
    const treasuries = await db.treasury_accounts.toArray();
    const trMap = new Map(treasuries.filter(t => t.outlet_id).map(t => [t.outlet_id, t]));
    return outlets.map(o => {
      const tr = trMap.get(o.id);
      return {
        ...o,
        treasury_id: tr?.id || null,
        treasury_name: tr?.name || null,
        current_balance: Number(tr?.current_balance) || 0,
      };
    });
  },

  async getOutlet(id) {
    const outlet = await db.sales_outlets.get(id);
    if (!outlet) return null;
    const treasury = await db.treasury_accounts.where('outlet_id').equals(id).first();
    const invoicesCount = await db.sales_invoices.where('outlet_id').equals(id).count();
    const closingsCount = await db.daily_closings.where('outlet_id').equals(id).count();
    return {
      ...outlet,
      treasury_id: treasury?.id || null,
      treasury_name: treasury?.name || null,
      current_balance: Number(treasury?.current_balance) || 0,
      invoices_count: invoicesCount,
      closings_count: closingsCount,
    };
  },

  async createOutlet(data, userId = 'usr-owner') {
    const id = data.id || `out-${Date.now()}`;
    const code = data.code || `OUT-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const outlet = {
      id,
      code,
      name: data.name.trim(),
      location: data.location || '',
      contact_phone: data.contact_phone || '',
      price_markup_percent: Number(data.price_markup_percent) || 0,
      notes: data.notes || '',
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      created_at: now,
    };
    await db.sales_outlets.add(outlet);

    // Automatically create a linked treasury for this outlet
    const treasuryId = `acc-${id}`;
    const initialBalance = Math.max(0, Number(data.initial_balance) || 0);
    const treasury = {
      id: treasuryId,
      name: `خزينة ${outlet.name}`,
      account_type: 'treasury',
      outlet_id: id,
      is_main: 0,
      current_balance: initialBalance,
      is_active: 1,
      created_at: now,
    };
    await db.treasury_accounts.put(treasury);

    if (initialBalance > 0) {
      await db.cash_transactions.add({
        id: `tx-out-init-${Date.now()}`,
        tx_number: `TX-INIT-${Date.now().toString().slice(-4)}`,
        account_id: treasuryId,
        tx_type: 'deposit',
        category: 'opening_balance',
        amount: initialBalance,
        reference_type: 'OUTLET_OPENING',
        reference_id: id,
        notes: `رصيد افتتاحي لخزينة منفذ ${outlet.name}`,
        created_by: userId,
        created_at: now,
      });
    }

    await auditRepo.log(userId, 'CREATE_OUTLET', 'sales_outlets', id, null, outlet);
    return {
      ...outlet,
      treasury_id: treasuryId,
      current_balance: initialBalance,
    };
  },

  async updateOutlet(id, data, userId = 'usr-owner') {
    const current = await db.sales_outlets.get(id);
    if (!current) throw new Error('المنفذ / المعرض غير موجود');

    const updated = {
      ...current,
      name: data.name !== undefined ? data.name.trim() : current.name,
      location: data.location !== undefined ? data.location : current.location,
      contact_phone: data.contact_phone !== undefined ? data.contact_phone : current.contact_phone,
      price_markup_percent: data.price_markup_percent !== undefined ? (Number(data.price_markup_percent) || 0) : current.price_markup_percent,
      notes: data.notes !== undefined ? data.notes : current.notes,
      is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active,
      updated_at: new Date().toISOString(),
    };
    await db.sales_outlets.put(updated);

    // Update treasury account name if outlet name changed
    if (data.name && data.name.trim() !== current.name) {
      const treasury = await db.treasury_accounts.where('outlet_id').equals(id).first();
      if (treasury) {
        await db.treasury_accounts.update(treasury.id, {
          name: `خزينة ${updated.name}`,
        });
      }
    }

    await auditRepo.log(userId, 'UPDATE_OUTLET', 'sales_outlets', id, current, updated);
    return updated;
  },

  async deleteOutlet(id, userId = 'usr-owner') {
    const current = await db.sales_outlets.get(id);
    if (!current) throw new Error('المنفذ / المعرض غير موجود');

    // Check if sales invoices exist for this outlet
    const invoiceCount = await db.sales_invoices.where('outlet_id').equals(id).count();
    if (invoiceCount > 0) {
      throw new Error(`لا يمكن حذف المنفذ "${current.name}" لوجود (${invoiceCount}) فاتورة مبيعات مرتبطة به. يمكنك تعطيل المنفذ بدلاً من حذفه.`);
    }

    // Check if daily closings exist
    const closingCount = await db.daily_closings.where('outlet_id').equals(id).count();
    if (closingCount > 0) {
      throw new Error(`لا يمكن حذف المنفذ "${current.name}" لوجود (${closingCount}) تقفيل وردية مسجل له.`);
    }

    // Check if users are assigned
    const userCount = await db.users.where('outlet_id').equals(id).count();
    if (userCount > 0) {
      throw new Error(`لا يمكن حذف المنفذ "${current.name}" لوجود مستخدمين / كاشير معينين عليه.`);
    }

    // Safe to delete
    await db.sales_outlets.delete(id);

    // Delete or deactivate associated treasury
    const treasury = await db.treasury_accounts.where('outlet_id').equals(id).first();
    if (treasury) {
      const txCount = await db.cash_transactions.where('account_id').equals(treasury.id).count();
      if (txCount === 0 || (txCount === 1 && treasury.current_balance === 0)) {
        await db.treasury_accounts.delete(treasury.id);
      } else {
        await db.treasury_accounts.update(treasury.id, { is_active: 0 });
      }
    }

    await auditRepo.log(userId, 'DELETE_OUTLET', 'sales_outlets', id, current, null);
    return { success: true, message: `تم حذف المنفذ "${current.name}" بنجاح` };
  },

  async getSalesInvoices(outletId = null) {
    let invoices = await db.sales_invoices.reverse().sortBy('created_at');
    if (outletId) {
      invoices = invoices.filter(i => i.outlet_id === outletId);
    }
    const customers = await db.customers.toArray();
    const custMap = new Map(customers.map(c => [c.id, c.name]));
    const outlets = await db.sales_outlets.toArray();
    const outMap = new Map(outlets.map(o => [o.id, o.name]));
    const items = await db.sales_invoice_items.toArray();
    const products = await db.products.toArray();
    const prodMap = new Map(products.map(p => [p.id, p]));

    return invoices.map(i => {
      const invItems = items.filter(it => it.invoice_id === i.id).map(it => {
        const prod = prodMap.get(it.product_id);
        return {
          ...it,
          product_name: prod ? prod.name : it.product_id,
          product_code: prod ? prod.code : '',
        };
      });

      return {
        ...i,
        customer_name: custMap.get(i.customer_id) || i.customer_id,
        outlet_name: outMap.get(i.outlet_id) || (i.outlet_id ? 'المعرض الرئيسي' : 'بدون منفذ'),
        items: invItems,
        remaining_amount: Math.max(0, Number(((Number(i.total_invoice_amount) || 0) - (Number(i.paid_amount) || 0)).toFixed(2))),
      };
    });
  },

  /**
   * Sales Report (تقرير المبيعات المعتمدة وتجميع مبيعات العملاء)
   * Strictly includes ONLY customers who actually have issued sales invoices
   * matching active filters (date range, payment type, status).
   * Customers with zero matching invoices are completely excluded from rows and customer count summaries.
   * All aggregations are computed with integer-piaster precision.
   */
  async getSalesReport(filters = {}) {
    const { startDate, endDate, paymentType, status, customerId } = filters;
    let invoices = await db.sales_invoices.toArray();

    // 1. Filter ONLY valid issued invoices matching active filters
    invoices = invoices.filter(inv => {
      // Must not be cancelled unless explicitly requested as cancelled
      if (!status && inv.status === 'cancelled') return false;
      if (status && status !== 'all' && inv.status !== status) return false;

      // Payment terms filter ('cash' | 'credit')
      if (paymentType && paymentType !== 'all' && inv.payment_terms !== paymentType) return false;

      // Date range filter
      const invDate = inv.invoice_date || inv.date || (inv.created_at ? String(inv.created_at).split('T')[0] : '');
      if (startDate && invDate && invDate < startDate) return false;
      if (endDate && invDate && invDate > endDate) return false;
      if ((startDate || endDate) && !invDate) return false;

      // Specific customer filter
      if (customerId && customerId !== 'all' && inv.customer_id !== customerId && inv.party_id !== customerId) {
        return false;
      }

      return true;
    });

    // 2. Discover UNIQUE customers that actually have matching invoices
    const activeCustomerIds = new Set();
    for (const inv of invoices) {
      const cId = inv.customer_id || inv.party_id;
      if (cId) activeCustomerIds.add(cId);
    }

    // 3. Load customer metadata ONLY for customers with matching invoices
    const allCustomers = await db.customers.toArray();
    const allParties = await db.parties.where('is_customer').equals(1).toArray().catch(() => []);
    const custMap = new Map();
    for (const c of allCustomers) custMap.set(c.id, c);
    for (const p of allParties) {
      if (!custMap.has(p.id)) custMap.set(p.id, p);
      else custMap.set(p.id, { ...custMap.get(p.id), ...p });
    }

    // 4. Build Customer Aggregations in integer piasters
    let overallSubtotalPiasters = 0;
    let overallDiscountPiasters = 0;
    let overallTotalSalesPiasters = 0;
    let overallPaidPiasters = 0;
    let overallRemainingPiasters = 0;

    const customerRows = [];
    for (const cId of activeCustomerIds) {
      const custInvoices = invoices.filter(i => (i.customer_id === cId || i.party_id === cId));
      if (custInvoices.length === 0) continue; // Guarantees zero-invoice customers NEVER included

      const custObj = custMap.get(cId) || {};
      let subPiasters = 0;
      let discPiasters = 0;
      let totalPiastersVal = 0;
      let paidPiastersVal = 0;

      for (const inv of custInvoices) {
        const netAmt = inv.net_amount ?? inv.grand_total ?? inv.total_invoice_amount ?? inv.total_amount ?? 0;
        const subAmt = inv.subtotal ?? netAmt;
        const discAmt = inv.discount_value ?? inv.discount ?? 0;
        const paidAmt = inv.paid_amount ?? (inv.payment_terms === 'cash' ? netAmt : 0);

        subPiasters += toPiasters(subAmt);
        discPiasters += toPiasters(discAmt);
        totalPiastersVal += toPiasters(netAmt);
        paidPiastersVal += toPiasters(paidAmt);
      }

      const remainingPiastersVal = Math.max(0, totalPiastersVal - paidPiastersVal);

      overallSubtotalPiasters += subPiasters;
      overallDiscountPiasters += discPiasters;
      overallTotalSalesPiasters += totalPiastersVal;
      overallPaidPiasters += paidPiastersVal;
      overallRemainingPiasters += remainingPiastersVal;

      customerRows.push({
        id: cId,
        customer_id: cId,
        code: custObj.code || cId,
        name: custObj.name || custInvoices[0]?.customer_name || 'عميل',
        phone: custObj.phone || custInvoices[0]?.customer_phone || '-',
        invoices_count: custInvoices.length,
        subtotal: fromPiasters(subPiasters),
        discount_total: fromPiasters(discPiasters),
        total_sales: fromPiasters(totalPiastersVal),
        paid_total: fromPiasters(paidPiastersVal),
        balance_remaining: fromPiasters(remainingPiastersVal),
        invoices: custInvoices,
      });
    }

    // Sort customers by total sales descending
    customerRows.sort((a, b) => b.total_sales - a.total_sales);

    // Format individual invoices with resolved customer names
    const populatedInvoices = invoices.map(i => ({
      ...i,
      customer_name: custMap.get(i.customer_id)?.name || custMap.get(i.party_id)?.name || i.customer_name || 'عميل',
      customer_code: custMap.get(i.customer_id)?.code || custMap.get(i.party_id)?.code || '',
    }));

    return {
      customerRows,
      invoices: populatedInvoices,
      summary: {
        uniqueCustomersCount: customerRows.length,
        invoicesCount: invoices.length,
        totalSales: fromPiasters(overallTotalSalesPiasters),
        totalSubtotal: fromPiasters(overallSubtotalPiasters),
        totalDiscount: fromPiasters(overallDiscountPiasters),
        totalPaid: fromPiasters(overallPaidPiasters),
        totalRemaining: fromPiasters(overallRemainingPiasters),
      }
    };
  },

  async createSalesInvoice(data, userId = 'usr-accountant') {
    if (data.invoice_date) validateNotPastDate(data.invoice_date, 'تاريخ فاتورة المبيعات');
    if (data.due_date && data.payment_terms === 'credit') validateNotPastDate(data.due_date, 'تاريخ استحقاق الفاتورة');
    const id = `sinv-${Date.now()}`;
    const invoiceNumber = data.invoice_number || `INV-SLS-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const paymentTerms = data.payment_terms || 'cash';
    const isExport = data.is_export ? 1 : 0;
    const currency = data.currency || 'EGP';
    const exchangeRate = Math.max(0.0001, Number(data.exchange_rate) || 1.0);

    const shipping = Math.max(0, Number(data.shipping_expense) || 0);
    const customs = Math.max(0, Number(data.customs_expense) || 0);
    const commission = Math.max(0, Number(data.commission_expense) || 0);
    const totalSellingExpenses = Number((shipping + customs + commission).toFixed(2));
    const settings = await db.settings.get(1);

    // Validation: Item type MUST be finished goods only (يقتصر البيع على المنتجات التامة فقط)
    for (const item of (data.items || [])) {
      const itemMaster = (await db.items.get(item.product_id)) || (await db.products.get(item.product_id));
      if (itemMaster) {
        const itemType = String(itemMaster.item_type || itemMaster.type || '').trim();
        const isFinished = itemType === 'finished' || itemType === 'تام' || itemType === 'منتج تام';
        if (!isFinished) {
          const name = itemMaster.name || item.product_id;
          throw new Error(`لا يمكن إصدار فاتورة مبيعات لصنف غير تام الصنع: الصنف "${name}" نوعه مادة خام / مستلزم إنتاج. يقتصر البيع على المنتجات التامة فقط.`);
        }
      }
    }

    let subtotal = 0;
    let totalCogs = 0;
    const invoiceItems = [];

    // Calculate subtotal and line items
    for (let idx = 0; idx < (data.items || []).length; idx++) {
      const item = data.items[idx];
      const qty = Math.max(1, Number(item.quantity) || 1);
      const priceBeforeDiscount = Math.max(0, Number(item.price_before_discount ?? item.unit_selling_price) || 0);
      const discountValue = Math.max(0, Number(item.discount_value) || 0);
      const unitSellingPrice = Math.max(0, Number(item.unit_selling_price ?? (priceBeforeDiscount - discountValue)) || 0);
      const totalPrice = Number((qty * unitSellingPrice).toFixed(2));
      subtotal += totalPrice;

      const unitCost = Number(item.unit_cost) || 0;
      const totalItemCost = Number((qty * unitCost).toFixed(2));
      totalCogs += totalItemCost;
      const itemProfit = Number((totalPrice - totalItemCost).toFixed(2));

      invoiceItems.push({
        id: `sii-${Date.now()}-${idx}`,
        invoice_id: id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        finishing_order_id: item.finishing_order_id || null,
        quantity: qty,
        price_before_discount: priceBeforeDiscount,
        discount_value: discountValue,
        unit_cost: unitCost,
        unit_selling_price: unitSellingPrice,
        total_price: totalPrice,
        total_cost: totalItemCost,
        item_net_profit: itemProfit,
      });
    }

    const vatRate = (settings && settings.vat_enabled && !isExport) ? (Number(settings.vat_rate_percent) || 14) : 0;
    const taxAmount = Number(((subtotal * vatRate) / 100).toFixed(2));
    const totalInvoiceAmount = Number((subtotal + taxAmount).toFixed(2));

    const paidAmount = paymentTerms === 'cash'
      ? totalInvoiceAmount
      : Math.max(0, Number(data.paid_amount) || 0);

    // Validation: Credit Limit on Customer
    // Applies ONLY when the invoice is Credit and customer has a positive credit limit (> 0).
    // Calculates balance net of any supplier-side balance if the party is both!
    if (paymentTerms === 'credit' && data.customer_id) {
      const customer = await db.customers.get(data.customer_id);
      const limit = Number(customer?.credit_limit) || 0;
      if (limit > 0) {
        const stmt = await this.getCustomerStatement(data.customer_id);
        const currentCustomerBal = stmt.summary?.remaining_balance || stmt.balance_due || 0;

        // Check if party is also a supplier (netting)
        let effectiveBalance = currentCustomerBal;
        const party = await db.parties.get(data.customer_id).catch(() => null);
        if (party && party.is_supplier) {
          const supInvoices = await db.supplier_invoices.where('supplier_id').equals(data.customer_id).toArray();
          const supReturns = await db.supplier_returns.where('supplier_id').equals(data.customer_id).toArray();
          const supOpening = resolveOpeningBalance(party, 'supplier');
          const supBal = BalanceCalculator.calculateSupplierBalance(supInvoices, supReturns, supOpening);
          effectiveBalance = Math.max(0, currentCustomerBal - supBal.balanceDue);
        }

        const totalDueAfterThisInvoice = Number((effectiveBalance + (totalInvoiceAmount - paidAmount)).toFixed(2));

        if (totalDueAfterThisInvoice > limit) {
          const excess = Number((totalDueAfterThisInvoice - limit).toFixed(2));
          throw new Error(
            `لا يمكن حفظ الفاتورة الآجلة: إجمالي مديونية العميل (صافي بعد رصيد التوريد إن وجد) مع الفاتورة الحالية ستصبح (${totalDueAfterThisInvoice} ج.م) وهي تتجاوز الحد الائتماني المسموح به (${limit} ج.م) بمقدار (${excess} ج.م). يرجى تحصيل دفعة نقدية أولاً أو زيادة الحد الائتماني للعميل.`
          );
        }
      }
    }

    let status = 'unpaid';
    if (paidAmount >= totalInvoiceAmount && totalInvoiceAmount > 0) {
      status = 'paid';
    } else if (paidAmount > 0) {
      status = 'partially_paid';
    }

    const netProfit = CostCalculator.calculateNetProfit(subtotal, totalCogs, totalSellingExpenses);

    const invoice = {
      id,
      invoice_number: invoiceNumber,
      customer_id: data.customer_id,
      outlet_id: data.outlet_id || null,
      payment_terms: paymentTerms,
      invoice_date: data.invoice_date || now.split('T')[0],
      due_date: paymentTerms === 'credit' ? (data.due_date || null) : null, // Cash has NO due date
      is_export: isExport,
      currency,
      exchange_rate: exchangeRate,
      subtotal: Number(subtotal.toFixed(2)),
      tax_amount: taxAmount,
      shipping_expense: shipping,
      customs_expense: customs,
      commission_expense: commission,
      total_selling_expenses: totalSellingExpenses,
      total_invoice_amount: totalInvoiceAmount,
      total_cogs: Number(totalCogs.toFixed(2)),
      net_profit: netProfit,
      paid_amount: paidAmount,
      status,
      notes: data.notes || '',
      created_by: userId,
      created_at: now,
    };

    await db.transaction('rw', [db.sales_invoices, db.sales_invoice_items, db.products, db.items, db.stock_movements, db.treasury_accounts, db.cash_transactions], async () => {
      await db.sales_invoices.add(invoice);
      for (let idx = 0; idx < invoiceItems.length; idx++) {
        const ii = invoiceItems[idx];
        await db.sales_invoice_items.add(ii);

        // Deduct finished stock from product and item
        const prod = await db.products.get(ii.product_id);
        if (prod) {
          const newStock = Number(((Number(prod.current_finished_stock) || 0) - ii.quantity).toFixed(2));
          await db.products.update(prod.id, { current_finished_stock: newStock });
        }
        const itemMaster = await db.items.get(ii.product_id);
        if (itemMaster) {
          const newStock = Number(((Number(itemMaster.current_stock) || 0) - ii.quantity).toFixed(2));
          await db.items.update(itemMaster.id, { current_stock: newStock });
        }

        // Record stock movement (direction: 'out')
        await db.stock_movements.add({
          id: `sm-sls-${Date.now()}-${idx}`,
          item_id: ii.product_id,
          material_id: ii.product_id,
          variant_id: ii.variant_id || null,
          location_id: data.location_id || 'loc-main',
          movement_type: 'sales_invoice',
          direction: 'out',
          quantity: ii.quantity,
          quantity_change: -ii.quantity,
          unit_cost: ii.unit_cost,
          document_id: id,
          reference_type: 'SALES_INVOICE',
          reference_id: id,
          date: invoice.invoice_date,
          movement_date: invoice.invoice_date,
          notes: `منصرف مبيعات فاتورة ${invoiceNumber}`,
          created_by: userId,
          created_at: now
        });
      }

      // If Cash invoice or paid amount > 0, record cash inflow in outlet treasury
      if (paidAmount > 0) {
        let treasury = null;
        if (data.account_id) {
          treasury = await db.treasury_accounts.get(data.account_id);
        }
        if (!treasury && data.outlet_id) {
          treasury = await db.treasury_accounts.where('outlet_id').equals(data.outlet_id).first();
        }
        if (!treasury) {
          treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                     (await db.treasury_accounts.where('account_type').equals('treasury').first()) ||
                     (await db.treasury_accounts.toCollection().first());
        }
        if (!treasury) {
          treasury = {
            id: 'acc-main',
            name: 'الخزينة الرئيسية',
            account_type: 'treasury',
            outlet_id: null,
            is_main: 1,
            current_balance: 0,
            created_at: now
          };
          await db.treasury_accounts.put(treasury);
        }

        const currentBal = Number(treasury.current_balance) || 0;
        const newBal = Number((currentBal + paidAmount).toFixed(2));
        await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

        await db.cash_transactions.add({
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tx_number: `TXN-${Date.now().toString().slice(-4)}`,
          account_id: treasury.id,
          tx_type: 'inflow',
          category: 'sales',
          amount: paidAmount,
          balance_after: newBal,
          reference_type: 'sales_invoices',
          reference_id: id,
          description: `تحصيل فاتورة مبيعات ${invoiceNumber}`,
          created_by: userId,
          created_at: now
        });
      }
    });

    await auditRepo.log(userId, 'CREATE_SALES_INVOICE', 'sales_invoices', id, null, { invoiceNumber, subtotal, paymentTerms });
    return invoice;
  },

  /**
   * Cancelling a sales invoice:
   * - Reverses inventory quantities to finished goods (reverse stock effect).
   * - If CREDIT: removes debt from customer's balance (treasury untouched).
   * - If CASH: reverses effect on treasury by refunding cash (customer balance untouched).
   * - Must NOT delete the customer, and must NOT delete/rename items.
   * - Idempotent: already cancelled invoice changes nothing.
   * - Uses a single database transaction.
   */
  async cancelSalesInvoice(invoiceId, reason = '', userId = 'usr-accountant') {
    const inv = await db.sales_invoices.get(invoiceId);
    if (!inv) throw new Error('فاتورة المبيعات غير موجودة');

    // Prevent double cancellation (second attempt changes nothing)
    if (inv.status === 'cancelled') {
      return { success: true, message: 'فاتورة المبيعات ملغاة بالفعل', alreadyCancelled: true };
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    await db.transaction('rw', [
      db.sales_invoices,
      db.sales_invoice_items,
      db.products,
      db.items,
      db.stock_movements,
      db.treasury_accounts,
      db.cash_transactions,
      db.customers,
      db.parties
    ], async () => {
      // 1. Gather line items and restore inventory
      const items = await db.sales_invoice_items.where('invoice_id').equals(invoiceId).toArray();
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const qty = Number(item.quantity) || 0;
        if (qty > 0 && item.product_id) {
          const prod = await db.products.get(item.product_id);
          if (prod) {
            const newStock = Number(((Number(prod.current_finished_stock) || 0) + qty).toFixed(2));
            await db.products.update(prod.id, { current_finished_stock: newStock });
          }
          const itm = await db.items.get(item.product_id);
          if (itm) {
            const newStock = Number(((Number(itm.current_stock) || 0) + qty).toFixed(2));
            await db.items.update(itm.id, { current_stock: newStock });
          }

          // Inbound reversal stock movement
          await db.stock_movements.add({
            id: `sm-sls-rev-${Date.now()}-${idx}`,
            item_id: item.product_id,
            material_id: item.product_id,
            location_id: 'loc-main',
            movement_type: 'reversal',
            direction: 'in',
            quantity: qty,
            quantity_change: qty,
            unit_cost: item.unit_cost || 0,
            document_id: invoiceId,
            reference_type: 'SALES_INVOICE_CANCELLED',
            reference_id: invoiceId,
            date: today,
            movement_date: today,
            notes: `حركة عكسية لإلغاء فاتورة المبيعات ${inv.invoice_number}`,
            created_by: userId,
            created_at: now
          });
        }
      }

      // 2. Reverse debt according to payment terms
      const isCredit = inv.payment_terms === 'credit';
      const paidAmount = Number(inv.paid_amount) || 0;

      if (isCredit) {
        // CREDIT: Customer receivable is reversed automatically by status = 'cancelled'
        // Treasury is untouched.
      } else if (paidAmount > 0) {
        // CASH: Refund paid amount to customer out of the outlet/main treasury
        let treasury = null;
        if (inv.outlet_id) {
          treasury = await db.treasury_accounts.where('outlet_id').equals(inv.outlet_id).first();
        }
        if (!treasury) {
          treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                     (await db.treasury_accounts.where('account_type').equals('treasury').first()) ||
                     (await db.treasury_accounts.toCollection().first());
        }
        if (treasury) {
          const currentBal = Number(treasury.current_balance) || 0;
          const newBal = Number((currentBal - paidAmount).toFixed(2));
          await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

          await db.cash_transactions.add({
            id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tx_number: `TXN-${Date.now().toString().slice(-4)}`,
            account_id: treasury.id,
            tx_type: 'outflow',
            category: 'sales_cancellation',
            amount: paidAmount,
            balance_after: newBal,
            reference_type: 'sales_invoices',
            reference_id: invoiceId,
            description: `رد نقدية لإلغاء فاتورة مبيعات ${inv.invoice_number}`,
            created_by: userId,
            created_at: now
          });
        }
      }

      // 3. Mark invoice as cancelled
      await db.sales_invoices.update(invoiceId, {
        status: 'cancelled',
        cancellation_reason: reason || 'إلغاء الفاتورة',
        cancelled_at: now,
        cancelled_by: userId
      });
    });

    await auditRepo.log(userId, 'CANCEL_SALES_INVOICE', 'sales_invoices', invoiceId, inv, {
      status: 'cancelled',
      reason
    });

    return { success: true, message: 'تم إلغاء فاتورة المبيعات بنجاح' };
  },

  async collectPayment(data, userId = 'usr-accountant') {
    const { customer_id, invoice_id, account_id, amount, payment_date, payment_method, notes } = data;
    if (payment_date) validateNotPastDate(payment_date, 'تاريخ سند التحصيل');
    const colAmount = Math.max(0, Number(amount) || 0);
    if (colAmount <= 0) throw new Error('مبلغ التحصيل يجب أن يكون أكبر من صفر');

    const paymentId = `cpay-${Date.now()}`;
    const receiptNumber = `REC-SLS-${Date.now().toString().slice(-4)}`;
    const txId = `tx-${Date.now()}`;
    const txNumber = `TXN-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.customer_payments, db.sales_invoices, db.treasury_accounts, db.cash_transactions], async () => {
      const account = await db.treasury_accounts.get(account_id);
      if (!account) throw new Error('الحساب المالي أو الخزينة غير موجودة');

      const currentAccBal = Number(account.current_balance) || 0;
      const newAccBal = Number((currentAccBal + colAmount).toFixed(2));
      await db.treasury_accounts.update(account_id, { current_balance: newAccBal });

      // Record customer receipt
      await db.customer_payments.add({
        id: paymentId,
        receipt_number: receiptNumber,
        customer_id,
        invoice_id: invoice_id || null,
        account_id,
        amount: colAmount,
        payment_date: payment_date || now.split('T')[0],
        payment_method: payment_method || 'cash',
        notes: notes || '',
        created_by: userId,
        created_at: now,
      });

      // Record cash inflow transaction
      await db.cash_transactions.add({
        id: txId,
        tx_number: txNumber,
        account_id,
        tx_type: 'inflow',
        category: 'customer_payment',
        amount: colAmount,
        balance_after: newAccBal,
        reference_type: 'sales_invoices',
        reference_id: invoice_id || null,
        description: `تحصيل من العميل: ${notes || receiptNumber}`,
        created_by: userId,
        created_at: now,
      });

      // Update invoice paid amount & status if linked
      if (invoice_id) {
        const inv = await db.sales_invoices.get(invoice_id);
        if (inv) {
          const oldPaid = Number(inv.paid_amount) || 0;
          const newPaid = Number((oldPaid + colAmount).toFixed(2));
          const totalAmt = Number(inv.total_invoice_amount) || 0;
          let newStatus = 'partially_paid';
          if (newPaid >= totalAmt) newStatus = 'paid';

          await db.sales_invoices.update(invoice_id, {
            paid_amount: newPaid,
            status: newStatus,
          });
        }
      }
    });

    await auditRepo.log(userId, 'COLLECT_CUSTOMER_PAYMENT', 'customer_payments', paymentId, null, data);
    return { success: true, paymentId, receiptNumber };
  },

  async createCustomerReturn(data, userId = 'usr-accountant') {
    const { customer_id, invoice_id, product_id, quantity, refund_amount, refund_method, return_date, reason, return_mode } = data;
    if (return_date) validateNotPastDate(return_date, 'تاريخ مرتجع المبيعات');
    const returnQty = Math.max(1, Number(quantity) || 1);
    const returnAmount = Math.max(0, Number(refund_amount) || 0);
    const returnId = `cret-${Date.now()}`;
    const returnNumber = `RET-SLS-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    let actualRefundMethod = refund_method || 'deduct_balance';
    let targetOutletId = null;

    // Mode 2: Return against original invoice validation
    if (invoice_id) {
      const origInv = await db.sales_invoices.get(invoice_id);
      if (!origInv) {
        throw new Error('الفاتورة الأصلية المحددة غير موجودة');
      }
      targetOutletId = origInv.outlet_id;

      // Check sold quantity
      const invItems = await db.sales_invoice_items.where('invoice_id').equals(invoice_id).toArray();
      const targetItem = invItems.find(it => it.product_id === product_id) || invItems[0];
      if (targetItem) {
        const soldQty = Number(targetItem.quantity) || 0;
        // Check previously returned quantity for this invoice
        const pastReturns = await db.customer_returns.where('invoice_id').equals(invoice_id).toArray();
        const previouslyReturned = pastReturns
          .filter(r => r.product_id === product_id)
          .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

        const remainingSoldQty = soldQty - previouslyReturned;
        if (returnQty > remainingSoldQty) {
          throw new Error(
            `الكمية المرتجعة (${returnQty}) تتجاوز الكمية المباعة المتبقية في الفاتورة الأصلية (${remainingSoldQty} قطعة)`
          );
        }
      }

      // If original invoice was Cash and no explicit refund_method given, refund in cash
      if (origInv.payment_terms === 'cash' && !refund_method) {
        actualRefundMethod = 'cash_refund';
      }
    }

    // Validation: Return product MUST be finished goods only
    const itemMaster = (await db.items.get(product_id)) || (await db.products.get(product_id));
    if (itemMaster) {
      const itemType = String(itemMaster.item_type || itemMaster.type || '').trim();
      const isFinished = itemType === 'finished' || itemType === 'تام' || itemType === 'منتج تام';
      if (!isFinished) {
        const name = itemMaster.name || product_id;
        throw new Error(`لا يمكن إضافة الصنف "${name}" في مرتجع المبيعات: يقتصر المرتجع على المنتجات التامة فقط (تام).`);
      }
    }

    await db.transaction('rw', [db.customer_returns, db.products, db.items, db.stock_movements, db.treasury_accounts, db.cash_transactions], async () => {
      // Restore stock
      const prod = await db.products.get(product_id);
      if (prod) {
        const newStock = Number(((Number(prod.current_finished_stock) || 0) + returnQty).toFixed(2));
        await db.products.update(prod.id, { current_finished_stock: newStock });
      }
      const itm = await db.items.get(product_id);
      if (itm) {
        const newStock = Number(((Number(itm.current_stock) || 0) + returnQty).toFixed(2));
        await db.items.update(itm.id, { current_stock: newStock });
      }

      await db.customer_returns.add({
        id: returnId,
        return_number: returnNumber,
        return_mode: return_mode || (invoice_id ? 'against_invoice' : 'free_return'),
        customer_id,
        invoice_id: invoice_id || null,
        product_id,
        quantity: returnQty,
        refund_amount: returnAmount,
        refund_method: actualRefundMethod,
        return_date: return_date || now.split('T')[0],
        reason: reason || 'مرتجع مبيعات',
        created_by: userId,
        created_at: now,
      });

      // Record stock movement (direction: 'in')
      await db.stock_movements.add({
        id: `sm-sret-${Date.now()}`,
        item_id: product_id,
        material_id: product_id,
        location_id: 'loc-main',
        movement_type: 'sales_return',
        direction: 'in',
        quantity: returnQty,
        quantity_change: returnQty,
        unit_cost: returnAmount > 0 ? Number((returnAmount / returnQty).toFixed(2)) : 0,
        document_id: returnId,
        reference_type: 'SALES_RETURN',
        reference_id: returnId,
        date: return_date || now.split('T')[0],
        movement_date: return_date || now.split('T')[0],
        notes: `وارد مرتجع مبيعات إذن ${returnNumber}`,
        created_by: userId,
        created_at: now,
      });

      // If cash refund, deduct from outlet treasury
      if (actualRefundMethod === 'cash_refund' && returnAmount > 0) {
        let treasury = null;
        if (targetOutletId) {
          treasury = await db.treasury_accounts.where('outlet_id').equals(targetOutletId).first();
        }
        if (!treasury) {
          treasury = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                     (await db.treasury_accounts.where('account_type').equals('treasury').first());
        }

        if (treasury) {
          const currentBal = Number(treasury.current_balance) || 0;
          const newBal = Number((currentBal - returnAmount).toFixed(2));
          await db.treasury_accounts.update(treasury.id, { current_balance: newBal });

          await db.cash_transactions.add({
            id: `tx-${Date.now()}`,
            tx_number: `TXN-${Date.now().toString().slice(-4)}`,
            account_id: treasury.id,
            tx_type: 'outflow',
            category: 'sales_return',
            amount: returnAmount,
            balance_after: newBal,
            reference_type: 'customer_returns',
            reference_id: returnId,
            description: `رد نقدية لمرتجع عميل ${returnNumber} من خزينة المنفذ`,
            created_by: userId,
            created_at: now,
          });
        }
      }
    });

    await auditRepo.log(userId, 'CREATE_CUSTOMER_RETURN', 'customer_returns', returnId, null, data);
    return { success: true, returnId, returnNumber };
  }
};

export default salesRepo;
