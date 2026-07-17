import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, SetPasswordResult } from '../core/customer-auth';
import { SetPassword } from './set-password';

interface Overrides {
  readonly signedIn?: boolean;
  readonly restoring?: boolean;
  readonly setPassword?: SetPasswordResult;
}

function authStub(o: Overrides = {}): Partial<CustomerAuth> & {
  setPassword: ReturnType<typeof vi.fn>;
  requestVerification: ReturnType<typeof vi.fn>;
} {
  return {
    restoring: signal(o.restoring ?? false),
    signedIn: signal(o.signedIn ?? true),
    email: signal('ana@example.com'),
    emailVerified: signal<boolean | undefined>(undefined),
    setPassword: vi.fn(async () => o.setPassword ?? 'set'),
    requestVerification: vi.fn(async () => 'sent' as const),
  } as unknown as Partial<CustomerAuth> & {
    setPassword: ReturnType<typeof vi.fn>;
    requestVerification: ReturnType<typeof vi.fn>;
  };
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

function text(fixture: ComponentFixture<SetPassword>, testid: string): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)?.textContent ??
    ''
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
});
