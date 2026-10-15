import db from '../data/db';
import { backupRepo } from '../data/repositories/backupRepo';
import { partiesRepo } from '../data/repositories/partiesRepo';
import { treasuriesRepo } from '../data/repositories/treasuriesRepo';
import { toPiasters, fromPiasters } from '../utils/money';

/**
 * Migration & Verification Engine for Money Precision
 *
 * Requirements:
 * 1. Automatic backup creation before any conversion.
 * 2. Convert stored float amounts with correct round-half-up.
 * 3. Print/return verification report (counts, balance sums per customer, supplier, treasury before vs after).
 * 4. Stop and report if anything differs.
 */
export async function runMoneyPrecisionMigration() {
  if (!db.isOpen()) {
    await db.open();
  }

  // 1. Create automatic in-memory backup snapshot
  const backupSnapshot = await backupRepo.getBackupPayload();

  // 2. Measure before state
  const partiesBefore = await partiesRepo.getAll();
  const treasuriesBefore = await db.treasury_accounts.toArray();
  const itemsBefore = await db.items.toArray();
  const invoicesBefore = await db.sales_invoices.toArray();
  const supInvoicesBefore = await db.supplier_invoices.toArray();

  const customerCountBefore = partiesBefore.filter(p => p.is_customer === 1).length;
  const supplierCountBefore = partiesBefore.filter(p => p.is_supplier === 1).length;
  const treasuryCountBefore = treasuriesBefore.length;

  const totalCustomerBalanceBefore = partiesBefore
    .filter(p => p.is_customer === 1)
    .reduce((sum, p) => sum + toPiasters(p.customer_balance), 0);

  const totalSupplierBalanceBefore = partiesBefore
    .filter(p => p.is_supplier === 1)
    .reduce((sum, p) => sum + toPiasters(p.supplier_balance), 0);

  const totalTreasuryBalanceBefore = treasuriesBefore
    .reduce((sum, t) => sum + toPiasters(t.current_balance), 0);

  // 3. Perform conversion of float amounts with round-half-up
  await db.transaction('rw', [
    db.parties,
    db.treasury_accounts,
    db.items,
    db.sales_invoices,
    db.supplier_invoices,
    db.payments,
    db.customer_payments,
    db.cash_transactions
  ], async () => {
    // A. Parties
    const allParties = await db.parties.toArray();
    for (const p of allParties) {
      const updates = {};
      if (p.opening_balance !== undefined && p.opening_balance !== null) {
        updates.opening_balance = fromPiasters(toPiasters(p.opening_balance));
      }
      if (p.supplier_opening_balance !== undefined && p.supplier_opening_balance !== null) {
        updates.supplier_opening_balance = fromPiasters(toPiasters(p.supplier_opening_balance));
      }
      if (p.customer_opening_balance !== undefined && p.customer_opening_balance !== null) {
        updates.customer_opening_balance = fromPiasters(toPiasters(p.customer_opening_balance));
      }
      if (p.credit_limit !== undefined && p.credit_limit !== null) {
        updates.credit_limit = fromPiasters(toPiasters(p.credit_limit));
      }
      if (Object.keys(updates).length > 0) {
        await db.parties.update(p.id, updates);
      }
    }

    // B. Treasuries
    const allTreasuries = await db.treasury_accounts.toArray();
    for (const t of allTreasuries) {
      if (t.current_balance !== undefined && t.current_balance !== null) {
        await db.treasury_accounts.update(t.id, {
          current_balance: fromPiasters(toPiasters(t.current_balance))
        });
      }
    }

    // C. Items cost and prices
    const allItems = await db.items.toArray();
    for (const it of allItems) {
      const updates = {};
      if (it.cost_price !== undefined && it.cost_price !== null) {
        updates.cost_price = fromPiasters(toPiasters(it.cost_price));
      }
      if (it.selling_price !== undefined && it.selling_price !== null) {
        updates.selling_price = fromPiasters(toPiasters(it.selling_price));
      }
      if (Object.keys(updates).length > 0) {
        await db.items.update(it.id, updates);
      }
    }

    // D. Invoices and payments
    const allSalesInv = await db.sales_invoices.toArray();
    for (const inv of allSalesInv) {
      await db.sales_invoices.update(inv.id, {
        total_amount: fromPiasters(toPiasters(inv.total_amount ?? inv.total_invoice_amount)),
        paid_amount: fromPiasters(toPiasters(inv.paid_amount || 0))
      });
    }

    const allSupInv = await db.supplier_invoices.toArray();
    for (const inv of allSupInv) {
      await db.supplier_invoices.update(inv.id, {
        total_amount: fromPiasters(toPiasters(inv.total_amount)),
        paid_amount: fromPiasters(toPiasters(inv.paid_amount || 0))
      });
    }

    const allPayments = await db.payments.toArray();
    for (const p of allPayments) {
      await db.payments.update(p.id, {
        amount: fromPiasters(toPiasters(p.amount))
      });
    }

    const allCustPayments = await db.customer_payments.toArray();
    for (const cp of allCustPayments) {
      await db.customer_payments.update(cp.id, {
        amount: fromPiasters(toPiasters(cp.amount))
      });
    }

    const allTxs = await db.cash_transactions.toArray();
    for (const tx of allTxs) {
      await db.cash_transactions.update(tx.id, {
        amount: fromPiasters(toPiasters(tx.amount)),
        balance_after: fromPiasters(toPiasters(tx.balance_after))
      });
    }
  });

  // 4. Measure after state
  const partiesAfter = await partiesRepo.getAll();
  const treasuriesAfter = await db.treasury_accounts.toArray();

  const customerCountAfter = partiesAfter.filter(p => p.is_customer === 1).length;
  const supplierCountAfter = partiesAfter.filter(p => p.is_supplier === 1).length;
  const treasuryCountAfter = treasuriesAfter.length;

  const totalCustomerBalanceAfter = partiesAfter
    .filter(p => p.is_customer === 1)
    .reduce((sum, p) => sum + toPiasters(p.customer_balance), 0);

  const totalSupplierBalanceAfter = partiesAfter
    .filter(p => p.is_supplier === 1)
    .reduce((sum, p) => sum + toPiasters(p.supplier_balance), 0);

  const totalTreasuryBalanceAfter = treasuriesAfter
    .reduce((sum, t) => sum + toPiasters(t.current_balance), 0);

  // 5. Verification checks
  const differences = [];
  if (customerCountBefore !== customerCountAfter) {
    differences.push(`اختلاف عدد العملاء: قبل (${customerCountBefore}) بعد (${customerCountAfter})`);
  }
  if (supplierCountBefore !== supplierCountAfter) {
    differences.push(`اختلاف عدد الموردين: قبل (${supplierCountBefore}) بعد (${supplierCountAfter})`);
  }
  if (treasuryCountBefore !== treasuryCountAfter) {
    differences.push(`اختلاف عدد الخزائن: قبل (${treasuryCountBefore}) بعد (${treasuryCountAfter})`);
  }
  if (totalCustomerBalanceBefore !== totalCustomerBalanceAfter) {
    differences.push(
      `اختلاف مجموع أرصدة العملاء: قبل (${fromPiasters(totalCustomerBalanceBefore)} ج.م) بعد (${fromPiasters(totalCustomerBalanceAfter)} ج.م)`
    );
  }
  if (totalSupplierBalanceBefore !== totalSupplierBalanceAfter) {
    differences.push(
      `اختلاف مجموع أرصدة الموردين: قبل (${fromPiasters(totalSupplierBalanceBefore)} ج.م) بعد (${fromPiasters(totalSupplierBalanceAfter)} ج.م)`
    );
  }
  if (totalTreasuryBalanceBefore !== totalTreasuryBalanceAfter) {
    differences.push(
      `اختلاف مجموع أرصدة الخزائن: قبل (${fromPiasters(totalTreasuryBalanceBefore)} ج.م) بعد (${fromPiasters(totalTreasuryBalanceAfter)} ج.م)`
    );
  }

  const report = {
    timestamp: new Date().toISOString(),
    status: differences.length === 0 ? 'success' : 'failed',
    differences,
    customers: {
      countBefore: customerCountBefore,
      countAfter: customerCountAfter,
      totalBalanceBefore: fromPiasters(totalCustomerBalanceBefore),
      totalBalanceAfter: fromPiasters(totalCustomerBalanceAfter)
    },
    suppliers: {
      countBefore: supplierCountBefore,
      countAfter: supplierCountAfter,
      totalBalanceBefore: fromPiasters(totalSupplierBalanceBefore),
      totalBalanceAfter: fromPiasters(totalSupplierBalanceAfter)
    },
    treasuries: {
      countBefore: treasuryCountBefore,
      countAfter: treasuryCountAfter,
      totalBalanceBefore: fromPiasters(totalTreasuryBalanceBefore),
      totalBalanceAfter: fromPiasters(totalTreasuryBalanceAfter)
    }
  };

  if (differences.length > 0) {
    // Rollback from backup snapshot
    await backupRepo.importAllData(backupSnapshot);
    throw new Error(`فشلت المطابقة المالية أثناء ترحيل البيانات:\n${differences.join('\n')}`);
  }

  return report;
}

export async function rollbackMigration(backupSnapshot) {
  if (backupSnapshot) {
    await backupRepo.importAllData(backupSnapshot);
  }
}
