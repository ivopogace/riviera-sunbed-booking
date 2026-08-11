import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminMailDeliveryService } from './admin-mail-delivery.service';
import { AdminMailOutbox } from './admin-mail-outbox';
import { AdminMailOutboxService } from './admin-mail-outbox.service';
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
    status: vi.fn(() => Promise.resolve(status)),
    resubmit: vi.fn((): Promise<ResubmissionResultView> =>
      Promise.resolve({
        outcome: 'RESUBMITTED',
        resubmitted: 0,
        cooldownRemainingSeconds: 60,
      }),
    ),
  };
}

/** The nested delivery card's port — never exercised from these specs. */
const inertDeliveryService = {
  lookup: () => Promise.resolve({ bookings: [] }),
  resend: () => Promise.resolve({ outcome: 'SENT' as const }),
};

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminMailOutbox>> {
  await TestBed.configureTestingModule({
    imports: [AdminMailOutbox],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminMailOutboxService, useValue: service },
      // The page nests the delivery card; inert here, it has its own specs.
      { provide: AdminMailDeliveryService, useValue: inertDeliveryService },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminMailOutbox);
  fixture.detectChanges();
  // Settled twice: load() awaits refreshStatus(), which awaits the service — two microtask turns.
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<AdminMailOutbox>, testId: string): string {
  return (
    (fixture.nativeElement as HTMLElement)
      .querySelector(`[data-testid="${testId}"]`)
      ?.textContent?.trim() ?? ''
  );
}

function has(fixture: ComponentFixture<AdminMailOutbox>, testId: string): boolean {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`) !== null;
}

async function press(fixture: ComponentFixture<AdminMailOutbox>): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLElement>('[data-testid="admin-outbox-resubmit"]')!
    .click();
  // resubmit() -> describe() -> reconcile() -> status(): three awaits before the notice settles.
  await fixture.whenStable();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminMailOutbox', () => {
  it('shows what the registry still owes before anything is pressed (AC-8)', async () => {
    const service = serviceStub({ outstanding: 3, cooldownRemainingSeconds: 0 });

    const fixture = await render(authStub(), service);

    expect(text(fixture, 'admin-outbox-outstanding')).toContain('3');
    expect(text(fixture, 'admin-outbox-outstanding')).toContain('mails are');
    expect(service.status).toHaveBeenCalledTimes(1);
  });

  it('says so plainly when nothing is outstanding', async () => {
    const fixture = await render(authStub(), serviceStub());

    expect(has(fixture, 'admin-outbox-empty')).toBe(true);
    expect(has(fixture, 'admin-outbox-outstanding')).toBe(false);
  });

  it('reports the count handed back and re-reads the outbox (AC-8)', async () => {
    const service = serviceStub({ outstanding: 4, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'RESUBMITTED',
      resubmitted: 4,
      cooldownRemainingSeconds: 60,
    });
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-outbox-notice')).toBe('Handed 4 back for delivery.');
    expect(service.status).toHaveBeenCalledTimes(2);
  });

  /**
   * The refusal is a `200` the admin acts on, so it must not read as a failure — conflating the two
   * teaches an admin to distrust a working button.
   */
  it('reports a cooling-down refusal as a refusal, not an error (AC-8)', async () => {
    const service = serviceStub({ outstanding: 2, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'COOLING_DOWN',
      resubmitted: 0,
      cooldownRemainingSeconds: 41,
    });
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-outbox-notice')).toBe(
      'A resubmission ran recently, so this one was skipped. Try again in 41s.',
    );
    expect(text(fixture, 'admin-outbox-notice')).not.toContain('wrong');
  });

  it('reports a concurrent press as ALREADY_RUNNING', async () => {
    const service = serviceStub({ outstanding: 2, cooldownRemainingSeconds: 0 });
    service.resubmit.mockResolvedValue({
      outcome: 'ALREADY_RUNNING',
      resubmitted: 0,
      cooldownRemainingSeconds: 60,
    });
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-outbox-notice')).toContain('already running');
  });

  it('surfaces a failed resubmission as an error without claiming a count', async () => {
    const service = serviceStub({ outstanding: 1, cooldownRemainingSeconds: 0 });
    service.resubmit.mockRejectedValue(new Error('boom'));
    const fixture = await render(authStub(), service);

    await press(fixture);

    expect(text(fixture, 'admin-outbox-notice')).toBe(
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

    expect(text(fixture, 'admin-outbox-notice')).toBe('Handed 2 back for delivery.');
    expect(has(fixture, 'admin-outbox-error')).toBe(false);
  });

  it('offers a retry when the initial load fails', async () => {
    const service = serviceStub();
    service.status.mockRejectedValueOnce(new Error('boom'));

    const fixture = await render(authStub(), service);

    expect(has(fixture, 'admin-outbox-error')).toBe(true);
    expect(has(fixture, 'admin-outbox-resubmit')).toBe(false);
  });

  it('offers no lever to a non-admin operator (AC-9)', async () => {
    const service = serviceStub();

    const fixture = await render(authStub({ isAdmin: false }), service);

    expect(has(fixture, 'admin-outbox-forbidden')).toBe(true);
    expect(has(fixture, 'admin-outbox-resubmit')).toBe(false);
    expect(service.status).not.toHaveBeenCalled();
  });

  it('offers no lever, and no tab strip, to a signed-out visitor (AC-9)', async () => {
    const service = serviceStub();

    const fixture = await render(authStub({ signedIn: false, isAdmin: false }), service);

    expect(has(fixture, 'admin-outbox-signed-out')).toBe(true);
    expect(has(fixture, 'admin-outbox-resubmit')).toBe(false);
    expect(has(fixture, 'admin-tab-email')).toBe(false);
  });

  it('waits for session restore before deciding anything', async () => {
    const service = serviceStub();

    const fixture = await render(authStub({ restoring: true }), service);

    expect(has(fixture, 'admin-outbox-restoring')).toBe(true);
    expect(service.status).not.toHaveBeenCalled();
  });
});
