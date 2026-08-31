import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { AdminConsole, AdminTabRouteData } from './admin-console';

interface AuthState {
  restoring?: boolean;
  signedIn?: boolean;
  isAdmin?: boolean;
}

function authStub(state: AuthState = {}): OperatorAuth {
  return {
    restoring: signal(state.restoring ?? false),
    signedIn: signal(state.signedIn ?? true),
    isAdmin: signal(state.isAdmin ?? true),
    principalName: signal('admin-self'),
  } as unknown as OperatorAuth;
}

const TAB_A: AdminTabRouteData = {
  title: 'Tab A',
  titleId: 'tab-a-title',
  maxWidthClass: 'max-w-[720px]',
  signInCopy: 'Sign in as an admin to see tab A.',
  restoringTestId: 'tab-a-restoring',
  signedOutTestId: 'tab-a-signed-out',
  forbiddenTestId: 'tab-a-forbidden',
};

const TAB_B: AdminTabRouteData = {
  title: 'Tab B',
  titleId: 'tab-b-title',
  maxWidthClass: 'max-w-[880px]',
  signInCopy: 'Sign in as an admin to see tab B.',
  restoringTestId: 'tab-b-restoring',
  signedOutTestId: 'tab-b-signed-out',
  forbiddenTestId: 'tab-b-forbidden',
};

@Component({ template: `<p data-testid="stub-a-content">Tab A content</p>` })
class StubTabA {}

@Component({ template: `<p data-testid="stub-b-content">Tab B content</p>` })
class StubTabB {}

/** A host that renders the shell under a real router, so `ActivatedRoute.snapshot.firstChild`
 *  resolves for real — `AdminConsole` must be the routed component, not a stubbed leaf. */
@Component({ imports: [RouterOutlet], template: `<router-outlet />` })
class RootHost {}

async function renderAt(url: string, auth: OperatorAuth): Promise<ComponentFixture<RootHost>> {
  await TestBed.configureTestingModule({
    imports: [RootHost],
    providers: [
      provideRouter([
        {
          path: 'admin',
          component: AdminConsole,
          children: [
            { path: '', data: { adminTab: TAB_A }, component: StubTabA },
            { path: 'b', data: { adminTab: TAB_B }, component: StubTabB },
          ],
        },
      ]),
      { provide: OperatorAuth, useValue: auth },
    ],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(RootHost);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function byTestId(fixture: ComponentFixture<RootHost>, id: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

describe('AdminConsole', () => {
  it("renders the active child's title, scoped to its own id", async () => {
    const fixture = await renderAt('/admin', authStub());

    const h1 = (fixture.nativeElement as HTMLElement).querySelector('#tab-a-title');
    expect(h1?.textContent).toBe('Tab A');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('section')
        ?.getAttribute('aria-labelledby'),
    ).toBe('tab-a-title');
  });

  it("shows the loading state while the session restores, keyed to the active tab's test id", async () => {
    const fixture = await renderAt('/admin', authStub({ restoring: true }));

    expect(byTestId(fixture, 'tab-a-restoring')).not.toBeNull();
    expect(byTestId(fixture, 'stub-a-content')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
  });

  it('shows a sign-in prompt for a signed-out visitor, returning to the page they landed on', async () => {
    const fixture = await renderAt('/admin/b', authStub({ signedIn: false }));

    const notice = byTestId(fixture, 'tab-b-signed-out');
    expect(notice?.textContent).toContain('Sign in as an admin to see tab B.');
    const link = notice?.querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Fb',
    );
    expect(byTestId(fixture, 'stub-b-content')).toBeNull();
  });

  it('shows the forbidden line for a signed-in non-admin, naming the active tab', async () => {
    const fixture = await renderAt('/admin/b', authStub({ isAdmin: false }));

    expect(byTestId(fixture, 'tab-b-forbidden')).not.toBeNull();
    expect(byTestId(fixture, 'stub-b-content')).toBeNull();
  });

  it("never renders the tab strip until the gate passes — a signed-out visitor isn't told what exists", async () => {
    const fixture = await renderAt('/admin', authStub({ signedIn: false }));

    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
  });

  it("shows the tab strip and the active child's content once authorized", async () => {
    const fixture = await renderAt('/admin', authStub());

    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).not.toBeNull();
    expect(byTestId(fixture, 'stub-a-content')?.textContent).toBe('Tab A content');
  });

  it('switches the rendered title, gate id and content to match the newly active tab', async () => {
    const fixture = await renderAt('/admin', authStub({ isAdmin: false }));
    expect(byTestId(fixture, 'tab-a-forbidden')).not.toBeNull();

    await TestBed.inject(Router).navigateByUrl('/admin/b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId(fixture, 'tab-a-forbidden')).toBeNull();
    expect(byTestId(fixture, 'tab-b-forbidden')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#tab-b-title')?.textContent).toBe(
      'Tab B',
    );
  });
});
