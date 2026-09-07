import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { OperatorAccountChip } from './operator-account-chip';

@Component({ template: '' })
class BlankPage {}

/**
 * The account chip the console shell's section row mounts. These specs pin the disclosure's
 * contract — the chip's name and `aria-expanded`, the row set (the same for every principal), the
 * five ways it closes and where focus lands on each, the current-page marker — and what the call
 * site supplies: the test-id prefix and the sign-out output. The shell's own specs cover its
 * surrounding row.
 */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(false),
  username: signal<string | undefined>('maria@example.com'),
};

@Component({
  imports: [OperatorAccountChip],
  template: `<header>
    <app-operator-account-chip testIdPrefix="oc" (signOut)="signedOut = true" />
  </header>`,
})
class Host {
  signedOut = false;
}

describe('OperatorAccountChip', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(async () => {
    operatorAuth.isAdmin.set(false);
    operatorAuth.username.set('maria@example.com');
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'operator', component: BlankPage },
          { path: 'operator/onboarding', component: BlankPage },
          { path: 'admin', component: BlankPage },
          { path: 'admin/email', component: BlankPage },
          { path: 'account/operator-password', component: BlankPage },
        ]),
        { provide: OperatorAuth, useValue: operatorAuth },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function chip(): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('[data-testid="oc-account"]')!;
  }

  function menu(): HTMLElement | null {
    return el.querySelector<HTMLElement>('[data-testid="oc-account-menu"]');
  }

  function open(): void {
    chip().click();
    fixture.detectChanges();
  }

  /** Open and let `routerLinkActive` settle — it marks the rows in a microtask after they mount. */
  async function openSettled(): Promise<void> {
    open();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function rows(): string[] {
    return [...menu()!.querySelectorAll('a, button')].map((row) => row.textContent.trim());
  }

  it('renders one button named for the account, closed, with nothing of the popover in the bar', () => {
    expect(chip().getAttribute('aria-label')).toBe('Account: maria@example.com');
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(chip().textContent).toContain('maria');
    expect(menu()).toBeNull();
    expect(el.textContent).not.toContain('Signed in as');
    expect(el.querySelectorAll('a, button')).toHaveLength(1);
  });

  it('opens the popover: identity block, Change password, Sign out — no Create a venue, no Admin console for a non-admin (#1009)', () => {
    open();

    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(menu()!.querySelector('[data-testid="oc-account-identity"]')?.textContent).toContain(
      'Signed in as maria@example.com',
    );
    expect(rows()).toEqual(['Change password', 'Sign out']);
    // Venue actions live under the venue switcher, not in the account chip.
    expect(el.querySelector('[data-testid="oc-create-venue"]')).toBeNull();
    expect(el.textContent).not.toContain('Create a venue');
    expect(
      el
        .querySelector<HTMLAnchorElement>('[data-testid="oc-change-password"]')
        ?.getAttribute('href'),
    ).toBe('/account/operator-password');
    expect(el.querySelector('[data-testid="oc-admin-link"]')).toBeNull();
  });

  it('holds the same rows for a platform-admin principal — Admin is a section of the shell, not a row (#1011)', () => {
    operatorAuth.isAdmin.set(true);
    open();

    expect(rows()).toEqual(['Change password', 'Sign out']);
    expect(el.querySelector('[data-testid="oc-admin-link"]')).toBeNull();
    expect(el.querySelector('a[href="/admin"]')).toBeNull();
  });

  it('prefixes every test id from the call site, so each header keeps its own', () => {
    open();

    for (const suffix of [
      'account',
      'account-menu',
      'account-backdrop',
      'account-identity',
      'change-password',
      'signout',
    ]) {
      expect(el.querySelector(`[data-testid="oc-${suffix}"]`), suffix).not.toBeNull();
      expect(el.querySelector(`[data-testid="opc-${suffix}"]`), suffix).toBeNull();
    }
  });

  it('closes on Escape and returns focus to the chip', () => {
    open();
    el.querySelector<HTMLAnchorElement>('[data-testid="oc-change-password"]')!.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(chip());
  });

  it('ignores Escape while closed — it never steals focus', () => {
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('closes on backdrop click and returns focus to the chip', () => {
    open();

    el.querySelector<HTMLElement>('[data-testid="oc-account-backdrop"]')!.click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chip());
  });

  it('closes on row activation and returns focus to the chip', async () => {
    open();
    const row = el.querySelector<HTMLAnchorElement>('[data-testid="oc-change-password"]')!;
    row.focus();

    row.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chip());
    expect(TestBed.inject(Router).url).toBe('/account/operator-password');
  });

  it('closes when a navigation ends elsewhere, leaving focus where it is', async () => {
    open();
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();

    await TestBed.inject(Router).navigateByUrl('/operator/onboarding');
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('closes on a click outside the header, leaving focus where it is', () => {
    open();
    const content = document.createElement('button');
    document.body.append(content);

    content.focus();
    content.click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(content);
    content.remove();
  });

  it('stays open on a click inside its own popover', () => {
    open();

    menu()!.querySelector<HTMLElement>('[data-testid="oc-account-identity"]')!.click();
    fixture.detectChanges();

    expect(menu()).not.toBeNull();
  });

  it('marks Change password current on the password page — exact path, query ignored', async () => {
    await TestBed.inject(Router).navigateByUrl('/account/operator-password?x=1');
    await openSettled();

    const current = [...menu()!.querySelectorAll('[aria-current="page"]')];
    expect(current.map((row) => row.textContent.trim())).toEqual(['Change password']);
  });

  it('marks no row current on an admin page', async () => {
    operatorAuth.isAdmin.set(true);
    await TestBed.inject(Router).navigateByUrl('/admin/email');
    await openSettled();

    expect(menu()!.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('marks no row current on the operator landing', async () => {
    await TestBed.inject(Router).navigateByUrl('/operator');
    await openSettled();

    expect(menu()!.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('emits sign-out after closing itself, rather than performing it — the two headers tear down differently', () => {
    open();

    el.querySelector<HTMLButtonElement>('[data-testid="oc-signout"]')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.signedOut).toBe(true);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(chip());
  });

  it('shows the handle and the initial for a plain username too', () => {
    operatorAuth.username.set('operator');
    fixture.detectChanges();

    expect(chip().getAttribute('aria-label')).toBe('Account: operator');
    expect(chip().textContent).toContain('O');
    expect(chip().textContent).toContain('operator');
  });
});
