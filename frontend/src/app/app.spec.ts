import { provideHttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { of } from 'rxjs';

import { App } from './app';
import { routes } from './app.routes';
import { CustomerAuth } from './core/customer-auth';
import { OperatorAuth } from './core/operator-auth';
import { OwnedVenue, OwnedVenues, OwnedVenuesResult } from './core/owned-venues';
import { ConsoleVenueMap } from './operator/console-venue-map';
import { SessionAuth } from './core/session-auth';
import { SignOutNotice } from './core/sign-out-notice';
import { ConsoleTheme } from './core/console-theme';
import { ThemeService } from './core/theme';

@Component({ template: '' })
class BlankPage {}

/**
 * A CustomerAuth fake: the shell injects CustomerAuth, which would otherwise fire a real
 * `GET /api/auth/me` on construction. Signal-backed so a test can flip the signed-in state before
 * rendering; reset to signed-out in each `beforeEach`.
 */
const customerAuth = {
  restoring: signal(false),
  signedIn: signal(false),
  email: signal<string | undefined>(undefined),
  signOut: vi.fn(() => Promise.resolve()),
};

/** An OperatorAuth fake for the console shell (same rationale as the CustomerAuth fake). */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(false),
  username: signal<string | undefined>('maria'),
  signOut: vi.fn(() => Promise.resolve()),
};

/** The console shell's two reads, faked so no request leaves: the owned list and the venue snapshot. */
const ONE_VENUE: readonly OwnedVenue[] = [{ id: 7, name: 'Miramar Beach Club', beach: 'Ksamil' }];
const ownedVenues = {
  venues: signal<readonly OwnedVenue[] | undefined>(ONE_VENUE),
  load: vi.fn((): Promise<OwnedVenuesResult> =>
    Promise.resolve({ status: 'loaded', venues: ONE_VENUE }),
  ),
};
const consoleVenueMap = {
  load: vi.fn(() => of({ id: 7, name: 'Miramar Beach Club', sets: [] })),
  reset: vi.fn(),
};

/** Test routes exercising the console-shell and tourist chrome mechanisms without
 *  loading real (HTTP-bound) pages. Rebuilt per test: Angular caches a resolved `loadComponent`
 *  on the `Route` object itself, so a shared array would let one spec's chunk satisfy the next. */
const surfaceRoutes = () => [
  { path: 'glass', component: BlankPage },
  { path: 'my-bookings', component: BlankPage, data: { section: 'bookings' } },
  { path: 'venues/:id', component: BlankPage, data: { section: 'beaches' } },
  { path: 'booking/:code', component: BlankPage, data: { section: 'bookings' } },
  { path: 'pay', component: BlankPage, data: { section: 'bookings', tabBar: false } },
  // The pay page's real shape: lazily loaded, so a sheet can be opened while its chunk is in flight.
  {
    path: 'pay-lazy',
    loadComponent: () => lazyChunk,
    data: { section: 'bookings', tabBar: false },
  },
  { path: 'account/password', component: BlankPage, data: { section: 'account' } },
  { path: 'operator/:venueId/daily', component: BlankPage, data: { console: 'venue' } },
  {
    path: 'admin',
    component: BlankPage,
    data: { console: 'admin' },
    children: [{ path: 'audit', component: BlankPage }],
  },
  { path: 'operator', component: BlankPage, data: { console: 'plain' } },
  { path: 'retired-flag', component: BlankPage, data: { operatorChrome: true } },
  // The operator chrome's sign-out navigates here; a resolvable target keeps that await clean.
  { path: 'account/sign-in', component: BlankPage },
  // Chunks arriving only when a spec says so — the window the header is interactive in.
  { path: 'elsewhere', loadComponent: () => lazyChunk },
  {
    path: '',
    pathMatch: 'full' as const,
    loadComponent: () => lazyChunk,
    data: { section: 'beaches' },
  },
];

/** Resolves the `lazy` route's chunk, ending the navigation a spec left in flight. */
let landLazyChunk!: () => void;
let lazyChunk: Promise<typeof BlankPage>;

describe('App (Liquid Glass shell, issue #134)', () => {
  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    lazyChunk = new Promise((resolve) => (landLazyChunk = () => resolve(BlankPage)));
    customerAuth.restoring.set(false);
    customerAuth.signedIn.set(false);
    customerAuth.email.set(undefined);
    customerAuth.signOut.mockClear();
    operatorAuth.signOut.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      // The find modal's BookingService injects HttpClient (no request fires); the fake stops the /me call.
      providers: [
        provideRouter(surfaceRoutes()),
        provideHttpClient(),
        { provide: CustomerAuth, useValue: customerAuth },
        { provide: OperatorAuth, useValue: operatorAuth },
        { provide: OwnedVenues, useValue: ownedVenues },
        { provide: ConsoleVenueMap, useValue: consoleVenueMap },
      ],
    }).compileComponents();
  });

  function shell(): { fixture: ComponentFixture<App>; el: HTMLElement } {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('should create the app', () => {
    expect(shell().fixture.componentInstance).toBeTruthy();
  });

  it('renders the brand wordmark linking home and the router outlet', () => {
    const { el } = shell();
    const brand = el.querySelector<HTMLAnchorElement>('[data-testid="brand-home"]');
    expect(brand?.textContent).toContain('Riviera');
    expect(brand?.getAttribute('href')).toBe('/');
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('theme pill opens the picker listing all three themes; picking one switches the document theme', () => {
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!.click();
    fixture.detectChanges();

    const options = el.querySelectorAll('[data-testid^="theme-option-"]');
    expect(options).toHaveLength(3);

    el.querySelector<HTMLButtonElement>('[data-testid="theme-option-porcelain"]')!.click();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
    // picker closed after selection
    expect(el.querySelector('[data-testid="theme-option-porcelain"]')).toBeNull();
  });

  it('renders exactly two primary destinations, Beaches and My bookings (#1002)', () => {
    const { el } = shell();
    const nav = el.querySelector('nav[aria-label="Primary"]')!;

    const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')].map((a) => [
      a.textContent?.trim(),
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Beaches', '/'],
      ['My bookings', '/my-bookings'],
    ]);
    // Find a booking is a menu row now, not a destination — and no button lives in the nav at all.
    expect(nav.querySelector('button')).toBeNull();
    expect(nav.textContent).not.toContain('Find a booking');
  });

  it('lists a My bookings nav entry on desktop and in the phone tab bar (T6 #139, #1003)', () => {
    const { el } = shell();

    const desktopLink = el
      .querySelector('.riv-nav-desktop')
      ?.querySelector<HTMLAnchorElement>('a[href="/my-bookings"]');
    expect(desktopLink?.textContent).toContain('My bookings');

    const tab = el
      .querySelector('[data-testid="tab-bar"]')
      ?.querySelector<HTMLAnchorElement>('a[href="/my-bookings"]');
    expect(tab?.textContent).toContain('My bookings');
  });

  /** The current-page marker on a nav link: `aria-current="page"`, what `routerLinkActive` sets. */
  function current(el: HTMLElement, scope: string, link: string): boolean {
    return el.querySelector(scope)?.querySelector(link)?.getAttribute('aria-current') === 'page';
  }

  it('marks the current page in the desktop nav and the phone tab bar (touch has no hover)', async () => {
    const { fixture, el } = shell();
    await TestBed.inject(Router).navigate(['/my-bookings']);
    fixture.detectChanges();

    expect(current(el, '.riv-nav-desktop', 'a[href="/my-bookings"]')).toBe(true);
    expect(current(el, '.riv-nav-desktop', 'a[href="/"]')).toBe(false);
    expect(current(el, '[data-testid="tab-bar"]', 'a[href="/my-bookings"]')).toBe(true);
    expect(current(el, '[data-testid="tab-bar"]', 'a[href="/"]')).toBe(false);
  });

  it('marks Beaches current at the root only, and nothing on a page the nav does not list', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);
    landLazyChunk();
    await router.navigate(['/']);
    fixture.detectChanges();
    expect(current(el, '.riv-nav-desktop', 'a[href="/"]')).toBe(true);

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.querySelector('.riv-nav-desktop')?.querySelector('[aria-current]')).toBeNull();

    // Exact-path matching: a venue page is not "Beaches"; section marking is the tab bar's rule.
    await router.navigate(['/venues/1']);
    fixture.detectChanges();
    expect(el.querySelector('.riv-nav-desktop')?.querySelector('[aria-current]')).toBeNull();
  });

  it('marks Your account current in the account menu and the mobile sheet on the account page', async () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();
    await TestBed.inject(Router).navigate(['/account/password']);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      current(el, '[data-testid="nav-account-menu"]', '[data-testid="nav-account-link"]'),
    ).toBe(true);

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      current(el, '[data-testid="mobile-menu"]', '[data-testid="nav-account-link-mobile"]'),
    ).toBe(true);
  });

  it('never marks Sign in and Create an account current together: the mode query param decides', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    await router.navigate(['/account/sign-in'], { queryParams: { mode: 'register' } });
    fixture.detectChanges();
    expect(current(el, '.riv-header', '[data-testid="nav-signin"]')).toBe(false);
    // Create an account lives in the menu popover now.
    el.querySelector<HTMLButtonElement>('[data-testid="nav-menu"]')!.click();
    fixture.detectChanges();
    expect(current(el, '[data-testid="nav-account-menu"]', '[data-testid="nav-register"]')).toBe(
      true,
    );

    // A returnUrl is no reason to lose the marker: the pair keys on `mode` alone.
    await router.navigate(['/account/sign-in'], { queryParams: { returnUrl: '/my-bookings' } });
    fixture.detectChanges();
    expect(current(el, '.riv-header', '[data-testid="nav-signin"]')).toBe(true);
    el.querySelector<HTMLButtonElement>('[data-testid="nav-menu"]')!.click();
    fixture.detectChanges();
    expect(current(el, '[data-testid="nav-account-menu"]', '[data-testid="nav-register"]')).toBe(
      false,
    );

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    expect(current(el, '[data-testid="mobile-menu"]', '[data-testid="nav-signin-mobile"]')).toBe(
      true,
    );
    expect(current(el, '[data-testid="mobile-menu"]', '[data-testid="nav-register-mobile"]')).toBe(
      false,
    );
  });

  it('signed out: a Sign in link plus a Menu button, never a Sign in that opens a menu (#1002)', () => {
    const { fixture, el } = shell();
    const header = el.querySelector('.riv-header')!;

    const signIn = header.querySelector<HTMLAnchorElement>('[data-testid="nav-signin"]')!;
    expect(signIn.tagName).toBe('A');
    expect(signIn.getAttribute('href')).toBe('/account/sign-in');
    expect(signIn.hasAttribute('aria-expanded')).toBe(false);

    const menu = header.querySelector<HTMLButtonElement>('[data-testid="nav-menu"]')!;
    expect(menu.getAttribute('aria-label')).toBe('Menu');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(header.querySelector('[data-testid="nav-account-menu"]')).toBeNull();

    menu.click();
    fixture.detectChanges();
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    const pop = header.querySelector('[data-testid="nav-account-menu"]')!;
    // Create an account deep-links into the unified card's register mode.
    const register = pop.querySelector<HTMLAnchorElement>('[data-testid="nav-register"]')!;
    expect(register.getAttribute('href')).toBe('/account/sign-in?mode=register');
    expect(register.textContent).toContain('Create an account');
    expect(pop.querySelector('[data-testid="find-open"]')?.textContent).toContain('Find a booking');
    // No signed-in affordances when signed out.
    expect(header.querySelector('[data-testid="nav-user"]')).toBeNull();
    expect(header.querySelector('[data-testid="nav-signout"]')).toBeNull();
    expect(header.querySelector('[data-testid="nav-account-link"]')).toBeNull();
  });

  it('signed in: one account chip opening the account menu, and signs out on click (#1002)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();
    const header = el.querySelector('.riv-header')!;

    const chip = header.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!;
    expect(chip.getAttribute('aria-label')).toBe('Account: ana@example.com');
    // The handle is the visible label; the full address waits in the menu.
    expect(chip.textContent).toContain('ana');
    expect(chip.textContent).not.toContain('ana@example.com');
    expect(header.textContent).not.toContain('Signed in as');
    // The signed-out controls are gone.
    expect(header.querySelector('[data-testid="nav-signin"]')).toBeNull();
    expect(header.querySelector('[data-testid="nav-menu"]')).toBeNull();

    chip.click();
    fixture.detectChanges();
    const pop = header.querySelector('[data-testid="nav-account-menu"]')!;
    expect(pop.querySelector('[data-testid="nav-account-identity"]')?.textContent).toContain(
      'ana@example.com',
    );
    expect(pop.querySelector('[data-testid="find-open"]')?.textContent).toContain('Find a booking');
    expect(pop.querySelector('[data-testid="nav-register"]')).toBeNull();

    pop.querySelector<HTMLButtonElement>('[data-testid="nav-signout"]')!.click();
    fixture.detectChanges();
    expect(customerAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('opens an account menu with a Your account link when signed in (#351)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    // Closed by default: the menu's contents are absent until the trigger is activated.
    const trigger = el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(el.querySelector('[data-testid="nav-signout"]')).toBeNull();

    trigger.click();
    fixture.detectChanges();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const link = el.querySelector<HTMLAnchorElement>('[data-testid="nav-account-link"]');
    expect(link?.getAttribute('href')).toBe('/account/password');
    expect(link?.textContent).toContain('Your account');
    expect(el.querySelector('[data-testid="nav-signout"]')).not.toBeNull();

    // A disclosure, NOT an ARIA menu — role=menu would oblige roving tabindex (WCAG 4.1.2).
    expect(el.querySelector('[data-testid="nav-account-menu"]')?.getAttribute('role')).toBeNull();
    expect(link?.getAttribute('role')).toBeNull();
  });

  it('closes the signed-out menu on Escape and on the backdrop, handing focus back to the Menu button (#1002)', () => {
    const { fixture, el } = shell();
    const trigger = el.querySelector<HTMLButtonElement>('[data-testid="nav-menu"]')!;

    trigger.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    fixture.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="account-backdrop"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes the account menu when the theme picker opens, and vice versa (#351)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(el.querySelector('[data-testid="theme-option-porcelain"]')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="theme-option-porcelain"]')).toBeNull();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).not.toBeNull();
  });

  it('closes the account menu on Escape and hands focus back to the trigger (#351)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    const trigger = el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!;
    trigger.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('offers the account group in the mobile menu when signed in (#351)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();

    const menu = el.querySelector('[data-testid="mobile-menu"]')!;
    expect(menu.querySelector('[data-testid="nav-user-mobile"]')?.textContent).toContain(
      'ana@example.com',
    );
    const link = menu.querySelector<HTMLAnchorElement>('[data-testid="nav-account-link-mobile"]');
    expect(link?.getAttribute('href')).toBe('/account/password');
    expect(link?.textContent).toContain('Your account');
    expect(menu.querySelector('[data-testid="nav-signout-mobile"]')).not.toBeNull();
    // Flat group, not a nested popover.
    expect(menu.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
  });

  /** The tab carrying `aria-current="page"`, by test id, or `null` when no tab is lit. */
  function currentTab(el: HTMLElement): string | null {
    return (
      el
        .querySelector('[data-testid="tab-bar"]')
        ?.querySelector('[aria-current="page"]')
        ?.getAttribute('data-testid') ?? null
    );
  }

  it.each([false, true])(
    'renders the three-tab bottom bar and no hamburger in the top bar (signed in: %s) (#1003)',
    (signedIn) => {
      customerAuth.signedIn.set(signedIn);
      customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
      const { el } = shell();

      const bar = el.querySelector<HTMLElement>('[data-testid="tab-bar"]')!;
      expect(bar.tagName).toBe('NAV');
      expect(bar.getAttribute('aria-label')).toBe('Primary (phone)');
      const links = [...bar.querySelectorAll<HTMLAnchorElement>('a')].map((a) => [
        a.textContent?.trim(),
        a.getAttribute('href'),
      ]);
      expect(links).toEqual([
        ['Beaches', '/'],
        ['My bookings', '/my-bookings'],
      ]);

      // The third tab opens the sheet; it is never a `Sign in` (a control so labelled must navigate).
      const tab = bar.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!;
      // The label is the tab's own text; the avatar initial inside the pill is aria-hidden.
      const label = [...tab.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join('')
        .trim();
      expect(label).toBe(signedIn ? 'Account' : 'Menu');
      expect(tab.getAttribute('aria-label')).toBe(signedIn ? 'Account: ana@example.com' : 'Menu');
      expect(tab.getAttribute('aria-expanded')).toBe('false');
      expect(bar.textContent).not.toContain('Sign in');
      expect(el.querySelector('.riv-header [data-testid="menu-toggle"]')).toBeNull();
    },
  );

  it('the third tab hides its label and glyph until the session restore settles (#1003)', () => {
    customerAuth.restoring.set(true);
    const { el } = shell();

    const tab = el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!;
    expect(tab.textContent?.trim()).toBe('');
    expect(tab.querySelector('svg')).toBeNull();
    expect(tab.getAttribute('aria-label')).toBe('Menu');
  });

  it('the top bar scrolls away below sm: relative there, sticky from sm up (#1003)', () => {
    const { el } = shell();
    const header = el.querySelector<HTMLElement>('.riv-header')!;

    // jsdom loads no stylesheet: the declaration is pinned here, the computed position in the e2e.
    expect(header.classList.contains('sticky')).toBe(true);
    expect(header.classList.contains('max-sm:relative')).toBe(true);
    // Brand and swatch are the phone top bar's whole control set.
    expect(header.querySelector('[data-testid="brand-home"]')).not.toBeNull();
    expect(header.querySelector('[data-testid="theme-toggle"]')).not.toBeNull();
    expect(header.querySelector('[data-testid="mobile-menu"]')).toBeNull();
  });

  it.each([false, true])(
    'the third tab opens the sheet with the auth rows, Find a booking and Sign out in order (signed in: %s) (#1003)',
    (signedIn) => {
      customerAuth.signedIn.set(signedIn);
      customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
      const { fixture, el } = shell();

      el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
      fixture.detectChanges();

      const sheet = el.querySelector<HTMLElement>('[data-testid="mobile-menu"]')!;
      const rows = [...sheet.querySelectorAll('a, button')].map((row) =>
        row.getAttribute('data-testid'),
      );
      expect(rows).toEqual(
        signedIn
          ? ['nav-account-link-mobile', 'find-open-mobile', 'nav-signout-mobile']
          : ['nav-signin-mobile', 'nav-register-mobile', 'find-open-mobile'],
      );
      if (signedIn) {
        expect(sheet.querySelector('[data-testid="nav-user-mobile"]')?.textContent).toContain(
          'ana@example.com',
        );
      }
      // No tabs in the sheet: Beaches and My bookings are the bar's first two tabs.
      expect(sheet.querySelector('a[href="/"]')).toBeNull();
      expect(sheet.querySelector('a[href="/my-bookings"]')).toBeNull();
    },
  );

  it("pads the shell by the bar plus the safe-area inset, and the sheet's offset carries the inset too (#1003)", () => {
    const { fixture, el } = shell();
    const root = el.firstElementChild!;
    expect(root.classList.contains('max-sm:pb-[calc(61px+env(safe-area-inset-bottom))]')).toBe(
      true,
    );
    expect(
      el
        .querySelector('[data-testid="tab-bar"]')
        ?.classList.contains('pb-[env(safe-area-inset-bottom)]'),
    ).toBe(true);

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    const sheet = el.querySelector<HTMLElement>('[data-testid="mobile-menu"]')!;
    expect(sheet.classList.contains('fixed')).toBe(true);
    expect(sheet.classList.contains('bottom-[calc(76px+env(safe-area-inset-bottom))]')).toBe(true);
  });

  it('lights exactly one tab by route section, and none on legal pages or on the account section signed out (#1003)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);
    // Before the first navigation lands, nothing is lit.
    expect(currentTab(el)).toBeNull();

    landLazyChunk();
    await router.navigate(['/']);
    fixture.detectChanges();
    expect(currentTab(el)).toBe('tab-beaches');

    await router.navigate(['/venues/1']);
    fixture.detectChanges();
    expect(currentTab(el)).toBe('tab-beaches');

    await router.navigate(['/my-bookings']);
    fixture.detectChanges();
    expect(currentTab(el)).toBe('tab-bookings');

    await router.navigate(['/booking/WXYZ345678']);
    fixture.detectChanges();
    expect(currentTab(el)).toBe('tab-bookings');

    // A page outside every section (the legal pages' shape).
    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(currentTab(el)).toBeNull();

    // The account section lights only while signed in.
    await router.navigate(['/account/password']);
    fixture.detectChanges();
    expect(currentTab(el)).toBeNull();
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    fixture.detectChanges();
    expect(currentTab(el)).toBe('menu-toggle');
  });

  it('hides the bar and drops the padding on a route carrying tabBar: false (#1003)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);
    const padded = () =>
      el.firstElementChild!.classList.contains(
        'max-sm:pb-[calc(61px+env(safe-area-inset-bottom))]',
      );

    await router.navigate(['/pay']);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="tab-bar"]')).toBeNull();
    expect(padded()).toBe(false);
    // The header stays: only the bar goes.
    expect(el.querySelector('.riv-header')).not.toBeNull();

    await router.navigate(['/my-bookings']);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="tab-bar"]')).not.toBeNull();
    expect(padded()).toBe(true);
  });

  it.each([false, true])(
    'the sheet takes focus on open and hands it back to the tab on Escape, backdrop and row activation (signed in: %s) (#1003)',
    async (signedIn) => {
      customerAuth.signedIn.set(signedIn);
      customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
      const { fixture, el } = shell();
      const tab = el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!;
      const firstRow = signedIn ? 'nav-account-link-mobile' : 'nav-signin-mobile';
      const open = async () => {
        tab.click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(document.activeElement?.getAttribute('data-testid')).toBe(firstRow);
      };

      await open();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
      expect(document.activeElement).toBe(tab);

      await open();
      el.querySelector<HTMLElement>('[data-testid="menu-backdrop"]')!.click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
      expect(document.activeElement).toBe(tab);

      await open();
      el.querySelector<HTMLAnchorElement>(`[data-testid="${firstRow}"]`)!.click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
      expect(document.activeElement).toBe(tab);
    },
  );

  it("while restoring, Find a booking is the sheet's first row and takes focus (#1003)", async () => {
    customerAuth.restoring.set(true);
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.querySelector('[data-testid="nav-signin-mobile"]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('find-open-mobile');
  });

  it('moves focus to main when a navigation closes the sheet (#1003)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('nav-signin-mobile');

    await router.navigate(['/glass']);
    fixture.detectChanges();

    // The sheet held focus and this navigation destroyed it: land on main, never body (WCAG 2.4.3).
    expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('closes the sheet and lands focus on main when the navigation it was opened during hides the bar (#1003)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    // A deep link to the pay page: the bar is up until the chunk lands, and the sheet opens on it.
    const pending = router.navigate(['/pay-lazy']);
    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    // whenStable() waits on the pending navigation too; a macrotask flush runs the render hooks.
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.activeElement?.getAttribute('data-testid')).toBe('nav-signin-mobile');

    landLazyChunk();
    await pending;
    fixture.detectChanges();

    // The destination took the bar, and with it the sheet's trigger: the sheet closes, focus lands on main.
    expect(el.querySelector('[data-testid="tab-bar"]')).toBeNull();
    expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('keeps the sheet open across the navigation it was opened during when the destination keeps the bar (#892, #1003)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    const pending = router.navigate(['/elsewhere']);
    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    landLazyChunk();
    await pending;
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="mobile-menu"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute('data-testid')).toBe('nav-signin-mobile');
  });

  it("renders the tab bar before the header so the header popovers' backdrop covers it (#1003)", () => {
    const { fixture, el } = shell();
    const bar = el.querySelector('[data-testid="tab-bar"]')!;
    const header = el.querySelector('.riv-header')!;

    // An earlier z-20 sibling paints under the header's stacking context, backdrop included.
    expect(bar.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The sheet, by contrast, must beat both: a later sibling of the header.
    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    const sheet = el.querySelector('[data-testid="mobile-menu"]')!;
    expect(header.compareDocumentPosition(sheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.contains(sheet)).toBe(false);
  });

  /**
   * A sign-out that never reached the server leaves the HttpOnly SESSION cookie alive, so
   * the next visitor on a shared device would be silently restored. The shell is where that warning
   * belongs: it renders above the chrome conditional, so it shows on the operator console too.
   */
  it('surfaces the sign-out warning with a retry action, and hides it once retried', async () => {
    const notice = TestBed.inject(SignOutNotice);
    const { fixture, el } = shell();
    expect(el.querySelector('[data-testid="sign-out-warning"]')).toBeNull();

    notice.record({ signOut: () => Promise.resolve('signed-out') } as unknown as SessionAuth, true);
    fixture.detectChanges();

    const warning = el.querySelector('[data-testid="sign-out-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute('role')).toBe('alert');
    expect(warning?.textContent).toContain('may still be signed in on this device');

    el.querySelector<HTMLButtonElement>('[data-testid="sign-out-retry"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="sign-out-warning"]')).toBeNull();
  });

  it('dismisses the sign-out warning without retrying', () => {
    const notice = TestBed.inject(SignOutNotice);
    const retryable = { signOut: vi.fn(() => Promise.resolve('signed-out')) };
    const { fixture, el } = shell();

    notice.record(retryable as unknown as SessionAuth, true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="sign-out-dismiss"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="sign-out-warning"]')).toBeNull();
    expect(retryable.signOut).not.toHaveBeenCalled();
  });

  /** Opens the find modal from the desktop popover (the menu button signed out, the account
   *  chip signed in) and returns that persistent trigger — the row itself is gone by then. */
  function openFindFromPopover(fixture: ComponentFixture<App>, el: HTMLElement): HTMLElement {
    const trigger = el.querySelector<HTMLButtonElement>(
      '[data-testid="nav-menu"], [data-testid="nav-user"]',
    )!;
    trigger.click();
    fixture.detectChanges();
    const row = el.querySelector<HTMLButtonElement>(
      '[data-testid="nav-account-menu"] [data-testid="find-open"]',
    )!;
    expect(row.textContent).toContain('Find a booking');
    row.click();
    fixture.detectChanges();
    return trigger;
  }

  it('Find a booking from the signed-out menu opens the modal, closes the popover and returns focus to the menu button (#1002)', () => {
    const { fixture, el } = shell();
    expect(el.querySelector('app-find-booking')).toBeNull();

    const trigger = openFindFromPopover(fixture, el);
    expect(el.querySelector('app-find-booking')).not.toBeNull();
    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    // Dismiss via the modal's close button → focus returns to the popover's persistent trigger.
    el.querySelector<HTMLButtonElement>('[data-testid="find-close"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Find a booking from the account menu returns focus to the chip on dismiss (#1002)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    const trigger = openFindFromPopover(fixture, el);
    expect(trigger.getAttribute('data-testid')).toBe('nav-user');
    expect(el.querySelector('app-find-booking')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('[data-testid="find-close"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([false, true])(
    'Find a booking from the sheet (signed in: %s) closes the sheet and returns focus to the Menu tab (#148, #1002, #1003)',
    (signedIn) => {
      customerAuth.signedIn.set(signedIn);
      customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
      const { fixture, el } = shell();

      const menuTab = el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!;
      menuTab.click();
      fixture.detectChanges();
      const mobileBtn = el.querySelector<HTMLButtonElement>(
        '[data-testid="mobile-menu"] [data-testid="find-open-mobile"]',
      )!;
      expect(mobileBtn.textContent).toContain('Find a booking');

      mobileBtn.click();
      fixture.detectChanges();
      expect(el.querySelector('app-find-booking')).not.toBeNull();
      // Opening find collapses the mobile menu.
      expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();

      el.querySelector<HTMLButtonElement>('[data-testid="find-close"]')!.click();
      fixture.detectChanges();
      expect(document.activeElement).toBe(menuTab);
    },
  );

  it('closes the Find a booking modal on navigation and moves focus to main (a11y, #148)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    openFindFromPopover(fixture, el);
    expect(el.querySelector('app-find-booking')).not.toBeNull();

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).toBeNull();
    // Focus lands on the main content region, not document.body (review finding [4], WCAG 2.4.3).
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('keeps an overlay open when the navigation it was opened during completes (#892)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    // The header goes interactive with the first route's chunk still in flight.
    const pending = router.navigate(['/']);
    openFindFromPopover(fixture, el);
    const focused = document.activeElement;
    expect(el.querySelector('app-find-booking')).not.toBeNull();

    landLazyChunk();
    await pending;
    fixture.detectChanges();

    expect(el.querySelector('app-find-booking')).not.toBeNull();
    expect(document.activeElement).toBe(focused);
  });

  it('keeps an overlay open across a navigation to a different route it was opened during (#892)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    // Deliberately wider than the initial-navigation case — see the plan's declared behaviour change.
    const pending = router.navigate(['/elsewhere']);
    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid^="theme-option-"]')).not.toBeNull();

    landLazyChunk();
    await pending;
    fixture.detectChanges();

    expect(el.querySelector('[data-testid^="theme-option-"]')).not.toBeNull();
  });

  it('closes an overlay when a navigation raised from inside it supersedes the pending one (#892)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    const pending = router.navigate(['/']);
    openFindFromPopover(fixture, el);
    expect(el.querySelector('app-find-booking')).not.toBeNull();

    // find-booking's move on a found code: it supersedes the pending nav onto the very same url.
    const resubmitted = router.navigate(['/']);
    landLazyChunk();
    await Promise.all([pending, resubmitted]);
    fixture.detectChanges();

    expect(el.querySelector('app-find-booking')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('moves focus to main when a navigation closes the account menu (a11y, #351)', async () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLAnchorElement>('[data-testid="nav-account-link"]')!.focus();

    await router.navigate(['/glass']);
    fixture.detectChanges();

    // Without the restore, focus falls to body (the find-modal bug, WCAG 2.4.3).
    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('closes the account menu when Your account is activated on the page it points at (#351)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    const trigger = el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!;
    trigger.click();
    fixture.detectChanges();

    // A same-URL activation emits NavigationSkipped, not NavigationEnd, so the router-event
    // close never fires — the link must close the popover itself, like every sibling control.
    el.querySelector<HTMLAnchorElement>('[data-testid="nav-account-link"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('[data-testid="account-backdrop"]')).toBeNull();
  });

  it('keeps focus in the page after signing out from the account menu (a11y, #351)', async () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();
    const signOutButton = el.querySelector<HTMLButtonElement>('[data-testid="nav-signout"]')!;
    signOutButton.focus();

    signOutButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Sign-out does not navigate, so no NavigationEnd restore runs; without an explicit hand-off
    // focus is stranded on document.body while the popover unmounts around it (WCAG 2.4.3).
    expect(document.activeElement).not.toBe(document.body);
    expect(customerAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('the theme control is a swatch-only button named for the active theme (#1002)', () => {
    const { fixture, el } = shell();
    const themes = TestBed.inject(ThemeService);
    const swatch = el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!;

    themes.select('riviera');
    fixture.detectChanges();
    expect(swatch.getAttribute('aria-label')).toBe('Color theme: Riviera');
    // No label, no caret: the swatch is the whole control, painted from the active option.
    expect(swatch.textContent?.trim()).toBe('');
    expect(swatch.style.getPropertyValue('--riv-swatch')).toBe(
      themes.options.find((o) => o.id === 'riviera')?.swatch,
    );

    themes.select('dark');
    fixture.detectChanges();
    expect(swatch.getAttribute('aria-label')).toBe('Color theme: Dark');
  });

  /** Every `<a>` in the top bar, the popovers, the tab bar and the sheet: `check-touch-target.mjs`
   *  judges buttons only, so a link's declaration is this test's to prove. */
  function headerLinksDeclareTheFloor(el: HTMLElement): void {
    const links = [
      ...el.querySelectorAll<HTMLAnchorElement>(
        '.riv-header a, [data-testid="tab-bar"] a, [data-testid="mobile-menu"] a',
      ),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.classList.contains('min-h-11'), `${link.textContent?.trim()} min-h`).toBe(true);
      expect(link.classList.contains('min-w-11'), `${link.textContent?.trim()} min-w`).toBe(true);
    }
  }

  it.each([false, true])(
    'every header link declares the touch floor, popovers and sheet open (signed in: %s) (#1002)',
    (signedIn) => {
      customerAuth.signedIn.set(signedIn);
      customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
      const { fixture, el } = shell();
      headerLinksDeclareTheFloor(el);

      el.querySelector<HTMLButtonElement>(
        '[data-testid="nav-menu"], [data-testid="nav-user"]',
      )!.click();
      fixture.detectChanges();
      headerLinksDeclareTheFloor(el);

      el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
      fixture.detectChanges();
      headerLinksDeclareTheFloor(el);
    },
  );

  it('the Menu tab opens the sheet; Escape closes it and returns focus to the tab (AC-3, #1003)', () => {
    const { fixture, el } = shell();
    const button = el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!;

    button.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="mobile-menu"]')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('backdrop click closes the sheet (AC-3)', () => {
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="menu-backdrop"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
  });

  it('renders <main> bare under the tourist chrome before the first navigation completes (#992)', () => {
    // No navigation has landed: the root route's chunk stays unresolved until `landLazyChunk`.
    const { el } = shell();

    expect(el.querySelector('main')?.className).toBe('flex-1');
    expect(el.querySelector('.riv-header')).not.toBeNull();
  });

  it('carries the legal links in the shared footer, opening in a new tab (#101 Slice 3)', () => {
    const { el } = shell();
    const privacy = el.querySelector<HTMLAnchorElement>('.riv-footer a[href="/legal/privacy"]');
    const terms = el.querySelector<HTMLAnchorElement>('.riv-footer a[href="/legal/terms"]');
    expect(privacy?.textContent).toContain('Privacy');
    expect(terms?.textContent).toContain('Terms');
    // New tab: in-app nav would unmount /booking/pay's Payment Element (see app.html footer note).
    for (const link of [privacy, terms]) {
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toContain('noopener');
    }
  });

  it('renders the console shell instead of the tourist header on the venue console route (#1011)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.querySelector('.riv-header')).not.toBeNull();
    expect(el.querySelector('app-console-shell')).toBeNull();

    await router.navigate(['/operator/7/daily']);
    fixture.detectChanges();
    // The section row replaces the tourist header; the shared footer and background stay, the blobs go.
    expect(el.querySelector('.riv-header')).toBeNull();
    expect(el.querySelector('app-operator-chrome')).toBeNull();
    expect(el.querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(el.querySelector('.riv-footer')).not.toBeNull();
    expect(el.querySelector('.riv-bg')).not.toBeNull();
    expect(el.querySelector('.riv-blob')).toBeNull();
    // The section and the venue id come off the route chain: the venue slot is current and the rail is venue 7's.
    expect(el.querySelector('[data-testid="oc-section-venue"]')?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(el.querySelector('[data-testid="oc-tabs"] a[href="/operator/7/daily"]')).not.toBeNull();
    // <main> stays the one landmark: the console page renders no header, rail or main of its own.
    expect(el.querySelectorAll('main')).toHaveLength(1);

    // An admin tab: the same row, Admin current (the flag on the parent reaches the child), the admin rail.
    operatorAuth.isAdmin.set(true);
    await router.navigate(['/admin/audit']);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="oc-section-admin"]')?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      el.querySelector('[data-testid="oc-section-venue"]')?.getAttribute('aria-current'),
    ).toBeNull();
    expect(
      el.querySelector('nav[aria-label="Admin console sections"] a[href="/admin/audit"]'),
    ).not.toBeNull();
    expect(el.querySelector('[data-testid="oc-tabs"]')).toBeNull();

    // A plain operator page: the row with neither section current, and no rail at all.
    await router.navigate(['/operator']);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="oc-header"]')).not.toBeNull();
    expect(
      el.querySelector('[data-testid="oc-section-venue"]')?.getAttribute('aria-current'),
    ).toBeNull();
    expect(
      el.querySelector('[data-testid="oc-section-admin"]')?.getAttribute('aria-current'),
    ).toBeNull();
    expect(el.querySelector('nav[aria-label$="console sections"]')).toBeNull();
    expect(el.getAttribute('data-riv-theme')).toBe('porcelain');
  });

  it('pins the shell porcelain on every console route and never on a tourist one (#1011)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);
    TestBed.inject(ThemeService).select('dark');

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBeNull();

    await router.navigate(['/operator/7/daily']);
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBe('porcelain');
    // The document-level theme is the tourist's choice and stays untouched.
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('dark');

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBeNull();
  });

  it('the console host wears the console theme, the tourist chrome none (#1010)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);
    TestBed.inject(ThemeService).select('riviera');
    TestBed.inject(ConsoleTheme).select('dark');

    await router.navigate(['/operator/7/daily']);
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBe('dark');
    // The document-level theme is the tourist's choice and stays untouched — never the console's.
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');

    await router.navigate(['/admin']);
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBe('dark');

    TestBed.inject(ConsoleTheme).select('porcelain');
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBe('porcelain');

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.getAttribute('data-riv-theme')).toBeNull();
    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('riviera');
  });

  it('console-shell Sign out parks focus on main before the control unmounts (WCAG 2.4.3)', async () => {
    const { fixture, el } = shell();
    await TestBed.inject(Router).navigate(['/operator/7/daily']);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="oc-account"]')!.click();
    fixture.detectChanges();
    const signOut = el.querySelector<HTMLButtonElement>('[data-testid="oc-signout"]')!;
    signOut.focus();

    signOut.click();
    fixture.detectChanges();

    expect(operatorAuth.signOut).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(el.querySelector('main'));
  });

  it('⌘K opens the palette on a console route and nothing on a tourist one (#1013)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);
    const chord = () =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
      );
    const dialog = () => el.querySelector('[role="dialog"][aria-label="Go to"]');

    await router.navigate(['/glass']);
    fixture.detectChanges();
    chord();
    fixture.detectChanges();
    expect(dialog()).toBeNull();
    expect(el.querySelector('[data-testid="oc-search"]')).toBeNull();

    await router.navigate(['/operator/7/daily']);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="oc-search"]')).not.toBeNull();
    chord();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog()).not.toBeNull();
    // The rows are venue 7's: the venue id comes off the same route chain the shell reads.
    expect(dialog()!.querySelector('a[href="/operator/7/requests"]')).not.toBeNull();
    expect(
      dialog()!.querySelector('a[href="/operator/7/daily"]')?.getAttribute('aria-current'),
    ).toBe('page');
    expect(document.activeElement).toBe(el.querySelector('[data-testid="oc-palette-search"]'));

    // Leaving the console takes the palette and its chord with it.
    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(dialog()).toBeNull();
    chord();
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('renders the tourist chrome on a route carrying only the retired operatorChrome flag (#1011)', async () => {
    const { fixture, el } = shell();
    await TestBed.inject(Router).navigate(['/retired-flag']);
    fixture.detectChanges();

    expect(el.querySelector('.riv-header')).not.toBeNull();
    expect(el.querySelector('app-console-shell')).toBeNull();
    expect(el.getAttribute('data-riv-theme')).toBeNull();
  });
});

describe('app.routes chrome flags (issue #134)', () => {
  /**
   * The operator/admin surfaces and the console section each names for the app shell
   * (`data.console`, read on the root→leaf walk): the venue console, the admin console, and the
   * two plain operator pages — the `/operator` picker and the password page, which used to wear
   * the tourist chrome ("Sign in / Register" while signed in as an operator) or none at all.
   */
  const CONSOLE_SECTIONS = [
    ['operator/:venueId', 'venue'],
    ['admin', 'admin'],
    ['operator', 'plain'],
    ['account/operator-password', 'plain'],
  ] as const;

  /** The admin console's tab child routes, nested under `admin` (`AdminConsole`) — they inherit
   *  the section from the parent chain (`app.ts`'s root→leaf walk) rather than each carrying it. */
  const ADMIN_TAB_CHILD_PATHS = [
    '',
    'commissions',
    'email',
    'refunds',
    'photos',
    'reviews',
    'privacy',
    'audit',
  ];

  it('names the console section on the four operator/admin surfaces and nowhere else (#1011)', () => {
    for (const [path, section] of CONSOLE_SECTIONS) {
      const route = routes.find((r) => r.path === path);
      expect(route?.data?.['console'], `route '${path}' console section`).toBe(section);
    }
    const flagged = routes.filter((r) => r.data?.['console'] !== undefined).map((r) => r.path);
    expect(flagged.sort()).toEqual(CONSOLE_SECTIONS.map(([path]) => path).sort());
    // The two retired flags are gone from the table.
    expect(routes.some((r) => 'operatorChrome' in (r.data ?? {}))).toBe(false);
    expect(routes.some((r) => 'operatorConsole' in (r.data ?? {}))).toBe(false);
  });

  it("admin's tab children inherit the shell's operator chrome rather than carrying their own", () => {
    const admin = routes.find((r) => r.path === 'admin');
    for (const path of ADMIN_TAB_CHILD_PATHS) {
      const child = admin?.children?.find((c) => c.path === path);
      expect(child?.data?.['adminTab'], `admin child '${path}' adminTab data`).toBeDefined();
      expect(child?.data?.['console'], `admin child '${path}' console section`).toBeUndefined();
    }
  });

  it('forwards the retired daily URL to the console Daily-view tab, preserving the venue id (O6 #176)', () => {
    // A bookmarked /venue-admin/daily/:venueId must not 404 to a blank page — it redirects to the tab.
    const redirect = routes.find((r) => r.path === 'venue-admin/daily/:venueId');
    expect(redirect?.redirectTo).toBe('operator/:venueId/daily');
  });

  it('adds the venue console route, in the console shell, with its six tab children (#170, #1011)', () => {
    const console = routes.find((r) => r.path === 'operator/:venueId');
    expect(console?.data?.['console']).toBe('venue');
    expect(console?.data?.['operatorConsole']).toBeUndefined();

    const children = console?.children ?? [];
    const childPaths = children.map((c) => c.path);
    for (const tab of ['beach-map', 'pricing', 'daily', 'requests', 'payouts', 'venue']) {
      expect(childPaths, `tab route '${tab}'`).toContain(tab);
    }
    // Choosing a venue opens the Daily view: the landing tab, and the one the rail lists first.
    expect(children.some((c) => c.path === '' && c.redirectTo === 'daily')).toBe(true);
  });

  it('graduates the payouts tab from the placeholder to the real PayoutsTab (O7 #173)', async () => {
    const console = routes.find((r) => r.path === 'operator/:venueId');
    const payouts = (console?.children ?? []).find((c) => c.path === 'payouts');
    const load = payouts?.loadComponent as (() => Promise<{ name: string }>) | undefined;
    const component = await load?.();
    // The bundler may prefix the emitted class name (e.g. `_PayoutsTab`) — match on the class, not ===.
    expect(component?.name).toContain('PayoutsTab');
  });

  it('graduates the venue tab from the placeholder to the real VenueTab (O8 #177)', async () => {
    const console = routes.find((r) => r.path === 'operator/:venueId');
    const venue = (console?.children ?? []).find((c) => c.path === 'venue');
    const load = venue?.loadComponent as (() => Promise<{ name: string }>) | undefined;
    const component = await load?.();
    expect(component?.name).toContain('VenueTab');
  });
});
