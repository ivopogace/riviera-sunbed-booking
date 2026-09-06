import { chromium } from 'playwright';
const VARIANT = process.env.VARIANT ?? 'h';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function mk({ width = 390, height = 844, signedIn = false, theme = 'porcelain' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
  await page.route(/\/api\/.*/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.route(/\/api\/venues(\?.*)?$/, (r) => r.fulfill({ json: [] }));
  await page.route(/\/api\/auth\/me$/, (r) =>
    signedIn
      ? r.fulfill({
          json: {
            username: 'sofia.kelmendi@example.com',
            principalType: 'CUSTOMER',
            emailVerified: true,
          },
        })
      : r.fulfill({
          status: 401,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 401, code: 'UNAUTHENTICATED' }),
        }),
  );
  await page.goto(`http://127.0.0.1:4200/?variant=${VARIANT}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="prototype-switcher"]');
  await page.waitForTimeout(400);
  return page;
}
const desc = (page) =>
  page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return 'BODY';
    return `${e.tagName.toLowerCase()}[${e.getAttribute('aria-label') ?? e.textContent.trim().slice(0, 30)}]`;
  });

// 1. geometry + DOM/tab order at phone width
{
  const page = await mk();
  const geo = await page.evaluate(() => {
    const h = document.querySelector('header').getBoundingClientRect();
    const n = document.querySelector('nav[aria-label="Primary (phone)"]').getBoundingClientRect();
    const main = document.querySelector('main').getBoundingClientRect();
    const shell = getComputedStyle(document.querySelector('app-root > div'));
    return {
      headerH: h.height,
      navTop: n.top,
      navH: n.height,
      shellPadBottom: shell.paddingBottom,
      mainTop: main.top,
      navBeforeMain: !!(
        document
          .querySelector('nav[aria-label="Primary (phone)"]')
          .compareDocumentPosition(document.querySelector('main')) &
        Node.DOCUMENT_POSITION_FOLLOWING
      ),
    };
  });
  console.log('GEOMETRY', JSON.stringify(geo));
  const order = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    order.push(await desc(page));
  }
  console.log('TAB ORDER', order.join(' > '));
  // theme popover open on phone: is the bottom nav still hittable (backdrop coverage)?
  await page.getByRole('button', { name: /Color theme/ }).click();
  await page.waitForTimeout(250);
  const hit = await page.evaluate(() => {
    const n = document.querySelector('nav[aria-label="Primary (phone)"] a');
    const r = n.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.closest('nav')
      ? 'NAV (backdrop does not cover the tab bar)'
      : el.className.slice(0, 40);
  });
  console.log('THEME-POP OPEN, tap on Beaches tab hits:', hit);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  console.log(
    'THEME-POP ESC → focus:',
    await desc(page),
    'open?',
    await page.locator('button[aria-pressed]').count(),
  );
  await page.close();
}
// 2. sheet: focus on open, Escape, backdrop, find-from-sheet return
for (const signedIn of [false, true]) {
  const page = await mk({ signedIn });
  const tab = page.locator('nav[aria-label="Primary (phone)"] button');
  await tab.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log(
    `SHEET(${signedIn ? 'in' : 'out'}) open → focus:`,
    await desc(page),
    '| aria-expanded:',
    await tab.getAttribute('aria-expanded'),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log(
    '  ESC → focus:',
    await desc(page),
    '| sheet rows:',
    await page.getByRole('button', { name: 'Find a booking' }).count(),
  );
  await tab.click();
  await page.waitForTimeout(300);
  await page.mouse.click(195, 200);
  await page.waitForTimeout(200);
  console.log(
    '  BACKDROP tap → focus:',
    await desc(page),
    '| sheet rows:',
    await page.getByRole('button', { name: 'Find a booking' }).count(),
  );
  await tab.click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Find a booking' }).click();
  await page.waitForTimeout(400);
  console.log(
    '  FIND from sheet → dialog:',
    await page.getByRole('dialog').count(),
    'focus:',
    await desc(page),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('  FIND dismissed → focus:', await desc(page));
  await page.close();
}
// 3. desktop popovers: focus on open / Escape return
{
  const page = await mk({ width: 1280, height: 900, signedIn: true });
  const acct = page.locator('header button[aria-expanded]').last();
  await acct.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  console.log('DESK account open → focus:', await desc(page));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('DESK account ESC → focus:', await desc(page));
  await acct.click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Find a booking' }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('DESK find-from-account dismissed → focus:', await desc(page));
  const order = [];
  await page.locator('header a').first().focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    order.push(await desc(page));
  }
  console.log('DESK TAB ORDER', order.join(' > '));
  await page.close();
}
await browser.close();
