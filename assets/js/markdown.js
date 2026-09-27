// Small, dependency-free Markdown renderer tuned for slides.
//
// Supports: headings, paragraphs, emphasis (** * _ ~~ ==), inline code,
// links, images, autolinks, fenced code, block quotes, nested lists,
// task lists, tables, horizontal rules, raw HTML (block and inline), and
// trailing attribute blocks such as `{.fragment .muted #id}` on headings,
// paragraphs, list items, images and code fences.
//
// Pure string functions: no DOM, so it runs in the browser and in Node.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

// ---------------------------------------------------------------- attributes

const TRAILING_ATTRS = /\s+\{:?\s*((?:[.#][\w-]+\s*)+)\}\s*$/;

export function attrString(spec) {
  const classes = [];
  let id = '';
  for (const tok of spec.trim().split(/\s+/)) {
    if (tok.startsWith('.')) classes.push(tok.slice(1));
    else if (tok.startsWith('#') && !id) id = tok.slice(1);
  }
  let out = '';
  if (id) out += ` id="${escapeHtml(id)}"`;
  if (classes.length) out += ` class="${escapeHtml(classes.join(' '))}"`;
  return out;
}

/** Split `text {.a #b}` into [text, ' id="b" class="a"']. */
export function splitAttrs(text) {
  const m = text.match(TRAILING_ATTRS);
  if (!m) return [text, ''];
  return [text.slice(0, m.index), attrString(m[1])];
}

// ------------------------------------------------------------------- inlines

export function inline(src) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
  let s = src;

  // Code spans first so nothing inside them is interpreted.
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code) =>
    keep(`<code>${escapeHtml(code.replace(/^ ([\s\S]*) $/, '$1'))}</code>`));

  // Backslash escapes.
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!|~=<>])/g, (_, c) => keep(escapeHtml(c)));

  // Autolinks, raw inline HTML, and entities pass through untouched.
  s = s.replace(/<(https?:\/\/[^\s<>]+)>/g, (_, u) =>
    keep(`<a href="${escapeHtml(u)}">${escapeHtml(u)}</a>`));
  s = s.replace(/<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g, (m) => keep(m));
  s = s.replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, (m) => keep(m));

  s = escapeHtml(s);

  // Images: ![alt](src "title"){.attrs}
  s = s.replace(
    /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+&quot;(.*?)&quot;)?\s*\)(?:\{:?\s*((?:[.#][\w-]+\s*)+)\})?/g,
    (_, alt, url, title, attrs) =>
      keep(`<img src="${url}" alt="${alt}"${title ? ` title="${title}"` : ''}${attrs ? attrString(attrs) : ''}>`));

  // Links: [text](href "title")
  s = s.replace(/\[([^\]]+)\]\(\s*([^\s)]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (_, text, href, title) =>
    keep(`<a href="${href}"${title ? ` title="${title}"` : ''}>`) + text + keep('</a>'));

  // Emphasis.
  s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^*])\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');

  // Hard line breaks: two trailing spaces or a trailing backslash.
  s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n');

  for (let n = 0; n < 5 && s.includes('\u0000'); n++) {
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
  }
  return s;
}

// -------------------------------------------------------------------- blocks

const FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*([^\s`{]*)\s*(?:\{:?\s*((?:[.#][\w-]+\s*)+)\})?\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^ {0,3}([*_-])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^ {0,3}>\s?/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const HTML_BLOCK_RE = new RegExp(
  '^\\s*(?:<!--|<\\/?(?:' +
  'address|article|aside|audio|blockquote|canvas|details|dialog|div|dl|figure|figcaption|footer|' +
  'form|h[1-6]|header|hr|iframe|main|nav|ol|p|picture|pre|section|summary|svg|table|ul|video|style' +
  ')(?:[\\s>/]|$))', 'i');

function isBlockStart(line) {
  return HEADING_RE.test(line) || FENCE_RE.test(line) || QUOTE_RE.test(line) ||
    HR_RE.test(line) || LIST_RE.test(line) || HTML_BLOCK_RE.test(line);
}

export function markdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return blocks(lines).join('\n');
}

function blocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;

    // Fenced code.
    if ((m = line.match(FENCE_RE))) {
      const [, indent, fence, lang, attrs] = m;
      const body = [];
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t[0] === fence[0] && t.length >= fence.length && /^([`~])\1*$/.test(t)) break;
        const lead = lines[i].search(/\S|$/);
        body.push(lines[i].slice(Math.min(indent.length, lead)));
        i++;
      }
      i++; // closing fence
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}"` : '';
      out.push(`<pre${attrs ? attrString(attrs) : ''}><code${langAttr}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // Heading.
    if ((m = line.match(HEADING_RE))) {
      const [text, attrs] = splitAttrs(m[2]);
      const n = m[1].length;
      out.push(`<h${n}${attrs}>${inline(text)}</h${n}>`);
      i++;
      continue;
    }

    // Horizontal rule.
    if (HR_RE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // Block quote.
    if (QUOTE_RE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) body.push(lines[i++].replace(QUOTE_RE, ''));
      out.push(`<blockquote>\n${blocks(body).join('\n')}\n</blockquote>`);
      continue;
    }

    // List.
    if (LIST_RE.test(line)) {
      const res = parseList(lines, i);
      out.push(res.html);
      i = res.next;
      continue;
    }

    // Raw HTML block: passes through until a blank line (or `-->` for comments).
    if (HTML_BLOCK_RE.test(line)) {
      const body = [];
      if (/^\s*<!--/.test(line)) {
        while (i < lines.length) {
          body.push(lines[i]);
          if (lines[i++].includes('-->')) break;
        }
      } else {
        while (i < lines.length && lines[i].trim()) body.push(lines[i++]);
      }
      out.push(body.join('\n'));
      continue;
    }

    // Table.
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const res = parseTable(lines, i);
      out.push(res.html);
      i = res.next;
      continue;
    }

    // Paragraph.
    const para = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
    out.push(paragraph(para.map((l) => l.replace(/^\s+/, '')).join('\n')));
  }
  return out;
}

function paragraph(text) {
  const [body, attrs] = splitAttrs(text);
  const html = inline(body.trim());
  // A lone image with a title becomes a captioned figure.
  const fig = html.match(/^<img [^>]*title="([^"]*)"[^>]*>$/);
  if (fig) return `<figure${attrs}>${html}<figcaption>${fig[1]}</figcaption></figure>`;
  return `<p${attrs}>${html}</p>`;
}

function parseList(lines, start) {
  const first = lines[start].match(LIST_RE);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const startNum = ordered ? parseInt(first[2], 10) : 1;
  const items = [];
  let loose = false;
  let i = start;

  while (i < lines.length) {
    const m = lines[i].match(LIST_RE);
    if (!m || HR_RE.test(lines[i]) || Math.abs(m[1].length - baseIndent) > 1 || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = m[1].length + m[2].length + 1;
    const body = [m[3]];
    i++;
    let blank = false;
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { body.push(''); blank = true; i++; continue; }
      const ind = l.search(/\S/);
      if (ind > baseIndent + 1) { body.push(l.slice(Math.min(ind, contentIndent))); blank = false; i++; continue; }
      if (blank || LIST_RE.test(l) || isBlockStart(l)) break;
      body.push(l.trim()); // lazy continuation
      i++;
    }
    while (body.length && !body[body.length - 1].trim()) body.pop();
    if (blank && i < lines.length && LIST_RE.test(lines[i])) {
      const next = lines[i].match(LIST_RE);
      if (Math.abs(next[1].length - baseIndent) <= 1 && /\d/.test(next[2]) === ordered) loose = true;
    }
    if (body.slice(1).some((l, k) => !l.trim() && body[k + 2] && !LIST_RE.test(body[k + 2]))) loose = true;
    items.push(body);
  }

  const lis = items.map((body) => {
    let [head, attrs] = splitAttrs(body[0]);
    let task = '';
    const t = head.match(/^\[([ xX])\]\s+(.*)$/);
    if (t) {
      task = `<span class="task-box${t[1] !== ' ' ? ' checked' : ''}" aria-hidden="true"></span>`;
      head = t[2];
      attrs = attrs.includes('class="')
        ? attrs.replace('class="', `class="task${t[1] !== ' ' ? ' done' : ''} `)
        : `${attrs} class="task${t[1] !== ' ' ? ' done' : ''}"`;
    }
    let html = blocks([head, ...body.slice(1)]).join('\n');
    if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
    return `<li${attrs}>${task}${html}</li>`;
  });

  const tag = ordered ? 'ol' : 'ul';
  const startAttr = ordered && startNum !== 1 ? ` start="${startNum}"` : '';
  return { html: `<${tag}${startAttr}>\n${lis.join('\n')}\n</${tag}>`, next: i };
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let inCode = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function parseTable(lines, start) {
  const head = splitRow(lines[start]);
  const aligns = splitRow(lines[start + 1]).map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
  });
  const al = (k) => (aligns[k] ? ` style="text-align:${aligns[k]}"` : '');
  let i = start + 2;
  const rows = [];
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
  const thead = `<thead><tr>${head.map((c, k) => `<th${al(k)}>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td${al(k)}>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`
    : '';
  return { html: `<table>${thead}${tbody}</table>`, next: i };
}
