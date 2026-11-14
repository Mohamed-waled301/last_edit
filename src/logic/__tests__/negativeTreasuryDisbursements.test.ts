import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import db from '../../data/db';
import { cashRepo } from '../../data/repositories/cashRepo';
import { getTodayDateString } from '../../utils/formatters';

describe('Allow Cash and Expense Disbursements on Zero or Negative Treasury Balance', () => {
  beforeEach(async () => {
    if (!db.isOpen()) {
      await db.open();
    }
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });

    // Ensure baseline main treasury with balance = 0.00
    await db.treasury_accounts.put({
      id: 'acc-main',
      name: 'الخزينة الرئيسية',
      account_type: 'treasury',
      outlet_id: null,
      is_main: 1,
      current_balance: 0,
      bank_account_number: '',
      bank_name: '',
      is_active: 1,
      created_at: new Date().toISOString(),
    });

    // Add sample expense code
    await db.expense_codes.put({
      id: 'exp-rent',
      code: 'EXP-01',
      name: 'إيجار المصنع والورشة',
      default_amount: 1500,
      is_active: 1,
      created_at: new Date().toISOString(),
    });
  });

  it('1. Successfully disburses expense when treasury balance is 0.00 and drives balance into negative', async () => {
    const treasuryBefore = await db.treasury_accounts.get('acc-main');
    expect(treasuryBefore.current_balance).toBe(0);

    const result = await cashRepo.disburseExpense({
      expense_code_id: 'exp-rent',
      expense_name: 'إيجار المصنع والورشة',
      account_id: 'acc-main',
      amount: 1500,
      tx_date: getTodayDateString(),
      description: 'سداد دفعة إيجار شهر نوفمبر للمصنع',
    });

    expect(result.success).toBe(true);
    expect(result.txId).toBeDefined();
    expect(result.txNumber).toBeDefined();

    // Verify treasury balance is updated to -1500.00
    const treasuryAfter = await db.treasury_accounts.get('acc-main');
    expect(treasuryAfter.current_balance).toBe(-1500);

    // Verify cash_transactions ledger record
    const tx = await db.cash_transactions.get(result.txId);
    expect(tx).toBeDefined();
    expect(tx.account_id).toBe('acc-main');
    expect(tx.tx_type).toBe('outflow');
    expect(tx.category).toBe('operating_expense');
    expect(tx.amount).toBe(1500);
    expect(tx.balance_after).toBe(-1500);
    expect(tx.reference_type).toBe('EXPENSE_DISBURSEMENT');
    expect(tx.reference_id).toBe('exp-rent');
  });

  it('2. Successfully records consecutive expense disbursement when treasury is ALREADY negative', async () => {
    // Set treasury balance initially to negative -1500
    await db.treasury_accounts.update('acc-main', { current_balance: -1500 });
    const treasuryInitial = await db.treasury_accounts.get('acc-main');
    expect(treasuryInitial.current_balance).toBe(-1500);

    // Issue second expense disbursement of 750
    const result2 = await cashRepo.disburseExpense({
      expense_code_id: 'exp-electricity',
      expense_name: 'فاتورة الكهرباء التشغيلية',
      account_id: 'acc-main',
      amount: 750,
      tx_date: getTodayDateString(),
      description: 'فاتورة كهرباء المصنع',
    });

    expect(result2.success).toBe(true);

    // Treasury balance should accurately drop to -2250.00
    const treasuryAfter2 = await db.treasury_accounts.get('acc-main');
    expect(treasuryAfter2.current_balance).toBe(-2250);

    const tx2 = await db.cash_transactions.get(result2.txId);
    expect(tx2.amount).toBe(750);
    expect(tx2.balance_after).toBe(-2250);
    expect(tx2.tx_type).toBe('outflow');
  });

  it('3. Successfully executes manual cash outflow transaction when treasury balance is zero or negative', async () => {
    // Treasury at 0.00
    const resultOutflow = await cashRepo.recordTransaction({
      account_id: 'acc-main',
      tx_type: 'outflow',
      category: 'maintenance',
      amount: 400,
      description: 'صيانة ماكينات الخياطة الأوفرلوك',
      tx_date: getTodayDateString(),
    });

    expect(resultOutflow.success).toBe(true);
    const treasury = await db.treasury_accounts.get('acc-main');
    expect(treasury.current_balance).toBe(-400);

    const tx = await db.cash_transactions.get(resultOutflow.txId);
    expect(tx.amount).toBe(400);
    expect(tx.balance_after).toBe(-400);
    expect(tx.tx_type).toBe('outflow');
  });

  it('4. Restores negative treasury balance cleanly when cash inflow arrives', async () => {
    // Treasury at -400.00
    await db.treasury_accounts.update('acc-main', { current_balance: -400 });

    // Customer or capital injection inflow of 1000.00
    const resultInflow = await cashRepo.recordTransaction({
      account_id: 'acc-main',
      tx_type: 'inflow',
      category: 'capital_injection',
      amount: 1000,
      description: 'تغذية نقدية للخزينة',
      tx_date: getTodayDateString(),
    });

    expect(resultInflow.success).toBe(true);
    const treasury = await db.treasury_accounts.get('acc-main');
    expect(treasury.current_balance).toBe(600); // -400 + 1000 = 600

    const tx = await db.cash_transactions.get(resultInflow.txId);
    expect(tx.amount).toBe(1000);
    expect(tx.balance_after).toBe(600);
    expect(tx.tx_type).toBe('inflow');
  });

  it('5. Audit log correctly captures DISBURSE_EXPENSE action and payload', async () => {
    await cashRepo.disburseExpense({
      expense_code_id: 'exp-rent',
      expense_name: 'إيجار المصنع والورشة',
      account_id: 'acc-main',
      amount: 500,
      tx_date: getTodayDateString(),
      description: 'دفعة صيانة',
    }, 'usr-manager');

    const logs = await db.audit_log.toArray();
    expect(logs.length).toBeGreaterThan(0);
    const disburseLog = logs.find(l => l.action === 'DISBURSE_EXPENSE');
    expect(disburseLog).toBeDefined();
    expect(disburseLog.user_id).toBe('usr-manager');
  });
});
