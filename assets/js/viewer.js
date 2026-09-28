// Deck viewer: audience view, presenter view (?presenter), and capture mode (?capture).

import { loadDeck, renderSlide, applyStep, fitInto, thumbnail, measureOverflow } from './render.js';
import { initTheme, themeIcon } from './theme.js';

const params = new URLSearchParams(location.search);
const deckId = params.get('d') || params.get('deck') || '';
const MODE = params.has('presenter') ? 'presenter' : params.has('capture') ? 'capture' : 'audience';
const DEV = params.has('check') || MODE === 'capture' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
document.body.dataset.mode = MODE;

const state = { deck: null, slides: [], els: [], i: 0, step: 0, blackout: false };
const instance = Math.random().toString(36).slice(2);
let channel = null;

// ------------------------------------------------------------------ boot

boot().catch(showError);

async function boot() {
  if (!deckId) {
    location.replace('./');
    return;
  }
  const deck = await loadDeck(deckId);
  state.deck = deck;
  state.slides = deck.slides.filter((s) => !s.hidden);
  if (!state.slides.length) throw new Error('This deck has no slides yet.');
  deck.warnings.forEach((w) => console.warn(`[deck] ${w}`));

  document.title = MODE === 'presenter' ? `Presenter · ${deck.meta.title}` : deck.meta.title;
  injectPageSize(deck);

  if (MODE === 'presenter') buildPresenter();
  else buildAudience();
  // Capture mode renders decks exactly as authored.
  if (MODE !== 'capture') initTheme({ fallback: () => (deck.meta.theme === 'ink' ? 'dark' : 'light') });

  const fromHash = readHash();
  go(fromHash.i, fromHash.step, { broadcast: false, instant: true });
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (h.i !== state.i || h.step !== state.step) go(h.i, h.step);
  });

  setupChannel();
  setupKeys();
  await document.fonts?.ready;
  requestAnimationFrame(() => {
    checkOverflow();
    window.deckReady = true;
    document.body.dataset.ready = 'true';
  });
}

function showError(err) {
  console.error(err);
  const fileProtocol = location.protocol === 'file:';
  app.innerHTML = `
    <div class="viewer-error" role="alert">
      <h1>Can’t open this deck</h1>
      <p class="err-msg"></p>
      ${fileProtocol ? `<p>You opened the site from the file system. Browsers block loading deck files that way —
        serve the folder instead, e.g. <code>python3 -m http.server</code>, then visit <code>http://localhost:8000</code>.</p>` : ''}
      <p><a href="./">← Back to all decks</a></p>
    </div>`;
  $('.err-msg', app).textContent = err.message || String(err);
  document.title = 'Deck not found';
}

function injectPageSize(deck) {
  const style = document.createElement('style');
  style.textContent = `@page { size: ${deck.width}px ${deck.height}px; margin: 0; }`;
  document.head.append(style);
}

// ------------------------------------------------------------ audience UI

function buildAudience() {
  const { deck } = state;
  app.innerHTML = `
    <div class="progress" aria-hidden="true"><div class="progress-bar"></div></div>
    <main class="stage" aria-roledescription="presentation" aria-label="${escapeAttr(deck.meta.title)}">
      <div class="viewport"></div>
      <div class="blackout" hidden></div>
    </main>
    <div class="dev-flag" hidden role="status"></div>
    <nav class="controls" aria-label="Slide controls">
      <a class="ctl" href="./" title="All decks" aria-label="All decks">${icon('grid-home')}</a>
      <span class="ctl-sep"></span>
      <button class="ctl" data-act="prev" title="Previous (←)" aria-label="Previous">${icon('prev')}</button>
      <button class="ctl counter" data-act="jump" title="Go to slide (type a number, then Enter)" aria-label="Go to slide"><span class="cur">1</span><span class="of">/ ${state.slides.length}</span></button>
      <button class="ctl" data-act="next" title="Next (→)" aria-label="Next">${icon('next')}</button>
      <span class="ctl-sep"></span>
      <button class="ctl" data-act="overview" title="Overview (O)" aria-label="Overview">${icon('overview')}</button>
      <button class="ctl" data-act="presenter" title="Presenter view (S)" aria-label="Open presenter view">${icon('presenter')}</button>
      <button class="ctl" data-act="fullscreen" title="Fullscreen (F)" aria-label="Fullscreen">${icon('fullscreen')}</button>
      <button class="ctl theme-toggle" data-key="T" aria-label="Switch theme">${themeIcon}</button>
      <button class="ctl" data-act="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${icon('help')}</button>
    </nav>
    <div class="jump-toast" hidden aria-hidden="true"></div>
    <div class="sr-only" aria-live="polite" aria-atomic="true" id="announcer"></div>
    ${helpDialog()}
    <div class="overview" hidden role="dialog" aria-modal="true" aria-label="Slide overview">
      <header class="overview-head">
        <h2>${escapeHtml(deck.meta.title)}</h2>
        <span class="overview-hint">Arrow keys to move · Enter to open · Esc to close</span>
        <button class="ctl" data-act="overview" aria-label="Close overview">${icon('close')}</button>
      </header>
      <ol class="overview-grid"></ol>
    </div>`;

  const viewport = $('.viewport');
  viewport.style.width = `${deck.width}px`;
  viewport.style.height = `${deck.height}px`;
  state.els = state.slides.map((s, k) => {
    const el = renderSlide(s, deck, { number: k + 1, total: state.slides.length });
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'slide');
    el.setAttribute('aria-label', `${k + 1} of ${state.slides.length}${s.title ? `: ${s.title}` : ''}`);
    viewport.append(el);
    return el;
  });

  const stage = $('.stage');
  const fit = () => fitInto(viewport, stage, deck.width, deck.height);
  new ResizeObserver(fit).observe(stage);
  fit();

  $('.controls').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) runAction(act);
  });
  $('.overview').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) runAction(act);
  });

  // Click zones: left third goes back, the rest advances. Links, media and selections are left alone.
  stage.addEventListener('click', (e) => {
    if (e.target.closest('a, button, input, textarea, select, video, audio, iframe, details, [contenteditable], .no-advance')) return;
    if (String(getSelection()).length) return;
    const r = stage.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) prev(); else next();
  });
  stage.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect();
    stage.dataset.zone = e.clientX - r.left < r.width / 3 ? 'prev' : 'next';
  });

  setupSwipe(stage);
  setupIdle();
}

// ----------------------------------------------------------- presenter UI

function buildPresenter() {
  const { deck } = state;
  app.innerHTML = `
    <div class="presenter">
      <section class="p-current" aria-label="Current slide"><div class="p-frame"><div class="viewport"></div></div></section>
      <aside class="p-side">
        <div class="p-next-wrap">
          <div class="p-label">Next <span class="p-builds"></span></div>
          <div class="p-next"></div>
        </div>
        <div class="p-notes-wrap">
          <div class="p-label">Notes
            <span class="p-font"><button data-act="font-down" aria-label="Smaller notes">A−</button><button data-act="font-up" aria-label="Larger notes">A+</button></span>
          </div>
          <div class="p-notes" tabindex="0"></div>
        </div>
      </aside>
      <footer class="p-bar">
        <button class="ctl" data-act="prev" aria-label="Previous">${icon('prev')}</button>
        <span class="p-count"><span class="cur">1</span> / ${state.slides.length}</span>
        <button class="ctl" data-act="next" aria-label="Next">${icon('next')}</button>
        <span class="p-title"></span>
        <button class="p-timer" data-act="timer" title="Click to pause · double-click to reset"><span class="elapsed">0:00</span></button>
        <span class="p-clock"></span>
        <button class="ctl theme-toggle" aria-label="Switch theme">${themeIcon}</button>
        <button class="ctl" data-act="blackout" title="Black out audience screen (B)" aria-label="Black out audience screen">${icon('blackout')}</button>
        <button class="ctl" data-act="help" aria-label="Keyboard shortcuts">${icon('help')}</button>
      </footer>
    </div>
    <div class="sr-only" aria-live="polite" aria-atomic="true" id="announcer"></div>
    ${helpDialog()}`;

  const viewport = $('.viewport');
  viewport.style.width = `${deck.width}px`;
  viewport.style.height = `${deck.height}px`;
  state.els = state.slides.map((s, k) => {
    const el = renderSlide(s, deck, { number: k + 1, total: state.slides.length });
    viewport.append(el);
    return el;
  });
  const frame = $('.p-frame');
  const fit = () => fitInto(viewport, frame, deck.width, deck.height);
  new ResizeObserver(fit).observe(frame);

  $('.presenter').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) runAction(act);
  });
  $('.p-timer').addEventListener('dblclick', () => timer.reset());

  let notesSize = +(safeGet('slides:notes-size') || 22);
  const applyNotesSize = () => { $('.p-notes').style.fontSize = `${notesSize}px`; };
  applyNotesSize();
  presenterActions['font-up'] = () => { notesSize = Math.min(48, notesSize + 2); applyNotesSize(); safeSet('slides:notes-size', notesSize); };
  presenterActions['font-down'] = () => { notesSize = Math.max(14, notesSize - 2); applyNotesSize(); safeSet('slides:notes-size', notesSize); };

  timer.start();
  const clock = () => { $('.p-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  clock();
  setInterval(clock, 10_000);
}

const presenterActions = {};

const timer = {
  startedAt: 0, elapsed: 0, running: false, handle: 0,
  start() { this.startedAt = Date.now(); this.running = true; this.tick(); this.handle = setInterval(() => this.tick(), 1000); },
  toggle() {
    if (this.running) { this.elapsed += Date.now() - this.startedAt; this.running = false; }
    else { this.startedAt = Date.now(); this.running = true; }
    $('.p-timer').classList.toggle('paused', !this.running);
    this.tick();
  },
  reset() { this.elapsed = 0; this.startedAt = Date.now(); this.tick(); },
  tick() {
    const ms = this.elapsed + (this.running ? Date.now() - this.startedAt : 0);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
    const ss = String(s % 60).padStart(2, '0');
    const el = $('.p-timer .elapsed');
    if (el) el.textContent = h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },
};

function updatePresenter() {
  const { deck, slides, i, step } = state;
  const cur = slides[i];
  const nextSlide = slides[i + 1];
  const remaining = +state.els[i].dataset.steps - step;

  $('.p-builds').textContent = remaining > 0 ? `· ${remaining} more build${remaining > 1 ? 's' : ''} on this slide` : '';
  const nextBox = $('.p-next');
  nextBox.replaceChildren(nextSlide
    ? thumbnail(nextSlide, deck, { number: i + 2, total: slides.length })
    : Object.assign(document.createElement('div'), { className: 'p-end', textContent: 'End of deck' }));
  const notes = $('.p-notes');
  notes.innerHTML = cur.notesHtml || '<p class="p-empty">No notes for this slide.</p>';
  notes.scrollTop = 0;
  $('.p-title').textContent = cur.title || '';
}

// ------------------------------------------------------------ navigation

function readHash() {
  const m = location.hash.match(/^#\/?(\d+)(?:\.(\d+))?/);
  let i = 0;
  if (m) i = Math.min(Math.max(+m[1] - 1, 0), state.slides.length - 1);
  else if (location.hash.length > 1) {
    // #some-id jumps to a slide with <!-- id: some-id -->
    const idx = state.slides.findIndex((s) => s.id === decodeURIComponent(location.hash.slice(1)));
    if (idx >= 0) i = idx;
  }
  return { i, step: m && m[2] ? +m[2] : 0 };
}

function stepsOf(i) { return +state.els[i]?.dataset.steps || 0; }

function next() {
  if (state.step < stepsOf(state.i)) go(state.i, state.step + 1);
  else if (state.i < state.slides.length - 1) go(state.i + 1, 0);
}
function prev() {
  if (state.step > 0) go(state.i, state.step - 1);
  else if (state.i > 0) go(state.i - 1, stepsOf(state.i - 1));
}

function go(i, step = 0, { broadcast = true, instant = false } = {}) {
  i = Math.min(Math.max(i, 0), state.slides.length - 1);
  step = Math.min(Math.max(step, 0), stepsOf(i));
  const changed = i !== state.i || !state.started;
  state.i = i;
  state.step = step;
  state.started = true;

  state.els.forEach((el, k) => {
    const current = k === i;
    el.classList.toggle('is-current', current);
    el.classList.toggle('is-past', k < i);
    el.classList.toggle('is-future', k > i);
    el.classList.toggle('no-transition', instant || reduceMotion);
    el.inert = !current;
    el.setAttribute('aria-hidden', String(!current));
    if (!current) for (const m of el.querySelectorAll('video, audio')) m.pause();
  });
  applyStep(state.els[i], step);
  if (changed) {
    for (const m of state.els[i].querySelectorAll('video[autoplay], audio[autoplay]')) m.play?.().catch(() => {});
  }

  const hash = `#/${i + 1}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);

  document.querySelectorAll('.cur').forEach((n) => { n.textContent = i + 1; });
  const bar = $('.progress-bar');
  if (bar) bar.style.transform = `scaleX(${state.slides.length > 1 ? i / (state.slides.length - 1) : 1})`;
  if (changed) {
    const ann = $('#announcer');
    if (ann) ann.textContent = `Slide ${i + 1} of ${state.slides.length}${state.slides[i].title ? `: ${state.slides[i].title}` : ''}`;
  }
  if (MODE === 'presenter') updatePresenter();
  updateDevFlag();
  if (broadcast) send({ type: 'state', i, step });
}

// ----------------------------------------------------------- sync (S key)

function setupChannel() {
  if (!('BroadcastChannel' in window) || MODE === 'capture') return;
  channel = new BroadcastChannel(`slides:${deckId}`);
  channel.onmessage = ({ data }) => {
    if (!data || data.from === instance) return;
    if (data.type === 'state') go(data.i, data.step, { broadcast: false });
    else if (data.type === 'hello') send({ type: 'state', i: state.i, step: state.step });
    else if (data.type === 'blackout') setBlackout(data.on, { broadcast: false });
  };
  send({ type: 'hello' });
}
function send(msg) { channel?.postMessage({ ...msg, from: instance }); }

function openPresenter() {
  const url = `deck.html?d=${encodeURIComponent(deckId)}&presenter#/${state.i + 1}`;
  const win = window.open(url, `presenter:${deckId}`, 'popup,width=1280,height=800');
  if (!win) location.href = url; // popup blocked: open in this tab instead
}

// --------------------------------------------------------------- actions

function runAction(act) {
  switch (act) {
    case 'next': return next();
    case 'prev': return prev();
    case 'first': return go(0, 0);
    case 'last': return go(state.slides.length - 1, stepsOf(state.slides.length - 1));
    case 'overview': return toggleOverview();
    case 'presenter': return openPresenter();
    case 'fullscreen': return toggleFullscreen();
    case 'help': return toggleHelp();
    case 'blackout': return setBlackout(!state.blackout);
    case 'timer': return timer.toggle();
    case 'theme': return document.querySelector('.theme-toggle')?.click();
    case 'jump': return startJump();
    default: return presenterActions[act]?.();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function setBlackout(on, { broadcast = true } = {}) {
  state.blackout = on;
  const b = $('.blackout');
  if (b) b.hidden = !on;
  document.body.classList.toggle('is-blackout', on);
  $('[data-act="blackout"]')?.classList.toggle('active', on);
  if (broadcast) send({ type: 'blackout', on });
}

function toggleHelp(force) {
  const dlg = $('#help');
  const open = force ?? !dlg.open;
  if (open && !dlg.open) dlg.showModal();
  else if (!open && dlg.open) dlg.close();
}

// Jump to slide: type digits, press Enter.
let jumpBuffer = '';
let jumpTimer = 0;
function startJump() {
  jumpBuffer = '';
  showJump('Type a slide number…');
}
function showJump(text) {
  const t = $('.jump-toast');
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  clearTimeout(jumpTimer);
  jumpTimer = setTimeout(() => { t.hidden = true; jumpBuffer = ''; }, 2500);
}

// -------------------------------------------------------------- overview

let overviewBuilt = false;
function toggleOverview(force) {
  const ov = $('.overview');
  if (!ov) return;
  const open = force ?? ov.hidden;
  if (open) {
    if (!overviewBuilt) buildOverview();
    ov.hidden = false;
    document.body.classList.add('overview-open');
    const items = ov.querySelectorAll('.ov-item');
    items.forEach((b, k) => b.setAttribute('aria-current', k === state.i ? 'true' : 'false'));
    const cur = items[state.i];
    cur?.focus();
    cur?.scrollIntoView({ block: 'center' });
  } else {
    ov.hidden = true;
    document.body.classList.remove('overview-open');
    $('.stage')?.focus?.();
  }
}

function buildOverview() {
  overviewBuilt = true;
  const grid = $('.overview-grid');
  state.slides.forEach((s, k) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'ov-item';
    btn.setAttribute('aria-label', `Slide ${k + 1}${s.title ? `: ${s.title}` : ''}`);
    btn.append(thumbnail(s, state.deck, { number: k + 1, total: state.slides.length }));
    const cap = document.createElement('span');
    cap.className = 'ov-cap';
    cap.innerHTML = `<span class="ov-num">${k + 1}</span><span class="ov-title"></span>`;
    cap.querySelector('.ov-title').textContent = s.title || '';
    btn.append(cap);
    if (state.els[k].dataset.overflow === 'true') btn.classList.add('overflowing');
    btn.addEventListener('click', () => { go(k, 0); toggleOverview(false); });
    li.append(btn);
    grid.append(li);
  });
}

function overviewKeys(e) {
  const items = [...document.querySelectorAll('.ov-item')];
  const idx = items.indexOf(document.activeElement);
  if (idx < 0) return false;
  const cols = Math.max(1, Math.round($('.overview-grid').clientWidth / items[0].getBoundingClientRect().width));
  const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -Infinity, End: Infinity }[e.key];
  if (move === undefined) return false;
  const t = Math.min(Math.max(idx + move, 0), items.length - 1);
  items[Number.isFinite(t) ? t : 0].focus();
  return true;
}

// ------------------------------------------------------------- keyboard

function setupKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const helpOpen = $('#help')?.open;
    const ovOpen = !$('.overview')?.hidden && $('.overview');

    if (helpOpen) {
      if (e.key === '?' ) { toggleHelp(false); e.preventDefault(); }
      return; // Esc is handled by <dialog>
    }
    if (ovOpen) {
      if (e.key === 'Escape' || e.key === 'o' || e.key === 'O') { toggleOverview(false); e.preventDefault(); return; }
      if (overviewKeys(e)) { e.preventDefault(); return; }
      return; // Enter/Space activate the focused button natively
    }

    if (/^[0-9]$/.test(e.key)) {
      jumpBuffer = (jumpBuffer + e.key).slice(-4);
      showJump(`Go to slide ${jumpBuffer}`);
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && jumpBuffer) {
      go(+jumpBuffer - 1, 0);
      jumpBuffer = '';
      $('.jump-toast').hidden = true;
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && jumpBuffer) { jumpBuffer = ''; $('.jump-toast').hidden = true; return; }

    // Let focused buttons handle Space/Enter themselves.
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('button, a')) return;

    const map = {
      ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': e.shiftKey ? 'prev' : 'next', l: 'next', j: 'next', n: 'next',
      ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev', h: 'prev', k: 'prev', p: 'prev', Backspace: 'prev',
      Home: 'first', End: 'last',
      o: 'overview', O: 'overview', Escape: MODE === 'audience' ? 'overview' : null,
      f: 'fullscreen', F: 'fullscreen',
      s: MODE === 'audience' ? 'presenter' : null, S: MODE === 'audience' ? 'presenter' : null,
      b: 'blackout', B: 'blackout', '.': 'blackout',
      '?': 'help',
      t: MODE === 'presenter' ? 'timer' : 'theme',
      T: MODE === 'presenter' ? null : 'theme',
      r: MODE === 'presenter' ? 'reset' : null,
    };
    const act = map[e.key];
    if (act === 'reset') { timer.reset(); e.preventDefault(); return; }
    if (act) { runAction(act); e.preventDefault(); }
  });
}

// ---------------------------------------------------------- touch, idle

function setupSwipe(el) {
  let x0 = null;
  let y0 = null;
  el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next(); else prev();
      el.dataset.swiped = '1';
      setTimeout(() => delete el.dataset.swiped, 400);
    }
  });
  // Suppress the synthetic click that follows a swipe.
  el.addEventListener('click', (e) => { if (el.dataset.swiped) e.stopImmediatePropagation(); }, true);
}

function setupIdle() {
  let t = 0;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(t);
    t = setTimeout(() => {
      if (!document.querySelector('.controls:focus-within, .controls:hover')) document.body.classList.add('idle');
    }, 2500);
  };
  ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, (e) => {
    // Navigating with the keyboard shouldn't summon the chrome.
    if (ev === 'keydown' && !['Tab', 'Shift'].includes(e.key)) return;
    wake();
  }, { passive: true }));
  wake();
}

// ------------------------------------------------------- overflow check

function checkOverflow() {
  const report = state.els.map((el, k) => {
    const wasCurrent = el.classList.contains('is-current');
    applyStep(el, Infinity);
    const overflow = measureOverflow(el);
    if (!wasCurrent) applyStep(el, 0);
    el.dataset.overflow = String(overflow);
    if (overflow) console.warn(`[deck] Slide ${k + 1}${state.slides[k].title ? ` (“${state.slides[k].title}”)` : ''} overflows its ${state.deck.width}×${state.deck.height} canvas.`);
    return { slide: k + 1, title: state.slides[k].title, overflow, steps: +el.dataset.steps };
  });
  applyStep(state.els[state.i], state.step);
  window.deckReport = { id: deckId, title: state.deck.meta.title, warnings: state.deck.warnings, slides: report };
  updateDevFlag();
}

function updateDevFlag() {
  const flag = $('.dev-flag');
  if (!flag || !DEV || MODE === 'capture') return;
  const el = state.els[state.i];
  const msgs = [];
  if (el?.dataset.overflow === 'true') msgs.push('Content overflows this slide');
  if (state.i === 0 && state.deck.warnings.length) msgs.push(`${state.deck.warnings.length} deck warning(s) — see console`);
  flag.hidden = !msgs.length;
  flag.textContent = msgs.join(' · ');
}

// -------------------------------------------------------------- helpers

function helpDialog() {
  const row = (keys, what) => `<tr><td>${keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</td><td>${what}</td></tr>`;
  const rows = MODE === 'presenter'
    ? [
      row(['→', 'Space'], 'Next slide or build'),
      row(['←', '⇧ Space'], 'Previous'),
      row(['Home', 'End'], 'First / last slide'),
      row(['B', '.'], 'Black out the audience screen'),
      row(['T'], 'Pause / resume timer'),
      row(['R'], 'Reset timer'),
      row(['?'], 'This help'),
    ]
    : [
      row(['→', 'Space', 'click'], 'Next slide or build'),
      row(['←', '⇧ Space'], 'Previous'),
      row(['Home', 'End'], 'First / last slide'),
      row(['1', '2', '…', 'Enter'], 'Go to slide number'),
      row(['O', 'Esc'], 'Overview of all slides'),
      row(['S'], 'Presenter view (notes, next slide, timer) in a synced window'),
      row(['F'], 'Fullscreen'),
      row(['B', '.'], 'Black out'),
      row(['T'], 'Switch light / dark theme'),
      row(['⌘/Ctrl', 'P'], 'Print / save as PDF (one slide per page)'),
      row(['?'], 'This help'),
    ];
  return `
    <dialog id="help" class="help" aria-labelledby="help-title">
      <form method="dialog">
        <h2 id="help-title">Keyboard shortcuts</h2>
        <table>${rows.join('')}</table>
        <p class="help-foot">Links in the URL point at a slide: <code>#/5</code>. Swipe on touch screens.</p>
        <button class="help-close" aria-label="Close">${icon('close')}</button>
      </form>
    </dialog>`;
}

function icon(name) {
  const p = {
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    overview: '<rect x="3.5" y="4.5" width="7" height="6" rx="1"/><rect x="13.5" y="4.5" width="7" height="6" rx="1"/><rect x="3.5" y="13.5" width="7" height="6" rx="1"/><rect x="13.5" y="13.5" width="7" height="6" rx="1"/>',
    presenter: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M7 8.5h6M7 11.5h4"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.3-.9.8-.9 1.4v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    'grid-home': '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    blackout: '<rect x="3" y="5" width="18" height="13" rx="1.5" fill="currentColor"/>',
  }[name];
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const escapeAttr = escapeHtml;
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
