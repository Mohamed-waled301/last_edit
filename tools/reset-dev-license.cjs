#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

// Verify not running inside packaged app
if (process.mainModule && process.mainModule.filename && process.mainModule.filename.includes('app.asar')) {
  console.error('[Error]: Cannot run license:reset-dev inside a packaged application.');
  process.exit(1);
}

const appDataDir = process.env.APPDATA || (
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : path.join(os.homedir(), '.config')
);

const targetFolders = [
  path.join(appDataDir, 'apex-apparel-erp'),
  path.join(appDataDir, 'code-systems-standard'),
  path.join(appDataDir, 'code-systems'),
];

console.log('==================================================');
console.log('   Code Systems - Development License Reset Tool   ');
console.log('==================================================');
console.log(`Detected AppData Directory: ${appDataDir}\n`);

let totalRemoved = 0;

for (const folder of targetFolders) {
  if (fs.existsSync(folder)) {
    console.log(`Inspecting userData folder: ${folder}`);
    const filesToClean = [
      'license.json',
      '.sys_activation.dat',
      'license-state.json',
    ];

    let folderCleaned = false;
    for (const file of filesToClean) {
      const filePath = path.join(folder, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`  [REMOVED]: ${filePath}`);
          totalRemoved++;
          folderCleaned = true;
        } catch (err) {
          console.warn(`  [FAILED TO REMOVE]: ${filePath} - ${err.message}`);
        }
      }
    }

    if (folderCleaned) {
      console.log(`  -> Successfully cleaned license files in: ${folder}\n`);
    } else {
      console.log(`  -> No license files found in: ${folder}\n`);
    }
  } else {
    console.log(`Folder does not exist yet: ${folder}`);
  }
}

console.log('--------------------------------------------------');
console.log(`Reset complete. Total removed license files: ${totalRemoved}`);
console.log('Restart the application to see the activation screen.');
console.log('==================================================\n');
