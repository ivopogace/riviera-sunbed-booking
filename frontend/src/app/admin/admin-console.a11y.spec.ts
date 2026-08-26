import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminConsole, AdminTabRouteData } from './admin-console';

/**
 * Structural axe audit of the console shell across its four states — loading, signed-out,
 * forbidden, and authorized (tab strip + child content) — since each is a materially different
 * DOM, not a style variant of the others.
 */
const TAB: AdminTabRouteData = {
  title: 'Operators',
  titleId: 'admin-ops-title',
  maxWidthClass: 'max-w-[720px]',
  signInCopy: 'Sign in as an admin to review pending registrations.',
  restoringTestId: 'admin-ops-restoring',
  signedOutTestId: 'admin-ops-signed-out',
  forbiddenTestId: 'admin-ops-forbidden',
};

@Component({ template: `<p>Stub tab content</p>` })
class StubTab {}

@Component({ imports: [RouterOutlet], template: `<router-outlet />` })
class RootHost {}

function authStub(overrides: Partial<Record<'restoring' | 'signedIn' | 'isAdmin', boolean>> = {}) {
  return {
    restoring: signal(overrides.restoring ?? false),
    signedIn: signal(overrides.signedIn ?? true),
    isAdmin: signal(overrides.isAdmin ?? true),
    principalName: signal('admin-self'),
  } as unknown as OperatorAuth;
}

async function render(auth: OperatorAuth): Promise<ComponentFixture<RootHost>> {
  await TestBed.configureTestingModule({
    imports: [RootHost],
    providers: [
      provideRouter([
        {
          path: 'admin',
          component: AdminConsole,
          children: [{ path: '', data: { adminTab: TAB }, component: StubTab }],
        },
      ]),
      { provide: OperatorAuth, useValue: auth },
    ],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl('/admin');
  const fixture = TestBed.createComponent(RootHost);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminConsole accessibility (axe)', () => {
  it('has no critical/serious violations while the session restores', async () => {
    const fixture = await render(authStub({ restoring: true }));
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no critical/serious violations for a signed-out visitor', async () => {
    const fixture = await render(authStub({ signedIn: false }));
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no critical/serious violations for a signed-in non-admin', async () => {
    const fixture = await render(authStub({ isAdmin: false }));
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no critical/serious violations once authorized, tab strip and child content shown', async () => {
    const fixture = await render(authStub());
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});
