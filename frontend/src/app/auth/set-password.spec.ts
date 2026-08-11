import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, EraseAccountResult, SetPasswordResult } from '../core/customer-auth';
import { SetPassword } from './set-password';

interface Overrides {
  readonly signedIn?: boolean;
  readonly restoring?: boolean;
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
    signedIn: signal(o.signedIn ?? true),
    email: signal('ana@example.com'),
    emailVerified: signal<boolean | undefined>(o.emailVerified),
    setPassword: vi.fn(async () => o.setPassword ?? 'set'),
    requestVerification: vi.fn(async () => o.requestVerification ?? 'sent'),
    eraseAccount: vi.fn(async () => o.eraseAccount ?? 'erased'),
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
  it('prompts to sign in when signed out', async () => {
    const fixture = await render(authStub({ signedIn: false }));
    expect(text(fixture, 'setpw-signed-out')).toContain('Sign in to manage your account');
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
});
