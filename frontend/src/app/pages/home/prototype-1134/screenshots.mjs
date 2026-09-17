/**
 * THROWAWAY PROTOTYPE — the evidence driver. Against a running
 * `npm run prototype:1134`, it walks the four variants over the four cases on a phone viewport
 * (plus the opening view on a desktop one), writes the PNGs the README cites into
 * `screenshots/`, and prints the measurements the verdict rests on.
 *
 * Two gotchas it encodes: a pan must START ON EMPTY SEA, because a drag begun on a pin button
 * never reaches the canvas; and overlay pins are clicked with `force: true`, because the
 * re-projection tick keeps Playwright's stability check from ever settling.
 *
 *   npm run prototype:1134:shots
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
const BASE = process.env.PROTOTYPE_URL ?? 'http://localhost:4200';
const CASES = {
  riviera: '',
  dhermi: '&at=19.6394,40.1483,16',
  jale: '&at=19.719,40.108,13',
  ksamil: '&at=20.0027,39.7674,14',
};
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_EXECUTABLE ?? '/opt/pw-browsers/chromium',
});
const findings = {};

async function open(context, variant, kase, onPhone) {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`PAGE ERROR ${variant}/${kase}: ${error.message}`));
  await page.goto(`${BASE}/?variant=${variant}${CASES[kase]}`);
  if (onPhone) {
    await page.getByTestId('view-map').click();
  }
  await page.locator('app-pin-crowding-prototype button').first().waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'app-prototype-switcher { display: none }' });
  await page.waitForTimeout(2_000);
  return page;
}

const shoot = (page, name) =>
  page.locator('[data-testid="map-panel"]').screenshot({ path: join(OUT, `${name}.png`) });

/** Every visible overlay control: its box in map-panel px and its accessible name. */
async function controls(page) {
  return page.evaluate(() => {
    const host = document.querySelector('app-pin-crowding-prototype');
    const origin = host.getBoundingClientRect();
    return [...host.querySelectorAll('button')]
      .filter((button) => getComputedStyle(button).opacity !== '0')
      .map((button) => {
        const box = button.getBoundingClientRect();
        return {
          label: button.getAttribute('aria-label') ?? '',
          x: box.x + box.width / 2 - origin.x,
          y: box.y + box.height / 2 - origin.y,
          w: box.width,
          h: box.height,
        };
      });
  });
}

const mapHeight = async (page) =>
  (await page.locator('app-pin-crowding-prototype').boundingBox()).height;

/** Web Mercator at MapLibre's 512 px tiles: how far apart two points project at a zoom. */
function projectedPx(a, b, zoom) {
  const scale = (512 * 2 ** zoom) / 360;
  const y = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI);
  return Math.hypot((a.lng - b.lng) * scale, (y(a.lat) - y(b.lat)) * scale);
}

const DHERMI = [
  { name: 'Havana Beach', lat: 40.14831, lng: 19.63925 },
  { name: 'Folie Marine', lat: 40.14848, lng: 19.63941 },
  { name: 'Dhërmi Sun Club', lat: 40.14819, lng: 19.63953 },
];
findings.dhermiAtMaxZoomPx = [
  [DHERMI[0], DHERMI[1]],
  [DHERMI[0], DHERMI[2]],
  [DHERMI[1], DHERMI[2]],
].map(([a, b]) => `${a.name} ↔ ${b.name}: ${projectedPx(a, b, 16).toFixed(1)} px`);

const phone = await browser.newContext({
  viewport: PHONE,
  hasTouch: true,
  deviceScaleFactor: 1,
});
for (const variant of ['A', 'B', 'C', 'D']) {
  for (const kase of Object.keys(CASES)) {
    const page = await open(phone, variant, kase, true);
    await shoot(page, `${variant.toLowerCase()}-${kase}-phone`);

    if (variant === 'A' && kase === 'riviera') {
      const crowds = (await controls(page)).filter((c) => /venues here/.test(c.label));
      findings.openingView = {
        crowds: crowds.map((c) => c.label.split(' ')[0]),
        solo: (await controls(page)).filter(
          (c) => !/venues here/.test(c.label) && c.x > 0 && c.y > 0 && c.x < 400 && c.y < 700,
        ).length,
      };
    }
    if (variant === 'A' && kase === 'jale') {
      await page.getByRole('button', { name: /5 venues here/ }).click({ force: true });
      await page.waitForTimeout(500);
      await shoot(page, 'a-jale-fanned-phone');
    }
    if (variant === 'B' && kase === 'jale') {
      await page.getByRole('button', { name: /5 venues at this spot/ }).click({ force: true });
      await page.waitForTimeout(500);
      const sheet = await page.getByRole('dialog').boundingBox();
      findings.bSheetShareOfPhoneMap = `${((100 * sheet.height) / (await mapHeight(page))).toFixed(0)}%`;
      findings.bSheetRowsVisible = await page
        .getByRole('dialog')
        .getByRole('listitem')
        .evaluateAll(
          (items) =>
            items.filter(
              (item) =>
                item.getBoundingClientRect().bottom <=
                item.closest('ul').getBoundingClientRect().bottom,
            ).length,
        );
      await shoot(page, 'b-jale-sheet-phone');
    }
    if (variant === 'C' && kase === 'riviera') {
      const pins = (await controls(page)).filter((c) => c.x > 0 && c.y > 0);
      let closest = { px: Infinity };
      for (const a of pins) {
        for (const b of pins) {
          const px = Math.hypot(a.x - b.x, a.y - b.y);
          if (a !== b && px < closest.px) closest = { px, a: a.label, b: b.label };
        }
      }
      findings.cOpeningViewClosestPins = `${closest.px.toFixed(1)} px between "${closest.a}" and "${closest.b}"`;
    }
    if (variant === 'D' && kase === 'riviera') {
      findings.dOpeningViewChips = (await controls(page))
        .filter((c) => c.x > -50 && c.y > 0)
        .map((c) => `${c.w.toFixed(0)}×${c.h.toFixed(0)} ${c.label}`);
      await page.getByRole('button', { name: /^3 venues at Dhërmi/ }).click({ force: true });
      await page.waitForTimeout(500);
      await shoot(page, 'd-riviera-open-phone');
    }
    if (variant === 'D' && kase === 'dhermi') {
      await page.getByRole('button', { name: /^3 venues at Dhërmi/ }).click({ force: true });
      await page.waitForTimeout(500);
      const card = await page.getByTestId('venue-preview').boundingBox();
      findings.dCardShareOfPhoneMap = `${((100 * card.height) / (await mapHeight(page))).toFixed(0)}%`;
      const walk = [await page.getByTestId('preview-name').innerText()];
      for (let step = 0; step < 3; step += 1) {
        await page.getByRole('button', { name: /^Next venue at/ }).click({ force: true });
        await page.waitForTimeout(300);
        walk.push(await page.getByTestId('preview-name').innerText());
      }
      findings.dStepperWalk = walk.map((name) => name.trim()).join(' → ');
      await page.getByRole('button', { name: /^Previous venue at/ }).click({ force: true });
      await page.waitForTimeout(300);
      await shoot(page, 'd-dhermi-open-phone');
    }
    await page.close();
  }
}
await phone.close();

const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
for (const variant of ['A', 'B', 'C', 'D']) {
  const page = await open(desktop, variant, 'riviera', false);
  await shoot(page, `${variant.toLowerCase()}-riviera-desktop`);
  if (variant === 'B' || variant === 'D') {
    const jale = page.getByRole('button', { name: /^6 venues/ });
    await jale.evaluate((button) => {
      button.dataset.probe = 'focused-before-zoom';
      button.focus();
    });
    const map = await page.locator('app-pin-crowding-prototype').boundingBox();
    await page.mouse.move(map.x + 60, map.y + map.height - 120);
    for (let notch = 0; notch < 6; notch += 1) {
      await page.mouse.wheel(0, -1_000);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(1_200);
    findings[`focusSurvivesRegroup${variant}`] = {
      jaleCrowdNow: (await controls(page))
        .filter((c) => /Jale/.test(c.label))
        .map((c) => c.label.split(';')[0]),
      probedElementStillInDom: (await page.locator('[data-probe]').count()) === 1,
      stillFocused: await page.evaluate(
        () => document.activeElement?.dataset.probe === 'focused-before-zoom',
      ),
    };
  }
  await page.close();
}
await desktop.close();
await browser.close();
console.log(JSON.stringify(findings, null, 2));
