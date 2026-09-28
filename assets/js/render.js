// DOM rendering shared by the viewer, presenter view and library thumbnails.

const isColorLike = (v) => /^(#|rgb|hsl|oklch|oklab|lab|lch|color\(|var\(|linear-gradient|radial-gradient|conic-gradient|[a-z]+$)/i.test(v.trim());
const isRelative = (url) => url && !/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(url);

/** Base path for a deck's assets, e.g. "decks/welcome/". */
export const deckBase = (id) => `decks/${encodeURIComponent(id)}/`;

export function renderSlide(slide, deck, { base = deckBase(deck.id), number, total } = {}) {
  const el = document.createElement('section');
  el.className = ['slide', `theme-${deck.meta.theme}`, `layout-${slide.layout}`, slide.className]
    .filter(Boolean).join(' ');
  el.style.width = `${deck.width}px`;
  el.style.height = `${deck.height}px`;
  if (deck.meta.accent) el.style.setProperty('--accent', deck.meta.accent);
  if (slide.id) el.dataset.slideId = slide.id;
  el.dataset.index = slide.index;
  if (slide.build) el.dataset.build = slide.build;

  if (slide.bg) {
    const bg = document.createElement('div');
    bg.className = 'slide-bg';
    if (isColorLike(slide.bg)) bg.style.background = slide.bg;
    else {
      const url = isRelative(slide.bg) ? base + slide.bg : slide.bg;
      bg.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
      bg.style.backgroundSize = slide.bgFit;
      el.classList.add('has-bg-image');
    }
    el.append(bg);
  }

  const content = document.createElement('div');
  content.className = 'slide-content';
  content.innerHTML = slide.html;
  el.append(content);

  // Resolve deck-relative asset URLs.
  for (const node of content.querySelectorAll('[src], [href], [poster], object[data]')) {
    for (const attr of ['src', 'href', 'poster', 'data']) {
      const v = node.getAttribute(attr);
      if (v && isRelative(v) && !(attr === 'data' && node.tagName !== 'OBJECT')) node.setAttribute(attr, base + v);
    }
  }
  for (const a of content.querySelectorAll('a[href^="http"]')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  // Media layouts: the first image (or figure/video) moves into a full-bleed side panel.
  if (slide.layout === 'media-left' || slide.layout === 'media-right') {
    const media = content.querySelector(':scope > figure, :scope > p > img:only-child, :scope > video, :scope > img, :scope > p > video:only-child');
    if (media) {
      const panel = document.createElement('div');
      panel.className = 'slide-media';
      const holder = media.parentElement !== content ? media.parentElement : null;
      panel.append(media);
      holder?.remove();
      el.insertBefore(panel, content);
    }
  }

  // Builds: every list item becomes a fragment.
  if (slide.build) {
    for (const li of content.querySelectorAll('li')) li.classList.add('fragment');
  }
  content.querySelectorAll('.fragment').forEach((f, k) => { f.dataset.step = k + 1; });
  el.dataset.steps = content.querySelectorAll('.fragment').length;

  if (deck.meta.footer || deck.meta.numbers) {
    const foot = document.createElement('footer');
    foot.className = 'slide-footer';
    const text = document.createElement('span');
    text.textContent = typeof deck.meta.footer === 'string' ? deck.meta.footer : '';
    foot.append(text);
    if (deck.meta.numbers && number) {
      const num = document.createElement('span');
      num.className = 'slide-number';
      num.textContent = total ? `${number} / ${total}` : number;
      foot.append(num);
    }
    if (!['title', 'full'].includes(slide.layout)) el.append(foot);
  }

  return el;
}

/** Reveal fragments up to `step` (0 = none). */
export function applyStep(el, step) {
  for (const f of el.querySelectorAll('.fragment')) {
    const s = +f.dataset.step;
    f.classList.toggle('visible', s <= step);
    f.classList.toggle('current', s === step);
  }
}

/** Scale a fixed-size slide element to fit inside `box`, centred. */
export function fitInto(slideEl, box, width, height) {
  const scale = Math.min(box.clientWidth / width, box.clientHeight / height) || 0;
  slideEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
  return scale;
}

/** A self-scaling, non-interactive thumbnail of a slide. */
export function thumbnail(slide, deck, opts = {}) {
  const box = document.createElement('div');
  box.className = 'thumb';
  box.style.aspectRatio = `${deck.width} / ${deck.height}`;
  const el = renderSlide(slide, deck, opts);
  el.classList.add('is-thumb');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  applyStep(el, Infinity);
  for (const v of el.querySelectorAll('video, audio')) { v.removeAttribute('autoplay'); v.preload = 'none'; }
  for (const f of el.querySelectorAll('iframe')) f.replaceWith(Object.assign(document.createElement('div'), { className: 'iframe-placeholder', textContent: 'Embedded content' }));
  box.append(el);
  const ro = new ResizeObserver(() => fitInto(el, box, deck.width, deck.height));
  ro.observe(box);
  return box;
}

/** Content that doesn't fit the slide canvas. Needs the slide to be laid out (not display:none). */
export function measureOverflow(el) {
  const c = el.querySelector('.slide-content');
  if (!c) return false;
  if (c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2) return true;
  // Clipped code blocks and table cells hide their own overflow.
  return [...c.querySelectorAll('pre, .col')].some((n) => n.scrollWidth > n.clientWidth + 2 || n.scrollHeight > n.clientHeight + 2);
}

export async function loadDeck(id) {
  const { parseDeck } = await import('./deck.js?v=6cb37f5d10');
  const res = await fetch(`${deckBase(id)}deck.md`, { cache: 'no-cache' });
  if (!res.ok) throw Object.assign(new Error(`Could not load decks/${id}/deck.md (HTTP ${res.status}).`), { status: res.status });
  return parseDeck(await res.text(), { id });
}

export async function loadManifest() {
  const res = await fetch('decks/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load decks/index.json (HTTP ${res.status}).`);
  const data = await res.json();
  const decks = (data.decks || []).map((d) => (typeof d === 'string' ? { id: d } : d));
  return { ...data, decks };
}

/** Show the page once web fonts have loaded (or after a short wait). */
export async function revealPage() {
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2000))]);
  requestAnimationFrame(() => document.documentElement.classList.remove('is-loading'));
}
