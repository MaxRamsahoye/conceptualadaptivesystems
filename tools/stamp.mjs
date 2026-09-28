#!/usr/bin/env node
// Version-stamp asset URLs (`?v=<hash>`) so a deploy switches every file over
// at once instead of browsers mixing freshly fetched files with cached ones.
//
//   node tools/stamp.mjs          # rewrite stamps (run before committing site changes)
//   node tools/stamp.mjs --check  # exit 1 if any stamp is stale
//
// Each file's hash covers its content *after* its own references are stamped,
// so changing markdown.js also changes deck.js, render.js, viewer.js, … .

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

// Relative references to local assets inside quotes or url(...).
const REF = /(["'(])((?:\.\.?\/)?(?:[\w-]+\/)*[\w.-]+\.(?:js|css|woff2|svg))(?:\?v=[0-9a-f]*)?(?=["')])/g;

// Stamp order: dependencies before the files that reference them.
const FILES = [
  'assets/css/fonts.css',
  'assets/css/slides.css',
  'assets/css/site.css',
  'assets/js/markdown.js',
  'assets/js/theme.js',
  'assets/js/deck.js',
  'assets/js/render.js',
  'assets/js/library.js',
  'assets/js/viewer.js',
  'index.html',
  'deck.html',
];

const hashes = new Map(); // absolute path -> short hash
const hashOf = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

async function hashFile(abs) {
  if (!hashes.has(abs)) hashes.set(abs, hashOf(await readFile(abs)));
  return hashes.get(abs);
}

let stale = [];
for (const rel of FILES) {
  const abs = join(root, rel);
  const src = await readFile(abs, 'utf8');
  const parts = [];
  let last = 0;
  for (const m of src.matchAll(REF)) {
    const [whole, open, ref] = m;
    const target = resolve(dirname(abs), ref);
    if (!target.startsWith(root)) continue;
    let v;
    try { v = await hashFile(target); } catch { continue; } // not a local file
    parts.push(src.slice(last, m.index), `${open}${ref}?v=${v}`);
    last = m.index + whole.length;
  }
  parts.push(src.slice(last));
  const out = parts.join('');
  hashes.set(abs, hashOf(out));
  if (out !== src) {
    stale.push(relative(root, abs));
    if (!check) await writeFile(abs, out);
  }
}

if (check) {
  if (stale.length) {
    console.log(`✖ stale asset stamps in: ${stale.join(', ')} — run \`node tools/stamp.mjs\``);
    process.exit(1);
  }
  console.log('asset stamps up to date');
} else {
  console.log(stale.length ? `stamped: ${stale.join(', ')}` : 'asset stamps already up to date');
}
