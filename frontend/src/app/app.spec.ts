import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { App } from './app';
import { routes } from './app.routes';

@Component({ template: '' })
class BlankPage {}

/** Test routes exercising the compat-surface mechanism without loading real (HTTP-bound) pages. */
const surfaceRoutes = [
  { path: 'legacy', component: BlankPage, data: { legacySurface: true } },
  { path: 'glass', component: BlankPage },
];

describe('App (Liquid Glass shell, issue #134)', () => {
  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    await TestBed.configureTestingModule({
      imports: [App],
      // provideHttpClient: the shell renders the find-a-booking modal (#148), whose BookingService
      // injects HttpClient — no request is made in these tests.
      providers: [provideRouter(surfaceRoutes), provideHttpClient()],
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
});

describe('app.routes legacy-surface flags (issue #134)', () => {
  // Restyled routes render on the bare themed background; each T2–T6/operator slice
  // moves its route from LEGACY to this list. T2 (#135): Discover (''). T3 (#136): the beach map.
  // T4 (#137): booking/confirmation, booking/pay, booking/requested. T5 (#138): booking/:code.
  // T6 (#139): my-bookings (new glass route, born un-legacied).
  const RESTYLED_PATHS = [
    '',
    'my-bookings',
    'venues/:id',
    'booking/confirmation',
    'booking/pay',
    'booking/requested',
    'booking/:code',
  ];

  it('marks every not-yet-restyled route with the compat surface (flipped per T2–T5/operator slice)', () => {
    for (const route of routes) {
      const expected = !RESTYLED_PATHS.includes(route.path ?? '');
      expect(
        route.data?.['legacySurface'] === true,
        `route '${route.path}' legacySurface flag`,
      ).toBe(expected);
    }
  });
});
