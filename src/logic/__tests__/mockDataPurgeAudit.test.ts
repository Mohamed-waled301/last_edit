import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Production Code Mock Data Purge Audit', () => {
  const forbiddenPhrases = [
    'خالد المنشاوي',
    'المنشاوي',
    'أحمد محمود',
    'مجموعة القمة',
    'شركة القمة',
    'el-qemma',
    '300-456-789',
    '01001234567',
    '01098765432'
  ];

  function getProductionFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file === 'node_modules' || file === '__tests__' || file === '.git' || file === 'dist' || file === 'release') {
          continue;
        }
        getProductionFiles(fullPath, fileList);
      } else {
        if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.html')) {
          fileList.push(fullPath);
        }
      }
    }
    return fileList;
  }

  it('strictly verifies zero occurrences of sample person/company names or mock contacts in production code', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const prodFiles = getProductionFiles(srcDir);
    const violations: { file: string; phrase: string; line: number }[] = [];

    for (const filePath of prodFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const phrase of forbiddenPhrases) {
          if (line.includes(phrase)) {
            violations.push({
              file: path.relative(srcDir, filePath),
              phrase,
              line: i + 1
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map(v => `${v.file}:${v.line} contains forbidden mock data: "${v.phrase}"`)
        .join('\n');
      expect.fail(`Found forbidden mock data in production source files:\n${msg}`);
    }

    expect(violations.length).toBe(0);
  });
});
