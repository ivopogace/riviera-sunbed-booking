import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminAudit } from './admin-audit';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditEntryView } from './admin.model';

/**
 * The admin console's Audit tab: the recorded admin actions render newest-first with who /
 * what / when / outcome / grounds, empty and failure states are honest, and the surface self-gates
 * exactly like its sibling tabs.
 */
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

const ENTRIES: readonly AdminAuditEntryView[] = [
  {
    id: 12,
    occurredAt: '2026-06-15T09:30:00Z',
    actor: 'operator',
    method: 'DELETE',
    path: '/api/admin/venues/7/photos/cover',
    status: 204,
    reason: 'reported by email',
  },
  {
    id: 11,
    occurredAt: '2026-06-14T18:05:00Z',
    actor: 'operator',
    method: 'POST',
    path: '/api/admin/erasure',
    status: 400,
    reason: null,
  },
];

function serviceStub(entries: readonly AdminAuditEntryView[] = ENTRIES): {
  latest: ReturnType<typeof vi.fn>;
} {
  return { latest: vi.fn(() => Promise.resolve(entries)) };
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminAudit>> {
  await TestBed.configureTestingModule({
    imports: [AdminAudit],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminAuditService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminAudit);
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function byTestId<T extends HTMLElement>(
  fixture: ComponentFixture<AdminAudit>,
  id: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

describe('AdminAudit', () => {
  it('renders the recorded actions with who, what, when, outcome and grounds (AC-5)', async () => {
    const service = serviceStub();

    const fixture = await render(authStub(), service);

    expect(service.latest).toHaveBeenCalledTimes(1);
    const takedown = byTestId(fixture, 'admin-audit-row-12');
    expect(takedown?.textContent).toContain('operator');
    expect(takedown?.textContent).toContain('DELETE /api/admin/venues/7/photos/cover');
    expect(takedown?.textContent).toContain('204');
    expect(takedown?.textContent).toContain('reported by email');
    // The instant renders as a Europe/Tirane moment (09:30Z is 11:30 in summer), not raw ISO.
    expect(takedown?.textContent).toContain('11:30');
    expect(takedown?.textContent).not.toContain('2026-06-15T09:30:00Z');
  });

  it('renders a failed attempt as a row with its status, and its absent reason as a dash', async () => {
    const fixture = await render(authStub(), serviceStub());

    const failed = byTestId(fixture, 'admin-audit-row-11');
    expect(failed?.textContent).toContain('400');
    expect(failed?.textContent).toContain('—');
  });

  it('says so plainly when nothing has been recorded (AC-5)', async () => {
    const fixture = await render(authStub(), serviceStub([]));

    expect(byTestId(fixture, 'admin-audit-empty')).not.toBeNull();
    expect(byTestId(fixture, 'admin-audit-table')).toBeNull();
  });

  it('offers a retry when the load fails (AC-5)', async () => {
    const service = serviceStub();
    service.latest.mockRejectedValueOnce(new Error('boom'));

    const fixture = await render(authStub(), service);

    expect(byTestId(fixture, 'admin-audit-error')).not.toBeNull();
    byTestId<HTMLButtonElement>(fixture, 'admin-audit-retry')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId(fixture, 'admin-audit-error')).toBeNull();
    expect(byTestId(fixture, 'admin-audit-row-12')).not.toBeNull();
  });

  /**
   * WCAG 2.4.3 — the recurring stranded-focus class: a successful retry destroys
   * the error banner and the Retry button the user just activated, so focus must be parked on the
   * card that replaces it rather than falling back to `<body>`.
   */
  it('parks focus on the card after a successful retry', async () => {
    const service = serviceStub();
    service.latest.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    byTestId<HTMLButtonElement>(fixture, 'admin-audit-retry')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-audit-card'));
  });

  /** The gate itself (forbidden/signed-out/restoring markup) moved to `AdminConsole`; this
   *  component's own defensive guard — redundant once the shell's gate is in place, but harmless
   *  to keep — still must not load when the admin session says no (AC-5). */
  it('does not load for a signed-in non-admin (AC-5)', async () => {
    const service = serviceStub();
    await render(authStub({ isAdmin: false }), service);
    expect(service.latest).not.toHaveBeenCalled();
  });

  it('does not load for a signed-out visitor (AC-5)', async () => {
    const service = serviceStub();
    await render(authStub({ signedIn: false, isAdmin: false }), service);
    expect(service.latest).not.toHaveBeenCalled();
  });

  it('does not load while the session is still restoring (AC-5)', async () => {
    const service = serviceStub();
    await render(authStub({ restoring: true }), service);
    expect(service.latest).not.toHaveBeenCalled();
  });
});
