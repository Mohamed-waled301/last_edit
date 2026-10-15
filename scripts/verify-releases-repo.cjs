#!/usr/bin/env node
/**
 * scripts/verify-releases-repo.cjs
 * Verifies that a public releases repository contains ONLY allowed files:
 *   - README.md
 *   - LICENSE
 * (plus .git directory if inspecting a git clone)
 * Absolutely NO source code, no configs, no scripts, no package.json, no workflows.
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_FILES = new Set(['readme.md', 'license', 'license.txt', 'license.md']);
const ALLOWED_DIRS = new Set(['.git']);

function verifyDirectory(targetDir) {
  if (!fs.existsSync(targetDir)) {
    console.error(`[Error] Target directory does not exist: ${targetDir}`);
    return false;
  }

  console.log(`\n======================================================`);
  console.log(`[Releases Repo Audit] Inspecting: ${path.resolve(targetDir)}`);
  console.log(`======================================================`);

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  const violations = [];
  const allowedFound = [];

  for (const entry of entries) {
    const nameLower = entry.name.toLowerCase();
    if (entry.isDirectory()) {
      if (!ALLOWED_DIRS.has(nameLower)) {
        violations.push(`Forbidden directory detected: /${entry.name}`);
      }
    } else if (entry.isFile()) {
      if (ALLOWED_FILES.has(nameLower)) {
        allowedFound.push(entry.name);
      } else {
        violations.push(`Forbidden file detected: ${entry.name}`);
      }
    }
  }

  console.log(`[Allowed Files Found]:`, allowedFound.length > 0 ? allowedFound.join(', ') : 'None');

  if (violations.length > 0) {
    console.error(`\n❌ [AUDIT FAILED] Forbidden files/directories detected in releases repo:`);
    for (const v of violations) {
      console.error(`   - ${v}`);
    }
    console.error(`\nThe public releases repo must contain ONLY README.md and LICENSE.`);
    return false;
  }

  if (!allowedFound.some((f) => f.toLowerCase() === 'readme.md')) {
    console.error(`\n❌ [AUDIT FAILED] Missing required README.md file.`);
    return false;
  }

  console.log(`\n✅ [AUDIT PASSED] Releases repository tree is 100% clean and contains ONLY allowed documentation.`);
  return true;
}

const target = process.argv[2] || path.join(__dirname, '../releases-repo-template/unified');
const success = verifyDirectory(target);
process.exit(success ? 0 : 1);
