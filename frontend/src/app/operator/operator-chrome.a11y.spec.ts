import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { OperatorChrome } from './operator-chrome';

/**
 * Structural a11y audit for the shared operator/admin header. Both rendering states are audited:
 * the signed-in admin state (every link + the sign-out control) and the signed-out sign-in link.
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

  it('has no violations signed out', async () => {
    await expectNoAxeViolations(await render(false));
  });
});
