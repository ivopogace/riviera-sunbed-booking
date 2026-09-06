import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? '/tmp/shots/h';
mkdirSync(OUT, { recursive: true });
const VARIANT = process.env.VARIANT ?? 'h';
const ONLY = process.env.ONLY;

const VENUE = {
  id: 1,
  name: 'Miramar Beach Club',
  beach: 'Ksamil',
  region: 'Albanian Riviera',
  description: 'Premium loungers on the Ksamil shoreline.',
  ratingTenths: 48,
  reviewsCount: 326,
  bookingMode: 'INSTANT',
  fromPrice: { minorUnits: 2500, currency: 'EUR' },
  amenities: ['SHOWERS', 'BEACH_BAR', 'FREE_PARKING', 'WIFI'],
  distanceToWaterM: 15,
  distanceToWater: 15,
  availability: { free: 14, total: 18 },
  coverPhoto: null,
  photos: [],
  salesOpen: true,
  salesClose: '16:00',
  sets: Array.from({ length: 18 }, (_, i) => ({
    id: i + 1,
    rowLabel: i < 6 ? 'Front row · Sea view' : i < 12 ? 'Second row' : 'Row 3 · Back',
    positionNo: (i % 6) + 1,
    tier: i < 6 ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: i < 6 ? 4500 : 2500, currency: 'EUR' },
    gridX: (i % 6) + 1,
    gridY: Math.floor(i / 6) + 1,
    availability: i === 3 || i === 9 ? 'BOOKED' : 'FREE',
  })),
};
const VENUES = [
  VENUE,
  {
    id: 2,
    name: 'Aurora Bay',
    beach: 'Dhërmi',
    region: 'Albanian Riviera',
    ratingTenths: 41,
    reviewsCount: 88,
    bookingMode: 'REQUEST',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
    availability: { free: 5, total: 10 },
    salesOpen: true,
  },
];
const CODE = 'ABCD234567';
const ROW = {
  code: CODE,
  status: 'CONFIRMED',
  venueId: 1,
  venueName: 'Miramar Beach Club',
  rowLabel: 'Front row · Sea view',
  positionNo: 2,
  bookingDate: '2026-12-01',
  amount: { minorUnits: 4500, currency: 'EUR' },
  requestExpiresAt: null,
};
const PENDING = {
  ...ROW,
  code: 'PNDG234567',
  status: 'PENDING_REQUEST',
  venueName: 'Aurora Bay',
  cancellable: false,
  beforeCutoff: true,
  refundIfCancelledNow: null,
  refundedAmount: null,
  requestExpiresAt: '2026-11-30T16:00:00Z',
  withdrawable: true,
  payment: null,
  cancellationWindowAtBirth: 'FREE',
  reviewPanel: { kind: 'NOT_COMPLETED' },
};
const DETAIL = {
  ...ROW,
  cancellable: true,
  beforeCutoff: true,
  refundIfCancelledNow: { minorUnits: 4500, currency: 'EUR' },
  refundedAmount: null,
  payment: null,
  reviewPanel: { kind: 'NOT_COMPLETED' },
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function newPage({
  width,
  height,
  signedIn,
  theme,
  bookings = 'populated',
  post = 'awaiting',
}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    hasTouch: width < 640,
  });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('riviera-theme', t), theme);
  await page.addInitScript(() => {
    window.__RIVIERA_FAKE_STRIPE__ = true;
  });
  await page.route(/\/api\/.*/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.route(/\/api\/venues\/1\/reviews(\?.*)?$/, (r) =>
    r.fulfill({
      json: {
        reviews: [
          { id: 41, stars: 5, displayName: 'Ana', stayedIn: '2026-07', comment: 'Great spot.' },
        ],
        nextCursor: null,
      },
    }),
  );
  await page.route(/\/api\/venues\/1(\?.*)?$/, (r) => r.fulfill({ json: VENUE }));
  await page.route(/\/api\/venues(\?.*)?$/, (r) => r.fulfill({ json: VENUES }));
  await page.route(/\/api\/me\/bookings(\?.*)?$/, (r) =>
    r.fulfill({ json: bookings === 'empty' ? [] : [ROW, PENDING] }),
  );
  await page.route(new RegExp(`/api/bookings/${CODE}(\\?.*)?$`), (r) =>
    r.fulfill({ json: DETAIL }),
  );
  await page.route(/\/api\/bookings\/PNDG234567(\?.*)?$/, (r) => r.fulfill({ json: PENDING }));
  await page.route('**/api/bookings', (r) =>
    r.fulfill(
      post === 'confirmed'
        ? {
            status: 201,
            json: {
              code: CODE,
              status: 'CONFIRMED',
              venueId: 1,
              venueName: 'Miramar Beach Club',
              setId: 2,
              rowLabel: 'Front row · Sea view',
              positionNo: 2,
              bookingDate: '2026-12-01',
              amount: { minorUnits: 4500, currency: 'EUR' },
            },
          }
        : {
            status: 202,
            json: {
              code: 'WXYZ345678',
              status: 'AWAITING_PAYMENT',
              venueId: 1,
              venueName: 'Miramar Beach Club',
              setId: 2,
              rowLabel: 'Front row · Sea view',
              positionNo: 2,
              bookingDate: '2026-12-01',
              amount: { minorUnits: 4500, currency: 'EUR' },
              clientSecret: 'pi_123_secret_abc',
              paymentIntentId: 'pi_123',
            },
          },
    ),
  );
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
  return page;
}

async function goto(page, path) {
  const join = path.includes('?') ? '&' : '?';
  await page.goto(`http://127.0.0.1:4200${path}${join}variant=${VARIANT}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('[data-testid="prototype-switcher"]');
  await page.waitForTimeout(400);
}

async function fillDialog(page) {
  await page
    .getByRole('button', { name: /Select to book/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  return dialog;
}
async function toPay(page, target = /\/booking\/pay/) {
  const dialog = await fillDialog(page);
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();
  await page.waitForURL(target, { timeout: 15000 });
  await page.waitForTimeout(1000);
}
const menuTab = (page) => page.locator('nav[aria-label="Primary (phone)"] button');

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 900 };
const THEMES = ['porcelain', 'riviera', 'dark'];
const VIEWS = [];
for (const theme of THEMES)
  for (const signedIn of [false, true]) {
    const a = signedIn ? 'in' : 'out';
    VIEWS.push({ name: `map-phone-${theme}-${a}`, ...PHONE, theme, signedIn, path: '/venues/1' });
    VIEWS.push({
      name: `sheet-phone-${theme}-${a}`,
      ...PHONE,
      theme,
      signedIn,
      path: '/venues/1',
      sheet: true,
    });
    VIEWS.push({
      name: `theme-phone-${theme}-${a}`,
      ...PHONE,
      theme,
      signedIn,
      path: '/',
      themePop: true,
      clip: 300,
    });
    VIEWS.push({ name: `desk-home-${theme}-${a}`, ...DESK, theme, signedIn, path: '/', clip: 320 });
    VIEWS.push({
      name: `desk-account-${theme}-${a}`,
      ...DESK,
      theme,
      signedIn,
      path: '/venues/1',
      account: true,
      clip: 360,
    });
    VIEWS.push({
      name: `signin-phone-${theme}-${a}`,
      ...PHONE,
      theme,
      signedIn,
      path: '/account/sign-in',
    });
    VIEWS.push({
      name: `mybookings-phone-${theme}-${a}`,
      ...PHONE,
      theme,
      signedIn,
      path: '/my-bookings',
    });
  }
for (const theme of THEMES) {
  VIEWS.push({
    name: `mybookings-empty-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: true,
    path: '/my-bookings',
    bookings: 'empty',
  });
  VIEWS.push({
    name: `booking-pending-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: true,
    path: '/booking/PNDG234567',
  });
  VIEWS.push({
    name: `confirmation-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: false,
    path: '/venues/1',
    post: 'confirmed',
    confirm: true,
  });
  VIEWS.push({
    name: `dialog-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: false,
    path: '/venues/1',
    dialog: true,
  });
  VIEWS.push({
    name: `pay-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: false,
    path: '/venues/1',
    pay: true,
  });
  VIEWS.push({
    name: `signin-kbd-${theme}`,
    width: 390,
    height: 420,
    theme,
    signedIn: false,
    path: '/account/sign-in',
    kbd: true,
  });
  VIEWS.push({
    name: `landscape-${theme}`,
    width: 844,
    height: 390,
    theme,
    signedIn: true,
    path: '/venues/1',
  });
  VIEWS.push({
    name: `narrow320-${theme}`,
    width: 320,
    height: 640,
    theme,
    signedIn: true,
    path: '/venues/1',
  });
  VIEWS.push({
    name: `narrow320-sheet-${theme}`,
    width: 320,
    height: 640,
    theme,
    signedIn: true,
    path: '/venues/1',
    sheet: true,
  });
  VIEWS.push({
    name: `find-from-sheet-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: false,
    path: '/venues/1',
    findFromSheet: true,
  });
  VIEWS.push({
    name: `map-bottom-phone-${theme}`,
    ...PHONE,
    theme,
    signedIn: true,
    path: '/venues/1',
    scrollBottom: true,
  });
}

for (const v of VIEWS) {
  if (ONLY && !v.name.includes(ONLY)) continue;
  const page = await newPage(v);
  try {
    await goto(page, v.path);
    if (v.pay) await toPay(page);
    if (v.confirm) await toPay(page, /\/booking\/confirmation/);
    if (v.dialog) await fillDialog(page);
    if (v.sheet) {
      await menuTab(page).click();
      await page.waitForTimeout(300);
    }
    if (v.themePop) {
      await page.getByRole('button', { name: /Color theme/ }).click();
      await page.waitForTimeout(300);
    }
    if (v.account) {
      await page.locator('header button[aria-expanded]').last().click();
      await page.waitForTimeout(300);
    }
    if (v.kbd) {
      await page.getByLabel('Email').first().focus();
      await page.waitForTimeout(200);
    }
    if (v.findFromSheet) {
      await menuTab(page).click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: 'Find a booking' }).click();
      await page.waitForTimeout(400);
    }
    if (v.scrollBottom) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: `${OUT}/${v.name}.png`,
      clip: { x: 0, y: 0, width: v.width, height: Math.min(v.height, v.clip ?? v.height) },
    });
    console.log(v.name);
  } catch (e) {
    console.error(`FAILED ${v.name}: ${e.message.split('\n')[0]}`);
  }
  await page.context().close();
}
await browser.close();
