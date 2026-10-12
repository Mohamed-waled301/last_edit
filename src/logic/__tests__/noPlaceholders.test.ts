import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Pattern matching any placeholder attribute on HTML/JSX elements: placeholder="..." or placeholder={...}
const PLACEHOLDER_ATTRIBUTE_REGEX = /\bplaceholder\s*=/i;

function walkDir(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', '.git', 'dist', '.agents'].includes(file)) continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(full));
    } else if (/\.(jsx?|tsx?|html)$/.test(file)) {
      results.push(full);
    }
  }
  return results;
}

describe('Zero Placeholder Attributes Rule', () => {
  it('strictly verifies zero placeholder attributes on any element across src/ and index.html', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const sourceFiles = walkDir(srcDir);

    const indexHtml = path.resolve(__dirname, '../../../index.html');
    if (fs.existsSync(indexHtml)) {
      sourceFiles.push(indexHtml);
    }

    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of sourceFiles) {
      if (filePath.includes('noPlaceholders.test')) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (PLACEHOLDER_ATTRIBUTE_REGEX.test(line)) {
          violations.push({
            file: path.relative(path.resolve(__dirname, '../../../'), filePath),
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const summary = violations
        .map(v => `${v.file}:${v.line} -> ${v.text}`)
        .join('\n');
      expect.fail(`Found ${violations.length} forbidden placeholder attribute occurrences:\n${summary}`);
    }

    expect(violations).toHaveLength(0);
  });
});
