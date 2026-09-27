#!/usr/bin/env node
// Screenshot every slide of a deck and report slides whose content overflows.
// Lets an author (human or Claude Code) *look* at the result.
//
//   node tools/render.mjs welcome            # PNGs in .renders/welcome/
//   node tools/render.mjs welcome 3 5        # only slides 3 and 5
//
// Requires Playwright (`npm i -g playwright` or `npx playwright`) and a Chromium build.

import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, ...only] = process.argv.slice(2);
if (!id) { console.error('usage: node tools/render.mjs <deck-id> [slide numbers…]'); process.exit(2); }

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const { createRequire } = await import('node:module');
    const { execSync } = await import('node:child_process');
    const globalRoot = execSync('npm root -g').toString().trim();
    ({ chromium } = createRequire(join(globalRoot, 'noop.js'))('playwright'));
  } catch {
    console.error('Playwright is not installed. Run `npm i -g playwright` (and `npx playwright install chromium`).');
    process.exit(2);
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(0);
const port = server.address().port;

const launchOpts = {};
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.goto(`http://localhost:${port}/deck.html?d=${encodeURIComponent(id)}&capture`);
  await page.waitForFunction(() => window.deckReady || document.querySelector('.viewer-error'), null, { timeout: 15000 });
  if (await page.$('.viewer-error')) throw new Error(await page.textContent('.viewer-error'));

  const report = await page.evaluate(() => window.deckReport);
  const size = await page.evaluate(() => { const v = document.querySelector('.viewport'); return { width: v.offsetWidth, height: v.offsetHeight }; });
  await page.setViewportSize(size);

  const outDir = join(root, '.renders', id);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const wanted = only.length ? only.map(Number) : report.slides.map((s) => s.slide);
  for (const n of wanted) {
    const s = report.slides[n - 1];
    if (!s) continue;
    await page.evaluate(({ n, steps }) => { location.hash = `#/${n}.${steps}`; }, { n, steps: s.steps });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.waitForTimeout(80);
    await page.screenshot({ path: join(outDir, `slide-${String(n).padStart(2, '0')}.png`) });
  }

  console.log(`${report.title} — ${report.slides.length} slides → .renders/${id}/`);
  for (const s of report.slides) if (s.overflow) console.log(`  ⚠ slide ${s.slide}${s.title ? ` “${s.title}”` : ''} overflows the canvas`);
  for (const p of new Set(problems)) console.log(`  · ${p}`);
  if (!report.slides.some((s) => s.overflow)) console.log('  no overflow detected');
} finally {
  await browser.close();
  server.close();
}
