// House rule: no comment longer than two lines. JSDoc tag lines (@param, @returns) do not
// count; the provided assignment files and generated output are exempt.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAX_LINES = 2;
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist']);
const PROVIDED = new Set(['malicious.html', 'benign.html']);
const EXTENSIONS = new Set(['.js', '.html', '.css', '.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(full);
    }
    const provided = dir === ROOT && PROVIDED.has(entry.name);
    return EXTENSIONS.has(path.extname(entry.name)) && !provided ? [full] : [];
  });
}

/** Counts prose lines in a block comment, skipping delimiters and JSDoc tags. */
function proseLineCount(lines: string[]): number {
  let inTag = false;
  let count = 0;
  for (const raw of lines) {
    const line = raw
      .trim()
      .replace(/^(\/\*\*?|<!--)|(\*\/|-->)$/g, '')
      .replace(/^\*\s?/, '')
      .trim();
    if (line.startsWith('@')) {
      inTag = true;
    } else if (line === '') {
      inTag = false;
    } else if (!inTag) {
      count += 1;
    }
  }
  return count;
}

/** Index of the last line of a run of // comments starting at `start`. */
function lastLineOfRun(lines: string[], start: number): number {
  let end = start;
  while (end + 1 < lines.length && (lines[end + 1] ?? '').trim().startsWith('//')) {
    end += 1;
  }
  return end;
}

function lastLineOfBlock(lines: string[], start: number, close: string): number {
  let end = start;
  while (end < lines.length - 1 && !(lines[end] ?? '').includes(close)) {
    end += 1;
  }
  return end;
}

function longComments(source: string): Array<{ line: number; length: number }> {
  const lines = source.split('\n');
  const found = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = (lines[index] ?? '').trim();
    let end = index;
    let length = 0;
    if (text.startsWith('//')) {
      end = lastLineOfRun(lines, index);
      length = end - index + 1;
    } else if (text.startsWith('/*') || text.startsWith('<!--')) {
      end = lastLineOfBlock(lines, index, text.startsWith('<!--') ? '-->' : '*/');
      length = proseLineCount(lines.slice(index, end + 1));
    }
    if (length > MAX_LINES) {
      found.push({ line: index + 1, length });
    }
    index = end;
  }
  return found;
}

test('no comment is longer than two lines', () => {
  const offenders = sourceFiles(ROOT).flatMap((file) =>
    longComments(readFileSync(file, 'utf8')).map(
      ({ line, length }) => `${path.relative(ROOT, file)}:${line} (${length} lines)`,
    ),
  );
  assert.deepEqual(offenders, []);
});

test('the checker itself catches a three-line comment', () => {
  assert.equal(longComments('// one\n// two\n// three\nconst x = 1;').length, 1);
  assert.equal(longComments('/**\n * one\n * two\n * @param x a number\n */').length, 0);
  assert.equal(longComments('<!--\n  one\n  two\n  three\n-->').length, 1);
});
