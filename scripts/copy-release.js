import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = 'C:\\Users\\kaled\\erp-release';
const targetDir = path.resolve(__dirname, '..', 'release');

console.log(`[Release Copier] Copying artifacts from ${sourceDir} to ${targetDir}...`);

if (!fs.existsSync(sourceDir)) {
  console.warn(`[Release Copier] Source directory ${sourceDir} does not exist.`);
  process.exit(0);
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Copy .exe installers and portable exes, or directories
const items = fs.readdirSync(sourceDir);
for (const item of items) {
  const srcItem = path.join(sourceDir, item);
  const dstItem = path.join(targetDir, item);

  try {
    const stat = fs.statSync(srcItem);
    if (stat.isFile()) {
      fs.copyFileSync(srcItem, dstItem);
      console.log(`✓ Copied file: ${item}`);
    } else if (stat.isDirectory()) {
      fs.cpSync(srcItem, dstItem, { recursive: true });
      console.log(`✓ Copied directory: ${item}`);
    }
  } catch (err) {
    console.warn(`! Note copying ${item}:`, err.message);
  }
}

console.log(`\n🎉 All desktop release files are available in: ${targetDir}`);
