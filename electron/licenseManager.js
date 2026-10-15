const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { LICENSE_PUBLIC_KEY } = require('./license-public-key');

const APP_SALT = 'APEX-APPAREL-ERP-DEVICE-BOUND-SALT-2026-X99';
const HMAC_CLOCK_SECRET = 'APEX-ERP-CLOCK-TAMPER-SECRET-K391';

function getRawMachineId() {
  if (process.platform === 'win32') {
    try {
      const output = execSync('REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = output.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/i);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch {
      // Fallback below
    }
  }

  try {
    const interfaces = os.networkInterfaces();
    const macs = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macs.push(net.mac);
        }
      }
    }
    if (macs.length > 0) {
      return macs.sort().join(';');
    }
  } catch {}

  return `${os.hostname()}-${os.platform()}-${os.arch()}-${os.userInfo().username}`;
}

function deriveMachineCode(rawId) {
  const cleanId = String(rawId || 'FALLBACK-DEVICE-ID').trim().toLowerCase();
  const sha = crypto.createHash('sha256').update(`${cleanId}:${APP_SALT}`).digest('hex').toUpperCase();
  const hex16 = sha.slice(0, 16);
  return hex16.match(/.{1,4}/g).join('-');
}

function normalizeMachineCode(code) {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function canonicalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const keys = Object.keys(payload).sort();
  const ordered = {};
  for (const k of keys) {
    ordered[k] = payload[k];
  }
  return JSON.stringify(ordered);
}

function parseLicenseInput(rawInput) {
  if (!rawInput) return null;
  if (typeof rawInput === 'object') return rawInput;

  const str = String(rawInput).trim();
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      return JSON.parse(str);
    } catch {}
  }

  try {
    const decoded = Buffer.from(str, 'base64').toString('utf8');
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      return JSON.parse(decoded);
    }
  } catch {}

  return null;
}

function writeClockState(stateFilePath, lastSeenIso) {
  const dir = path.dirname(stateFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const hmac = crypto.createHmac('sha256', HMAC_CLOCK_SECRET).update(lastSeenIso).digest('hex');
  fs.writeFileSync(stateFilePath, JSON.stringify({ lastSeen: lastSeenIso, hmac }, null, 2), 'utf8');
}

function checkClockRollback(stateFilePath, now = new Date()) {
  try {
    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    if (fs.existsSync(stateFilePath)) {
      const content = fs.readFileSync(stateFilePath, 'utf8');
      const state = JSON.parse(content);
      const { lastSeen, hmac } = state;

      if (!lastSeen || !hmac) {
        writeClockState(stateFilePath, nowIso);
        return { valid: true };
      }

      const expectedHmac = crypto.createHmac('sha256', HMAC_CLOCK_SECRET).update(lastSeen).digest('hex');
      if (expectedHmac !== hmac) {
        return {
          valid: false,
          error: 'تم اكتشاف تلاعب في سجلات توقيت الجهاز',
          code: 'CLOCK_TAMPERED',
        };
      }

      const lastSeenMs = new Date(lastSeen).getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      // Rollback detected if current clock is earlier than last recorded by more than 1 day
      if (nowMs < (lastSeenMs - ONE_DAY_MS)) {
        return {
          valid: false,
          error: 'تم ترجيع تاريخ وساعة الجهاز، يرجى ضبط توقيت النظام',
          code: 'CLOCK_ROLLED_BACK',
        };
      }

      if (nowMs > lastSeenMs) {
        writeClockState(stateFilePath, nowIso);
      }
    } else {
      writeClockState(stateFilePath, nowIso);
    }
    return { valid: true };
  } catch (err) {
    try {
      writeClockState(stateFilePath, now.toISOString());
    } catch {}
    return { valid: true };
  }
}

function verifyLicense(licenseData, currentMachineCode, publicKeyPem = LICENSE_PUBLIC_KEY, stateFilePath = null, now = new Date(), expectedEdition = null) {
  if (!licenseData || typeof licenseData !== 'object' || !licenseData.payload || !licenseData.signature) {
    return {
      valid: false,
      error: 'ملف الترخيص غير صالح أو تالف',
      code: 'INVALID_FORMAT',
    };
  }

  const { payload, signature } = licenseData;
  const canonical = canonicalizePayload(payload);

  // 1. Ed25519 signature check
  let signatureValid = false;
  try {
    const sigBuffer = Buffer.from(signature, 'base64');
    signatureValid = crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKeyPem, sigBuffer);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return {
      valid: false,
      error: 'ملف الترخيص غير صالح أو تم التلاعب به',
      code: 'INVALID_SIGNATURE',
    };
  }

  // 2. Machine code binding check
  const expectedMachine = normalizeMachineCode(payload.machineIdHash);
  const currentMachine = normalizeMachineCode(currentMachineCode);

  if (!expectedMachine || expectedMachine !== currentMachine) {
    return {
      valid: false,
      error: 'الترخيص مخصص لجهاز آخر ولا يعمل على هذا الجهاز',
      code: 'MACHINE_MISMATCH',
      customerName: payload.customerName,
      expectedMachine,
      currentMachine,
    };
  }

  // 3. Edition check (if specified)
  if (expectedEdition) {
    const rawLicEdition = String(payload.edition || '').trim().toLowerCase();
    const rawExpected = String(expectedEdition).trim().toLowerCase();
    const isCuttingMatch = rawExpected === 'cutting' && (rawLicEdition === 'cutting' || rawLicEdition === 'enterprise');
    const isStandardMatch = rawExpected === 'standard' && rawLicEdition === 'standard';

    if (!isCuttingMatch && !isStandardMatch) {
      return {
        valid: false,
        error: 'هذا الترخيص لا يخص هذا الإصدار من النظام',
        code: 'EDITION_MISMATCH',
        customerName: payload.customerName,
        expectedEdition,
        licenseEdition: payload.edition,
      };
    }
  }

  // 4. Expiry check
  let daysRemaining = null;
  let isExpiringSoon = false;

  if (payload.expiresAt) {
    const expiryDate = new Date(payload.expiresAt);
    if (isNaN(expiryDate.getTime())) {
      return {
        valid: false,
        error: 'تاريخ انتهاء الترخيص غير صالح',
        code: 'INVALID_EXPIRY',
      };
    }

    if (now.getTime() > expiryDate.getTime()) {
      return {
        valid: false,
        error: 'انتهت صلاحية هذا الترخيص',
        code: 'EXPIRED',
        customerName: payload.customerName,
        expiresAt: payload.expiresAt,
        isExpired: true,
      };
    }

    const diffMs = expiryDate.getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    if (daysRemaining <= 14) {
      isExpiringSoon = true;
    }
  }

  // 5. Clock Rollback check
  if (stateFilePath) {
    const clockCheck = checkClockRollback(stateFilePath, now);
    if (!clockCheck.valid) {
      return {
        valid: false,
        error: clockCheck.error,
        code: 'CLOCK_ROLLED_BACK',
        isClockRolledBack: true,
        customerName: payload.customerName,
      };
    }
  }

  return {
    valid: true,
    customerName: payload.customerName,
    edition: payload.edition || 'cutting',
    expiresAt: payload.expiresAt || null,
    issuedAt: payload.issuedAt || null,
    daysRemaining,
    isExpiringSoon,
    machineCode: currentMachineCode,
  };
}

class LicenseManager {
  constructor(userDataPath, edition = null) {
    this.userDataPath = userDataPath;
    this.edition = edition || process.env.EDITION || 'cutting';
    this.tokenFilePath = path.join(userDataPath, '.sys_activation.dat');
    this.licenseFilePath = path.join(userDataPath, 'license.json');
    this.stateFilePath = path.join(userDataPath, 'license-state.json');
    this._cachedMachineCode = null;
  }

  getMachineCode() {
    if (!this._cachedMachineCode) {
      const rawId = getRawMachineId();
      this._cachedMachineCode = deriveMachineCode(rawId);
    }
    return this._cachedMachineCode;
  }

  _deriveDeviceKey() {
    const rawId = getRawMachineId();
    return crypto.createHash('sha256').update(`${rawId}:${APP_SALT}:SYS_LOCK_2026`).digest();
  }

  _encryptRecord(record) {
    const key = this._deriveDeviceKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const jsonStr = JSON.stringify(record);
    const enc = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  _decryptRecord(encBase64) {
    try {
      const buf = Buffer.from(encBase64, 'base64');
      if (buf.length < 28) return null;
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const enc = buf.subarray(28);
      const key = this._deriveDeviceKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
      return JSON.parse(dec);
    } catch {
      return null;
    }
  }

  saveLicense(signedObj) {
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.licenseFilePath, JSON.stringify(signedObj, null, 2), 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  loadSavedLicense() {
    try {
      if (fs.existsSync(this.licenseFilePath)) {
        const content = fs.readFileSync(this.licenseFilePath, 'utf8');
        return parseLicenseInput(content);
      }
    } catch (err) {
      console.warn('[LicenseManager] Failed to read saved license:', err);
    }
    return null;
  }

  saveActivationRecord(payload) {
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      const rawId = getRawMachineId();
      const hmac = crypto.createHmac('sha256', APP_SALT)
        .update(`${rawId}:${payload.customerName}:${payload.issuedAt || ''}:${payload.expiresAt || ''}`)
        .digest('hex');

      const record = {
        hmac,
        customerName: payload.customerName,
        edition: payload.edition || this.edition || 'cutting',
        expiresAt: payload.expiresAt || null,
        issuedAt: payload.issuedAt || null,
        machineCode: this.getMachineCode(),
        activatedAt: new Date().toISOString()
      };

      const encrypted = this._encryptRecord(record);
      fs.writeFileSync(this.tokenFilePath, encrypted, 'utf8');
      return true;
    } catch (err) {
      console.error('[LicenseManager] Failed to save activation record:', err);
      return false;
    }
  }

  getStatus() {
    const machineCode = this.getMachineCode();
    const rawId = getRawMachineId();

    // 1. Check saved license file first if present
    const saved = this.loadSavedLicense();
    if (saved) {
      const verification = verifyLicense(saved, machineCode, LICENSE_PUBLIC_KEY, this.stateFilePath, new Date(), this.edition);
      if (verification.valid) {
        return {
          isValid: true,
          isActivated: true,
          machineCode,
          customerName: verification.customerName || null,
          edition: verification.edition || this.edition,
          expiresAt: verification.expiresAt || null,
          daysRemaining: verification.daysRemaining ?? null,
          isExpiringSoon: verification.isExpiringSoon ?? false,
          isPermanent: !verification.expiresAt,
          error: null,
          code: null
        };
      } else {
        return {
          isValid: false,
          isActivated: false,
          machineCode,
          customerName: verification.customerName || null,
          edition: verification.edition || this.edition,
          error: verification.error || 'الترخيص المحفوظ غير صالح',
          code: verification.code || 'INVALID_LICENSE',
        };
      }
    }

    // 2. Check encrypted activation record if license.json is absent
    if (fs.existsSync(this.tokenFilePath)) {
      try {
        const encData = fs.readFileSync(this.tokenFilePath, 'utf8');
        const record = this._decryptRecord(encData);
        if (record && record.hmac) {
          const expectedHmac = crypto.createHmac('sha256', APP_SALT)
            .update(`${rawId}:${record.customerName}:${record.issuedAt || ''}:${record.expiresAt || ''}`)
            .digest('hex');

          if (expectedHmac === record.hmac) {
            // Check edition match
            const rawLicEdition = String(record.edition || '').trim().toLowerCase();
            const rawExpected = String(this.edition || 'cutting').trim().toLowerCase();
            const isCuttingMatch = rawExpected === 'cutting' && (rawLicEdition === 'cutting' || rawLicEdition === 'enterprise');
            const isStandardMatch = rawExpected === 'standard' && rawLicEdition === 'standard';

            if (!isCuttingMatch && !isStandardMatch) {
              return {
                isValid: false,
                isActivated: false,
                machineCode,
                error: 'هذا الترخيص لا يخص هذا الإصدار من النظام',
                code: 'EDITION_MISMATCH',
              };
            }

            // Check expiry if set
            if (record.expiresAt) {
              const expDate = new Date(record.expiresAt);
              if (!isNaN(expDate.getTime()) && Date.now() > expDate.getTime()) {
                return {
                  isValid: false,
                  isActivated: false,
                  machineCode,
                  isExpired: true,
                  error: 'انتهت صلاحية الترخيص المسجل',
                  code: 'EXPIRED'
                };
              }
            }

            return {
              isValid: true,
              isActivated: true,
              machineCode,
              customerName: record.customerName,
              edition: record.edition || this.edition,
              expiresAt: record.expiresAt || null,
              daysRemaining: null,
              isExpiringSoon: false,
              isExpired: false,
              isPermanent: !record.expiresAt,
              error: null,
              code: null
            };
          }
        }
      } catch (err) {
        console.warn('[LicenseManager] Failed to read encrypted token:', err);
      }
    }

    return {
      isValid: false,
      isActivated: false,
      machineCode,
      error: 'التطبيق غير مفعل على هذا الجهاز',
      code: 'NOT_ACTIVATED'
    };
  }

  activate(rawInput) {
    const machineCode = this.getMachineCode();
    const parsed = parseLicenseInput(rawInput);

    if (!parsed) {
      return {
        success: false,
        isValid: false,
        error: 'صيغة كود الترخيص غير صالحة',
        code: 'PARSE_ERROR',
      };
    }

    const verification = verifyLicense(parsed, machineCode, LICENSE_PUBLIC_KEY, this.stateFilePath, new Date(), this.edition);
    if (!verification.valid) {
      return {
        success: false,
        isValid: false,
        error: verification.error,
        code: verification.code,
      };
    }

    // Save both human-readable / portable license.json and encrypted device-bound token
    this.saveLicense(parsed);
    const savedOk = this.saveActivationRecord(parsed.payload);
    if (!savedOk) {
      return {
        success: false,
        isValid: false,
        error: 'فشل حفظ سجل التفعيل على الجهاز',
        code: 'SAVE_FAILED',
      };
    }

    return {
      success: true,
      isValid: true,
      isActivated: true,
      customerName: verification.customerName,
      edition: verification.edition,
      expiresAt: verification.expiresAt,
      daysRemaining: verification.daysRemaining,
      isExpiringSoon: verification.isExpiringSoon,
      machineCode,
    };
  }
}

module.exports = {
  APP_SALT,
  HMAC_CLOCK_SECRET,
  getRawMachineId,
  deriveMachineCode,
  normalizeMachineCode,
  canonicalizePayload,
  parseLicenseInput,
  checkClockRollback,
  writeClockState,
  verifyLicense,
  LicenseManager,
};
