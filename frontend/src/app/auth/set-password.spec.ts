import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, EraseAccountResult, SetPasswordResult } from '../core/customer-auth';
import { SetPassword } from './set-password';

interface Overrides {
  readonly signedIn?: boolean;
  readonly restoring?: boolean;
  readonly restoreFailed?: boolean;
  readonly emailVerified?: boolean | undefined;
  readonly setPassword?: SetPasswordResult;
  readonly requestVerification?: 'sent' | 'withheld' | 'error';
  readonly eraseAccount?: EraseAccountResult;
}

function authStub(o: Overrides = {}): Partial<CustomerAuth> & {
  setPassword: ReturnType<typeof vi.fn>;
  requestVerification: ReturnType<typeof vi.fn>;
  eraseAccount: ReturnType<typeof vi.fn>;
} {
  return {
    restoring: signal(o.restoring ?? false),
    restoreFailed: signal(o.restoreFailed ?? false),
    signedIn: signal(o.signedIn ?? true),
    email: signal('ana@example.com'),
    emailVerified: signal<boolean | undefined>(o.emailVerified),
    setPassword: vi.fn(() => Promise.resolve(o.setPassword ?? 'set')),
    requestVerification: vi.fn(() => Promise.resolve(o.requestVerification ?? 'sent')),
    eraseAccount: vi.fn(() => Promise.resolve(o.eraseAccount ?? 'erased')),
  };
}

function click(fixture: ComponentFixture<SetPassword>, testid: string): void {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!
    .click();
  fixture.detectChanges();
}

async function render(auth: Partial<CustomerAuth>): Promise<ComponentFixture<SetPassword>> {
  await TestBed.configureTestingModule({
    imports: [SetPassword],
    providers: [provideRouter([]), { provide: CustomerAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SetPassword);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setModel(
  fixture: ComponentFixture<SetPassword>,
  newPassword: string,
  currentPassword: string,
): void {
  (
    fixture.componentInstance as unknown as {
      model: { set(v: { newPassword: string; currentPassword: string }): void };
    }
  ).model.set({ newPassword, currentPassword });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<SetPassword>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

async function submitAndSettle(fixture: ComponentFixture<SetPassword>): Promise<void> {
  submit(fixture);
  await fixture.whenStable();
  fixture.detectChanges();
}

async function clickAndSettle(
  fixture: ComponentFixture<SetPassword>,
  testid: string,
): Promise<void> {
  click(fixture, testid);
  await fixture.whenStable();
  fixture.detectChanges();
}

function byId(fixture: ComponentFixture<SetPassword>, testid: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testid}"]`,
  );
}

function text(fixture: ComponentFixture<SetPassword>, testid: string): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)
      ?.textContent ?? ''
  ).trim();
}

describe('SetPassword', () => {
  it('announces through one region that survives loading → loaded (#741)', async () => {
    // signedIn defaults true — the only restore path that reaches the form.
    const auth = authStub({ restoring: true });
    const fixture = await render(auth);
    const host = fixture.nativeElement as HTMLElement;

    const announcer = host.querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading…');
    // The visible copy is decoration; the announcer alone carries the words.
    expect(host.querySelector('[data-testid="setpw-loading"]')!.getAttribute('aria-hidden')).toBe(
      'true',
    );

    (auth.restoring as unknown as { set(v: boolean): void }).set(false);
    fixture.detectChanges();

    // Same node, mutated text: the mechanism that makes a live region speak.
    expect(host.querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Account loaded.');
  });

  it('prompts to sign in when signed out', async () => {
    const fixture = await render(authStub({ signedIn: false }));
    expect(text(fixture, 'setpw-signed-out')).toContain('Sign in to manage your account');
    // Not restoring is not signed in, so the announcer says nothing (#741 review).
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="load-announcer"]')!.textContent?.trim()).toBe('');
  });

  it('distinguishes a failed session restore from actually being signed out (#745)', async () => {
    const fixture = await render(authStub({ signedIn: false, restoreFailed: true }));
    const host = fixture.nativeElement as HTMLElement;

    // Pin the mechanism (a distinct `alert` element), not just text — either branch has some.
    expect(host.querySelector('[data-testid="setpw-signed-out"]')).toBeNull();
    const panel = byId(fixture, 'setpw-restore-failed')!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('alert');
  });

  it('sets the first password for an SSO-only account (no current password sent)', async () => {
    const auth = authStub({ setPassword: 'set' });
    const fixture = await render(auth);

    setModel(fixture, 'brandnewpass2', '');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.setPassword).toHaveBeenCalledWith('brandnewpass2', undefined);
    expect(text(fixture, 'setpw-notice')).toContain('saved');
  });

  it('says the password rule up front and names the blocklist when the server rejects for it', async () => {
    const auth = authStub({ setPassword: 'blocked-password' });
    const fixture = await render(auth);
    expect(text(fixture, 'setpw-new-hint')).toContain('At least 12 characters');

    setModel(fixture, 'brandnewpass2', 'currentpass1');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'setpw-error')).toContain('name you sign in with');
  });

  it('blocks a password containing the email name client-side, without a request', async () => {
    const auth = authStub({ setPassword: 'set' });
    const fixture = await render(auth);

    setModel(fixture, 'ana-is-the-best-1', 'currentpass1');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.setPassword).not.toHaveBeenCalled();
    expect(text(fixture, 'setpw-error')).toContain('name you sign in with');
  });

  it('shows the current-password error when it is wrong', async () => {
    const auth = authStub({ setPassword: 'invalid-current' });
    const fixture = await render(auth);

    setModel(fixture, 'brandnewpass2', 'wrong-current');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.setPassword).toHaveBeenCalledWith('brandnewpass2', 'wrong-current');
    expect(text(fixture, 'setpw-error')).toContain('current password is incorrect');
  });

  // The page cannot tell an SSO-only account apart, so only the server can call the blank a fault.
  it('asks a password-holding account to fill in the current password it left blank', async () => {
    const auth = authStub({ setPassword: 'missing-current' });
    const fixture = await render(auth);

    setModel(fixture, 'brandnewpass2', '');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'setpw-error')).toContain('Enter your current password.');
  });

  // This endpoint is throttled; "try again" would invite the rejected retry.
  it('tells a throttled customer to wait rather than to retry immediately', async () => {
    const auth = authStub({ setPassword: 'rate-limited' });
    const fixture = await render(auth);

    setModel(fixture, 'brandnewpass2', 'currentpass1');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'setpw-error')).toContain('wait a minute');
  });

  it('shows the generic error on a transport failure', async () => {
    const auth = authStub({ setPassword: 'error' });
    const fixture = await render(auth);

    setModel(fixture, 'brandnewpass2', '');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'setpw-error')).toContain('Something went wrong');
  });

  it('shows the verify nudge for an unverified account and resends on click', async () => {
    const auth = authStub({ emailVerified: false });
    const fixture = await render(auth);

    expect(text(fixture, 'setpw-unverified')).toContain("isn't verified");
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="setpw-resend"]')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.requestVerification).toHaveBeenCalled();
    expect(text(fixture, 'setpw-notice')).toContain('Verification email sent');
  });

  it('tells the customer when the verification email was withheld', async () => {
    const auth = authStub({ emailVerified: false, requestVerification: 'withheld' });
    const fixture = await render(auth);

    click(fixture, 'setpw-resend');
    await fixture.whenStable();
    fixture.detectChanges();

    // The old copy must be gone, not merely accompanied by a caveat.
    expect(text(fixture, 'setpw-notice')).not.toContain('Verification email sent');
    expect(text(fixture, 'setpw-notice')).toContain("couldn't send");
  });

  it('keeps the sent copy for a deliverable address', async () => {
    const auth = authStub({ emailVerified: false, requestVerification: 'sent' });
    const fixture = await render(auth);

    click(fixture, 'setpw-resend');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'setpw-notice')).toContain('Verification email sent. Check your inbox.');
  });

  it('announces the resend outcome through a region that predates it (#1076)', async () => {
    const fixture = await render(authStub({ emailVerified: false, requestVerification: 'sent' }));

    // Present and empty beforehand: a region born holding its sentence announces nothing.
    const notice = byId(fixture, 'setpw-notice');
    expect(notice).not.toBeNull();
    expect(text(fixture, 'setpw-notice')).toBe('');

    await clickAndSettle(fixture, 'setpw-resend');

    // Same node, mutated text: the mechanism that makes a live region speak.
    expect(byId(fixture, 'setpw-notice')).toBe(notice);
    expect(text(fixture, 'setpw-notice')).toContain('Verification email sent');
  });

  it('re-announces an identical resend outcome by clearing first (#1076)', async () => {
    // Each resend waits on its gate, so the gap where the region passes through empty is visible.
    const gates: (() => void)[] = [];
    const fixture = await render({
      ...authStub({ emailVerified: false }),
      requestVerification: vi.fn(
        () =>
          new Promise<'sent'>((resolve) => {
            gates.push(() => resolve('sent'));
          }),
      ),
    });

    await clickAndSettle(fixture, 'setpw-resend');
    gates[0]();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(fixture, 'setpw-notice')).toContain('Verification email sent');

    await clickAndSettle(fixture, 'setpw-resend');

    // An unchanged string is not a mutation, so an identical second outcome must clear first.
    expect(text(fixture, 'setpw-notice')).toBe('');

    gates[1]();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'setpw-notice')).toContain('Verification email sent');
  });

  it('shows the verified badge for a verified account (no nudge)', async () => {
    const fixture = await render(authStub({ emailVerified: true }));

    expect(text(fixture, 'setpw-verified')).toContain('verified');
    expect(text(fixture, 'setpw-unverified')).toBe('');
  });

  it('requires an explicit confirm before erasing, then erases and shows the done screen', async () => {
    const auth = authStub({ eraseAccount: 'erased' });
    const fixture = await render(auth);

    // The trigger only reveals the confirm — it does not erase on its own.
    click(fixture, 'erase-account');
    expect(auth.eraseAccount).not.toHaveBeenCalled();
    expect(text(fixture, 'erase-warning')).toContain('cannot be undone');

    click(fixture, 'erase-confirm');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.eraseAccount).toHaveBeenCalledOnce();
    expect(text(fixture, 'erase-done')).toContain('have been erased');
    // The account form is gone once erased.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="setpw-email"]'),
    ).toBeNull();
  });

  it('can cancel the erase confirmation without erasing', async () => {
    const auth = authStub();
    const fixture = await render(auth);

    click(fixture, 'erase-account');
    click(fixture, 'erase-cancel');

    expect(auth.eraseAccount).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="erase-account"]'),
    ).not.toBeNull();
  });

  it('surfaces an error and stays signed in when erasure fails', async () => {
    const auth = authStub({ eraseAccount: 'error' });
    const fixture = await render(auth);

    click(fixture, 'erase-account');
    click(fixture, 'erase-confirm');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'erase-error')).toContain('Something went wrong');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="erase-done"]'),
    ).toBeNull();
  });

  it('focuses the first field when the page mounts', async () => {
    const fixture = await render(authStub());

    expect(document.activeElement).toBe(byId(fixture, 'setpw-current'));
  });

  it('moves focus to the erase confirm button when the prompt appears', async () => {
    const fixture = await render(authStub());

    await clickAndSettle(fixture, 'erase-account');

    expect(document.activeElement).toBe(byId(fixture, 'erase-confirm'));
  });

  it('returns focus to the erase trigger when the customer backs out', async () => {
    const fixture = await render(authStub());

    await clickAndSettle(fixture, 'erase-account');
    await clickAndSettle(fixture, 'erase-cancel');

    expect(document.activeElement).toBe(byId(fixture, 'erase-account'));
  });

  it('parks focus on the erased notice when the erasure completes', async () => {
    const fixture = await render(authStub({ eraseAccount: 'erased' }));

    await clickAndSettle(fixture, 'erase-account');
    await clickAndSettle(fixture, 'erase-confirm');

    expect(byId(fixture, 'erase-account')).toBeNull();
    expect(document.activeElement).toBe(byId(fixture, 'erase-done'));
  });

  it('issues no second erase while one is in flight', async () => {
    const auth = authStub({ eraseAccount: 'erased' });
    const fixture = await render(auth);

    await clickAndSettle(fixture, 'erase-account');
    click(fixture, 'erase-confirm');
    click(fixture, 'erase-confirm');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.eraseAccount).toHaveBeenCalledOnce();
  });

  /**
   * The policy guard returns before the request, so unless the clearing happens first a success
   * notice from an earlier save stays on screen beside the fresh error and the customer reads "Your
   * password has been saved." directly above a failure. `operator-password.ts` carries the identical
   * fix, and its comment is why this clearing sits above the early return.
   */
  it('clears a stale success notice before showing a fresh error', async () => {
    const fixture = await render(authStub({ setPassword: 'set' }));

    setModel(fixture, 'brandnewpass2', '');
    await submitAndSettle(fixture);
    expect(text(fixture, 'setpw-notice')).toContain('saved');

    // Under the minimum, so the client-side guard takes the early return and spends no request.
    setModel(fixture, 'short', '');
    await submitAndSettle(fixture);

    expect(text(fixture, 'setpw-error')).toContain('12–72 characters');
    expect(text(fixture, 'setpw-notice')).toBe('');
  });

  /**
   * The notice renders ABOVE the form, so on a phone a save submitted from the bottom of the form
   * leaves its only confirmation off-screen, indistinguishable from the fields merely emptying
   * themselves. Focusing it is what scrolls it back — the browser's focusing steps scroll a
   * focus target into view — so `document.activeElement` is the unit-level proof; the pixel proof is
   * `customer-password.e2e.ts`, which needs a real viewport.
   */
  it('focuses the saved notice, which is what brings it into view', async () => {
    const fixture = await render(authStub({ setPassword: 'set' }));

    setModel(fixture, 'brandnewpass2', '');
    await submitAndSettle(fixture);

    expect(byId(fixture, 'setpw-error')).toBeNull();
    expect(document.activeElement).toBe(byId(fixture, 'setpw-notice'));
  });

  /**
   * The error is what just spoke, so the error is what focus lands on — even though the notice sits
   * EARLIER in the document. That ordering is the whole reason `focusMover`'s two-argument form is
   * used rather than one `querySelector` selector list: a list resolves in document order and would
   * hand back the notice above the form every time.
   */
  it('focuses the error below the form, not the notice above it', async () => {
    const fixture = await render(authStub({ setPassword: 'invalid-current' }));

    setModel(fixture, 'brandnewpass2', 'wrong-current');
    await submitAndSettle(fixture);

    const error = byId(fixture, 'setpw-error')!;
    expect(error.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(error);
  });

  // The client-side guard returns before any request, so it needs the reveal of its own.
  it('focuses a policy error the client-side guard raised without a request', async () => {
    const auth = authStub();
    const fixture = await render(auth);

    setModel(fixture, 'short', '');
    await submitAndSettle(fixture);

    expect(auth.setPassword).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(byId(fixture, 'setpw-error'));
  });

  /**
   * The decision this slice had to make, pinned so it cannot regress silently. The save path moves
   * focus because its notice can be off-screen; the resend path must NOT, and the grounds are
   * WCAG rather than Angular — the framework's own guidance stops at "follow WCAG AA". 4.1.3 wants a
   * status message conveyed without a focus move, which this page's live region already does, and
   * 2.4.3 only compels a move when the focused element is destroyed, which this click does not do.
   * Taking focus off a still-visible, repeatable trigger would cost the customer their place.
   */
  it('leaves focus on the resend button, which survives its own click', async () => {
    const fixture = await render(authStub({ emailVerified: false, requestVerification: 'sent' }));

    const resend = byId(fixture, 'setpw-resend')!;
    resend.focus();
    await clickAndSettle(fixture, 'setpw-resend');

    expect(text(fixture, 'setpw-notice')).toContain('Verification email sent');
    expect(document.activeElement).toBe(resend);
  });
});
