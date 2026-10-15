#!/usr/bin/env node
/**
 * scripts/verify-release-artifacts.cjs
 * Strict Allow-List & Content Validator for Shipped Release Binaries.
 * CI will FAIL if any non-allowed, unexpected, or corrupted files exist.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Strict Allow-List Patterns (Exact Match for Approved Artifacts)
const APPROVED_EXE_PATTERNS = [
  /^code-systems-cutting-Setup-[\d\w.-]+\.exe$/i,
  /^code-systems-cutting-Portable-[\d\w.-]+\.exe$/i,
  /^code-systems-standard-Setup-[\d\w.-]+\.exe$/i,
  /^code-systems-standard-Portable-[\d\w.-]+\.exe$/i,
];

// Explicit Forbidden File Extensions and Names
const FORBIDDEN_PATTERNS = [
  /\.[jt]sx?$/i,         // JavaScript / TypeScript source
  /\.json$/i,            // JSON configs or licenses
  /\.map$/i,             // Source maps
  /\.pdb$/i,             // Debug symbols
  /\.pem$/i,             // Private or public keys
  /\.key$/i,             // Key files
  /\.lic$/i,             // License files
  /^\.env/i,             // Environment files
  /\.log$/i,             // Logs
  /\.txt$/i,             // Text files
  /\.md$/i,              // Markdown docs in release folder
  /builder-debug\.yml$/i,
  /builder-effective-config\.yaml$/i,
  /license-generator/i,
];

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Validates that an executable file is a legitimate Windows PE binary (checks MZ header)
 * and meets minimum sanity thresholds.
 */
function validateExecutableContent(filePath, fileName) {
  const stats = fs.statSync(filePath);
  if (stats.size < 5 * 1024 * 1024) {
    return `Executable ${fileName} is suspiciously small (${(stats.size / 1024).toFixed(1)} KB). Expected > 5MB.`;
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(2);
  fs.readSync(fd, buffer, 0, 2, 0);
  fs.closeSync(fd);

  // Check MZ header (0x4D, 0x5A)
  if (buffer[0] !== 0x4D || buffer[1] !== 0x5A) {
    return `File ${fileName} does not contain valid Windows PE executable magic bytes ('MZ').`;
  }

  return null;
}

function verifyReleaseArtifacts(releaseDir, autoUpdateEnabled = false) {
  if (!fs.existsSync(releaseDir)) {
    console.error(`❌ [Error] Release output directory not found: ${releaseDir}`);
    return false;
  }

  console.log(`\n======================================================`);
  console.log(`[Strict Release Artifacts Audit] Directory: ${path.resolve(releaseDir)}`);
  console.log(`Auto-Update Enabled: ${autoUpdateEnabled}`);
  console.log(`======================================================`);

  const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
  const approvedArtifacts = [];
  const violations = [];

  for (const entry of entries) {
    const fileName = entry.name;
    const fullPath = path.join(releaseDir, fileName);

    if (entry.isDirectory()) {
      if (fileName === 'win-unpacked') {
        // Internal packaging directory, must NOT be part of upload
        continue;
      }
      violations.push(`Unexpected directory detected in release folder: /${fileName}`);
      continue;
    }

    // Clean up internal builder diagnostic files so they are never bundled or uploaded
    if (fileName === 'builder-debug.yml' || fileName === 'builder-effective-config.yaml') {
      try {
        fs.unlinkSync(fullPath);
        console.log(`  [Excluded & Removed] Internal builder config cleaned up: ${fileName}`);
      } catch {}
      continue;
    }

    // Check against forbidden list
    const isForbidden = FORBIDDEN_PATTERNS.some((pattern) => pattern.test(fileName));
    if (isForbidden) {
      violations.push(`FORBIDDEN file detected in release folder: ${fileName}`);
      continue;
    }

    // Auto-update files handling
    if (fileName === 'latest.yml' || fileName.endsWith('.blockmap')) {
      if (!autoUpdateEnabled) {
        console.log(`  [Excluded] Auto-update disabled, skipping: ${fileName}`);
        continue;
      } else {
        // If auto-update is enabled, allow latest.yml and blockmaps
        const stats = fs.statSync(fullPath);
        approvedArtifacts.push({
          name: fileName,
          path: fullPath,
          sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
          sha256: calculateSha256(fullPath),
        });
        continue;
      }
    }

    // Check against approved executable patterns
    const isApprovedExe = APPROVED_EXE_PATTERNS.some((pattern) => pattern.test(fileName));
    if (isApprovedExe) {
      // Validate content & PE header
      const contentError = validateExecutableContent(fullPath, fileName);
      if (contentError) {
        violations.push(contentError);
        continue;
      }

      const stats = fs.statSync(fullPath);
      const sha256 = calculateSha256(fullPath);
      approvedArtifacts.push({
        name: fileName,
        path: fullPath,
        sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
        sha256,
      });
    } else {
      violations.push(`File is NOT on the approved release allow-list: ${fileName}`);
    }
  }

  console.log(`\n--- Approved Release Artifacts (${approvedArtifacts.length} files) ---`);
  for (const file of approvedArtifacts) {
    console.log(`  ✓ ${file.name} (${file.sizeMb} MB) | SHA-256: ${file.sha256}`);
  }

  if (violations.length > 0) {
    console.error(`\n❌ [STRICT AUDIT FAILED] Violations detected in release folder:`);
    for (const v of violations) {
      console.error(`   ✗ ${v}`);
    }
    console.error(`\nAborting release. Shipped artifacts must conform strictly to the allow-list.`);
    return false;
  }

  if (approvedArtifacts.length === 0) {
    console.error(`\n❌ [STRICT AUDIT FAILED] No approved executable (.exe) files found in ${releaseDir}`);
    return false;
  }

  console.log(`\n✅ [STRICT AUDIT PASSED] All ${approvedArtifacts.length} release artifacts verified for names, PE headers, and allow-list.`);
  return true;
}

const dir = process.argv[2] || path.join(__dirname, '../release');
const autoUpdate = process.argv.includes('--with-updates');
const passed = verifyReleaseArtifacts(dir, autoUpdate);
process.exit(passed ? 0 : 1);
