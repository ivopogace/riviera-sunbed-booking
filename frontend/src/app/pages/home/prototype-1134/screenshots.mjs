/**
 * THROWAWAY PROTOTYPE — the evidence driver. Against a running
 * `npm run prototype:1134`, it walks the hybrid over the four cases on a phone viewport (plus the
 * opening view and the Dhërmi case on a desktop one), writes the PNGs the README cites into
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

async function open(context, kase, onPhone) {
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`PAGE ERROR ${kase}: ${error.message}`));
  await page.goto(`${BASE}/?variant=E${CASES[kase]}`);
  if (onPhone) {
    await page.getByTestId('view-map').click();
  }
  await page.locator('app-pin-crowding-prototype button').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2_000);
  return page;
}

const shoot = (page, name) =>
  page.locator('[data-testid="map-panel"]').screenshot({ path: join(OUT, `${name}.png`) });

const shootPage = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

/** Press a control by its accessible name and let the camera, the list and the focus settle. */
async function press(page, name) {
  await page.getByRole('button', { name }).first().click({ force: true });
  await page.waitForTimeout(1_500);
}

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

const onMap = (c) => c.x > -50 && c.y > 0 && c.x < 420 && c.y < 700;

/** The page's state the hybrid acts on: the beach filter, the count block, the card, the focus. */
async function pageState(page) {
  return {
    beachFilter: await page.getByTestId('filter-beach').inputValue(),
    results: (await page.getByTestId('results').innerText()).replace(/\s+/g, ' ').trim(),
    previewOpen: await page.getByTestId('venue-preview').isVisible(),
    focus: await page.evaluate(
      () =>
        `${document.activeElement?.tagName ?? ''} ${(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 30) ?? '').split(';')[0]}`,
    ),
  };
}

const mapHeight = async (page) =>
  (await page.locator('app-pin-crowding-prototype').boundingBox()).height;

/** The closest two visible controls on the map, in px between their centres. */
function closestPair(pins) {
  let closest = { px: Infinity };
  for (const a of pins) {
    for (const b of pins) {
      const px = Math.hypot(a.x - b.x, a.y - b.y);
      if (a !== b && px < closest.px) closest = { px, a: a.label, b: b.label };
    }
  }
  return closest;
}

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
{
  const page = await open(phone, 'riviera', true);
  await shoot(page, 'riviera-phone');
  const pills = (await controls(page)).filter(onMap);
  findings.openingView = {
    crowds: pills.filter((c) => /venues at/.test(c.label)).map((c) => c.label.split(',')[0]),
    solo: pills.filter((c) => !/venues at/.test(c.label)).length,
    pills: pills.map((c) => `${c.w.toFixed(0)}×${c.h.toFixed(0)} ${c.label.split(';')[0]}`),
  };
  await press(page, /^9 venues at 3 beaches/);
  await shoot(page, 'riviera-pressed-phone');
  findings.afterPressingTheNine = {
    ...(await pageState(page)),
    pins: (await controls(page)).filter(onMap).map((c) => c.label.split(';')[0]),
  };
  await press(page, /^6 venues at Jale & Livadh/);
  await press(page, /^5 venues at Jale/);
  await shoot(page, 'jale-narrowed-phone');
  const pins = (await controls(page)).filter(onMap);
  findings.afterThreePressesJale = {
    ...(await pageState(page)),
    pins: pins.map((c) => c.label),
    closestPins: `${closestPair(pins).px.toFixed(1)} px`,
    crumb: await page.getByTestId('prototype-beach-crumb').innerText(),
  };
  await press(page, /^Blue Bay Jale/);
  await shoot(page, 'jale-card-phone');
  findings.openingViewToAJaleCard = { presses: 4, ...(await pageState(page)) };
  await page.getByTestId('preview-close').click();
  await page.waitForTimeout(400);
  await press(page, /^Showing Jale only/);
  findings.crumbShowsAllBeaches = {
    ...(await pageState(page)),
    pins: (await controls(page)).filter(onMap).length,
  };
  await page.close();
}
{
  const page = await open(phone, 'dhermi', true);
  await shoot(page, 'dhermi-phone');
  findings.dhermiPillBeforeAnyPress = (await controls(page))
    .filter(onMap)
    .map((c) => `${c.w.toFixed(0)}×${c.h.toFixed(0)} ${c.label}`);
  await press(page, /^3 venues at Dhërmi, from €18; press to open Havana Beach/);
  await shoot(page, 'dhermi-open-phone');
  const card = await page.getByTestId('venue-preview').boundingBox();
  findings.dhermiFirstPress = {
    ...(await pageState(page)),
    pill: (await controls(page)).filter(onMap).map((c) => c.label)[0],
    cardShareOfPhoneMap: `${((100 * card.height) / (await mapHeight(page))).toFixed(0)}%`,
  };
  const walk = [await page.getByTestId('preview-name').innerText()];
  for (let step = 0; step < 3; step += 1) {
    await press(page, /press again for/);
    walk.push(await page.getByTestId('preview-name').innerText());
  }
  findings.dhermiPressAgainWalk = walk.map((name) => name.trim()).join(' → ');
  await press(page, /^Previous venue at/);
  await shoot(page, 'dhermi-stepped-phone');
  findings.dhermiCardStepper = await page.getByTestId('preview-name').innerText();
  await page.close();
}
{
  const page = await open(phone, 'ksamil', true);
  await shoot(page, 'ksamil-phone');
  await press(page, /^2 venues at Ksamil/);
  await shoot(page, 'ksamil-pressed-phone');
  const pins = (await controls(page)).filter((c) => c.x > 0 && c.y > 0 && c.x < 400);
  findings.ksamilAfterOnePress = {
    ...(await pageState(page)),
    pins: pins.map((c) => c.label),
    closestPins: `${closestPair(pins).px.toFixed(1)} px`,
  };
  await page.close();
}
{
  const page = await open(phone, 'jale', true);
  await shoot(page, 'jale-phone');
  await press(page, /^5 venues at Jale/);
  await shoot(page, 'jale-pressed-phone');
  await page.close();
}
await phone.close();

const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
{
  const page = await open(desktop, 'riviera', false);
  await shoot(page, 'riviera-desktop');
  const nine = page.getByRole('button', { name: /^9 venues/ });
  await nine.evaluate((button) => {
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
  findings.focusSurvivesRegroup = {
    crowdNow: (await controls(page))
      .filter((c) => /Jale|beaches/.test(c.label))
      .map((c) => c.label.split(';')[0]),
    probedElementStillInDom: (await page.locator('[data-probe]').count()) === 1,
    stillFocused: await page.evaluate(
      () => document.activeElement?.dataset.probe === 'focused-before-zoom',
    ),
  };
  await page.close();
}
{
  const page = await open(desktop, 'ksamil', false);
  await shootPage(page, 'ksamil-desktop');
  await press(page, /^2 venues at Ksamil/);
  await shootPage(page, 'ksamil-pressed-desktop');
  await page.close();
}
{
  const page = await open(desktop, 'dhermi', false);
  await press(page, /^3 venues at Dhërmi, from €18; press to open Havana Beach/);
  await shootPage(page, 'dhermi-open-desktop');
  findings.dhermiFirstPressDesktop = await pageState(page);
  await page.close();
}
await desktop.close();
await browser.close();
console.log(JSON.stringify(findings, null, 2));
