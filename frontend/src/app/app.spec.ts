import { provideHttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { App } from './app';
import { routes } from './app.routes';
import { CustomerAuth } from './core/customer-auth';
import { OperatorAuth } from './core/operator-auth';
import { SessionAuth } from './core/session-auth';
import { SignOutNotice } from './core/sign-out-notice';

@Component({ template: '' })
class BlankPage {}

/**
 * A CustomerAuth fake (S2 #111): the shell injects CustomerAuth, which would otherwise fire a real
 * `GET /api/auth/me` on construction. Signal-backed so a test can flip the signed-in state before
 * rendering; reset to signed-out in each `beforeEach`.
 */
const customerAuth = {
  restoring: signal(false),
  signedIn: signal(false),
  email: signal<string | undefined>(undefined),
  signOut: vi.fn(() => Promise.resolve()),
};

/** An OperatorAuth fake for the shared operator chrome (same rationale as the CustomerAuth fake). */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(false),
  username: signal<string | undefined>('maria'),
  signOut: vi.fn(() => Promise.resolve()),
};

/** Test routes exercising the compat-surface + chromeless + operator-chrome mechanisms without
 *  loading real (HTTP-bound) pages. */
const surfaceRoutes = [
  { path: 'legacy', component: BlankPage, data: { legacySurface: true } },
  { path: 'glass', component: BlankPage },
  { path: 'operator', component: BlankPage, data: { operatorConsole: true } },
  { path: 'operator-chrome', component: BlankPage, data: { operatorChrome: true } },
  // The operator chrome's sign-out navigates here; a resolvable target keeps that await clean.
  { path: 'account/sign-in', component: BlankPage },
];

describe('App (Liquid Glass shell, issue #134)', () => {
  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    customerAuth.restoring.set(false);
    customerAuth.signedIn.set(false);
    customerAuth.email.set(undefined);
    customerAuth.signOut.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      // provideHttpClient: the shell renders the find-a-booking modal (#148), whose BookingService
      // injects HttpClient — no request is made in these tests. The CustomerAuth fake replaces the
      // real one so no startup /me call fires (S2 #111).
      providers: [
        provideRouter(surfaceRoutes),
        provideHttpClient(),
        { provide: CustomerAuth, useValue: customerAuth },
        { provide: OperatorAuth, useValue: operatorAuth },
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

  it('theme pill opens the picker listing both themes; picking one switches the document theme', () => {
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!.click();
    fixture.detectChanges();

    const options = el.querySelectorAll('[data-testid^="theme-option-"]');
    expect(options).toHaveLength(2);

    el.querySelector<HTMLButtonElement>('[data-testid="theme-option-porcelain"]')!.click();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-riv-theme')).toBe('porcelain');
    // picker closed after selection
    expect(el.querySelector('[data-testid="theme-option-porcelain"]')).toBeNull();
  });

  it('lists a My bookings nav entry on desktop and in the mobile menu (T6 #139)', () => {
    const { fixture, el } = shell();

    const desktopLink = el
      .querySelector('.riv-nav-desktop')
      ?.querySelector<HTMLAnchorElement>('a[href="/my-bookings"]');
    expect(desktopLink?.textContent).toContain('My bookings');

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();
    const mobileLink = el
      .querySelector('[data-testid="mobile-menu"]')
      ?.querySelector<HTMLAnchorElement>('a[href="/my-bookings"]');
    expect(mobileLink?.textContent).toContain('My bookings');
  });

  it('shows Sign in and Register links in the header when signed out (S2 #111)', () => {
    const { el } = shell();
    const nav = el.querySelector('.riv-nav-desktop');
    expect(
      nav?.querySelector<HTMLAnchorElement>('[data-testid="nav-signin"]')?.getAttribute('href'),
    ).toBe('/account/sign-in');
    // S9 (#277): Register now deep-links into the unified card's register mode.
    expect(
      nav?.querySelector<HTMLAnchorElement>('[data-testid="nav-register"]')?.getAttribute('href'),
    ).toBe('/account/sign-in?mode=register');
    // No signed-in affordances when signed out — including the #351 account menu.
    expect(nav?.querySelector('[data-testid="nav-user"]')).toBeNull();
    expect(nav?.querySelector('[data-testid="nav-signout"]')).toBeNull();
    expect(nav?.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
    expect(nav?.querySelector('[data-testid="nav-account-link"]')).toBeNull();
  });

  it('shows the signed-in email + Sign out when signed in, and signs out on click (S2 #111)', () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();

    expect(el.querySelector('[data-testid="nav-user"]')?.textContent).toContain(
      'Signed in as ana@example.com',
    );
    // The signed-out links are gone.
    expect(el.querySelector('[data-testid="nav-signin"]')).toBeNull();

    // Sign out now lives inside the account menu (#351), so it opens first.
    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-testid="nav-signout"]')!.click();
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
    // Flat group, not a nested popover (the riv-mobile-theme precedent).
    expect(menu.querySelector('[data-testid="nav-account-menu"]')).toBeNull();
  });

  /**
   * #128 gap 2. A sign-out that never reached the server leaves the HttpOnly SESSION cookie alive, so
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

  it('exposes a Find a booking trigger on desktop that opens the modal and restores focus on dismiss (#148)', () => {
    const { fixture, el } = shell();

    const desktopBtn = el.querySelector<HTMLButtonElement>(
      '.riv-nav-desktop [data-testid="find-open"]',
    )!;
    expect(desktopBtn.textContent).toContain('Find a booking');
    expect(el.querySelector('app-find-booking')).toBeNull();

    desktopBtn.click();
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).not.toBeNull();

    // Dismiss via the modal's close button → the modal closes and focus returns to the trigger.
    el.querySelector<HTMLButtonElement>('[data-testid="find-close"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).toBeNull();
    expect(document.activeElement).toBe(desktopBtn);
  });

  it('exposes a Find a booking entry in the mobile menu that opens the modal and closes the menu (#148)', () => {
    const { fixture, el } = shell();

    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
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
  });

  it('closes the Find a booking modal on navigation and moves focus to main (a11y, #148)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    el.querySelector<HTMLButtonElement>('[data-testid="find-open"]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).not.toBeNull();

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.querySelector('app-find-booking')).toBeNull();
    // Focus lands on the main content region, not document.body (review finding [4], WCAG 2.4.3).
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

    // Without the restore, focus falls to body (the #148 find-modal bug, WCAG 2.4.3).
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

  it('hamburger opens the mobile menu; Escape closes it and returns focus to the button (AC-3)', () => {
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

  it('backdrop click closes the mobile menu (AC-3)', () => {
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();

    el.querySelector<HTMLElement>('[data-testid="menu-backdrop"]')!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="mobile-menu"]')).toBeNull();
  });

  it('wraps legacy-flagged routes in the opaque compat surface, glass routes not (AC-6)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    await router.navigate(['/legacy']);
    fixture.detectChanges();
    expect(el.querySelector('main')?.classList.contains('riv-legacy-surface')).toBe(true);

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.querySelector('main')?.classList.contains('riv-legacy-surface')).toBe(false);
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

  it('suppresses the tourist header/footer chrome on operator-console routes (#170, AC-7)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    await router.navigate(['/glass']);
    fixture.detectChanges();
    expect(el.querySelector('.riv-header')).not.toBeNull();
    expect(el.querySelector('.riv-footer')).not.toBeNull();

    await router.navigate(['/operator']);
    fixture.detectChanges();
    // The operator console owns full-bleed porcelain chrome — the tourist header/nav/footer are hidden.
    expect(el.querySelector('.riv-header')).toBeNull();
    expect(el.querySelector('.riv-footer')).toBeNull();
    // Chromeless, not legacy: the compat surface is not applied on operator routes either.
    expect(el.querySelector('main')?.classList.contains('riv-legacy-surface')).toBe(false);
  });

  it('renders the shared operator chrome instead of the tourist header on operator-chrome routes', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    await router.navigate(['/operator-chrome']);
    fixture.detectChanges();

    // The operator header replaces the tourist one; the shell footer stays (porcelain-toned).
    expect(el.querySelector('.riv-header')).toBeNull();
    expect(el.querySelector('[data-testid="opc-header"]')).not.toBeNull();
    expect(el.querySelector('.riv-footer')).not.toBeNull();
    // The whole subtree is pinned porcelain so page + chrome agree whatever the tourist theme is.
    expect(el.getAttribute('data-riv-theme')).toBe('porcelain');
    // The tourist decorative blobs are off; the themed background itself stays.
    expect(el.querySelector('.riv-bg')).not.toBeNull();
    expect(el.querySelector('.riv-blob')).toBeNull();
  });

  it('operator-chrome Sign out parks focus on main before the control unmounts (WCAG 2.4.3)', async () => {
    const { fixture, el } = shell();
    const router = TestBed.inject(Router);

    await router.navigate(['/operator-chrome']);
    fixture.detectChanges();
    const signOut = el.querySelector<HTMLButtonElement>('[data-testid="opc-signout"]')!;
    signOut.focus();

    signOut.click();
    fixture.detectChanges();

    // The #148/#351 F-8 class: signOut() unmounts the focused button — focus must land on
    // <main tabindex="-1">, never document.body.
    expect(operatorAuth.signOut).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(el.querySelector('main'));
  });
});

describe('app.routes legacy-surface flags (issue #134)', () => {
  // Restyled routes render on the bare themed background; each T2–T6/operator slice
  // moves its route from LEGACY to this list. T2 (#135): Discover (''). T3 (#136): the beach map.
  // T4 (#137): booking/confirmation, booking/pay, booking/requested. T5 (#138): booking/:code.
  // T6 (#139): my-bookings (new glass route, born un-legacied).
  const RESTYLED_PATHS = [
    '',
    'my-bookings',
    // S9 (#277): account/register + operator/register are redirect-only now, so they left this list.
    'account/sign-in',
    // S8 (#113): the account-recovery pages (forgot / reset / verify) + the account page — new glass routes.
    'account/forgot',
    'account/reset',
    'account/verify',
    'account/password',
    'venues/:id',
    'booking/confirmation',
    'booking/pay',
    'booking/requested',
    'booking/:code',
    // #101 Slice 3: the legal pages — new glass routes, born un-legacied.
    'legal/privacy',
    'legal/terms',
  ];

  /**
   * Operator/admin surfaces — a THIRD category outside the tourist legacy/restyled binary. The
   * console (#170) owns its whole porcelain shell (`operatorConsole`); every other operator/admin
   * page carries `operatorChrome`, so the shell swaps in the shared operator header/footer — the
   * fix for those pages wearing the tourist chrome ("Sign in / Register" while signed in as an
   * operator) or none at all (the #326 password page, the S9 '/operator' picker).
   */
  const OPERATOR_SURFACE_PATHS = [
    'operator/:venueId',
    'operator',
    'account/operator-password',
    'admin',
    'admin/commissions',
    'admin/email',
    'admin/refunds',
    'admin/photos',
    'admin/privacy',
    'admin/audit',
  ];

  it('marks every not-yet-restyled tourist route with the compat surface (flipped per slice)', () => {
    for (const route of routes) {
      // Redirect-only routes (no rendered surface) carry no legacySurface flag — skip them.
      if (OPERATOR_SURFACE_PATHS.includes(route.path ?? '') || route.redirectTo !== undefined) {
        continue;
      }
      const expected = !RESTYLED_PATHS.includes(route.path ?? '');
      expect(
        route.data?.['legacySurface'] === true,
        `route '${route.path}' legacySurface flag`,
      ).toBe(expected);
    }
  });

  it('flags every non-console operator/admin surface with the shared operator chrome', () => {
    for (const path of OPERATOR_SURFACE_PATHS.filter((p) => p !== 'operator/:venueId')) {
      const route = routes.find((r) => r.path === path);
      expect(route?.data?.['operatorChrome'], `route '${path}' operatorChrome flag`).toBe(true);
      // The two flags are mutually exclusive — the console alone stays fully chromeless.
      expect(route?.data?.['operatorConsole'], `route '${path}' console flag`).toBeUndefined();
      // Operator surfaces left the tourist binary but must never re-acquire the compat surface.
      expect(route?.data?.['legacySurface'], `route '${path}' legacy flag`).toBeUndefined();
    }
  });

  it('has no legacy compat-surface routes left (O8 #177 retired the last one)', () => {
    // O6 retired the StaffDaily route; O8 (#177) slimmed /venue-admin to onboarding and dropped its
    // legacySurface flag — the whole operator surface is now Liquid Glass (console) + bare onboarding.
    const legacy = routes.filter((r) => r.data?.['legacySurface'] === true);
    expect(legacy.map((r) => r.path)).toEqual([]);
  });

  it('forwards the retired daily URL to the console Daily-view tab, preserving the venue id (O6 #176)', () => {
    // A bookmarked /venue-admin/daily/:venueId must not 404 to a blank page — it redirects to the tab.
    const redirect = routes.find((r) => r.path === 'venue-admin/daily/:venueId');
    expect(redirect?.redirectTo).toBe('operator/:venueId/daily');
    expect(redirect?.data?.['legacySurface']).toBeUndefined();
  });

  it('adds the chromeless operator console route with its six tab children (#170)', () => {
    const console = routes.find((r) => r.path === 'operator/:venueId');
    expect(console?.data?.['operatorConsole']).toBe(true);
    expect(console?.data?.['legacySurface']).toBeUndefined();

    const children = console?.children ?? [];
    const childPaths = children.map((c) => c.path);
    for (const tab of ['beach-map', 'pricing', 'daily', 'requests', 'payouts', 'venue']) {
      expect(childPaths, `tab route '${tab}'`).toContain(tab);
    }
    // A default child redirects to the first tab so `/operator/:venueId` lands on a tab.
    expect(children.some((c) => c.path === '' && c.redirectTo === 'beach-map')).toBe(true);
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
