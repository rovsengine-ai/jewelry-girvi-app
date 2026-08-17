type Dirent = { name: string; isDirectory(): boolean };

type Fs = {
  readdirSync: (dir: string, opts: { withFileTypes: true }) => Dirent[];
  readFileSync: (file: string, encoding: 'utf8') => string;
};

type Path = {
  join: (...parts: string[]) => string;
  relative: (from: string, to: string) => string;
};

const fs = jest.requireActual('fs') as Fs;
const path = jest.requireActual('path') as Path;
const APP_DIR = path.join(process.cwd(), 'src/app');

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...walkTsx(full));
      continue;
    }
    if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function isJsxTagStart(src: string, index: number): boolean {
  if (src[index] !== '<') return false;
  const next = src[index + 1];
  if (!next || !/[A-Za-z]/.test(next)) return false;
  const prev = src[index - 1];
  // Generics sit on an identifier (`useState<Foo>`). JSX tags do not.
  if (prev && /[A-Za-z0-9_$.]/.test(prev)) return false;
  return true;
}

function scanTagEnd(src: string, start: number): { end: number; selfClosing: boolean } | null {
  let i = start + 1;
  let quote: string | null = null;
  let brace = 0;
  while (i < src.length) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '{') {
      brace += 1;
      i += 1;
      continue;
    }
    if (ch === '}') {
      brace = Math.max(0, brace - 1);
      i += 1;
      continue;
    }
    if (brace > 0) {
      i += 1;
      continue;
    }
    if (ch === '=' && src[i + 1] === '>') {
      i += 2;
      continue;
    }
    if (ch === '/' && src[i + 1] === '>') {
      return { end: i + 2, selfClosing: true };
    }
    if (ch === '>') {
      return { end: i + 1, selfClosing: false };
    }
    i += 1;
  }
  return null;
}

function hardcodedJsxText(src: string): string[] {
  const found: string[] = [];
  for (let i = 0; i < src.length; i += 1) {
    if (!isJsxTagStart(src, i)) continue;
    const tag = scanTagEnd(src, i);
    if (!tag || tag.selfClosing) {
      if (tag) i = tag.end - 1;
      continue;
    }
    const after = src.slice(tag.end);
    const nextLt = after.indexOf('<');
    if (nextLt === -1) continue;
    const text = after.slice(0, nextLt);
    i = tag.end - 1;
    if (text.includes('{')) continue;
    if (!/[A-Za-z]{2,}/.test(text)) continue;
    found.push(text.replace(/\s+/g, ' ').trim());
  }
  return found;
}

describe('src/app has no hardcoded English JSX text nodes', () => {
  test('JSX text with two+ ASCII letters must come from {t(...)}', () => {
    const files = walkTsx(APP_DIR);
    const violations: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const snippet of hardcodedJsxText(src)) {
        violations.push(`${path.relative(APP_DIR, file)}: ${snippet}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
