import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { OperatorActions } from './operator-actions';

/**
 * The operator nav cluster both headers mount. These specs pin what the two call sites vary —
 * the test-id prefix and the sign-out output — and the admin-only link; each header's own specs
 * still cover its surrounding chrome.
 */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(false),
  username: signal<string | undefined>('maria'),
};

@Component({
  imports: [OperatorActions],
  template: `<nav class="flex gap-3.5">
    <app-operator-actions testIdPrefix="oc" (signOut)="signedOut = true" />
  </nav>`,
})
class Host {
  signedOut = false;
}

describe('OperatorActions', () => {
  beforeEach(async () => {
    operatorAuth.isAdmin.set(false);
    operatorAuth.username.set('maria');
    await TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: OperatorAuth, useValue: operatorAuth }],
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('prefixes every test id from the call site, so each header keeps its own', () => {
    const { el } = render();

    for (const suffix of ['create-venue', 'change-password', 'signed-in-as', 'signout']) {
      expect(el.querySelector(`[data-testid="oc-${suffix}"]`)).not.toBeNull();
      expect(el.querySelector(`[data-testid="opc-${suffix}"]`)).toBeNull();
    }
  });

  it('names the signed-in operator', () => {
    expect(render().el.querySelector('[data-testid="oc-signed-in-as"]')?.textContent).toContain(
      'maria',
    );
  });

  it('shows the Admin link only to an admin principal', () => {
    expect(render().el.querySelector('[data-testid="oc-admin-link"]')).toBeNull();

    operatorAuth.isAdmin.set(true);
    expect(render().el.querySelector('[data-testid="oc-admin-link"]')).not.toBeNull();
  });

  it('emits sign-out rather than performing it — the two headers tear down differently', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('[data-testid="oc-signout"]')!.click();

    expect(fixture.componentInstance.signedOut).toBe(true);
  });

  it('drops its host out of layout so each header’s own gap still applies', () => {
    expect(render().el.querySelector('app-operator-actions')?.classList.contains('contents')).toBe(
      true,
    );
  });
});
