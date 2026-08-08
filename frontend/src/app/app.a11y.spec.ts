import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../testing/axe';
import { App } from './app';
import { SsoRedirect } from './core/sso-redirect';
import { ThemeService } from './core/theme';

/** No-op SSO redirect: the shell instantiates the real CustomerAuth, which injects SsoRedirect;
 *  these tests never start SSO, so a do-nothing redirector avoids a real navigation. */
const noopSsoRedirect: SsoRedirect = { go: () => undefined };

/**
 * Automated axe-core structural audit of the Liquid Glass shell: header,
 * nav, theme picker and mobile menu — in BOTH themes, closed and open. Colour contrast is
 * verified deterministically in `app.contrast.spec.ts` (axe can't measure it under jsdom);
 * the real-browser sweep runs in `e2e/theme-shell.e2e.ts`.
 */
describe('App shell accessibility (axe, issue #134)', () => {
  beforeEach(async () => {
    document.documentElement.removeAttribute('data-riv-theme');
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: SsoRedirect, useValue: noopSsoRedirect }],
    }).compileComponents();
  });

  function shell(): { fixture: ComponentFixture<App>; el: HTMLElement } {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it.each(['riviera', 'porcelain'] as const)('shell with menus closed has no violations (%s)', async (theme) => {
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

  it('shell with the mobile menu open has no violations', async () => {
    const { fixture, el } = shell();
    el.querySelector<HTMLButtonElement>('[data-testid="menu-toggle"]')!.click();
    fixture.detectChanges();

    await expectNoAxeViolations(el);
  });
});
