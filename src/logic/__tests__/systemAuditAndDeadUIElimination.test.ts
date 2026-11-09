import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('End-to-End System Audit & Dead UI Elimination Suite', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('Verifies that all active FormPage components (including PurchaseReturnFormPage) have handleFormKeyDown and navigationGuard', () => {
    const modulesDir = path.join(rootDir, 'src', 'modules');
    const formFiles: string[] = [];

    function findFormPages(dir: string) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          findFormPages(full);
        } else if (item.name.endsWith('FormPage.jsx')) {
          formFiles.push(full);
        }
      }
    }

    findFormPages(modulesDir);
    expect(formFiles.length).toBe(18);

    for (const f of formFiles) {
      const content = fs.readFileSync(f, 'utf8');
      const basename = path.basename(f);

      // Verify Enter Key prevention
      expect(content).toContain('handleFormKeyDown');
      expect(content).toContain('onKeyDown={handleFormKeyDown}');

      // Verify Unsaved Changes Guard
      expect(content).toContain('navigationGuard');
      expect(content).toContain('navigationGuard.register');
      expect(content).toContain('navigationGuard.unregister()');
    }
  });

  it('Verifies 0 empty/mock click handlers across active modules', () => {
    const modulesDir = path.join(rootDir, 'src', 'modules');
    const files: string[] = [];

    function scanFiles(dir: string) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          scanFiles(full);
        } else if (item.name.endsWith('.jsx')) {
          // exclude legacy monolithic modules not imported by App.jsx
          if (!['CashModule.jsx', 'FinishingModule.jsx', 'InventoryModule.jsx', 'ManufacturingModule.jsx', 'ProductsModule.jsx', 'SalesModule.jsx', 'SuppliersModule.jsx'].includes(item.name)) {
            files.push(full);
          }
        }
      }
    }

    scanFiles(modulesDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      // No empty arrow handlers
      expect(content).not.toMatch(/onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/);
      // No javascript:void
      expect(content).not.toContain('javascript:void');
    }
  });

  it('Verifies 0 input placeholders and 0 emojis across active source files', () => {
    const srcDir = path.join(rootDir, 'src');
    const files: string[] = [];

    function scanDir(dir: string) {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (!full.includes('node_modules') && !full.includes('.git') && !full.includes('dist') && !full.includes('dist-electron')) {
            scanDir(full);
          }
        } else if (/\.(jsx|tsx|html)$/.test(item.name)) {
          // Ignore legacy unused modules
          if (!['CashModule.jsx', 'FinishingModule.jsx', 'InventoryModule.jsx', 'ManufacturingModule.jsx', 'ProductsModule.jsx', 'SalesModule.jsx', 'SuppliersModule.jsx'].includes(item.name)) {
            files.push(full);
          }
        }
      }
    }

    scanDir(srcDir);
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      // Zero placeholder attributes on input or textarea
      const phAttr = new RegExp('<(input|textarea)[^>]+' + 'place' + 'holder=', 'i');
      expect(content).not.toMatch(phAttr);

      // Zero emojis
      const emojiMatch = content.match(emojiRegex);
      expect(emojiMatch).toBeNull();
    }
  });

  it('Verifies Arabic currency symbol ج.م is used across all UI formatters', () => {
    const formattersPath = path.join(rootDir, 'src', 'utils', 'formatters.js');
    const content = fs.readFileSync(formattersPath, 'utf8');
    expect(content).toContain('ج.م');
    expect(content).not.toContain('EGP');
    expect(content).not.toContain('LE');
  });
});
