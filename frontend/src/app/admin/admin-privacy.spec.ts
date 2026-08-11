import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminPrivacy } from './admin-privacy';
import { AdminPrivacyService } from './admin-privacy.service';

/**
 * The admin console's Privacy tab — the first UI for `POST /api/admin/erasure`.
 *
 * <p>Two things carry this spec. First, **nothing is sent until the confirmation is confirmed**: an
 * erasure is irreversible, so every case that reaches the confirm stage also asserts the service was
 * not called. Second, **the surface has no not-found branch to test**, because the endpoint has none
 * — it answers `204` for a real scrub, an already-erased subject and an unknown address alike
 * (design D-8). The done-stage case therefore asserts the *absence* of any such distinction as
 * carefully as it asserts the presence of the sentence that explains why.
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

const EMAIL = 'ana@example.com';

function serviceStub(): { erase: ReturnType<typeof vi.fn> } {
  return { erase: vi.fn(async () => undefined) };
}

/** An RFC-7807 failure as the interceptor-free service surfaces it. */
function problem(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, title: code } });
}

async function settle(fixture: ComponentFixture<AdminPrivacy>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminPrivacy>> {
  await TestBed.configureTestingModule({
    imports: [AdminPrivacy],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminPrivacyService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminPrivacy);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

function byTestId<T extends HTMLElement>(
  fixture: ComponentFixture<AdminPrivacy>,
  id: string,
): T | null {
  return fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
}

function text(fixture: ComponentFixture<AdminPrivacy>, id: string): string {
  return byTestId(fixture, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

async function type(
  fixture: ComponentFixture<AdminPrivacy>,
  id: string,
  value: string,
): Promise<void> {
  const field = byTestId<HTMLInputElement>(fixture, id)!;
  field.value = value;
  field.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  await settle(fixture);
}

/** Fill the address and arm the confirmation — the state every destructive case starts from. */
async function armConfirmation(
  fixture: ComponentFixture<AdminPrivacy>,
  email = EMAIL,
): Promise<void> {
  await type(fixture, 'admin-privacy-email', email);
  byTestId<HTMLButtonElement>(fixture, 'admin-privacy-review')!.click();
  fixture.detectChanges();
  await settle(fixture);
}

async function confirm(fixture: ComponentFixture<AdminPrivacy>): Promise<void> {
  byTestId<HTMLButtonElement>(fixture, 'admin-privacy-confirm')!.click();
  fixture.detectChanges();
  await settle(fixture);
}

describe('AdminPrivacy', () => {
  it('explains what an erasure erases and what it keeps', async () => {
    const fixture = await render(authStub(), serviceStub());

    const aside = text(fixture, 'admin-privacy-survives').toLowerCase();
    expect(aside).toContain('name, email, phone');
    // ADR-0010's model: the rows stay and are overwritten — this is not a delete.
    expect(aside).toContain('overwritten in place');
    expect(aside).toContain('bookings, payments, payout ledger entries');
    expect(aside).toContain('legally required to retain');
    // The reason this screen exists at all: account holders have their own.
    expect(aside).toContain('erase themselves');
  });

  it('refuses a malformed email without sending anything', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture, 'not-an-email');

    expect(byTestId(fixture, 'admin-privacy-confirm-panel')).toBeNull();
    expect(text(fixture, 'admin-privacy-email-error')).toBe('Enter a valid email address.');
    expect(service.erase).not.toHaveBeenCalled();
  });

  it('refuses a blank email without sending anything', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture, '   ');

    expect(byTestId(fixture, 'admin-privacy-confirm-panel')).toBeNull();
    expect(text(fixture, 'admin-privacy-email-error')).toBe('Enter a valid email address.');
    expect(service.erase).not.toHaveBeenCalled();
  });

  it('arms a confirmation that names the address, sending nothing', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);

    expect(byTestId(fixture, 'admin-privacy-confirm-panel')).not.toBeNull();
    expect(text(fixture, 'admin-privacy-confirm-panel')).toContain(EMAIL);
    // The review step arms; it never acts. Nothing has reached the network.
    expect(service.erase).not.toHaveBeenCalled();
    expect(byTestId(fixture, 'admin-privacy-review')).toBeNull();
  });

  it('trims a pasted address before validating and sending', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture, `  ${EMAIL}  `);
    await confirm(fixture);

    expect(service.erase).toHaveBeenCalledWith(EMAIL);
  });

  it('sends the address on confirm', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await confirm(fixture);

    expect(service.erase).toHaveBeenCalledWith(EMAIL);
    expect(byTestId(fixture, 'admin-privacy-done-panel')).not.toBeNull();
    expect(text(fixture, 'admin-privacy-done-panel')).toContain(EMAIL);
  });

  /** Grounds typed into the confirmation ride the request into the audit trail. */
  it('passes typed grounds to the erasure', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await type(fixture, 'admin-privacy-reason', '  DSAR-2026-08-04  ');
    await confirm(fixture);

    expect(service.erase).toHaveBeenCalledWith(EMAIL, 'DSAR-2026-08-04');
  });

  it('sends no grounds when the field is blank', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await confirm(fixture);

    // One argument, so the service sends no header at all rather than a blank one.
    expect(service.erase).toHaveBeenCalledWith(EMAIL);
  });

  /**
   * The whole point of this screen. The wire has one success shape and it carries no information, so
   * the screen must not manufacture one — and must say so, or an admin will read a bare
   * confirmation as "yes, they were in the system".
   */
  it('states the non-enumeration property on the done stage', async () => {
    const fixture = await render(authStub(), serviceStub());

    await armConfirmation(fixture);
    await confirm(fixture);

    const done = text(fixture, 'admin-privacy-done-panel').toLowerCase();
    expect(done).toContain('whether or not');
    expect(done).toContain('never tell you');
    // No count, and no success/not-found distinction — there is none on the wire to render.
    expect(done).not.toMatch(/\d+\s+(record|booking|subject)/);
    expect(done).not.toContain('not found');
    expect(done).not.toContain('no such');
  });

  it("does not carry one request's address or grounds into the next", async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await type(fixture, 'admin-privacy-reason', 'first grounds');
    await confirm(fixture);
    byTestId<HTMLButtonElement>(fixture, 'admin-privacy-another')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(byTestId<HTMLInputElement>(fixture, 'admin-privacy-email')!.value).toBe('');
    await armConfirmation(fixture, 'bob@example.com');
    expect(byTestId<HTMLInputElement>(fixture, 'admin-privacy-reason')!.value).toBe('');
    await confirm(fixture);

    expect(service.erase).toHaveBeenLastCalledWith('bob@example.com');
  });

  it('keeps the confirmation armed when the request fails', async () => {
    const service = serviceStub();
    service.erase.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await type(fixture, 'admin-privacy-reason', 'DSAR-2026-08-04');
    await confirm(fixture);

    expect(byTestId(fixture, 'admin-privacy-done-panel')).toBeNull();
    expect(byTestId(fixture, 'admin-privacy-confirm-panel')).not.toBeNull();
    // Retrying costs no re-typing, and the failure says nothing was erased.
    expect(byTestId<HTMLInputElement>(fixture, 'admin-privacy-reason')!.value).toBe(
      'DSAR-2026-08-04',
    );
    expect(text(fixture, 'admin-privacy-error')).toContain('Nothing was erased');
  });

  it('reports a rejected address distinctly from a transport failure', async () => {
    const service = serviceStub();
    service.erase.mockRejectedValueOnce(problem(400, 'INVALID_REQUEST'));
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await confirm(fixture);

    expect(text(fixture, 'admin-privacy-error')).toContain('rejected that email address');
  });

  it('locks the confirmation while the erasure is in flight', async () => {
    const service = serviceStub();
    let resolveErase!: () => void;
    service.erase.mockImplementation(() => new Promise<void>((resolve) => (resolveErase = resolve)));
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    byTestId<HTMLButtonElement>(fixture, 'admin-privacy-confirm')!.click();
    fixture.detectChanges();

    expect(byTestId(fixture, 'admin-privacy-confirm')!.getAttribute('aria-disabled')).toBe('true');
    expect(byTestId(fixture, 'admin-privacy-cancel')!.getAttribute('aria-disabled')).toBe('true');
    // The field too, not just the buttons — grounds typed mid-flight would never be sent.
    expect(byTestId<HTMLInputElement>(fixture, 'admin-privacy-reason')!.disabled).toBe(true);

    resolveErase();
    await settle(fixture);

    expect(byTestId(fixture, 'admin-privacy-done-panel')).not.toBeNull();
    expect(service.erase).toHaveBeenCalledTimes(1);
  });

  it('self-gates on the admin session', async () => {
    const service = serviceStub();
    const fixture = await render(authStub({ isAdmin: false }), service);

    expect(byTestId(fixture, 'admin-privacy-forbidden')).not.toBeNull();
    expect(byTestId(fixture, 'admin-privacy-email')).toBeNull();
    // A signed-out visitor is never told which admin surfaces exist.
    expect(fixture.nativeElement.querySelector('app-admin-console-tabs')).toBeNull();
    expect(service.erase).not.toHaveBeenCalled();
  });

  it('offers a sign-in link when the visitor has no session', async () => {
    const fixture = await render(authStub({ signedIn: false }), serviceStub());

    expect(byTestId(fixture, 'admin-privacy-signed-out')).not.toBeNull();
    expect(byTestId(fixture, 'admin-privacy-email')).toBeNull();
  });

  /**
   * WCAG 2.4.3 — the recurring stranded-focus class, which a sibling tab's review fan-out
   * hit three times in one PR. Each of the five transitions below destroys the control that was just
   * activated, so without a deliberate move focus falls back to `<body>`. Each case fails with its
   * `focusAfterRender` call removed; that was verified rather than assumed.
   */
  it('moves focus onto the confirmation when it is armed', async () => {
    const fixture = await render(authStub(), serviceStub());

    await armConfirmation(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-privacy-confirm-panel'));
  });

  it('moves focus back to Review when the confirmation is dismissed', async () => {
    const fixture = await render(authStub(), serviceStub());

    await armConfirmation(fixture);
    byTestId<HTMLButtonElement>(fixture, 'admin-privacy-cancel')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-privacy-review'));
  });

  it('moves focus onto the outcome when the erasure completes', async () => {
    const fixture = await render(authStub(), serviceStub());

    await armConfirmation(fixture);
    await confirm(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-privacy-done-panel'));
  });

  it('moves focus onto the email field when starting another erasure', async () => {
    const fixture = await render(authStub(), serviceStub());

    await armConfirmation(fixture);
    await confirm(fixture);
    byTestId<HTMLButtonElement>(fixture, 'admin-privacy-another')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-privacy-email'));
  });

  /**
   * The transition the other four hide. A failure would otherwise strand a keyboard user on the one
   * path where they most need to act next; the busy posture now keeps focus on the confirm button
   * throughout, so this asserts the leg still lands rather than that a blur is undone.
   */
  it('returns focus to the confirm button when the erasure fails, rather than stranding it', async () => {
    const service = serviceStub();
    service.erase.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    await armConfirmation(fixture);
    await confirm(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-privacy-confirm'));
    expect(byTestId<HTMLButtonElement>(fixture, 'admin-privacy-confirm')!.disabled).toBe(false);
  });
});
