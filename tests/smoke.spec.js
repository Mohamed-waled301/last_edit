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
  await page.locator('text=جاري تحميل نظام إدارة مصانع الملابس').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

  // If on Setup Screen, click submit and wait for full demo seeding
  const setupForm = page.locator('form:has-text("اسم الشركة")');
  if (await setupForm.isVisible({ timeout: 4000 }).catch(() => false)) {
    const submitBtn = setupForm.locator('button[type="submit"]');
    await submitBtn.click();
    await setupForm.waitFor({ state: 'hidden', timeout: 35000 });
  }

  // If PIN login screen is shown, type 1234
  const pinInput = page.locator('input[type="password"]');
  if (await pinInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pinInput.fill('1234');
    const loginButton = page.locator('button[type="submit"]');
    await loginButton.click();
    await pinInput.waitFor({ state: 'hidden', timeout: 10000 });
  }

  // Wait for header to be visible
  await expect(page.locator('header')).toBeVisible({ timeout: 20000 });
}

test.describe('Apex Apparel ERP Smoke Tests', () => {
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
      if (!text.includes('خالد') && !text.includes('المنشاوي')) {
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
          JSON.stringify({ id: 'usr-cashier', role: 'cashier', full_name: 'أحمد محمود كاشير' })
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

  test('party form: cash type hides credit limit, credit type shows it, and saving cash customer succeeds', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await ensureSetup(page);

    // Navigate to new party / customer form
    await page.goto('#/customers/new');
    await page.waitForTimeout(600);

    // Verify "نوع التعامل" selector is present and defaults to "نقدي" (cash)
    const dealTypeSelect = page.locator('#customer-deal-type-select');
    await expect(dealTypeSelect).toBeVisible();
    await expect(dealTypeSelect).toHaveValue('cash');

    // Credit limit input and container must NOT be in the DOM
    const creditLimitInput = page.locator('#party-credit-limit-input');
    await expect(creditLimitInput).toHaveCount(0);

    // Switch to "آجل" (credit)
    await dealTypeSelect.selectOption('credit');
    await expect(creditLimitInput).toBeVisible();

    // Check exact Arabic helper text
    const helperText = page.locator('text=يطبق على فواتير المبيعات الآجلة فقط، ويمنع حفظ الفاتورة عند تجاوز المديونية لهذا الحد.');
    await expect(helperText).toBeVisible();

    // Fill a value and check thousand separator formatting
    await creditLimitInput.fill('250000');
    await expect(creditLimitInput).toHaveValue('250,000');

    // Switch back to "نقدي" (cash)
    await dealTypeSelect.selectOption('cash');
    await expect(creditLimitInput).toHaveCount(0);

    // Fill customer name and save
    const nameInput = page.locator('input[placeholder*="شركة النيل"]');
    await nameInput.fill('شركة الأناقة النقدية للاختبار');

    // Click Save button
    const saveButton = page.locator('button:has-text("حفظ جهة التعامل")');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    await page.waitForTimeout(1000);

    // Successfully saved and navigated to customers list
    expect(page.url()).toContain('#/customers');
    const customerRow = page.locator('text=شركة الأناقة النقدية للاختبار');
    await expect(customerRow).toBeVisible();
  });
});
