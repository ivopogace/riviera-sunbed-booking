import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminOperators } from './admin-operators';
import { AdminOperatorsService } from './admin-operators.service';
import { PendingOperatorView } from './admin.model';

interface AuthState {
  restoring?: boolean;
  signedIn?: boolean;
  isAdmin?: boolean;
}

function authStub(state: AuthState): OperatorAuth {
  return {
    restoring: signal(state.restoring ?? false),
    signedIn: signal(state.signedIn ?? true),
    isAdmin: signal(state.isAdmin ?? true),
  } as unknown as OperatorAuth;
}

function serviceStub(pending: PendingOperatorView[]): {
  pending: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  reject: ReturnType<typeof vi.fn>;
} {
  return {
    pending: vi.fn(async () => pending),
    approve: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
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
