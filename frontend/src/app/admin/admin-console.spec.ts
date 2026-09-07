import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { routes } from '../app.routes';
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
            { path: 'bare', component: StubTabA },
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

  it('renders the fallback tab and a root returnUrl before any navigation has completed (#983)', async () => {
    await TestBed.configureTestingModule({
      imports: [AdminConsole],
      providers: [
        provideRouter([]),
        { provide: OperatorAuth, useValue: authStub({ signedIn: false }) },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminConsole);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#admin-console-title')?.textContent).toBe('Admin');
    expect(
      host.querySelector('[data-testid="admin-console-signed-out"] a')?.getAttribute('href'),
    ).toBe('/account/sign-in?audience=operator&returnUrl=%2F');
  });

  it('falls back to the Admin title when the active child carries no adminTab (#983)', async () => {
    const fixture = await renderAt('/admin/bare', authStub());

    const h1 = (fixture.nativeElement as HTMLElement).querySelector('#admin-console-title');
    expect(h1?.textContent).toBe('Admin');
    expect(byTestId(fixture, 'stub-a-content')).not.toBeNull();
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

  it('follows a navigation: the sign-in returnUrl is the tab the visitor is on (#983)', async () => {
    const fixture = await renderAt('/admin', authStub({ signedIn: false }));
    expect(byTestId(fixture, 'tab-a-signed-out')?.querySelector('a')?.getAttribute('href')).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Fadmin',
    );

    await TestBed.inject(Router).navigateByUrl('/admin/b');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId(fixture, 'tab-a-signed-out')).toBeNull();
    expect(byTestId(fixture, 'tab-b-signed-out')?.querySelector('a')?.getAttribute('href')).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Fb',
    );
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

  it("renders no tab strip of its own — the shell wears it — and the active child's content once authorized (#1011)", async () => {
    const fixture = await renderAt('/admin', authStub());

    expect((fixture.nativeElement as HTMLElement).querySelector('nav')).toBeNull();
    expect(byTestId(fixture, 'stub-a-content')?.textContent).toBe('Tab A content');
  });

  it('carries no porcelain pin of its own — the app shell pins every console route (#1011)', async () => {
    const fixture = await renderAt('/admin', authStub());

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('app-admin-console')
        ?.getAttribute('data-riv-theme'),
    ).toBeNull();
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

/**
 * The shell over the REAL route table: `/admin/*` lazy-loads {@link AdminConsole} and each tab child
 * carries the `data.adminTab` the shell renders from. The stubbed table above proves the shell's
 * logic; only this proves the wiring it reads — a signed-out visitor is the cheapest way to render
 * the tab's copy without mounting the tab's page.
 */
describe('AdminConsole — deep link over the real routes (#983)', () => {
  it("renders the deep-linked tab's copy and returnUrl, then the next tab's", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: OperatorAuth, useValue: authStub({ signedIn: false }) },
      ],
    });
    const harness = await RouterTestingHarness.create('/admin/audit');
    const host = harness.routeNativeElement!;

    expect(host.querySelector('#admin-audit-title')?.textContent).toBe('Audit');
    expect(
      host.querySelector('[data-testid="admin-audit-signed-out"] a')?.getAttribute('href'),
    ).toBe('/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Faudit');

    await harness.navigateByUrl('/admin');

    expect(host.querySelector('#admin-audit-title')).toBeNull();
    expect(host.querySelector('#admin-ops-title')?.textContent).toBe('Operators');
    expect(host.querySelector('[data-testid="admin-ops-signed-out"] a')?.getAttribute('href')).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Fadmin',
    );
  });
});
