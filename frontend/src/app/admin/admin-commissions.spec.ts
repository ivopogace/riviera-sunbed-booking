import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Mock, vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminCommissions } from './admin-commissions';
import { AdminCommissionsService } from './admin-commissions.service';
import { VenueCommissionView } from './admin.model';

/**
 * The admin console's Commissions tab — the surface that makes a venue's rate
 * changeable at all. Four things matter here: the exact integer that will be stored is visible before
 * anything is sent, the wire never carries a percent, the response is spliced rather than re-read,
 * and the explainer states the guarantee the backend actually gives rather than the one a reader
 * would assume.
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

const VENUES: readonly VenueCommissionView[] = [
  {
    venueId: 7,
    name: 'Bora Bora Beach',
    beach: 'Dhërmi',
    commissionBps: 1500,
    payoutCurrency: 'EUR',
  },
  { venueId: 9, name: 'Folie Marine', beach: 'Gjipe', commissionBps: 1000, payoutCurrency: 'EUR' },
];

function serviceStub(): {
  venues: Mock<AdminCommissionsService['venues']>;
  setCommission: Mock<AdminCommissionsService['setCommission']>;
} {
  return {
    venues: vi.fn(() => Promise.resolve(VENUES)),
    setCommission: vi.fn((venueId: number, commissionBps: number) =>
      Promise.resolve({
        ...VENUES.find((venue) => venue.venueId === venueId)!,
        commissionBps,
      }),
    ),
  };
}

/** An RFC-7807 failure as the interceptor-free service surfaces it. */
function problem(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, title: code } });
}

async function settle(fixture: ComponentFixture<AdminCommissions>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminCommissions>> {
  await TestBed.configureTestingModule({
    imports: [AdminCommissions],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminCommissionsService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminCommissions);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

function byTestId<T extends HTMLElement>(
  fixture: ComponentFixture<AdminCommissions>,
  id: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

function text(fixture: ComponentFixture<AdminCommissions>, id: string): string {
  return byTestId(fixture, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Open one venue's editor and type a percent into it. */
async function typeRate(
  fixture: ComponentFixture<AdminCommissions>,
  venueId: number,
  percent: string,
): Promise<void> {
  byTestId<HTMLButtonElement>(fixture, `admin-commission-edit-${venueId}`)!.click();
  fixture.detectChanges();
  await settle(fixture);
  const field = byTestId<HTMLInputElement>(fixture, `admin-commission-percent-${venueId}`)!;
  field.value = percent;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

async function save(fixture: ComponentFixture<AdminCommissions>, venueId: number): Promise<void> {
  byTestId<HTMLButtonElement>(fixture, `admin-commission-save-${venueId}`)!.click();
  fixture.detectChanges();
  await settle(fixture);
}

describe('AdminCommissions', () => {
  it('lists every venue with its rate in percent and basis points', async () => {
    const fixture = await render(authStub(), serviceStub());

    expect(byTestId(fixture, 'admin-commission-row-7')).not.toBeNull();
    expect(byTestId(fixture, 'admin-commission-row-9')).not.toBeNull();
    expect(text(fixture, 'admin-commission-rate-7')).toBe('15%');
    // The exact stored integer is on screen beside the percentage, never only the percentage.
    expect(text(fixture, 'admin-commission-bps-7')).toContain('1500');
    expect(text(fixture, 'admin-commission-rate-9')).toBe('10%');
    expect(text(fixture, 'admin-commission-row-7')).toContain('Bora Bora Beach');
    expect(text(fixture, 'admin-commission-row-7')).toContain('EUR');
  });

  it('shows the exact basis points a typed percent will store', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');

    expect(text(fixture, 'admin-commission-preview-7')).toContain('1250');
    // Nothing has been sent — the preview is what makes the rounding visible BEFORE the write.
    expect(service.setCommission).not.toHaveBeenCalled();
  });

  it('shows the rounding a fractional percent would carry, before it is sent', async () => {
    const fixture = await render(authStub(), serviceStub());

    await typeRate(fixture, 7, '15.006');

    expect(text(fixture, 'admin-commission-preview-7')).toContain('1501');
  });

  it('sends basis points and splices the response back into the list', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    await save(fixture, 7);

    expect(service.setCommission).toHaveBeenCalledWith(7, 1250);
    expect(text(fixture, 'admin-commission-rate-7')).toBe('12.5%');
    expect(text(fixture, 'admin-commission-bps-7')).toContain('1250');
    // The list is not re-read: the write already answered the venue as it now stands.
    expect(service.venues).toHaveBeenCalledTimes(1);
    // The neighbouring venue is undisturbed.
    expect(text(fixture, 'admin-commission-rate-9')).toBe('10%');
    expect(byTestId(fixture, 'admin-commission-editor-7')).toBeNull();
    expect(text(fixture, 'admin-commissions-notice')).toContain('Bora Bora Beach');
  });

  /** Grounds typed into the confirmation ride the write into the audit trail. */
  it('passes typed grounds to the write', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    const reason = byTestId<HTMLInputElement>(fixture, 'admin-commission-reason-7')!;
    reason.value = '  renegotiated 2026-08  ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await save(fixture, 7);

    expect(service.setCommission).toHaveBeenCalledWith(7, 1250, 'renegotiated 2026-08');
  });

  it('sends no grounds when the field is blank', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    await save(fixture, 7);

    // Two arguments, so the service sends no header at all rather than a blank one.
    expect(service.setCommission).toHaveBeenCalledWith(7, 1250);
  });

  it('does not carry a reason typed for one change into the next', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    const reason = byTestId<HTMLInputElement>(fixture, 'admin-commission-reason-7')!;
    reason.value = 'first grounds';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-commission-cancel-7')!.click();
    fixture.detectChanges();
    await settle(fixture);

    await typeRate(fixture, 7, '11');
    expect(byTestId<HTMLInputElement>(fixture, 'admin-commission-reason-7')!.value).toBe('');
    await save(fixture, 7);

    expect(service.setCommission).toHaveBeenCalledWith(7, 1100);
  });

  it('refuses a rate outside 0–100% without sending anything', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '101');
    await save(fixture, 7);

    expect(service.setCommission).not.toHaveBeenCalled();
    expect(text(fixture, 'admin-commission-error-7')).toContain('0%');
    expect(text(fixture, 'admin-commission-rate-7')).toBe('15%');
  });

  it('refuses a blank rate rather than reading it as zero commission', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '');
    await save(fixture, 7);

    expect(service.setCommission).not.toHaveBeenCalled();
    expect(text(fixture, 'admin-commission-rate-7')).toBe('15%');
  });

  it("refuses a change that is already the venue's rate", async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '15');
    await save(fixture, 7);

    // A no-op write would still schedule a superseding row and record an audit entry.
    expect(service.setCommission).not.toHaveBeenCalled();
    expect(text(fixture, 'admin-commission-error-7')).toContain('already');
  });

  it('keeps the old rate and the typed draft when the write fails', async () => {
    const service = serviceStub();
    service.setCommission.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    await save(fixture, 7);

    expect(text(fixture, 'admin-commission-rate-7')).toBe('15%');
    // The editor stays open holding what was typed, so a retry costs no re-typing.
    expect(byTestId<HTMLInputElement>(fixture, 'admin-commission-percent-7')!.value).toBe('12.5');
    expect(text(fixture, 'admin-commission-error-7')).toContain('Nothing was changed');
  });

  /**
   * The fourth focus transition. Success and dismissal both move focus deliberately; a failure left
   * it stranded on the one path where the admin most needs to act next (WCAG 2.4.3 — the recurring
   * stranded-focus class). The busy posture now keeps focus on Save throughout, so this asserts the
   * leg still lands rather than that a blur is undone.
   */
  it('returns focus to Save when the write fails, rather than stranding it', async () => {
    const service = serviceStub();
    service.setCommission.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    await save(fixture, 7);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commission-save-7'));
    expect(byTestId<HTMLButtonElement>(fixture, 'admin-commission-save-7')!.disabled).toBe(false);
  });

  /**
   * The whole editor is locked while the write is in flight — both buttons AND both fields, plus
   * every other row's Edit. Leaving Cancel live let an admin dismiss the editor mid-request and then
   * watch the row change anyway when the response landed; the server had taken the write, so undoing
   * it locally would have been the worse lie. Leaving the *fields* live was the same bug half-fixed:
   * a percent or reason typed while the request was in flight is silently discarded by the
   * `closeEditor()` on success. `pricing-tab` has disabled its own money input during a save since
   * that file's first commit — this is the established shape, not a new one.
   */
  it('locks the editor while a write is in flight', async () => {
    const service = serviceStub();
    let resolveWrite!: (value: VenueCommissionView) => void;
    service.setCommission.mockImplementation(
      () => new Promise<VenueCommissionView>((resolve) => (resolveWrite = resolve)),
    );
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    byTestId<HTMLButtonElement>(fixture, 'admin-commission-save-7')!.click();
    fixture.detectChanges();

    expect(byTestId(fixture, 'admin-commission-cancel-7')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(byTestId(fixture, 'admin-commission-save-7')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(byTestId(fixture, 'admin-commission-edit-9')!.getAttribute('aria-disabled')).toBe(
      'true',
    );
    // The fields too, not just the buttons — a draft typed mid-flight is wiped when the write lands.
    expect(byTestId<HTMLInputElement>(fixture, 'admin-commission-percent-7')!.disabled).toBe(true);
    expect(byTestId<HTMLInputElement>(fixture, 'admin-commission-reason-7')!.disabled).toBe(true);

    resolveWrite({ ...VENUES[0], commissionBps: 1250 });
    await settle(fixture);

    expect(text(fixture, 'admin-commission-rate-7')).toBe('12.5%');
    expect(byTestId(fixture, 'admin-commission-edit-9')!.hasAttribute('aria-disabled')).toBe(false);
  });

  it('reports a vanished venue distinctly from a generic failure', async () => {
    const service = serviceStub();
    service.setCommission.mockRejectedValueOnce(problem(404, 'NO_SUCH_VENUE'));
    const fixture = await render(authStub(), service);

    await typeRate(fixture, 7, '12.5');
    await save(fixture, 7);

    // The backend does not blur venue existence here — a stale or mistyped id must fail loudly.
    expect(text(fixture, 'admin-commission-error-7')).toContain('no longer exists');
    expect(text(fixture, 'admin-commission-rate-7')).toBe('15%');
  });

  /**
   * The forward-only explainer is the substance of this surface, so its two load-bearing claims are
   * pinned rather than left to a later copy edit: the guarantee is that a past service date never
   * re-prices, NOT that the takings strip agrees with the ledger (the ledger prices each booking at
   * accrual, the strip applies one rate to a service date's aggregate).
   */
  it('states the narrow guarantee, and never promises the strip matches the ledger', async () => {
    const fixture = await render(authStub(), serviceStub());

    const explainer = text(fixture, 'admin-commissions-explainer').toLowerCase();
    expect(explainer).toContain('past service date');
    expect(explainer).toContain('never re-price');
    // The divergence is stated, not glossed — dropping this sentence is what would make the copy lie.
    expect(explainer).toContain('not a copy of the ledger');
    // Reporting follows from today — any "tomorrow" would resurrect the retired rule.
    expect(explainer).toContain('today');
    expect(explainer).not.toContain('tomorrow');
    expect(explainer).toContain('europe/tirane');
    expect(explainer).toContain('live rate');
  });

  /**
   * WCAG 2.4.3 — the recurring stranded-focus class. Each transition destroys the
   * control that was just activated, so without a deliberate move focus falls back to `<body>`.
   */
  it('moves focus onto the rate field when the editor opens', async () => {
    const fixture = await render(authStub(), serviceStub());

    byTestId<HTMLButtonElement>(fixture, 'admin-commission-edit-7')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commission-percent-7'));
  });

  it('moves focus back to Edit when the editor is dismissed', async () => {
    const fixture = await render(authStub(), serviceStub());

    await typeRate(fixture, 7, '12.5');
    byTestId<HTMLButtonElement>(fixture, 'admin-commission-cancel-7')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commission-edit-7'));
  });

  it('moves focus back to Edit once the rate is saved', async () => {
    const fixture = await render(authStub(), serviceStub());

    await typeRate(fixture, 7, '12.5');
    await save(fixture, 7);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commission-edit-7'));
  });

  /** The gate itself (forbidden markup) moved to `AdminConsole`; this component's own defensive
   *  guard — redundant once the shell's gate is in place, but harmless to keep — still must not
   *  load when the admin session says no. */
  it('does not load when the admin session is not confirmed', async () => {
    const service = serviceStub();
    const fixture = await render(authStub({ isAdmin: false }), service);

    expect(byTestId(fixture, 'admin-commission-row-7')).toBeNull();
    expect(service.venues).not.toHaveBeenCalled();
  });

  it('offers a retry when the venue list fails to load', async () => {
    const service = serviceStub();
    service.venues.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    expect(byTestId(fixture, 'admin-commissions-error')).not.toBeNull();
    byTestId<HTMLButtonElement>(fixture, 'admin-commissions-retry')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(byTestId(fixture, 'admin-commissions-error')).toBeNull();
    expect(byTestId(fixture, 'admin-commission-row-7')).not.toBeNull();
    // Retry unmounts itself with the branch swap, so focus lands on what the retry produced.
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commissions-list'));
  });

  it('keeps focus on Retry when the retried load fails again', async () => {
    const service = serviceStub();
    service.venues
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    byTestId<HTMLButtonElement>(fixture, 'admin-commissions-retry')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(byTestId(fixture, 'admin-commissions-error')).not.toBeNull();
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commissions-retry'));
  });

  it('lands focus on the empty notice when the retry finds no venues', async () => {
    const service = serviceStub();
    service.venues.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    const fixture = await render(authStub(), service);

    byTestId<HTMLButtonElement>(fixture, 'admin-commissions-retry')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-commissions-empty'));
  });

  it('says so when the platform has no venues yet', async () => {
    const service = serviceStub();
    service.venues.mockResolvedValueOnce([]);
    const fixture = await render(authStub(), service);

    expect(byTestId(fixture, 'admin-commissions-empty')).not.toBeNull();
  });
});
