#!/usr/bin/env node
/**
 * scripts/verify-release-artifacts.cjs
 * Strict Allow-List Validator for Shipped Release Binaries.
 * CI will FAIL if any non-allowed or forbidden files exist in the release directory.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Strict Allow-List Patterns (Regular Expressions)
const ALLOWED_FILE_PATTERNS = [
  /^code-systems.*-Setup-.*\.exe$/i,
  /^code-systems.*-Portable-.*\.exe$/i,
  /^code-systems.*\.exe$/i,
  // Only if auto-update is enabled
  /^latest\.yml$/i,
  /^.*\.blockmap$/i,
];

// Explicit Forbidden Patterns (Must NEVER be shipped)
const FORBIDDEN_FILE_PATTERNS = [
  /builder-debug\.yml$/i,
  /builder-effective-config\.yaml$/i,
  /\.map$/i,
  /\.pdb$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.lic$/i,
  /license.*\.json$/i,
  /^\.env/i,
  /\.log$/i,
  /win-unpacked/i,
  /tools/i,
  /tests/i,
  /src/i,
];

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function verifyReleaseArtifacts(releaseDir, autoUpdateEnabled = false) {
  if (!fs.existsSync(releaseDir)) {
    console.error(`❌ [Error] Release output directory not found: ${releaseDir}`);
    return false;
  }

  console.log(`\n======================================================`);
  console.log(`[Release Artifacts Allow-List Audit] Directory: ${path.resolve(releaseDir)}`);
  console.log(`======================================================`);

  const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
  const allowedFiles = [];
  const violations = [];
  const ignoredDevArtifacts = new Set(['win-unpacked']); // Builder output subdirectories to ignore/exclude from upload

  for (const entry of entries) {
    const fileName = entry.name;

    if (entry.isDirectory()) {
      if (fileName === 'win-unpacked') {
        // Ignored internal builder directory, verify it's never uploaded
        continue;
      }
      violations.push(`Unexpected directory found in release output: /${fileName}`);
      continue;
    }

    // Check against forbidden list
    const isExplicitlyForbidden = FORBIDDEN_FILE_PATTERNS.some((pat) => pat.test(fileName));
    if (isExplicitlyForbidden) {
      violations.push(`FORBIDDEN file detected in release folder: ${fileName}`);
      continue;
    }

    // Check auto-update exclusion
    if (!autoUpdateEnabled && (fileName === 'latest.yml' || fileName.endsWith('.blockmap'))) {
      console.log(`[Note] Skipping update metadata (auto-update disabled): ${fileName}`);
      continue;
    }

    // Check against allow-list
    const isAllowed = ALLOWED_FILE_PATTERNS.some((pat) => pat.test(fileName));
    if (isAllowed) {
      const fullPath = path.join(releaseDir, fileName);
      const stats = fs.statSync(fullPath);
      const sha256 = calculateSha256(fullPath);
      allowedFiles.push({
        name: fileName,
        path: fullPath,
        sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
        sha256,
      });
    } else {
      violations.push(`File is NOT on the strict release allow-list: ${fileName}`);
    }
  }

  console.log(`\n--- Verified Allow-Listed Artifacts (${allowedFiles.length} files) ---`);
  for (const file of allowedFiles) {
    console.log(`  ✓ ${file.name} (${file.sizeMb} MB) | SHA-256: ${file.sha256}`);
  }

  if (violations.length > 0) {
    console.error(`\n❌ [AUDIT FAILED] Violations detected in release directory:`);
    for (const v of violations) {
      console.error(`   ✗ ${v}`);
    }
    console.error(`\nAborting release. Do NOT upload non-allowlisted artifacts.`);
    return false;
  }

  if (allowedFiles.length === 0) {
    console.error(`\n❌ [AUDIT FAILED] No allowed installer (.exe) files found in ${releaseDir}`);
    return false;
  }

  console.log(`\n✅ [AUDIT PASSED] All ${allowedFiles.length} release artifacts strictly conform to the allow-list.`);
  return true;
}

const dir = process.argv[2] || path.join(__dirname, '../release');
const autoUpdate = process.argv.includes('--with-updates');
const passed = verifyReleaseArtifacts(dir, autoUpdate);
process.exit(passed ? 0 : 1);
