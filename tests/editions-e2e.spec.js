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

test.describe('Part C: Editions Verification (Cutting vs Standard)', () => {
  test('Cutting edition renders cutting sidebar item and reports catalog group', async ({ page }) => {
    // Force cutting edition in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem('__APP_EDITION_OVERRIDE__', 'cutting');
    });

    await ensureSetup(page);
    await page.goto('#/home');

    // 1. Verify "شاشة القص" is present in sidebar
    const cuttingSidebar = page.locator('aside button:has-text("شاشة القص")');
    await expect(cuttingSidebar).toBeVisible({ timeout: 10000 });

    // 2. Open reports and verify "التصنيع والإنتاج" is present
    await page.goto('#/reports');
    await expect(page.locator('text=التصنيع والإنتاج').first()).toBeVisible({ timeout: 10000 });
  });

  test('Standard edition cleanly excludes cutting sidebar item, cutting route, and cutting reports', async ({ page }) => {
    // Force standard edition in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem('__APP_EDITION_OVERRIDE__', 'standard');
    });

    await ensureSetup(page);
    await page.goto('#/home');

    // 1. Verify "شاشة القص" is NOT present in sidebar
    const cuttingSidebar = page.locator('aside button:has-text("شاشة القص")');
    await expect(cuttingSidebar).toHaveCount(0);

    // 2. Open reports and verify "التصنيع والإنتاج" group is NOT present
    await page.goto('#/reports');
    const mfgGroup = page.locator('text=التصنيع والإنتاج');
    await expect(mfgGroup).toHaveCount(0);

    // 3. Try navigating directly to #/manufacturing and verify it safely falls back to home
    await page.goto('#/manufacturing');
    await expect(page.locator('#kpi-cash-balance')).toBeVisible({ timeout: 10000 });
  });
});
