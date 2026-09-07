import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { OperatorChrome } from './operator-chrome';

@Component({ template: '' })
class BlankPage {}

/**
 * The shared operator/admin header the shell renders on `data.operatorChrome` routes. These specs
 * pin the three auth states (signed-in, signed-in admin, signed-out) and the sign-out flow —
 * the chrome-vs-route wiring itself is pinned in app.spec.ts, the account chip's own contract in
 * operator-account-chip.spec.ts.
 */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(false),
  username: signal<string | undefined>('maria'),
  signOut: vi.fn(() => Promise.resolve()),
};

describe('OperatorChrome', () => {
  beforeEach(async () => {
    operatorAuth.restoring.set(false);
    operatorAuth.signedIn.set(true);
    operatorAuth.isAdmin.set(false);
    operatorAuth.username.set('maria');
    operatorAuth.signOut.mockClear();
    await TestBed.configureTestingModule({
      imports: [OperatorChrome],
      providers: [
        provideRouter([
          { path: 'operator/onboarding', component: BlankPage },
          { path: 'admin/email', component: BlankPage },
        ]),
        { provide: OperatorAuth, useValue: operatorAuth },
      ],
    }).compileComponents();
  });

  function render(): { fixture: ComponentFixture<OperatorChrome>; el: HTMLElement } {
    const fixture = TestBed.createComponent(OperatorChrome);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Opens the account chip and lets `routerLinkActive` mark the rows (a microtask after mount). */
  async function openChip(
    fixture: ComponentFixture<OperatorChrome>,
    el: HTMLElement,
  ): Promise<void> {
    el.querySelector<HTMLButtonElement>('[data-testid="opc-account"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders one account chip and, opened, the operator rows — no Admin console for a non-admin (#1008)', async () => {
    const { fixture, el } = render();
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-brand"]')?.getAttribute('href'),
    ).toBe('/operator');
    const chip = el.querySelector<HTMLButtonElement>('[data-testid="opc-account"]')!;
    expect(chip.getAttribute('aria-label')).toBe('Account: maria');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    // The old peer row is gone: the chip is the header's one session control.
    const nav = el.querySelector('nav[aria-label="Operator"]')!;
    expect(nav.querySelectorAll('a, button')).toHaveLength(1);
    expect(nav.textContent).not.toContain('Signed in as');
    expect(el.querySelector('[data-testid="opc-signin"]')).toBeNull();

    await openChip(fixture, el);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[data-testid="opc-account-identity"]')?.textContent).toContain(
      'Signed in as maria',
    );
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-create-venue"]')?.getAttribute('href'),
    ).toBe('/operator?create=1');
    expect(
      el
        .querySelector<HTMLAnchorElement>('[data-testid="opc-change-password"]')
        ?.getAttribute('href'),
    ).toBe('/account/operator-password');
    expect(el.querySelector('[data-testid="opc-signout"]')).not.toBeNull();
    // A non-admin operator is not offered the platform-admin surface.
    expect(el.querySelector('[data-testid="opc-admin-link"]')).toBeNull();
  });

  it('adds the Admin console row for a platform-admin principal, current on the admin pages (#1008)', async () => {
    operatorAuth.isAdmin.set(true);
    const { fixture, el } = render();
    await TestBed.inject(Router).navigateByUrl('/admin/email');
    fixture.detectChanges();

    await openChip(fixture, el);
    const admin = el.querySelector<HTMLAnchorElement>('[data-testid="opc-admin-link"]')!;
    expect(admin.getAttribute('href')).toBe('/admin');
    expect(admin.textContent?.trim()).toBe('Admin console');
    expect(admin.getAttribute('aria-current')).toBe('page');
  });

  it('offers the operator sign-in (not session controls) when signed out', () => {
    operatorAuth.signedIn.set(false);
    operatorAuth.username.set(undefined);
    const { el } = render();
    // returnUrl carries the current page ('/') — it outranks the venue-count landing rule.
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-signin"]')?.getAttribute('href'),
    ).toBe('/account/sign-in?audience=operator&returnUrl=%2F');
    expect(el.querySelector('[data-testid="opc-account"]')).toBeNull();
    expect(el.textContent).not.toContain('Signed in as');
  });

  it('follows a navigation: returnUrl is the page the operator is on (#982)', async () => {
    operatorAuth.signedIn.set(false);
    operatorAuth.username.set(undefined);
    const { fixture, el } = render();

    await TestBed.inject(Router).navigateByUrl('/operator/onboarding');
    fixture.detectChanges();

    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-signin"]')?.getAttribute('href'),
    ).toBe('/account/sign-in?audience=operator&returnUrl=%2Foperator%2Fonboarding');
  });

  it('renders no session controls while the startup restore is still settling', () => {
    operatorAuth.restoring.set(true);
    const { el } = render();
    expect(el.querySelector('[data-testid="opc-signin"]')).toBeNull();
    expect(el.querySelector('[data-testid="opc-account"]')).toBeNull();
  });

  it('Sign out signs the session out and leaves for the operator sign-in', async () => {
    const { fixture, el } = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await openChip(fixture, el);
    el.querySelector<HTMLButtonElement>('[data-testid="opc-signout"]')!.click();
    await fixture.whenStable();

    expect(operatorAuth.signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/account/sign-in'], {
      queryParams: { audience: 'operator' },
    });
  });
});
