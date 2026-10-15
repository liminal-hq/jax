// Browser smoothness check: serves the built demo, steps through moods and saves screenshot runs
//
// Not part of the unit tests. Run with:
//   NODE_PATH=~/.cache/pb-check/node_modules node scripts/smooth-check.mjs
// Set `JAX_CHROME` to a different headless browser binary if needed.

import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = '/tmp/jax-smooth';
const distDir = '/tmp/jax-smooth-demo';
const chrome =
  process.env.JAX_CHROME ??
  join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell');

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
execFileSync('npx', ['vite', 'build', 'demo', '--outDir', distDir, '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit'
});

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const path = normalize(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(distDir, path === '/' ? 'index.html' : path);
  if (!file.startsWith(distDir) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: chrome,
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist'
  ]
});
const page = await browser.newPage({ viewport: { width: 460, height: 1000 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${url}?solo`);
await page.waitForSelector('#hero canvas, #hero svg', { timeout: 30000 });

const kind = await page.evaluate(() =>
  document.querySelector('#hero canvas') ? 'webgl' : 'fallback'
);
const glWorked = await page.evaluate(() => {
  const canvas = document.querySelector('#hero canvas');
  if (!canvas) return false;
  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
});
console.log(`hero renders as: ${kind}; WebGL context available: ${glWorked}`);

const heroBox = await page.locator('#hero').boundingBox();
// Name moods on the command line to check just those (each from chill); otherwise run the tour
const only = process.argv.slice(2);
const changes = only.length
  ? only.map((mood) => ['chill', mood])
  : [
      ['chill', 'flipping'],
      ['flipping', 'tea'],
      ['tea', 'thumbsup'],
      ['thumbsup', 'fishing'],
      ['fishing', 'nap'],
      ['nap', 'party']
    ];
const pick = (mood) => page.locator('#chips button', { hasText: new RegExp(`^${mood}$`) }).click();

await pick('chill');
await page.waitForTimeout(1500);
let shot = 0;
const frame = async (label) =>
  page.screenshot({
    path: join(outDir, `${String(shot++).padStart(2, '0')}-${label}.png`),
    clip: heroBox,
    timeout: 60000
  });

for (const [from, to] of changes) {
  await pick(from);
  await page.waitForTimeout(2500);
  if (shot === 0) await frame(`${from}-settled`);
  await pick(to);
  for (const ms of [200, 500]) {
    await page.waitForTimeout(ms);
    await frame(`${from}-to-${to}-${ms}ms`);
  }
  await page.waitForTimeout(2500);
  await frame(`${to}-settled`);
}

const readout = await page.locator('#smoothness').textContent();
console.log(readout);
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
console.log(`screenshots in ${outDir} (${shot} files)`);

await browser.close();
server.close();
