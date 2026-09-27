#!/usr/bin/env node
// Validate decks without a browser: manifest entries, front matter, directives,
// missing local assets, and slides that are likely too dense to fit.
//
//   node tools/check.mjs            # every deck in decks/index.json
//   node tools/check.mjs welcome    # just one deck

import { readFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeck } from '../assets/js/deck.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decksDir = join(root, 'decks');
const exists = (p) => access(p).then(() => true, () => false);

const LIMITS = { words: 80, bullets: 7, codeLines: 16 };

let errors = 0;
let warnings = 0;
const err = (where, msg) => { errors++; console.log(`  ✖ ${where}: ${msg}`); };
const warn = (where, msg) => { warnings++; console.log(`  ⚠ ${where}: ${msg}`); };

const manifest = JSON.parse(await readFile(join(decksDir, 'index.json'), 'utf8'));
const listed = (manifest.decks || []).map((d) => (typeof d === 'string' ? d : d.id));
const only = process.argv[2];

const folders = (await readdir(decksDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
if (!only) {
  for (const f of folders) if (!listed.includes(f)) console.log(`⚠ decks/${f}/ is not listed in decks/index.json (it won't appear in the library).`), warnings++;
  const dupes = listed.filter((id, k) => listed.indexOf(id) !== k);
  for (const d of dupes) console.log(`✖ "${d}" is listed twice in decks/index.json.`), errors++;
}

for (const id of only ? [only] : listed) {
  console.log(`\n${id}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) warn('id', 'use lowercase letters, digits and hyphens for deck ids.');
  const file = join(decksDir, id, 'deck.md');
  if (!(await exists(file))) { err('deck', `decks/${id}/deck.md not found`); continue; }
  const deck = parseDeck(await readFile(file, 'utf8'), { id });

  if (!deck.meta.title || deck.meta.title === id) warn('front matter', 'add a `title:`');
  if (!deck.meta.description) warn('front matter', 'add a `description:` (shown in the library)');
  if (deck.meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(deck.meta.date))) warn('front matter', 'date should be YYYY-MM-DD');
  for (const w of deck.warnings) warn('parse', w);
  if (!deck.slides.length) err('deck', 'no slides');

  const ids = new Set();
  for (const s of deck.slides) {
    const where = `slide ${s.index + 1}${s.title ? ` “${s.title}”` : ''}`;
    if (s.id) { if (ids.has(s.id)) err(where, `duplicate id "${s.id}"`); ids.add(s.id); }

    // Local asset references.
    const refs = [...s.html.matchAll(/\s(?:src|poster|href)="([^"]+)"/g)].map((m) => m[1]);
    if (s.bg && /\.\w{2,5}$/.test(s.bg)) refs.push(s.bg);
    for (const ref of refs) {
      if (/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(ref)) continue;
      const path = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/&amp;/g, '&');
      if (!(await exists(join(decksDir, id, path)))) err(where, `missing file decks/${id}/${path}`);
    }
    for (const m of s.html.matchAll(/<img [^>]*alt=""[^>]*>/g)) warn(where, `image without alt text: ${m[0].slice(0, 60)}…`);

    // Density heuristics (the viewer's overflow check is authoritative).
    const bullets = (s.html.match(/<li[\s>]/g) || []).length;
    const codeLines = Math.max(0, ...[...s.html.matchAll(/<pre[\s\S]*?<\/pre>/g)].map((m) => m[0].split('\n').length));
    if (s.wordCount > LIMITS.words && s.layout !== 'full') warn(where, `${s.wordCount} words — likely too dense (aim for < ${LIMITS.words})`);
    if (bullets > LIMITS.bullets) warn(where, `${bullets} list items — consider splitting`);
    if (codeLines > LIMITS.codeLines) warn(where, `${codeLines}-line code block — may not fit`);
  }
  console.log(`  ${deck.slides.length} slides, theme ${deck.meta.theme}, ${deck.meta.aspect}`);
}

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
