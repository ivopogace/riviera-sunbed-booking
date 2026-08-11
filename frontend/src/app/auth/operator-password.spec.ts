import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Mock, vi } from 'vitest';

import { OperatorAuth, OperatorPasswordChangeResult } from '../core/operator-auth';
import { OperatorPassword } from './operator-password';

type AuthStub = Partial<OperatorAuth> & {
  changePassword: Mock<
    (currentPassword: string, newPassword: string) => Promise<OperatorPasswordChangeResult>
  >;
  sessionLost: Mock<() => void>;
};

function authStub(result: OperatorPasswordChangeResult = 'changed'): AuthStub {
  return {
    signedIn: signal(true),
    restoring: signal(false),
    username: signal('adriatica'),
    changePassword: vi.fn(() => Promise.resolve(result)),
    sessionLost: vi.fn(),
  };
}

async function render(auth: AuthStub): Promise<ComponentFixture<OperatorPassword>> {
  await TestBed.configureTestingModule({
    imports: [OperatorPassword],
    providers: [provideRouter([]), { provide: OperatorAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(OperatorPassword);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setModel(
  fixture: ComponentFixture<OperatorPassword>,
  currentPassword: string,
  newPassword: string,
): void {
  (
    fixture.componentInstance as unknown as {
      model: { set(v: { currentPassword: string; newPassword: string }): void };
    }
  ).model.set({ currentPassword, newPassword });
  fixture.detectChanges();
}

async function submit(fixture: ComponentFixture<OperatorPassword>): Promise<void> {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>('[data-testid="oppw-submit"]')!
    .click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function text(fixture: ComponentFixture<OperatorPassword>, testid: string): string | undefined {
  return (fixture.nativeElement as HTMLElement)
    .querySelector(`[data-testid="${testid}"]`)
    ?.textContent?.trim();
}

describe('OperatorPassword (self-service credential rotation, #326)', () => {
  it('sends both passwords exactly as typed and confirms the other-device sign-out', async () => {
    const auth = authStub('changed');
    const fixture = await render(auth);

    setModel(fixture, 'current-pass1', 'rotated-pass2');
    await submit(fixture);

    expect(auth.changePassword).toHaveBeenCalledWith('current-pass1', 'rotated-pass2');
    expect(text(fixture, 'oppw-notice')).toContain('signed out');
    expect(text(fixture, 'oppw-error')).toBe('');
  });

  // A password may legitimately carry leading/trailing spaces; trimming would lock such an account
  // out of proving its current password.
  it('does not trim the submitted passwords', async () => {
    const auth = authStub('changed');
    const fixture = await render(auth);

    setModel(fixture, '  spaced current  ', '  spaced new pass  ');
    await submit(fixture);

    expect(auth.changePassword).toHaveBeenCalledWith('  spaced current  ', '  spaced new pass  ');
  });

  it('reports a wrong current password as such, not as a policy failure', async () => {
    const fixture = await render(authStub('invalid-current'));

    setModel(fixture, 'wrong', 'rotated-pass2');
    await submit(fixture);

    expect(text(fixture, 'oppw-error')).toContain('current password is incorrect');
    expect(text(fixture, 'oppw-notice')).toBe('');
  });

  it('explains the bootstrap admin refusal instead of showing a generic error', async () => {
    const fixture = await render(authStub('bootstrap-managed'));

    setModel(fixture, 'current-pass1', 'rotated-pass2');
    await submit(fixture);

    expect(text(fixture, 'oppw-error')).toContain('deployment environment');
  });

  it('rejects a too-short new password client-side without calling the backend', async () => {
    const auth = authStub('changed');
    const fixture = await render(auth);

    setModel(fixture, 'current-pass1', 'short');
    await submit(fixture);

    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(text(fixture, 'oppw-error')).toBeDefined();
  });

  // The guard still spends no request; the server names the case too (it no longer needs to).
  it('names the empty current-password field instead of blaming the new password', async () => {
    const auth = authStub('changed');
    const fixture = await render(auth);

    setModel(fixture, '', 'rotated-pass2');
    await submit(fixture);

    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(text(fixture, 'oppw-error')).toContain('current password');
    expect(text(fixture, 'oppw-error')).not.toContain('8–72');
  });

  // Review finding: an early return skipped the clear, so a stale success notice sat beside a fresh error.
  it('clears a previous success notice when the next attempt fails validation', async () => {
    const fixture = await render(authStub('changed'));
    setModel(fixture, 'current-pass1', 'rotated-pass2');
    await submit(fixture);
    expect(text(fixture, 'oppw-notice')).toContain('signed out');

    setModel(fixture, '', 'another-pass3');
    await submit(fixture);

    expect(text(fixture, 'oppw-error')).toContain('current password');
    expect(text(fixture, 'oppw-notice')).toBe('');
  });

  // The server caps bcrypt's 72-BYTE input; counting characters let an accented passphrase through to a
  // rejection whose message ("8–72 characters") contradicted what the operator could see on screen.
  it('rejects a new password over 72 UTF-8 bytes even when it is under 72 characters', async () => {
    const auth = authStub('changed');
    const fixture = await render(auth);

    setModel(fixture, 'current-pass1', 'ë'.repeat(40));
    await submit(fixture);

    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(text(fixture, 'oppw-error')).toContain('too long');
    expect(text(fixture, 'oppw-error')).not.toContain('8–72 characters');
  });

  // A dead session must flow back into SessionAuth; every other operator surface calls sessionLost().
  it('reports an expired session as such and drops the principal', async () => {
    const auth = authStub('session-lost');
    const fixture = await render(auth);

    setModel(fixture, 'current-pass1', 'rotated-pass2');
    await submit(fixture);

    expect(auth.sessionLost).toHaveBeenCalled();
    expect(text(fixture, 'oppw-error')).toContain('session');
  });

  // Live regions must pre-exist their content, or the announcement is commonly dropped entirely.
  it('keeps both live regions in the DOM before there is anything to announce', async () => {
    const fixture = await render(authStub('changed'));

    const notice = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="oppw-notice"]',
    );
    const error = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="oppw-error"]',
    );
    expect(notice?.getAttribute('role')).toBe('status');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(notice?.textContent?.trim()).toBe('');
    expect(error?.textContent?.trim()).toBe('');
  });

  it('clears the fields on success so the entered password is not left on screen', async () => {
    const fixture = await render(authStub('changed'));

    setModel(fixture, 'current-pass1', 'rotated-pass2');
    await submit(fixture);

    const model = (
      fixture.componentInstance as unknown as {
        model: () => { currentPassword: string; newPassword: string };
      }
    ).model();
    expect(model).toEqual({ currentPassword: '', newPassword: '' });
  });
});
