import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, ResetPasswordResult } from '../core/customer-auth';
import { ResetPassword } from './reset-password';

function authStub(result: ResetPasswordResult): Partial<CustomerAuth> & {
  resetPassword: ReturnType<typeof vi.fn>;
} {
  return { resetPassword: vi.fn(() => Promise.resolve(result)) };
}

async function render(
  auth: Partial<CustomerAuth>,
  token: string | null,
): Promise<ComponentFixture<ResetPassword>> {
  await TestBed.configureTestingModule({
    imports: [ResetPassword],
    providers: [
      provideRouter([]),
      { provide: CustomerAuth, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ResetPassword);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setModel(
  fixture: ComponentFixture<ResetPassword>,
  newPassword: string,
  confirm: string,
): void {
  (
    fixture.componentInstance as unknown as {
      model: { set(v: { newPassword: string; confirm: string }): void };
    }
  ).model.set({ newPassword, confirm });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<ResetPassword>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

function text(fixture: ComponentFixture<ResetPassword>, testid: string): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)
      ?.textContent ?? ''
  ).trim();
}

describe('ResetPassword', () => {
  it('shows the no-token dead-end when the link carries no token', async () => {
    const fixture = await render(authStub('reset'), null);
    expect(text(fixture, 'reset-no-token')).toContain('invalid or incomplete');
  });

  it('rejects a mismatched confirmation before calling the service', async () => {
    const auth = authStub('reset');
    const fixture = await render(auth, 'tok');

    setModel(fixture, 'password123', 'different1');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(text(fixture, 'reset-error')).toContain('do not match');
  });

  it('shows the done message and passes the token on a successful reset', async () => {
    const auth = authStub('reset');
    const fixture = await render(auth, 'tok');

    setModel(fixture, 'password123', 'password123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.resetPassword).toHaveBeenCalledWith('tok', 'password123');
    expect(text(fixture, 'reset-done')).toContain('updated');
  });

  it('maps an invalid token to the expired-link message', async () => {
    const auth = authStub('invalid-token');
    const fixture = await render(auth, 'tok');

    setModel(fixture, 'password123', 'password123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'reset-error')).toContain('invalid or has expired');
  });
});
