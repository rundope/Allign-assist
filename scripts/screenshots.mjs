// Regenerates the screenshots in docs/images/ from the built app (dist/index.html), in Korean and English.
//   npm run build && npm i --no-save playwright && npx playwright install chromium && node scripts/screenshots.mjs
// Set CHROMIUM=/path/to/chromium to use an existing browser instead of Playwright's download.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url);
const app = new URL('dist/index.html', root).href;
const out = fileURLToPath(new URL('docs/images/', root));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const errors = [];

async function open(lang, viewport = { width: 1400, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: 'light' });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(app);
  await page.evaluate((lang) => {
    localStorage.clear();
    localStorage.setItem('align-assist:lang', lang);
  }, lang);
  await page.reload();
  await ready(page);
  return page;
}

async function ready(page) {
  await page.waitForSelector('#result:not([hidden]) .block svg');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
}

async function loadExample(page, key) {
  await page.selectOption('#input-panel select.btn-select', key);
  await page.waitForTimeout(200);
  await ready(page);
}

/** Screen position of residue k (1-based) of the given row in the alignment view. */
async function residue(page, row, k) {
  return page.evaluate(
    ([row, k]) => {
      for (const svg of document.querySelectorAll('.block svg')) {
        const rows = [...svg.querySelectorAll('text[text-anchor="middle"]')].filter((t) => t.querySelector('tspan'));
        const numbers = [...svg.querySelectorAll('text[text-anchor="end"]')];
        if (!rows[row] || !numbers[row]) continue;
        const idx = k - Number(numbers[row].textContent);
        const xs = [...rows[row].querySelectorAll('tspan')].flatMap((t) => t.getAttribute('x').split(' ').map(Number));
        if (idx < 0 || idx >= xs.length) continue;
        svg.scrollIntoView({ block: 'center' });
        const r = svg.getBoundingClientRect();
        return { x: r.left + xs[idx], y: r.top + Number(rows[row].getAttribute('y')) - 4 };
      }
      return null;
    },
    [row, k],
  );
}

// lang = null for screenshots with no UI text (one file shared by both manuals)
const file = (name, lang) => `${out}${name}${lang ? `.${lang}` : ''}.png`;
const shot = (page, name, lang, opts = {}) => page.screenshot({ path: file(name, lang), ...opts });
/** Element screenshot in a very tall window, so nothing has to scroll under the sticky top bar. */
async function shotEl(page, loc, name, lang) {
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 4000 });
  await page.waitForTimeout(300);
  await loc.screenshot({ path: file(name, lang) });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}

/** From the top of block `from` to the bottom of block `to` in the alignment view. */
async function shotBlocks(page, name, lang, from, to) {
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 4000 });
  await page.waitForTimeout(300);
  await page.locator('.block').nth(from).scrollIntoViewIfNeeded();
  const a = await page.locator('.block').nth(from).boundingBox();
  const b = await page.locator('.block').nth(to).boundingBox();
  await shot(page, name, lang, { clip: { x: a.x, y: a.y, width: a.width, height: b.y + b.height - a.y } });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}

for (const lang of ['ko', 'en']) {
  const page = await open(lang);

  // 1. whole screen with the default example
  await shot(page, 'overview', lang);

  // 2. sequence cards (with AB1 chips and strand buttons)
  await shotEl(page, page.locator('#input-panel').locator('..'), 'input', lang);

  // 3. alignment view: legend + first two blocks
  const top = await page.locator('#result').boundingBox();
  const second = await page.locator('.block').nth(1).boundingBox();
  await shot(page, 'view', lang, { clip: { x: top.x, y: top.y, width: top.width, height: second.y + second.height - top.y + 8 } });

  // 4. tooltip with the chromatogram (read_1 = row 1)
  const pt = await residue(page, 1, 41);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(300);
  const tip = await page.locator('#tooltip').boundingBox();
  const x0 = Math.max(0, Math.min(pt.x, tip.x) - 40);
  const y0 = Math.max(0, Math.min(pt.y, tip.y) - 40);
  const x1 = Math.max(pt.x, tip.x + tip.width) + 40;
  const y1 = Math.max(pt.y, tip.y + tip.height) + 40;
  await shot(page, 'tooltip-ab1', lang, { clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
  await page.mouse.move(5, 5);

  // 5. statistics
  await shotEl(page, page.locator('#stats'), 'stats', lang);

  // 6. an AB1 read loaded as input: chromatogram strips above the alignment row (blocks 61–360)
  await loadExample(page, 'ab1-read');
  // (names and residues only, so one image for both languages)
  if (lang === 'ko') await shotBlocks(page, 'trace-inline', null, 1, 5);

  // 7. protein MSA (names and residues only, so one image for both languages), plus the colour settings
  await loadExample(page, 'protein-msa');
  if (lang === 'ko') await shotBlocks(page, 'msa', null, 0, 1);
  const colours = page.locator('#settings details').nth(2);
  await colours.evaluate((d) => (d.open = true));
  await shotEl(page, colours, 'settings-colour', lang);

  await page.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('screenshots written to', out);
