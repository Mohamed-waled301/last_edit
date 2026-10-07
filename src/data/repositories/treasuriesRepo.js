import db from '../db';
import auditRepo from './auditRepo';

export const treasuriesRepo = {
  /**
   * Get all treasuries, separating main and outlet treasuries, with aggregated balance
   */
  async getTreasuries() {
    const list = await db.treasury_accounts.filter(a => a.is_active === 1).toArray();
    const outlets = await db.sales_outlets.toArray();
    const outMap = new Map(outlets.map(o => [o.id, o.name]));

    let totalOutletsBalance = 0;
    let mainTreasuryBalance = 0;

    const formatted = list.map(acc => {
      const bal = Number(acc.current_balance) || 0;
      if (acc.is_main) {
        mainTreasuryBalance += bal;
      } else {
        totalOutletsBalance += bal;
      }
      return {
        ...acc,
        current_balance: bal,
        outlet_name: outMap.get(acc.outlet_id) || (acc.is_main ? 'الخزينة المركزية الرئيسية' : 'عام')
      };
    });

    const aggregatedGrandTotal = Number((mainTreasuryBalance + totalOutletsBalance).toFixed(2));

    return {
      treasuries: formatted,
      mainTreasury: formatted.find(a => a.is_main) || formatted[0],
      outletTreasuries: formatted.filter(a => !a.is_main),
      mainTreasuryBalance: Number(mainTreasuryBalance.toFixed(2)),
      totalOutletsBalance: Number(totalOutletsBalance.toFixed(2)),
      aggregatedGrandTotal
    };
  },

  async createOutletTreasury(outletId, name, initialBalance = 0, userId = 'usr-owner') {
    const id = `acc-out-${Date.now()}`;
    const acc = {
      id,
      name,
      account_type: 'treasury',
      outlet_id: outletId,
      is_main: 0,
      current_balance: Math.max(0, Number(initialBalance) || 0),
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.treasury_accounts.add(acc);
    await auditRepo.log(userId, 'CREATE_OUTLET_TREASURY', 'treasury_accounts', id, null, acc);
    return acc;
  },

  /**
   * Transfer cash from Outlet Treasury -> Main Treasury (توريد نقدية من المعرض للخزينة الرئيسية)
   */
  async transferOutletToMain(data, userId = 'usr-accountant') {
    const { from_treasury_id, amount, transfer_date, notes } = data;
    const numAmount = Math.max(0, Number(amount) || 0);
    if (numAmount <= 0) throw new Error('مبلغ التحويل يجب أن يكون أكبر من صفر');

    const fromAcc = await db.treasury_accounts.get(from_treasury_id);
    if (!fromAcc) throw new Error('خزينة المنفذ المحددة غير موجودة');

    const mainAcc = (await db.treasury_accounts.where('is_main').equals(1).first()) ||
                    (await db.treasury_accounts.where('account_type').equals('treasury').first());
    if (!mainAcc) throw new Error('الخزينة الرئيسية المركزية غير موجودة');

    if (fromAcc.id === mainAcc.id) throw new Error('لا يمكن التحويل من الخزينة الرئيسية إلى نفسها');

    const fromBal = Number(fromAcc.current_balance) || 0;
    if (fromBal < numAmount) {
      throw new Error(`الرصيد المتاح في (${fromAcc.name}) هو ${fromBal} ج.م ولا يكفي لتحويل ${numAmount} ج.م`);
    }

    const now = new Date().toISOString();
    const newFromBal = Number((fromBal - numAmount).toFixed(2));
    const newMainBal = Number(((Number(mainAcc.current_balance) || 0) + numAmount).toFixed(2));

    await db.transaction('rw', [db.treasury_accounts, db.cash_transactions], async () => {
      await db.treasury_accounts.update(fromAcc.id, { current_balance: newFromBal });
      await db.treasury_accounts.update(mainAcc.id, { current_balance: newMainBal });

      // Outflow from outlet treasury
      await db.cash_transactions.add({
        id: `tx-${Date.now()}-out`,
        tx_number: `TXN-${Date.now().toString().slice(-4)}-OUT`,
        account_id: fromAcc.id,
        tx_type: 'outflow',
        category: 'transfer',
        amount: numAmount,
        balance_after: newFromBal,
        reference_type: 'OUTLET_TO_MAIN_TRANSFER',
        reference_id: mainAcc.id,
        description: `توريد نقدية إلى الخزينة المركزية الرئيسية: ${notes || ''}`,
        created_by: userId,
        created_at: now
      });

      // Inflow to main treasury
      await db.cash_transactions.add({
        id: `tx-${Date.now()}-in`,
        tx_number: `TXN-${Date.now().toString().slice(-4)}-IN`,
        account_id: mainAcc.id,
        tx_type: 'inflow',
        category: 'transfer',
        amount: numAmount,
        balance_after: newMainBal,
        reference_type: 'OUTLET_TO_MAIN_TRANSFER',
        reference_id: fromAcc.id,
        description: `توريد نقدية وارد من (${fromAcc.name}): ${notes || ''}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'TRANSFER_OUTLET_TO_MAIN', 'treasury_accounts', fromAcc.id, null, {
      from: fromAcc.name,
      to: mainAcc.name,
      amount: numAmount
    });

    return { success: true };
  },

  /**
   * Daily Closing per Outlet (تقفيل الوردية والإغلاق اليومي لخزينة المنفذ)
   */
  async getDailyClosings(outletId = null) {
    let list = await db.daily_closings.reverse().sortBy('created_at');
    if (outletId) {
      list = list.filter(c => c.outlet_id === outletId);
    }
    const outlets = await db.sales_outlets.toArray();
    const outMap = new Map(outlets.map(o => [o.id, o.name]));
    const treasuries = await db.treasury_accounts.toArray();
    const trMap = new Map(treasuries.map(t => [t.id, t.name]));

    return list.map(c => ({
      ...c,
      outlet_name: outMap.get(c.outlet_id) || c.outlet_id,
      treasury_name: trMap.get(c.treasury_id) || c.treasury_id
    }));
  },

  async performDailyClosing(data, userId = 'usr-accountant') {
    const { outlet_id, treasury_id, closing_date, actual_cash_counted, notes } = data;
    const actualCash = Math.max(0, Number(actual_cash_counted) || 0);

    const treasury = await db.treasury_accounts.get(treasury_id);
    if (!treasury) throw new Error('الخزينة المحددة غير موجودة');

    const currentSystemBalance = Number(treasury.current_balance) || 0;
    const difference = Number((actualCash - currentSystemBalance).toFixed(2));

    const closingId = `cls-${Date.now()}`;
    const now = new Date().toISOString();

    const record = {
      id: closingId,
      outlet_id,
      treasury_id,
      closing_date: closing_date || now.split('T')[0],
      system_expected_balance: currentSystemBalance,
      actual_cash_counted: actualCash,
      difference_amount: difference, // > 0: زيادة, < 0: عجز, 0: متطابق
      notes: notes || '',
      status: 'closed',
      created_by: userId,
      created_at: now
    };

    await db.daily_closings.add(record);
    await auditRepo.log(userId, 'DAILY_CLOSING', 'daily_closings', closingId, null, record);

    return { success: true, record };
  }
};

export default treasuriesRepo;
