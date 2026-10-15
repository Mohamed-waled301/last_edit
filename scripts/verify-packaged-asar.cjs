#!/usr/bin/env node
/**
 * scripts/verify-packaged-asar.cjs
 * Hardening Audit: Inspects the packed app.asar archive to guarantee that
 * raw source files, private keys, test suites, generator tools, and source maps
 * NEVER leak into the production installer.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FORBIDDEN_ASAR_PATTERNS = [
  /\.map$/i,
  /\.pem$/i,
  /\.key$/i,
  /^[\\\/]tools([\\\/]|$)/i,
  /^[\\\/]tests([\\\/]|$)/i,
  /^[\\\/]src([\\\/]|$)/i,
  /\.test\.[jt]sx?$/i,
  /\.spec\.[jt]sx?$/i,
  /\.env/i,
  /private\.pem/i,
  /^[\\\/]\.git([\\\/]|$)/i,
];

function findAsarFile(targetDir) {
  const candidates = [
    path.join(targetDir, 'win-unpacked/resources/app.asar'),
    path.join(targetDir, 'resources/app.asar'),
    path.join(targetDir, 'app.asar'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

function verifyAsar(asarPath) {
  console.log(`\n======================================================`);
  console.log(`[ASAR Hardening Audit] Archive: ${path.resolve(asarPath)}`);
  console.log(`======================================================`);

  let fileListOutput = '';
  try {
    fileListOutput = execSync(`npx --yes @electron/asar list "${asarPath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
  } catch (err) {
    console.error(`❌ [Error] Failed to read asar archive:`, err.message);
    return false;
  }

  const lines = fileListOutput.split(/\r?\n/).filter(Boolean);
  console.log(`Total files inspected in asar: ${lines.length}`);

  const violations = [];

  for (const line of lines) {
    const cleanPath = line.trim();
    for (const pattern of FORBIDDEN_ASAR_PATTERNS) {
      if (pattern.test(cleanPath)) {
        violations.push(`Forbidden path inside asar: ${cleanPath} (matches ${pattern})`);
      }
    }
  }

  if (violations.length > 0) {
    console.error(`\n❌ [HARDENING AUDIT FAILED] Leaked files detected inside app.asar:`);
    for (const v of violations) {
      console.error(`   ✗ ${v}`);
    }
    console.error(`\nBuild rejected. Forbidden assets must be stripped before shipping.`);
    return false;
  }

  console.log(`\n✅ [HARDENING AUDIT PASSED] No source maps, private keys, tests, or generator tools exist inside app.asar.`);
  return true;
}

const inputPath = process.argv[2] || path.join(__dirname, '../release');
let asarPath = inputPath;
if (!inputPath.endsWith('.asar')) {
  asarPath = findAsarFile(inputPath);
}

if (!asarPath || !fs.existsSync(asarPath)) {
  console.log(`[Info] No app.asar found in ${inputPath}. (Run after electron-builder unpacked step).`);
  process.exit(0);
}

const ok = verifyAsar(asarPath);
process.exit(ok ? 0 : 1);
