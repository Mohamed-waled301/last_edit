import { test, expect } from '@playwright/test';

const EMOJI_AND_DECORATIVE_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2B50}\u{2705}\u{2714}\u{2713}\u{26A0}\u{1F4CC}\u{2630}\u{2715}\u{2716}\u{274C}\u{232B}\p{Extended_Pictographic}]/u;

const ALL_ROUTES = [
  '#/home',
  '#/items',
  '#/suppliers',
  '#/purchases',
  '#/inventory',
  '#/manufacturing',
  '#/outsourced',
  '#/customers',
  '#/sales',
  '#/returns',
  '#/treasuries',
  '#/disbursements',
  '#/reports',
  '#/backup',
  '#/settings',
  '#/data',
];

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

test.describe('code systems Smoke Tests', () => {
  test('1366px desktop width: visits every sidebar route without console errors or page horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });

    await ensureSetup(page);

    // Sidebar should be visible on desktop
    await expect(page.locator('#app-sidebar')).toBeVisible();

    for (const route of ALL_ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(400);

      // Check horizontal overflow: page must never scroll horizontally
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      });
      expect(isOverflowing, `Route ${route} at 1366px has horizontal page overflow`).toBe(false);

      // Check no emojis in rendered UI text
      const pageText = await page.evaluate(() => document.body.innerText);
      const emojiMatch = EMOJI_AND_DECORATIVE_REGEX.test(pageText);
      expect(emojiMatch, `Route ${route} at 1366px contains emojis or decorative symbols in rendered UI`).toBe(false);
    }

    expect(consoleErrors, 'Console errors encountered during desktop route traversal').toHaveLength(0);
  });

  test('390px mobile width: visits every sidebar route without console errors or page horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon')) {
          consoleErrors.push(text);
        }
      }
    });

    await ensureSetup(page);

    // Mobile menu button in header toggles the sidebar drawer
    const menuButton = page.locator('header button[title="القائمة الرئيسية"]');
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(page.locator('#app-sidebar')).toBeVisible();

    for (const route of ALL_ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(400);

      // Check horizontal overflow: mobile page must never scroll horizontally
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      });
      expect(isOverflowing, `Route ${route} at 390px has horizontal page overflow`).toBe(false);

      // Check no emojis in rendered UI text
      const pageText = await page.evaluate(() => document.body.innerText);
      const emojiMatch = EMOJI_AND_DECORATIVE_REGEX.test(pageText);
      expect(emojiMatch, `Route ${route} at 390px contains emojis or decorative symbols in rendered UI`).toBe(false);
    }

    expect(consoleErrors, 'Console errors encountered during mobile route traversal').toHaveLength(0);
  });

  test('non-CEO user cannot see or call data-management functions', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await ensureSetup(page);

    // Switch to non-CEO role (cashier) via header selector or session
    const roleSelect = page.locator('header select');
    await expect(roleSelect).toBeVisible();

    const options = await roleSelect.locator('option').all();
    let switched = false;
    for (const opt of options) {
      const text = await opt.innerText();
      if (!text.includes('المدير') && !text.includes('owner')) {
        const val = await opt.getAttribute('value');
        if (val) {
          await roleSelect.selectOption(val);
          switched = true;
          break;
        }
      }
    }

    if (!switched) {
      await page.evaluate(() => {
        sessionStorage.setItem(
          'erp_active_user',
          JSON.stringify({ id: 'usr-cashier', role: 'cashier', full_name: 'كاشير الفرع' })
        );
        window.location.reload();
      });
    }

    await page.waitForTimeout(800);

    // 1. Data management item must NOT be in the sidebar DOM for non-CEO
    const dataManagementSidebarBtn = page.locator('aside button[title*="إدارة البيانات"]');
    const count = await dataManagementSidebarBtn.count();
    expect(count, 'Non-CEO should not see Data Management in sidebar').toBe(0);

    // 2. Navigating to #/data directly shows access denied message
    await page.goto('#/data');
    await page.waitForTimeout(600);
    const accessDeniedHeading = page.locator('text=غير مصرح لك بالوصول');
    await expect(accessDeniedHeading).toBeVisible();

    // 3. Direct programmatic call to dataManagementRepo rejects with error
    const directCallRejected = await page.evaluate(async () => {
      try {
        await window.api.createDataRecord('items', { name: 'محاولة اختراق' });
        return false;
      } catch (err) {
        return err.message.includes('غير مصرح') || err.message.includes('CEO');
      }
    });
    expect(directCallRejected, 'Direct call to createDataRecord by non-CEO must be rejected').toBe(true);
  });

  test('party form: credit limit field is always visible for customer, and saving customer succeeds', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await ensureSetup(page);

    // Navigate to new party / customer form
    await page.goto('#/customers/new');
    await page.waitForTimeout(600);

    // Credit limit input is always visible for customer
    const creditLimitInput = page.locator('#party-credit-limit-input');
    await expect(creditLimitInput).toBeVisible();

    // Check exact Arabic helper text
    const helperText = page.locator('text=اختياري؛ اتركه فارغاً أو 0 لعدم تحديد سقف ائتماني. يطبق فقط على الفواتير الآجلة.');
    await expect(helperText).toBeVisible();

    // Fill a value and check input retains typed exact value without unwanted thousand formatting drift
    await creditLimitInput.fill('250000');
    await expect(creditLimitInput).toHaveValue('250000');

    // Fill customer name and save
    const nameInput = page.locator('#party-name-input');
    await nameInput.fill('شركة الأناقة النقدية للاختبار');

    // Click Save button
    const saveButton = page.locator('button:has-text("حفظ جهة التعامل")').first();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await page.waitForTimeout(1000);

    // Successfully saved and navigated to customers list
    expect(page.url()).toContain('#/customers');
    const customerRow = page.locator('text=شركة الأناقة النقدية للاختبار');
    await expect(customerRow).toBeVisible();
  });

  test('data persistence across page reload: created records survive F5 / page reload', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await ensureSetup(page);

    // Create unique records programmatically via window.api or Dexie
    const testSupplierName = `مورد استمرارية البيانات ${Date.now()}`;
    const testItemName = `صنف اختبار التحديث ${Date.now()}`;

    await page.evaluate(async ({ supName, itmName }) => {
      const sup = await window.api.createParty({
        code: `SUP-REL-${Date.now().toString().slice(-4)}`,
        name: supName,
        type: 'supplier',
        is_supplier: 1,
        phone: '01012345678',
        current_balance: 0
      });

      const itm = await window.api.createItem({
        code: `ITM-REL-${Date.now().toString().slice(-4)}`,
        name: itmName,
        item_type: 'raw_material',
        item_group: 'خامات',
        item_department: 'حياكة',
        unit: 'متر',
        cost_price: 150,
        opening_balance: 10,
        opening_cost: 150
      });

      await window.api.createPurchaseOrder({
        supplier_id: sup.id || sup.party?.id,
        payment_terms: 'cash',
        items: [
          {
            material_id: itm.id || itm.item?.id,
            quantity_ordered: 5,
            quantity: 5,
            unit_price: 150
          }
        ]
      });
    }, { supName: testSupplierName, itmName: testItemName });

    // Verify supplier is in suppliers list
    await page.goto('#/suppliers');
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${testSupplierName}`)).toBeVisible();

    // Verify item is in items list
    await page.goto('#/items');
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${testItemName}`)).toBeVisible();

    // Perform page reload (simulating F5 / browser reload)
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Re-verify that records survived reload completely!
    await page.goto('#/suppliers');
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${testSupplierName}`)).toBeVisible();

    await page.goto('#/items');
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${testItemName}`)).toBeVisible();

    await page.goto('#/purchases');
    await page.waitForTimeout(600);
    await expect(page.locator(`text=${testSupplierName}`)).toBeVisible();
  });
});
