import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Comprehensive pattern matching emojis, pictographic symbols, and decorative marks
const EMOJI_AND_DECORATIVE_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2B50}\u{2705}\u{2714}\u{2713}\u{26A0}\u{1F4CC}\u{2630}\u{2715}\u{2716}\u{274C}\u{232B}\u{2190}-\u{21FF}\p{Extended_Pictographic}]/u;

function walkDir(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (['node_modules', '.git', 'dist'].includes(file)) continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(full));
    } else if (/\.(jsx?|tsx?|html|css|json)$/.test(file)) {
      results.push(full);
    }
  }
  return results;
}

describe('Emoji and Decorative Symbols Rule', () => {
  it('strictly verifies zero emojis or decorative symbols in any source files under src/', () => {
    const srcDir = path.resolve(__dirname, '../../');
    const sourceFiles = walkDir(srcDir);
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const filePath of sourceFiles) {
      // Don't test this test file itself for regex definitions
      if (filePath.includes('noEmojis.test')) continue;

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (EMOJI_AND_DECORATIVE_REGEX.test(line)) {
          violations.push({
            file: path.relative(srcDir, filePath),
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
      expect.fail(`Found ${violations.length} forbidden emoji/symbol occurrences:\n${summary}`);
    }

    expect(violations).toHaveLength(0);
  });
});
