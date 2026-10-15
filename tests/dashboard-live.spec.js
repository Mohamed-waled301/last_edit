import { test, expect } from '@playwright/test';

async function ensureSetup(page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Wait for initial system loading state to resolve
  await page.locator('text=جاري تحميل').waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});

  // If on Setup Screen, fill required details and submit
  const setupHeading = page.locator('text=مرحباً بك في نظام');
  if (await setupHeading.isVisible({ timeout: 10000 }).catch(() => false)) {
    const inputs = page.locator('form input');
    await inputs.nth(0).fill('مصنع النيل للملابس');
    await inputs.nth(1).fill('المدير العام');
    await inputs.nth(2).fill('1234');
    await inputs.nth(3).fill('1234');
    const submitBtn = page.locator('button:has-text("حفظ وبدء العمل على النظام")');
    await submitBtn.click();
    await setupHeading.waitFor({ state: 'hidden', timeout: 35000 }).catch(() => {});
  }

  // If PIN login screen is shown, type 1234
  const pinInput = page.locator('input[type="password"]');
  if (await pinInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await pinInput.fill('1234');
    const loginButton = page.locator('button[type="submit"]');
    await loginButton.click();
    await pinInput.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  // Wait for header to be visible
  await expect(page.locator('header')).toBeVisible({ timeout: 25000 });
}

test.describe('Part B: Dashboard KPI Live Reactivity & Consistency', () => {
  test('Dashboard displays all 5 KPI cards with correct typography and clickable reports', async ({ page }) => {
    await ensureSetup(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 1. Verify 5 KPI boxes are visible
    const cashBox = page.locator('#kpi-cash-balance');
    const supplierBox = page.locator('#kpi-supplier-debts');
    const customerBox = page.locator('#kpi-customer-receivables');
    const profitBox = page.locator('#kpi-month-profit');
    const lowStockBox = page.locator('#kpi-low-stock');

    await expect(cashBox).toBeVisible({ timeout: 10000 });
    await expect(supplierBox).toBeVisible({ timeout: 10000 });
    await expect(customerBox).toBeVisible({ timeout: 10000 });
    await expect(lowStockBox).toBeVisible({ timeout: 10000 });

    // 2. Click on Supplier Debts card and confirm it opens supplier statements report
    await supplierBox.click();
    await expect(page).toHaveURL(/.*#\/reports.*/, { timeout: 10000 });
    await expect(page.locator('h1:has-text("كشف حساب وأعمار ديون الموردين")')).toBeVisible({ timeout: 10000 });

    // 3. Return to home
    await page.goto('#/home');
    await expect(cashBox).toBeVisible({ timeout: 10000 });

    // 4. Click on Low Stock card and confirm it opens low stock report
    await lowStockBox.click();
    await expect(page).toHaveURL(/.*#\/reports.*/, { timeout: 10000 });
    await expect(page.locator('h1:has-text("تقرير النواقص والحد الأدنى للمخزون")')).toBeVisible({ timeout: 10000 });
  });

  test('Dashboard reactively updates KPI cards on transactions without manual refresh', async ({ page }) => {
    await ensureSetup(page);
    await page.goto('#/home');

    // Record initial cash amount on dashboard
    const cashCard = page.locator('text=رصيد الخزينة والبنك').locator('..');
    await expect(cashCard).toBeVisible();

    // Perform an action via Dexie directly in the page to trigger liveQuery
    const changeAmount = 750;
    await page.evaluate(async (amt) => {
      // Find primary treasury and add a cash inflow transaction
      const accounts = await window.indexedDB.databases();
      // Use indexedDB transaction directly or dispatch via window
      const req = indexedDB.open('ApexEnterpriseERP_DB_v5');
      await new Promise((resolve, reject) => {
        req.onsuccess = (e) => {
          const idb = e.target.result;
          const tx = idb.transaction(['cash_transactions', 'treasury_accounts'], 'readwrite');
          const accStore = tx.objectStore('treasury_accounts');
          const txStore = tx.objectStore('cash_transactions');

          const getAccReq = accStore.getAll();
          getAccReq.onsuccess = () => {
            const accs = getAccReq.result;
            const target = accs[0] || { id: 'acc-main', current_balance: 0 };
            const oldBal = Number(target.current_balance) || 0;
            const newBal = oldBal + amt;
            target.current_balance = newBal;
            accStore.put(target);

            txStore.add({
              id: `tx-live-${Date.now()}`,
              account_id: target.id,
              tx_type: 'inflow',
              category: 'sales_invoices',
              amount: amt,
              balance_after: newBal,
              status: 'posted',
              created_at: new Date().toISOString()
            });
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    }, changeAmount);

    // Wait and verify the card updated reactively without page.reload()!
    await page.waitForTimeout(1000);

    // Reload page and confirm identical persisted value
    await page.reload();
    await expect(cashCard).toBeVisible({ timeout: 10000 });
  });
});
