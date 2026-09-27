// Deck parser: turns a deck.md source into { meta, slides, warnings }.
// Pure string code (no DOM) so the validator in tools/ can reuse it.

import { markdown, escapeHtml } from './markdown.js';

export const LAYOUTS = [
  'default', 'title', 'section', 'center', 'statement', 'quote',
  'media-left', 'media-right', 'full',
];
export const THEMES = ['paper', 'ink', 'signal'];
export const DIRECTIVES = ['layout', 'class', 'bg', 'bg-fit', 'build', 'hidden', 'id', 'columns', 'title'];

const ASPECTS = { '16:9': [1280, 720], '16:10': [1152, 720], '4:3': [960, 720], '1:1': [720, 720] };

// ------------------------------------------------------------------ helpers

/** Split lines on a predicate, ignoring lines inside fenced code blocks. */
function splitOutsideFences(lines, isSeparator) {
  const parts = [[]];
  let fence = null;
  for (const line of lines) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length)) fence = null;
    }
    if (!fence && !f && isSeparator(line)) parts.push([]);
    else parts[parts.length - 1].push(line);
  }
  return parts;
}

function parseValue(raw) {
  let v = raw.trim();
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((x) => parseValue(x)).filter((x) => x !== '');
  if (/^(['"]).*\1$/.test(v)) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

/** Minimal YAML-ish front matter: `key: value` per line, `[a, b]` lists, `# comments`. */
export function parseMeta(text) {
  const meta = {};
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = parseValue(m[2]);
  }
  return meta;
}

const stripTags = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

// -------------------------------------------------------------------- deck

export function parseDeck(source, { id = '' } = {}) {
  const text = String(source).replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const warnings = [];
  let meta = {};
  let body = text;

  const fm = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (fm) {
    meta = parseMeta(fm[1]);
    body = text.slice(fm[0].length);
  }

  const theme = THEMES.includes(meta.theme) ? meta.theme : 'paper';
  if (meta.theme && !THEMES.includes(meta.theme)) warnings.push(`Unknown theme "${meta.theme}"; using "paper".`);
  const aspectKey = ASPECTS[meta.aspect] ? meta.aspect : '16:9';
  if (meta.aspect && !ASPECTS[meta.aspect]) warnings.push(`Unknown aspect "${meta.aspect}"; using 16:9.`);
  const [width, height] = ASPECTS[aspectKey];

  const chunks = splitOutsideFences(body.split('\n'), (l) => /^---\s*$/.test(l));
  const slides = [];
  chunks.forEach((lines) => {
    if (!lines.join('').trim()) return; // tolerate stray separators
    slides.push(parseSlide(lines, slides.length, warnings));
  });

  const title = meta.title || slides.find((s) => s.title)?.title || id || 'Untitled deck';
  return {
    id,
    meta: { ...meta, title, theme, aspect: aspectKey },
    width,
    height,
    slides,
    warnings,
  };
}

// ------------------------------------------------------------------- slide

function parseSlide(lines, index, warnings) {
  const where = `Slide ${index + 1}`;
  const [contentLines, ...noteParts] = splitOutsideFences(lines, (l) => /^\?\?\?\s*$/.test(l));
  const notes = noteParts.map((p) => p.join('\n')).join('\n').trim();

  // Directives: whole-line comments like <!-- layout: title --> or <!-- build -->.
  const d = {};
  const kept = [];
  let fence = null;
  for (const line of contentLines) {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) fence = fence ? (f[1][0] === fence[0] ? null : fence) : f[1];
    const m = !fence && line.match(/^\s*<!--\s*([\w-]+)\s*(?::\s*([\s\S]*?))?\s*-->\s*$/);
    if (m && DIRECTIVES.includes(m[1].toLowerCase())) {
      d[m[1].toLowerCase()] = m[2] === undefined ? true : m[2].trim();
      continue;
    }
    if (m && /^[\w-]+$/.test(m[1]) && m[2] !== undefined) {
      warnings.push(`${where}: unknown directive "${m[1]}" (known: ${DIRECTIVES.join(', ')}).`);
    }
    kept.push(line);
  }

  let layout = typeof d.layout === 'string' ? d.layout : 'default';
  if (!LAYOUTS.includes(layout)) {
    warnings.push(`${where}: unknown layout "${layout}" (known: ${LAYOUTS.join(', ')}).`);
    layout = 'default';
  }

  // Columns: `|||` lines split the slide. A leading heading spans all columns.
  const parts = splitOutsideFences(kept, (l) => /^\s*\|\|\|\s*$/.test(l));
  let html;
  if (parts.length > 1) {
    let header = '';
    const firstIdx = parts[0].findIndex((l) => l.trim());
    if (firstIdx >= 0 && /^ {0,3}#{1,6}\s/.test(parts[0][firstIdx])) {
      header = markdown(parts[0][firstIdx]);
      parts[0] = parts[0].slice(firstIdx + 1);
      // Only a heading before the first `|||`: the columns start after it.
      if (!parts[0].join('').trim()) parts.shift();
    }
    let style = '';
    if (typeof d.columns === 'string') {
      const fr = d.columns.split(/[\s/:,]+/).filter(Boolean).map((n) => (/^\d+(\.\d+)?$/.test(n) ? `${n}fr` : n));
      style = ` style="grid-template-columns:${escapeHtml(fr.join(' '))}"`;
    }
    const cols = parts.map((p) => `<div class="col">\n${markdown(p.join('\n'))}\n</div>`).join('\n');
    html = `${header}\n<div class="columns" data-count="${parts.length}"${style}>\n${cols}\n</div>`;
  } else {
    html = markdown(kept.join('\n'));
  }

  const heading = html.match(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/);
  const title = typeof d.title === 'string' ? d.title : heading ? stripTags(heading[2]) : '';
  const text = stripTags(html.replace(/<pre[\s\S]*?<\/pre>/g, ' '));

  let build = false;
  if (d.build === true || d.build === 'true' || d.build === 'items') build = 'items';
  else if (d.build === 'dim') build = 'dim';
  else if (d.build) warnings.push(`${where}: build should be "items" or "dim".`);

  return {
    index,
    layout,
    className: typeof d.class === 'string' ? d.class : '',
    id: typeof d.id === 'string' ? d.id : '',
    bg: typeof d.bg === 'string' ? d.bg : '',
    bgFit: d['bg-fit'] === 'contain' ? 'contain' : 'cover',
    build,
    hidden: d.hidden === true || d.hidden === 'true',
    title,
    html,
    notes,
    notesHtml: notes ? markdown(notes) : '',
    wordCount: text ? text.split(/\s+/).length : 0,
    source: lines.join('\n'),
  };
}
