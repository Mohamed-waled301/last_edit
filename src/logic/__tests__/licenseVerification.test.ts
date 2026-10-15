import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const require = createRequire(import.meta.url);
const {
  deriveMachineCode,
  normalizeMachineCode,
  canonicalizePayload,
  verifyLicense,
  checkClockRollback,
  writeClockState,
  LicenseManager,
  APP_SALT,
} = require('../../../electron/licenseManager.js');
const { LICENSE_PUBLIC_KEY } = require('../../../electron/license-public-key.js');

describe('Single-Device License Verification Suite', () => {
  let tempDir: string;
  let testKeyPair: { publicKey: string; privateKey: string };
  let anotherKeyPair: { publicKey: string; privateKey: string };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-license-test-'));

    // Generate fresh Ed25519 keypairs for isolated test cryptographic signatures
    const keyPair1 = crypto.generateKeyPairSync('ed25519');
    testKeyPair = {
      publicKey: keyPair1.publicKey.export({ type: 'spki', format: 'pem' }) as string,
      privateKey: keyPair1.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    };

    const keyPair2 = crypto.generateKeyPairSync('ed25519');
    anotherKeyPair = {
      publicKey: keyPair2.publicKey.export({ type: 'spki', format: 'pem' }) as string,
      privateKey: keyPair2.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    };
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // Helper to sign payload
  function signTestLicense(payload: any, privateKeyPem = testKeyPair.privateKey) {
    const canonical = canonicalizePayload(payload);
    const signatureBuffer = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKeyPem);
    return {
      payload,
      signature: signatureBuffer.toString('base64'),
    };
  }

  describe('1. Machine Code Derivation and Normalization', () => {
    it('derives a consistent 16-hex code grouped into 4-char segments (XXXX-XXXX-XXXX-XXXX)', () => {
      const rawId = 'TEST-WINDOWS-MACHINE-GUID-12345';
      const code1 = deriveMachineCode(rawId);
      const code2 = deriveMachineCode(rawId);

      expect(code1).toBe(code2);
      expect(code1).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
      expect(code1.length).toBe(19);
    });

    it('normalizes machine codes by stripping hyphens, spaces, and case differences', () => {
      expect(normalizeMachineCode('4a57-b625-25a1-f68c')).toBe('4A57B62525A1F68C');
      expect(normalizeMachineCode('4A57 B625 25A1 F68C')).toBe('4A57B62525A1F68C');
      expect(normalizeMachineCode('4A57-B625-25A1-F68C')).toBe('4A57B62525A1F68C');
    });

    it('derives different machine codes for different raw hardware fingerprints', () => {
      const codeA = deriveMachineCode('MACHINE-A-GUID');
      const codeB = deriveMachineCode('MACHINE-B-GUID');
      expect(codeA).not.toBe(codeB);
    });
  });

  describe('2. License Verification Core (Ed25519 and Machine Binding)', () => {
    const targetMachine = '4A57-B625-25A1-F68C';

    it('passes verification when license is signed with valid key and matches machine code', () => {
      const payload = {
        customerName: 'مصنع النخبة للملابس',
        machineIdHash: normalizeMachineCode(targetMachine),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'Enterprise',
      };

      const licenseObj = signTestLicense(payload, testKeyPair.privateKey);
      const result = verifyLicense(licenseObj, targetMachine, testKeyPair.publicKey);

      expect(result.valid).toBe(true);
      expect(result.customerName).toBe('مصنع النخبة للملابس');
      expect(result.edition).toBe('Enterprise');
      expect(result.expiresAt).toBeNull();
      expect(result.isExpiringSoon).toBe(false);
    });

    it('fails when license machine code belongs to a different machine (wrong machine hash)', () => {
      const otherMachine = 'B2C3-9999-1111-2222';
      const payload = {
        customerName: 'مصنع الشرقية',
        machineIdHash: normalizeMachineCode(otherMachine),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'Enterprise',
      };

      const licenseObj = signTestLicense(payload, testKeyPair.privateKey);
      const result = verifyLicense(licenseObj, targetMachine, testKeyPair.publicKey);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('MACHINE_MISMATCH');
      expect(result.error).toContain('مخصص لجهاز آخر');
    });

    it('fails when payload is tampered with after signing (signature check fails)', () => {
      const payload = {
        customerName: 'شركة الأمل',
        machineIdHash: normalizeMachineCode(targetMachine),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'Enterprise',
      };

      const licenseObj = signTestLicense(payload, testKeyPair.privateKey);

      // Malicious attempt to change customer name without resigning
      const tamperedObj = {
        payload: {
          ...payload,
          customerName: 'شركة تلاعب أخرى',
        },
        signature: licenseObj.signature,
      };

      const result = verifyLicense(tamperedObj, targetMachine, testKeyPair.publicKey);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    it('fails when license is signed with a wrong/unauthorized private key', () => {
      const payload = {
        customerName: 'مصنع الإسكندرية',
        machineIdHash: normalizeMachineCode(targetMachine),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'Enterprise',
      };

      // Signed with anotherKeyPair instead of testKeyPair
      const licenseObj = signTestLicense(payload, anotherKeyPair.privateKey);
      const result = verifyLicense(licenseObj, targetMachine, testKeyPair.publicKey);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    it('fails when license has expired past expiresAt date', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        customerName: 'مصنع القاهرة',
        machineIdHash: normalizeMachineCode(targetMachine),
        issuedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: yesterday,
        edition: 'Trial',
      };

      const licenseObj = signTestLicense(payload, testKeyPair.privateKey);
      const result = verifyLicense(licenseObj, targetMachine, testKeyPair.publicKey);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('EXPIRED');
      expect(result.isExpired).toBe(true);
      expect(result.error).toContain('انتهت صلاحية');
    });

    it('flags license as expiring soon (isExpiringSoon: true) within 14 days of expiry', () => {
      // 5 days remaining in future
      const fiveDaysFuture = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        customerName: 'مصنع السلام',
        machineIdHash: normalizeMachineCode(targetMachine),
        issuedAt: new Date().toISOString(),
        expiresAt: fiveDaysFuture,
        edition: 'Annual',
      };

      const licenseObj = signTestLicense(payload, testKeyPair.privateKey);
      const result = verifyLicense(licenseObj, targetMachine, testKeyPair.publicKey);

      expect(result.valid).toBe(true);
      expect(result.isExpiringSoon).toBe(true);
      expect(result.daysRemaining).toBeLessThanOrEqual(14);
      expect(result.daysRemaining).toBeGreaterThanOrEqual(1);
    });

    it('does NOT flag license as expiring soon if expiry is more than 14 days away', () => {
      const sixtyDaysFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        customerName: 'مصنع الفرسان',
        machineIdHash: normalizeMachineCode(targetMachine),
        issuedAt: new Date().toISOString(),
        expiresAt: sixtyDaysFuture,
        edition: 'Enterprise',
      };

      const licenseObj = signTestLicense(payload, testKeyPair.privateKey);
      const result = verifyLicense(licenseObj, targetMachine, testKeyPair.publicKey);

      expect(result.valid).toBe(true);
      expect(result.isExpiringSoon).toBe(false);
      expect(result.daysRemaining).toBeGreaterThan(14);
    });
  });

  describe('3. Clock Rollback and Tamper Detection', () => {
    it('records clock state and permits normal forward time progression', () => {
      const stateFile = path.join(tempDir, 'license-state.json');
      const time1 = new Date('2026-10-13T10:00:00.000Z');
      const time2 = new Date('2026-10-13T14:00:00.000Z');

      const check1 = checkClockRollback(stateFile, time1);
      expect(check1.valid).toBe(true);

      const check2 = checkClockRollback(stateFile, time2);
      expect(check2.valid).toBe(true);
    });

    it('detects system clock rollback if time is rolled back by more than 1 day', () => {
      const stateFile = path.join(tempDir, 'license-state.json');
      const establishedTime = new Date('2026-10-13T10:00:00.000Z');
      checkClockRollback(stateFile, establishedTime);

      // Roll clock back by 3 days
      const rolledBackTime = new Date('2026-10-10T10:00:00.000Z');
      const result = checkClockRollback(stateFile, rolledBackTime);

      expect(result.valid).toBe(false);
      expect(result.code).toBe('CLOCK_ROLLED_BACK');
      expect(result.error).toContain('تم ترجيع تاريخ وساعة الجهاز');
    });

    it('detects manual tampering of license-state.json HMAC', () => {
      const stateFile = path.join(tempDir, 'license-state.json');
      const now = new Date('2026-10-13T10:00:00.000Z');
      checkClockRollback(stateFile, now);

      // Malicious attempt to change lastSeen date directly in JSON file with bogus HMAC
      const tampered = {
        lastSeen: '2025-01-01T00:00:00.000Z',
        hmac: 'forged_fake_hmac_hex',
      };
      fs.writeFileSync(stateFile, JSON.stringify(tampered), 'utf8');

      const result = checkClockRollback(stateFile, now);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('CLOCK_TAMPERED');
    });
  });

  describe('4. LicenseManager Lifecycle Integration', () => {
    it('returns NOT_ACTIVATED when no license file exists in userData', () => {
      const mgr = new LicenseManager(tempDir);
      const status = mgr.getStatus();

      expect(status.isValid).toBe(false);
      expect(status.isActivated).toBe(false);
      expect(status.code).toBe('NOT_ACTIVATED');
      expect(status.machineCode).toBeTruthy();
    });

    it('successfully activates with a valid signed license and persists to license.json', () => {
      const mgr = new LicenseManager(tempDir);
      const currentMachineCode = mgr.getMachineCode();

      // Sign for current machine using embedded application public key's matching private key or test key
      const payload = {
        customerName: 'مؤسسة التجارة العالمية',
        machineIdHash: normalizeMachineCode(currentMachineCode),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'Enterprise',
      };
      const signedObj = signTestLicense(payload, testKeyPair.privateKey);

      // Mock verifyLicense on this instance or use test public key
      const base64Key = Buffer.from(JSON.stringify(signedObj)).toString('base64');
      
      // Verification using test key
      const verifyDirect = verifyLicense(signedObj, currentMachineCode, testKeyPair.publicKey, mgr.stateFilePath);
      expect(verifyDirect.valid).toBe(true);

      // Persist via manager
      const saved = mgr.saveLicense(signedObj);
      expect(saved).toBe(true);
      expect(fs.existsSync(mgr.licenseFilePath)).toBe(true);

      // Read back
      const loaded = mgr.loadSavedLicense();
      expect(loaded.payload.customerName).toBe('مؤسسة التجارة العالمية');
    });

    it('rejects activation when raw key input is completely malformed', () => {
      const mgr = new LicenseManager(tempDir);
      const res = mgr.activate('invalid_random_garbage_string');

      expect(res.success).toBe(false);
      expect(res.code).toBe('PARSE_ERROR');
    });
  });

  describe('5. Fail-Closed on Corrupted, Missing, or Truncated Files', () => {
    it('fails closed when license.json contains corrupt or invalid JSON', () => {
      const mgr = new LicenseManager(tempDir);
      fs.writeFileSync(mgr.licenseFilePath, '{"payload": {"customerName": "Test", incomplete_json...', 'utf8');

      const status = mgr.getStatus();
      expect(status.isValid).toBe(false);
      expect(status.isActivated).toBe(false);
    });

    it('fails closed when license.json is completely empty (0 bytes)', () => {
      const mgr = new LicenseManager(tempDir);
      fs.writeFileSync(mgr.licenseFilePath, '', 'utf8');

      const status = mgr.getStatus();
      expect(status.isValid).toBe(false);
      expect(status.isActivated).toBe(false);
    });

    it('fails closed when encrypted token .sys_activation.dat is corrupted', () => {
      const mgr = new LicenseManager(tempDir);
      fs.writeFileSync(mgr.tokenFilePath, 'corrupted_base64_or_random_bytes_XYZ!@#', 'utf8');

      const status = mgr.getStatus();
      expect(status.isValid).toBe(false);
      expect(status.isActivated).toBe(false);
    });
  });

  describe('6. Production Code Security Audit Scan', () => {
    it('verifies electron/main.js guards dev bypass with !app.isPackaged', () => {
      const mainPath = path.join(process.cwd(), 'electron/main.js');
      const content = fs.readFileSync(mainPath, 'utf8');

      expect(content).toContain('!app.isPackaged');
      expect(content).toContain('ALLOW_DEV_LICENSE_BYPASS');
    });

    it('verifies src/App.jsx enforces licenseStatus.isValid && licenseStatus.isActivated with no localStorage backdoor', () => {
      const appPath = path.join(process.cwd(), 'src/App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');

      expect(content).toContain('const isSystemActivated = Boolean(licenseStatus?.isValid && licenseStatus?.isActivated);');
      expect(content).not.toContain("localStorage.getItem('code_systems_activated')");
    });

    it('verifies ActivationScreen does not unconditionally allow skip in production', () => {
      const screenPath = path.join(process.cwd(), 'src/components/ActivationScreen.jsx');
      const content = fs.readFileSync(screenPath, 'utf8');

      expect(content).toContain('Boolean(onSkip)');
    });
  });

  describe('7. Edition Compatibility Checks', () => {
    it('rejects a license issued for standard edition when running cutting edition', () => {
      const mgr = new LicenseManager(tempDir, 'cutting');
      const code = mgr.getMachineCode();

      const payload = {
        customerName: 'مصنع قياسي',
        machineIdHash: normalizeMachineCode(code),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'standard',
      };
      const signed = signTestLicense(payload, testKeyPair.privateKey);

      // Verify license with 'cutting' expected edition
      const result = verifyLicense(signed, code, testKeyPair.publicKey, mgr.stateFilePath, new Date(), 'cutting');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EDITION_MISMATCH');
    });

    it('rejects a license issued for cutting edition when running standard edition', () => {
      const mgr = new LicenseManager(tempDir, 'standard');
      const code = mgr.getMachineCode();

      const payload = {
        customerName: 'مصنع ملابس قص',
        machineIdHash: normalizeMachineCode(code),
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        edition: 'cutting',
      };
      const signed = signTestLicense(payload, testKeyPair.privateKey);

      // Verify license with 'standard' expected edition
      const result = verifyLicense(signed, code, testKeyPair.publicKey, mgr.stateFilePath, new Date(), 'standard');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('EDITION_MISMATCH');
    });
  });

  describe('8. Asar Packaging Verification Rules', () => {
    it('verifies that electron/ files are included and private keys/tools are excluded in package.json build config', () => {
      const pkgPath = path.join(process.cwd(), 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const files = pkg.build.files;

      expect(files).toContain('electron/**/*');
      expect(files).toContain('!tools/**/*');
      expect(files).toContain('!**/*.pem');
      expect(files).toContain('!**/*.sqlite*');
      expect(files).toContain('!**/*.db*');
    });
  });
});
