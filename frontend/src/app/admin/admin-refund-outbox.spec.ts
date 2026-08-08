import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminRefundOutbox } from './admin-refund-outbox';
import { AdminRefundOutboxService } from './admin-refund-outbox.service';
import { OutboxStatusView, ResubmissionResultView } from './admin.model';

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

function serviceStub(status: OutboxStatusView = { outstanding: 0, cooldownRemainingSeconds: 0 }): {
  status: ReturnType<typeof vi.fn>;
  resubmit: ReturnType<typeof vi.fn>;
} {
  return {
    status: vi.fn(async () => status),
    resubmit: vi.fn(async (): Promise<ResubmissionResultView> => ({
      outcome: 'RESUBMITTED',
      resubmitted: 0,
      cooldownRemainingSeconds: 60,
    })),
  };
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminRefundOutbox>> {
  await TestBed.configureTestingModule({
    imports: [AdminRefundOutbox],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminRefundOutboxService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminRefundOutbox);
  fixture.detectChanges();
  // Settled twice: load() awaits refreshStatus(), which awaits the service — two microtask turns.
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<AdminRefundOutbox>, testId: string): string {
  return (
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? ''
  );
}

function has(fixture: ComponentFixture<AdminRefundOutbox>, testId: string): boolean {
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) !== null;
}

async function press(fixture: ComponentFixture<AdminRefundOutbox>): Promise<void> {
  fixture.nativeElement.querySelector('[data-testid="admin-refunds-resubmit"]').click();
  // resubmit() -> describe() -> reconcile() -> status(): three awaits before the notice settles.
  await fixture.whenStable();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminRefundOutbox', () => {
  it('shows what the registry still owes before anything is pressed (AC-1)', async () => {
    const service = serviceStub({ outstanding: 3, cooldownRemainingSeconds: 0 });

    const fixture = await render(authStub(), service);

    expect(text(fixture, 'admin-refunds-outstanding')).toContain('3');
    expect(text(fixture, 'admin-refunds-outstanding')).toContain('refunds are');
    expect(service.status).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when nothing is outstanding', async () => {
    const fixture = await render(authStub(), serviceStub());

    expect(has(fixture, 'admin-refunds-empty')).toBe(true);
    expect(has(fixture, 'admin-refunds-outstanding')).toBe(false);
  });

  it('reports the count handed back and re-reads the outbox (AC-1)', async () => {
    const service = serviceStub({ outstanding: 4, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'RESUBMITTED',
      resubmitted: 4,
      cooldownRemainingSeconds: 60,
    });
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-refunds-notice')).toBe('Handed 4 back to be retried.');
    expect(service.status).toHaveBeenCalledTimes(2);
  });

  // A refusal is a `200` the admin acts on — it must never read as a failure.
  it('reports a cooling-down refusal as a refusal, not an error (AC-1)', async () => {
    const service = serviceStub({ outstanding: 2, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'COOLING_DOWN',
      resubmitted: 0,
      cooldownRemainingSeconds: 41,
    });
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-refunds-notice')).toBe(
      'A resubmission ran recently, so this one was skipped. Try again in 41s.',
    );
    expect(text(fixture, 'admin-refunds-notice')).not.toContain('wrong');
  });

  it('reports a concurrent press as ALREADY_RUNNING (AC-1)', async () => {
    const service = serviceStub({ outstanding: 2, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'ALREADY_RUNNING',
      resubmitted: 0,
      cooldownRemainingSeconds: 60,
    });
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-refunds-notice')).toContain('already running');
  });

  it('surfaces a failed resubmission as an error without claiming a count', async () => {
    const service = serviceStub({ outstanding: 1, cooldownRemainingSeconds: 0 });
    service.resubmit.mockRejectedValue(new Error('boom'));
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-refunds-notice')).toBe(
      'Something went wrong — nothing was resubmitted.',
    );
  });

  /** A failed re-read must not overwrite a successful outcome with an error banner. */
  it('keeps the outcome when the follow-up status read fails', async () => {
    const service = serviceStub({ outstanding: 2, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'RESUBMITTED',
      resubmitted: 2,
      cooldownRemainingSeconds: 60,
    });
    const fixture = await render(authStub(), service);
    service.status.mockRejectedValue(new Error('boom'));

    await press(fixture);

    expect(text(fixture, 'admin-refunds-notice')).toBe('Handed 2 back to be retried.');
    expect(has(fixture, 'admin-refunds-error')).toBe(false);
  });

  it('offers a retry when the initial load fails', async () => {
    const service = serviceStub();
    service.status.mockRejectedValueOnce(new Error('boom'));

    const fixture = await render(authStub(), service);

    expect(has(fixture, 'admin-refunds-error')).toBe(true);
    expect(has(fixture, 'admin-refunds-resubmit')).toBe(false);
  });

  it('offers no lever to a non-admin operator (AC-2)', async () => {
    const service = serviceStub();

    const fixture = await render(authStub({ isAdmin: false }), service);

    expect(has(fixture, 'admin-refunds-forbidden')).toBe(true);
    expect(has(fixture, 'admin-refunds-resubmit')).toBe(false);
    expect(service.status).not.toHaveBeenCalled();
  });

  it('offers no lever, and no tab strip, to a signed-out visitor (AC-2)', async () => {
    const service = serviceStub();

    const fixture = await render(authStub({ signedIn: false, isAdmin: false }), service);

    expect(has(fixture, 'admin-refunds-signed-out')).toBe(true);
    expect(has(fixture, 'admin-refunds-resubmit')).toBe(false);
    expect(has(fixture, 'admin-tab-refunds')).toBe(false);
  });

  it('waits for session restore before deciding anything (AC-2)', async () => {
    const service = serviceStub();

    const fixture = await render(authStub({ restoring: true }), service);

    expect(has(fixture, 'admin-refunds-restoring')).toBe(true);
    expect(service.status).not.toHaveBeenCalled();
  });
});
