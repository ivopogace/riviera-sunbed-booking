import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth, OperatorPasswordChangeResult } from '../core/operator-auth';
import { OperatorPassword } from './operator-password';

type AuthStub = Partial<OperatorAuth> & { changePassword: ReturnType<typeof vi.fn> };

function authStub(result: OperatorPasswordChangeResult = 'changed'): AuthStub {
  return {
    signedIn: signal(true),
    restoring: signal(false),
    username: signal('adriatica'),
    changePassword: vi.fn(async () => result),
  } as unknown as AuthStub;
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
    expect(text(fixture, 'oppw-error')).toBeUndefined();
  });

  // A password may legitimately carry leading/trailing spaces; trimming would lock such an account
  // out of proving its current password (the S8 set-password review finding, kept from recurring).
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
    expect(text(fixture, 'oppw-notice')).toBeUndefined();
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
