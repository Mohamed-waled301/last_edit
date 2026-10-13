#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_OUTPUT_PATH = path.join(__dirname, '../../electron/license-public-key.js');

function canonicalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const keys = Object.keys(payload).sort();
  const ordered = {};
  for (const k of keys) {
    ordered[k] = payload[k];
  }
  return JSON.stringify(ordered);
}

function normalizeMachineCode(code) {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function initKeys() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    console.log('[License Generator] Private key already exists at:', PRIVATE_KEY_PATH);
    console.log('Skipping generation to prevent overwriting existing vendor key.');
    return;
  }

  console.log('[License Generator] Generating new Ed25519 vendor keypair...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

  fs.writeFileSync(PRIVATE_KEY_PATH, privatePem, { encoding: 'utf8', mode: 0o600 });
  console.log('[License Generator] Private key saved to (NEVER commit this):', PRIVATE_KEY_PATH);

  const jsContent = `// Embedded Ed25519 Public Key for offline license verification
module.exports = {
  LICENSE_PUBLIC_KEY: ${JSON.stringify(publicPem)}
};
`;
  fs.writeFileSync(PUBLIC_KEY_OUTPUT_PATH, jsContent, 'utf8');
  console.log('[License Generator] Public key embedded in application at:', PUBLIC_KEY_OUTPUT_PATH);
  console.log('Key initialization complete!');
}

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function issueLicense(args) {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('Error: Private key not found. Run "node cli.js init" first.');
    process.exit(1);
  }

  const customer = args.customer;
  const rawMachine = args.machine;
  const expires = args.expires || null;
  const edition = args.edition || 'Enterprise';
  const outFile = args.out || null;

  if (!customer || !rawMachine) {
    console.error('Usage: node cli.js issue --customer "<Name>" --machine "<XXXX-XXXX-XXXX-XXXX>" [--expires YYYY-MM-DD] [--edition <Edition>] [--out <file.lic>]');
    process.exit(1);
  }

  const normalizedMachine = normalizeMachineCode(rawMachine);
  if (normalizedMachine.length < 8) {
    console.error('Error: Invalid machine code provided.');
    process.exit(1);
  }

  let formattedExpires = null;
  if (expires) {
    const expDate = new Date(expires);
    if (isNaN(expDate.getTime())) {
      console.error('Error: Invalid expiry date format. Use YYYY-MM-DD.');
      process.exit(1);
    }
    // Set to end of day in UTC
    formattedExpires = expDate.toISOString().slice(0, 10) + 'T23:59:59.999Z';
  }

  const payload = {
    customerName: customer.trim(),
    machineIdHash: normalizedMachine,
    issuedAt: new Date().toISOString(),
    expiresAt: formattedExpires,
    edition: edition.trim(),
  };

  const canonical = canonicalizePayload(payload);
  const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const signatureBuffer = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKeyPem);
  const signatureBase64 = signatureBuffer.toString('base64');

  const licenseObject = {
    payload,
    signature: signatureBase64,
  };

  const licenseJson = JSON.stringify(licenseObject, null, 2);
  const licenseKeyString = Buffer.from(JSON.stringify(licenseObject)).toString('base64');

  console.log('\n========================================');
  console.log('       APEX APPAREL ERP LICENSE         ');
  console.log('========================================');
  console.log('Customer:    ', payload.customerName);
  console.log('Machine ID:  ', rawMachine.toUpperCase());
  console.log('Normalized:  ', payload.machineIdHash);
  console.log('Edition:     ', payload.edition);
  console.log('Issued At:   ', payload.issuedAt);
  console.log('Expires:     ', payload.expiresAt || 'Lifetime (دائم)');
  console.log('========================================');
  console.log('\n--- LICENSE KEY STRING (Copy & Paste to App) ---');
  console.log(licenseKeyString);
  console.log('------------------------------------------------\n');

  if (outFile) {
    const resolvedOut = path.resolve(process.cwd(), outFile);
    fs.writeFileSync(resolvedOut, licenseJson, 'utf8');
    console.log('License file written to:', resolvedOut);
  }

  return { licenseObject, licenseKeyString };
}

// CLI Command Router
const command = process.argv[2];
const options = parseArgs(process.argv.slice(3));

if (command === 'init') {
  initKeys();
} else if (command === 'issue') {
  issueLicense(options);
} else {
  console.log('Apex Apparel ERP License Tool');
  console.log('Commands:');
  console.log('  node cli.js init');
  console.log('  node cli.js issue --customer "<Name>" --machine "<Code>" [--expires YYYY-MM-DD] [--edition <Type>] [--out <file.lic>]');
}

module.exports = {
  canonicalizePayload,
  normalizeMachineCode,
  initKeys,
  issueLicense,
};
