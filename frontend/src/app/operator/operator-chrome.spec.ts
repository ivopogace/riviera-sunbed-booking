import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { OperatorChrome } from './operator-chrome';

/**
 * The shared operator/admin header the shell renders on `data.operatorChrome` routes. These specs
 * pin the three auth states (signed-in, signed-in admin, signed-out) and the sign-out flow —
 * the chrome-vs-route wiring itself is pinned in app.spec.ts.
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
      providers: [provideRouter([]), { provide: OperatorAuth, useValue: operatorAuth }],
    }).compileComponents();
  });

  function render(): { fixture: ComponentFixture<OperatorChrome>; el: HTMLElement } {
    const fixture = TestBed.createComponent(OperatorChrome);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the operator links, the signed-in username and Sign out when signed in', () => {
    const { el } = render();
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-brand"]')?.getAttribute('href'),
    ).toBe('/operator');
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-create-venue"]')?.getAttribute('href'),
    ).toBe('/operator?create=1');
    expect(
      el
        .querySelector<HTMLAnchorElement>('[data-testid="opc-change-password"]')
        ?.getAttribute('href'),
    ).toBe('/account/operator-password');
    expect(el.querySelector('[data-testid="opc-signed-in-as"]')?.textContent).toContain('maria');
    expect(el.querySelector('[data-testid="opc-signout"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="opc-signin"]')).toBeNull();
    // A non-admin operator is not offered the platform-admin surface.
    expect(el.querySelector('[data-testid="opc-admin-link"]')).toBeNull();
  });

  it('adds the Admin link for a platform-admin principal', () => {
    operatorAuth.isAdmin.set(true);
    const { el } = render();
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-admin-link"]')?.getAttribute('href'),
    ).toBe('/admin');
  });

  it('offers the operator sign-in (not session controls) when signed out', () => {
    operatorAuth.signedIn.set(false);
    operatorAuth.username.set(undefined);
    const { el } = render();
    // returnUrl carries the current page ('/') — it outranks the venue-count landing rule.
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="opc-signin"]')?.getAttribute('href'),
    ).toBe('/account/sign-in?audience=operator&returnUrl=%2F');
    expect(el.querySelector('[data-testid="opc-signout"]')).toBeNull();
    expect(el.querySelector('[data-testid="opc-signed-in-as"]')).toBeNull();
  });

  it('renders no session controls while the startup restore is still settling', () => {
    operatorAuth.restoring.set(true);
    const { el } = render();
    expect(el.querySelector('[data-testid="opc-signin"]')).toBeNull();
    expect(el.querySelector('[data-testid="opc-signout"]')).toBeNull();
  });

  it('Sign out signs the session out and leaves for the operator sign-in', async () => {
    const { fixture, el } = render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    el.querySelector<HTMLButtonElement>('[data-testid="opc-signout"]')!.click();
    await fixture.whenStable();

    expect(operatorAuth.signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/account/sign-in'], {
      queryParams: { audience: 'operator' },
    });
  });
});
