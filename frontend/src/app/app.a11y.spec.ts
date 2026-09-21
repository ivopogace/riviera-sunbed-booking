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
 * nav, theme picker, the account/menu popover, the phone tab bar and its sheet — in all three
 * themes, closed and open. Colour contrast is verified deterministically in `app.contrast.spec.ts` (axe can't
 * measure it under jsdom); the real-browser sweep runs in `e2e/theme-shell.e2e.ts`.
 */
const THEMES = ['riviera', 'porcelain', 'dark'] as const;

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

  // `isolate` is false: this file's theme attribute would follow it into the next spec file.
  afterEach(() => {
    document.documentElement.removeAttribute('data-riv-theme');
  });

  function shell(): { fixture: ComponentFixture<App>; el: HTMLElement } {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it.each(THEMES)('shell with menus closed has no violations (%s)', async (theme) => {
    const { fixture, el } = shell();
    TestBed.inject(ThemeService).select(theme);
    fixture.detectChanges();

    await expectNoAxeViolations(el);
  });

  it('shell with the theme picker open has no violations', async () => {
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]')!.click();
    fixture.detectChanges();

    await expectNoAxeViolations(el);
  });

  /** The three menus that carry the legal rows, audited per theme: the rows are a menu's only
   *  non-destination content, so an open menu is the state worth crossing with the theme axis. */
  async function auditOpenMenu(
    theme: (typeof THEMES)[number],
    signedIn: boolean,
    opener: string,
  ): Promise<void> {
    customerAuth.signedIn.set(signedIn);
    customerAuth.email.set(signedIn ? 'ana@example.com' : undefined);
    const { fixture, el } = shell();
    TestBed.inject(ThemeService).select(theme);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>(`[data-testid="${opener}"]`)!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="legal-privacy-row"]')).not.toBeNull();
    await expectNoAxeViolations(el);
  }

  it.each(THEMES.flatMap((theme) => [false, true].map((signedIn) => ({ theme, signedIn }))))(
    'shell with the tab-bar sheet open has no violations ($theme, signed in: $signedIn) (#1003)',
    async ({ theme, signedIn }) => {
      await auditOpenMenu(theme, signedIn, 'menu-toggle');
    },
  );

  it.each(THEMES)(
    'shell with the signed-out menu popover open has no violations (%s) (#1002)',
    async (theme) => {
      await auditOpenMenu(theme, false, 'nav-menu');
    },
  );

  it.each(THEMES)(
    'shell with the signed-in account menu open has no violations (%s) (#1002)',
    async (theme) => {
      await auditOpenMenu(theme, true, 'nav-user');
    },
  );
});
