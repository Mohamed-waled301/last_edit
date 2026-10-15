import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { issueLicense } = require('../tools/license-generator/cli.js');

test.describe('Electron Offline License Gate E2E Test', () => {
  let tempUserData;

  test.beforeEach(() => {
    tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-license-gate-'));
  });

  test.afterEach(() => {
    try {
      if (fs.existsSync(tempUserData)) {
        fs.rmSync(tempUserData, { recursive: true, force: true });
      }
    } catch {}
  });

  test('isolated launch without license shows activation screen, accepts valid license, and fails closed when corrupted', async () => {
    // 1. Launch with empty temporary userData -> Must show activation screen
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: tempUserData,
        NODE_ENV: 'production',
        ALLOW_DEV_LICENSE_BYPASS: 'false',
      },
    });

    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // Verify Activation Screen appears
    const activationTitle = window.locator('text=تفعيل النسخة');
    await expect(activationTitle).toBeVisible({ timeout: 20000 });

    // Machine code should be visible
    const machineCodeElem = window.locator('#activation-machine-code');
    await expect(machineCodeElem).toBeVisible();
    const machineCode = (await machineCodeElem.innerText()).trim();
    expect(machineCode).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);

    // Verify the data safety backup button is visible on activation screen
    const backupBtn = window.locator('button:has-text("تصدير نسخة احتياطية من البيانات")');
    await expect(backupBtn).toBeVisible();

    // 2. Issue a valid license for this machine code
    const licOutPath = path.join(tempUserData, 'test-license.lic');
    const { licenseKeyString } = issueLicense({
      customer: 'شركة التجربة الشاملة',
      machine: machineCode,
      edition: 'cutting',
      out: licOutPath,
    });

    // Enter license into textarea and activate
    const licenseTextarea = window.locator('textarea[aria-label="نص كود الترخيص"]');
    await licenseTextarea.fill(licenseKeyString);

    const activateBtn = window.locator('button:has-text("تفعيل")');
    await activateBtn.click();

    // Success screen or transition to app setup should appear
    await expect(
      window.locator('text=تم التفعيل بنجاح')
        .or(window.locator('text=مرحباً بك في نظام'))
        .or(window.locator('header'))
    ).toBeVisible({ timeout: 15000 });

    await app.close();

    // 3. Relaunch with the same userData -> Should be activated and open main app directly
    const app2 = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: tempUserData,
        NODE_ENV: 'production',
        ALLOW_DEV_LICENSE_BYPASS: 'false',
      },
    });

    const window2 = await app2.firstWindow();
    await window2.waitForLoadState('domcontentloaded');

    // Header or setup screen should be visible, NOT activation screen
    await expect(
      window2.locator('header')
        .or(window2.locator('text=مرحباً بك في نظام'))
    ).toBeVisible({ timeout: 25000 });
    const activationOnRelaunch = window2.locator('text=تفعيل النسخة');
    await expect(activationOnRelaunch).toHaveCount(0);

    await app2.close();

    // 4. Corrupt the license file -> Must fail closed and show activation screen again
    const licJsonPath = path.join(tempUserData, 'license.json');
    if (fs.existsSync(licJsonPath)) {
      fs.writeFileSync(licJsonPath, '{"payload": {"tampered": true}, "signature": "BADSIG=="}', 'utf8');
    }
    const tokenPath = path.join(tempUserData, '.sys_activation.dat');
    if (fs.existsSync(tokenPath)) {
      fs.writeFileSync(tokenPath, 'corrupted_token_bytes', 'utf8');
    }

    const app3 = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        TEST_USER_DATA_DIR: tempUserData,
        NODE_ENV: 'production',
        ALLOW_DEV_LICENSE_BYPASS: 'false',
      },
    });

    const window3 = await app3.firstWindow();
    await window3.waitForLoadState('domcontentloaded');

    // Must show activation screen again due to corruption
    const activationOnCorruption = window3.locator('text=تفعيل النسخة');
    await expect(activationOnCorruption).toBeVisible({ timeout: 20000 });

    await app3.close();
  });
});
