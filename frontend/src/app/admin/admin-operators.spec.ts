import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminCommissionsService } from './admin-commissions.service';
import { AdminOperators } from './admin-operators';
import { AdminOperatorsService } from './admin-operators.service';
import { OperatorAccountView, PendingOperatorView } from './admin.model';

interface AuthState {
  restoring?: boolean;
  signedIn?: boolean;
  isAdmin?: boolean;
  principalName?: string;
}

function authStub(state: AuthState): OperatorAuth {
  return {
    restoring: signal(state.restoring ?? false),
    signedIn: signal(state.signedIn ?? true),
    isAdmin: signal(state.isAdmin ?? true),
    principalName: signal(state.principalName ?? 'admin-self'),
  } as unknown as OperatorAuth;
}

function serviceStub(
  pending: PendingOperatorView[],
  accounts: OperatorAccountView[] = [],
): {
  pending: ReturnType<typeof vi.fn>;
  accounts: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  reject: ReturnType<typeof vi.fn>;
  suspend: ReturnType<typeof vi.fn>;
  reinstate: ReturnType<typeof vi.fn>;
} {
  return {
    pending: vi.fn(async () => pending),
    accounts: vi.fn(async () => accounts),
    approve: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    reinstate: vi.fn(async () => undefined),
  };
}

/** The stat strip's own read — stubbed so the page's specs never reach a real HttpClient. */
function commissionsStub(): Partial<AdminCommissionsService> {
  return { venues: async () => [] };
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminOperators>> {
  await TestBed.configureTestingModule({
    imports: [AdminOperators],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminOperatorsService, useValue: service },
      { provide: AdminCommissionsService, useValue: commissionsStub() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminOperators);
  fixture.detectChanges();
  // Settled twice: the load awaits BOTH lists (Promise.all), so one microtask turn isn't enough.
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminOperators', () => {
  const rows: PendingOperatorView[] = [
    { id: 7, username: 'alice', contactEmail: 'a@v.example', registeredAt: '2026-07-18T00:00:00Z' },
  ];

  it('loads and lists pending operators for a signed-in admin', async () => {
    const service = serviceStub(rows);
    const fixture = await render(authStub({ isAdmin: true }), service);

    expect(service.pending).toHaveBeenCalledTimes(1);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('[data-testid="admin-op-row"]')).toHaveLength(1);
    expect(host.textContent).toContain('alice');
    expect(host.textContent).toContain('a@v.example');
  });

  it('approves then reconciles the queue from the server (re-fetch, not local removal)', async () => {
    const service = serviceStub(rows);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-approve-7"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.approve).toHaveBeenCalledWith(7);
    expect(service.pending).toHaveBeenCalledTimes(2); // initial load + reconcile after the decision
  });

  it('rejects then reconciles the queue from the server', async () => {
    const service = serviceStub(rows);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-reject-7"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.reject).toHaveBeenCalledWith(7);
    expect(service.pending).toHaveBeenCalledTimes(2);
  });

  const accounts: OperatorAccountView[] = [
    { id: 7, username: 'alice', contactEmail: 'a@v.example', admin: false, suspended: false },
    { id: 8, username: 'bob', contactEmail: null, admin: false, suspended: true },
    { id: 9, username: 'admin-self', contactEmail: null, admin: true, suspended: false },
  ];

  it('suspends an active operator and reconciles the list', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    // Suspension takes a deliberate second step — the first click only arms the confirmation.
    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.suspend).not.toHaveBeenCalled();

    (host.querySelector('[data-testid="admin-suspend-confirm-7"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.suspend).toHaveBeenCalledWith(7);
    expect(service.accounts).toHaveBeenCalledTimes(2); // initial load + reconcile, never a local removal
  });

  /** Grounds typed into the confirmation ride the suspension into the audit trail. */
  it('passes typed grounds to the suspend', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = host.querySelector('[data-testid="admin-suspend-reason-7"]') as HTMLInputElement;
    input.value = '  repeated guest reports  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (host.querySelector('[data-testid="admin-suspend-confirm-7"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.suspend).toHaveBeenCalledWith(7, 'repeated guest reports');
  });

  it('does not carry grounds typed for one suspension into the next (AC-4)', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input = host.querySelector('[data-testid="admin-suspend-reason-7"]') as HTMLInputElement;
    input.value = 'first grounds';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (host.querySelector('[data-testid="admin-suspend-cancel-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Re-armed after a dismissal, the field is blank and an unstated reason stays unstated.
    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(
      (host.querySelector('[data-testid="admin-suspend-reason-7"]') as HTMLInputElement).value,
    ).toBe('');
    (host.querySelector('[data-testid="admin-suspend-confirm-7"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.suspend).toHaveBeenCalledWith(7);
  });

  /**
   * WCAG 2.4.3 — the recurring stranded-focus class. Arming and dismissing
   * each destroy the control that was just activated, so focus must be moved deliberately.
   */
  it('moves focus onto the confirmation when armed rather than stranding it (AC-5)', async () => {
    const fixture = await render(authStub({ isAdmin: true }), serviceStub(rows, accounts));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(
      host.querySelector('[data-testid="admin-suspend-confirm-7"]'),
    );
  });

  it('returns focus to Suspend when the confirmation is dismissed (AC-5)', async () => {
    const fixture = await render(authStub({ isAdmin: true }), serviceStub(rows, accounts));
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="admin-suspend-cancel-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('[data-testid="admin-suspend-7"]'));
  });

  it('cancels an armed suspension without calling the server', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    (host.querySelector('[data-testid="admin-suspend-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (host.querySelector('[data-testid="admin-suspend-cancel-7"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.suspend).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="admin-suspend-7"]')).not.toBeNull();
  });

  it('reinstates a suspended operator in one step and reconciles', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="admin-suspended-badge-8"]')).not.toBeNull();
    (host.querySelector('[data-testid="admin-reinstate-8"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.reinstate).toHaveBeenCalledWith(8);
    expect(service.accounts).toHaveBeenCalledTimes(2);
  });

  /**
   * The fourth transition on all four row actions. `act()` clears the confirmation and reconciles
   * both lists from the server, so whatever focus was on — a confirm button, or a row the reconcile
   * removes — is gone by the time the action settles. Each lands on the notice stating the outcome,
   * which is also the page's only announcement of it.
   */
  async function settleAction(
    fixture: ComponentFixture<AdminOperators>,
    testid: string,
  ): Promise<void> {
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        `[data-testid="${testid}"]`,
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function notice(fixture: ComponentFixture<AdminOperators>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-ops-notice"]');
  }

  it('parks focus on the notice when an approval settles', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);

    await settleAction(fixture, 'admin-approve-7');

    expect(notice(fixture)?.textContent).toContain('alice');
    expect(document.activeElement).toBe(notice(fixture));
  });

  it('parks focus on the notice when a rejection settles', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);

    await settleAction(fixture, 'admin-reject-7');

    expect(notice(fixture)?.textContent).toContain('alice');
    expect(document.activeElement).toBe(notice(fixture));
  });

  it('parks focus on the notice when a suspension settles', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);
    (
      (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="admin-suspend-7"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    await settleAction(fixture, 'admin-suspend-confirm-7');

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-suspend-panel-7"]'),
    ).toBeNull();
    expect(notice(fixture)?.textContent).toContain('alice');
    expect(document.activeElement).toBe(notice(fixture));
  });

  it('parks focus on the notice when a reinstatement settles', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true }), service);

    await settleAction(fixture, 'admin-reinstate-8');

    expect(notice(fixture)?.textContent).toContain('bob');
    expect(document.activeElement).toBe(notice(fixture));
  });

  it('offers no suspend control on the signed-in admin’s own row', async () => {
    const service = serviceStub(rows, accounts);
    const fixture = await render(authStub({ isAdmin: true, principalName: 'admin-self' }), service);
    const host = fixture.nativeElement as HTMLElement;

    // The server refuses a self-suspend (409 CANNOT_SUSPEND_SELF); don't offer an action that can't succeed.
    expect(host.querySelector('[data-testid="admin-suspend-9"]')).toBeNull();
    expect(host.querySelector('[data-testid="admin-self-9"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="admin-suspend-7"]')).not.toBeNull();
  });

  it('shows the forbidden notice for a signed-in non-admin and never loads', async () => {
    const service = serviceStub(rows);
    const fixture = await render(authStub({ signedIn: true, isAdmin: false }), service);

    expect(service.pending).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-ops-forbidden"]'),
    ).not.toBeNull();
  });

  it('prompts to sign in when signed out', async () => {
    const service = serviceStub(rows);
    const fixture = await render(authStub({ signedIn: false, isAdmin: false }), service);

    expect(service.pending).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="admin-ops-signed-out"]'),
    ).not.toBeNull();
  });
});

describe('AdminOperators stat strip (A9, #348)', () => {
  const accounts: OperatorAccountView[] = [
    { id: 1, username: 'admin-self', contactEmail: null, admin: true, suspended: false },
    { id: 2, username: 'bea', contactEmail: 'b@v.example', admin: false, suspended: false },
    { id: 3, username: 'caj', contactEmail: 'c@v.example', admin: false, suspended: true },
  ];

  function tile(fixture: ComponentFixture<AdminOperators>, testId: string): string | undefined {
    return (fixture.nativeElement as HTMLElement)
      .querySelector(`[data-testid="${testId}"]`)
      ?.textContent?.trim();
  }

  it('feeds the strip the counts derived from the lists it loaded', async () => {
    const pending: PendingOperatorView[] = [
      { id: 7, username: 'a', contactEmail: 'a@v.example', registeredAt: '2026-07-18T00:00:00Z' },
      { id: 8, username: 'b', contactEmail: 'b@v.example', registeredAt: '2026-07-19T00:00:00Z' },
    ];
    const fixture = await render(authStub({ isAdmin: true }), serviceStub(pending, accounts));

    expect(tile(fixture, 'admin-stat-pending')).toBe('2');
    expect(tile(fixture, 'admin-stat-active')).toBe('2');
    expect(tile(fixture, 'admin-stat-suspended')).toBe('1');
  });

  it('dashes every count when the load failed — a blip is never a confident zero', async () => {
    const service = serviceStub([], accounts);
    service.pending.mockRejectedValueOnce(new Error('offline'));
    const fixture = await render(authStub({ isAdmin: true }), service);

    expect(tile(fixture, 'admin-stat-pending')).toBe('—');
    expect(tile(fixture, 'admin-stat-active')).toBe('—');
    expect(tile(fixture, 'admin-stat-suspended')).toBe('—');
  });

  it('reports a genuinely empty queue as a real zero', async () => {
    const fixture = await render(authStub({ isAdmin: true }), serviceStub([], accounts));

    expect(tile(fixture, 'admin-stat-pending')).toBe('0');
  });

  it('renders the strip above the queue but below the tab strip', async () => {
    const fixture = await render(authStub({ isAdmin: true }), serviceStub([], accounts));
    const host = fixture.nativeElement as HTMLElement;
    const order = [...host.querySelectorAll('nav, [data-testid="admin-stats"], #admin-pending-title')];

    expect(order.map((el) => el.getAttribute('data-testid') ?? el.tagName)).toEqual([
      'NAV',
      'admin-stats',
      'H2',
    ]);
  });
});
