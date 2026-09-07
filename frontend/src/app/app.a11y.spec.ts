import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../testing/axe';
import { App } from './app';
import { CustomerAuth } from './core/customer-auth';
import { ThemeService } from './core/theme';

@Component({ template: '' })
class BlankPage {}

/** A CustomerAuth fake (the app.spec.ts pattern): no `/api/auth/me` on construction, and the
 *  signed-in state flips per test so both header popovers get audited. */
const customerAuth = {
  restoring: signal(false),
  signedIn: signal(false),
  email: signal<string | undefined>(undefined),
  signOut: vi.fn(() => Promise.resolve()),
};

/**
 * Automated axe-core structural audit of the Liquid Glass shell: header,
 * nav, theme picker, the account/menu popover and the mobile menu — in BOTH themes, closed and
 * open. Colour contrast is verified deterministically in `app.contrast.spec.ts` (axe can't
 * measure it under jsdom); the real-browser sweep runs in `e2e/theme-shell.e2e.ts`.
 */
describe('App shell accessibility (axe, issue #134)', () => {
  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    customerAuth.signedIn.set(false);
    customerAuth.email.set(undefined);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([{ path: '', component: BlankPage }]),
        { provide: CustomerAuth, useValue: customerAuth },
      ],
    }).compileComponents();
  });

  function shell(): { fixture: ComponentFixture<App>; el: HTMLElement } {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it.each(['riviera', 'porcelain', 'dark'] as const)(
    'shell with menus closed has no violations (%s)',
    async (theme) => {
      const { fixture, el } = shell();
      TestBed.inject(ThemeService).select(theme);
      fixture.detectChanges();

      await expectNoAxeViolations(el);
    },
  );

  it('shell with the theme picker open has no violations', async () => {
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!.click();
    fixture.detectChanges();

    await expectNoAxeViolations(el);
  });

  it.each([false, true])(
    'shell with the mobile menu open has no violations (signed in: %s)',
    async (signedIn) => {
      customerAuth.signedIn.set(signedIn);
      customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
      const { fixture, el } = shell();
      el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
      fixture.detectChanges();

      await expectNoAxeViolations(el);
    },
  );

  it('shell with the signed-out menu popover open has no violations (#1002)', async () => {
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="nav-menu"]')!.click();
    fixture.detectChanges();

    await expectNoAxeViolations(el);
  });

  it('shell with the signed-in account menu open has no violations (#1002)', async () => {
    customerAuth.signedIn.set(true);
    customerAuth.email.set('ana@example.com');
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="nav-user"]')!.click();
    fixture.detectChanges();

    await expectNoAxeViolations(el);
  });
});
