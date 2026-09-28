// Library page: lists every deck in decks/index.json with a live thumbnail of its first slide.

import { loadManifest, loadDeck, thumbnail, revealPage } from './render.js?v=2c231993c6';
import { initTheme, themeIcon } from './theme.js?v=755052af71';

document.querySelector('.theme-toggle').innerHTML = themeIcon;
initTheme();

const params = new URLSearchParams(location.search);
const showDrafts = params.has('drafts');
const $ = (s) => document.querySelector(s);
const grid = $('#decks');
const search = $('#search');
const status = $('#status');

let cards = [];

init().finally(revealPage).catch((err) => {
  console.error(err);
  const fileProtocol = location.protocol === 'file:';
  status.hidden = false;
  status.innerHTML = fileProtocol
    ? `<strong>Serve this folder to view decks.</strong> Browsers block loading files from <code>file://</code>.
       Run <code>python3 -m http.server</code> in the repository and open <code>http://localhost:8000</code>.`
    : `<strong>Couldn’t load the deck list.</strong> <span class="err"></span>`;
  status.querySelector('.err')?.append(err.message);
});

async function init() {
  const manifest = await loadManifest();
  if (manifest.title) {
    $('#site-title').textContent = manifest.title;
    document.title = manifest.title;
  }
  if (manifest.description) $('#site-desc').textContent = manifest.description;

  const results = await Promise.all(manifest.decks.map(async (entry) => {
    try {
      return { entry, deck: await loadDeck(entry.id) };
    } catch (error) {
      return { entry, error };
    }
  }));

  const visible = results.filter((r) => showDrafts || !(r.deck?.meta.draft));
  visible.sort((a, b) => String(b.deck?.meta.date || '').localeCompare(String(a.deck?.meta.date || '')));

  if (!visible.length) {
    status.hidden = false;
    status.innerHTML = `<strong>No decks yet.</strong> Ask Claude Code to create one — it writes
      <code>decks/&lt;id&gt;/deck.md</code> and registers it in <code>decks/index.json</code>.`;
    search.closest('.toolbar').hidden = true;
    return;
  }

  cards = visible.map(({ entry, deck, error }) => card(entry, deck, error));
  grid.append(...cards.map((c) => c.el));
  updateCount(cards.length);

  search.addEventListener('input', filter);
  document.addEventListener('keydown', (e) => {
    if (e.key === 't' && !e.target.closest?.('input, textarea') && !e.metaKey && !e.ctrlKey && !e.altKey) document.querySelector('.theme-toggle').click();
    if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); search.focus(); }
    if (e.key === 'Escape' && document.activeElement === search) { search.value = ''; filter(); search.blur(); }
  });
}

function card(entry, deck, error) {
  const li = document.createElement('li');
  li.className = 'card';
  if (error) {
    li.classList.add('card-error');
    li.innerHTML = `<div class="card-body"><h2 class="card-title"></h2><p class="card-desc"></p></div>`;
    li.querySelector('.card-title').textContent = entry.id;
    li.querySelector('.card-desc').textContent = error.message;
    return { el: li, text: entry.id.toLowerCase() };
  }
  const { meta } = deck;
  const count = deck.slides.filter((s) => !s.hidden).length;
  const href = `deck.html?d=${encodeURIComponent(deck.id)}`;
  li.innerHTML = `
    <a class="card-link" href="${href}">
      <div class="card-thumb"></div>
      <div class="card-body">
        <h2 class="card-title"></h2>
        <p class="card-desc"></p>
        <p class="card-meta"></p>
      </div>
    </a>
    <a class="card-present" href="${href}&presenter" target="_blank" rel="noopener" title="Open presenter view (notes, next slide, timer)">Presenter view</a>`;
  li.querySelector('.card-title').textContent = meta.title;
  const desc = li.querySelector('.card-desc');
  if (meta.description) desc.textContent = meta.description; else desc.remove();

  const bits = [];
  if (meta.date) bits.push(formatDate(meta.date));
  if (meta.author) bits.push(meta.author);
  bits.push(`${count} slide${count === 1 ? '' : 's'}`);
  const metaEl = li.querySelector('.card-meta');
  metaEl.textContent = bits.join(' · ');
  const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
  if (meta.draft) tags.unshift('draft');
  for (const t of tags) {
    const tag = document.createElement('span');
    tag.className = `tag${t === 'draft' ? ' tag-draft' : ''}`;
    tag.textContent = t;
    metaEl.append(' ', tag);
  }

  const first = deck.slides.find((s) => !s.hidden);
  if (first) li.querySelector('.card-thumb').append(thumbnail(first, deck, { number: 1, total: count }));

  const text = [meta.title, meta.description, meta.author, ...tags, deck.id].filter(Boolean).join(' ').toLowerCase();
  return { el: li, text };
}

function filter() {
  const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  let n = 0;
  for (const c of cards) {
    const show = terms.every((t) => c.text.includes(t));
    c.el.hidden = !show;
    if (show) n++;
  }
  updateCount(n);
}

function updateCount(n) {
  $('#count').textContent = `${n} deck${n === 1 ? '' : 's'}`;
  status.hidden = n > 0;
  if (!n) status.innerHTML = '<strong>No decks match.</strong> Try a different search.';
}

function formatDate(d) {
  const date = new Date(`${d}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(d) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
