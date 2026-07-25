import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
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
