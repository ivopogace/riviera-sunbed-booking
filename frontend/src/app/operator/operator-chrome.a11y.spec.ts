import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { OperatorChrome } from './operator-chrome';

/**
 * Structural a11y audit for the shared operator/admin header. Three rendering states are audited:
 * the signed-in admin state (the account chip, closed and opened onto every row) and the
 * signed-out sign-in link.
 */
describe('OperatorChrome a11y', () => {
  const operatorAuth = {
    restoring: signal(false),
    signedIn: signal(true),
    isAdmin: signal(true),
    username: signal<string | undefined>('maria'),
    signOut: vi.fn(() => Promise.resolve()),
  };

  async function render(signedIn: boolean): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    operatorAuth.signedIn.set(signedIn);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: OperatorAuth, useValue: operatorAuth }],
    });
    const fixture = TestBed.createComponent(OperatorChrome);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no violations signed in as an admin', async () => {
    await expectNoAxeViolations(await render(true));
  });

  it('has no violations with the account popover open', async () => {
    const el = await render(true);
    el.querySelector<HTMLButtonElement>('[data-testid="opc-account"]')!.click();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(el.querySelector('[data-testid="opc-account-menu"]')).not.toBeNull();
    await expectNoAxeViolations(el);
  });

  it('has no violations signed out', async () => {
    await expectNoAxeViolations(await render(false));
  });
});
