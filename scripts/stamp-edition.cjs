#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const edition = process.argv[2];
if (edition !== 'cutting' && edition !== 'standard') {
  console.error('[stamp-edition] Error: Expected edition to be "cutting" or "standard", got:', edition);
  process.exit(1);
}

const targetFile = path.join(__dirname, '..', 'electron', 'edition.json');
const payload = JSON.stringify({ edition }, null, 2);
fs.writeFileSync(targetFile, payload, 'utf8');
console.log(`[stamp-edition] Successfully stamped edition "${edition}" to ${targetFile}`);
