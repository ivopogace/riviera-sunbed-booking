import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, ResetPasswordResult } from '../core/customer-auth';
import { OperatorAuth } from '../core/operator-auth';
import { ResetAudience, ResetPassword } from './reset-password';

function authStub(result: ResetPasswordResult): Partial<CustomerAuth> & {
  resetPassword: ReturnType<typeof vi.fn>;
} {
  return { resetPassword: vi.fn(() => Promise.resolve(result)) };
}

async function render(
  auth: Partial<CustomerAuth>,
  token: string | null,
  audience: ResetAudience = 'customer',
): Promise<ComponentFixture<ResetPassword>> {
  await TestBed.configureTestingModule({
    imports: [ResetPassword],
    providers: [
      provideRouter([]),
      audience === 'operator'
        ? { provide: OperatorAuth, useValue: auth }
        : { provide: CustomerAuth, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            queryParamMap: convertToParamMap(token ? { token } : {}),
            data: audience === 'operator' ? { resetAudience: 'operator' } : {},
          },
        },
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

function byId(fixture: ComponentFixture<ResetPassword>, testid: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testid}"]`,
  );
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

    setModel(fixture, 'passphrase-123', 'different1');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(text(fixture, 'reset-error')).toContain('do not match');
  });

  it('shows the done message and passes the token on a successful reset', async () => {
    const auth = authStub('reset');
    const fixture = await render(auth, 'tok');

    setModel(fixture, 'passphrase-123', 'passphrase-123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.resetPassword).toHaveBeenCalledWith('tok', 'passphrase-123');
    expect(text(fixture, 'reset-done')).toContain('updated');
  });

  it('parks focus on the done confirmation, whose trigger the branch destroyed (#1076)', async () => {
    const fixture = await render(authStub('reset'), 'tok');

    setModel(fixture, 'passphrase-123', 'passphrase-123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    // Focus would sit on <body> otherwise, and landing here is what announces the outcome.
    expect(byId(fixture, 'reset-submit')).toBeNull();
    expect(document.activeElement).toBe(byId(fixture, 'reset-done'));
  });

  it('says the password rule up front and rejects a short password before calling the service', async () => {
    const auth = authStub('reset');
    const fixture = await render(auth, 'tok');
    expect(text(fixture, 'reset-hint')).toContain('At least 12 characters');

    setModel(fixture, 'elevenchars', 'elevenchars');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(text(fixture, 'reset-error')).toContain('12–72 characters');
  });

  it('names the blocklist when the server rejects the password for it', async () => {
    const auth = authStub('blocked-password');
    const fixture = await render(auth, 'tok');

    setModel(fixture, 'passphrase-123', 'passphrase-123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'reset-error')).toContain('name you sign in with');
  });

  it('maps an invalid token to the expired-link message', async () => {
    const auth = authStub('invalid-token');
    const fixture = await render(auth, 'tok');

    setModel(fixture, 'passphrase-123', 'passphrase-123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'reset-error')).toContain('invalid or has expired');
  });

  describe('the operator audience (#1737)', () => {
    it('redeems through the operator auth service and lands on the operator sign-in tab', async () => {
      const auth = authStub('reset');
      const fixture = await render(auth, 'op-tok', 'operator');

      setModel(fixture, 'passphrase-123', 'passphrase-123');
      submit(fixture);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(auth.resetPassword).toHaveBeenCalledWith('op-tok', 'passphrase-123');
      expect(byId(fixture, 'reset-to-signin')!.getAttribute('href')).toBe(
        '/account/sign-in?audience=operator',
      );
    });

    it('sends an operator with a dead link to the admin, never to the tourist forgot page', async () => {
      const fixture = await render(authStub('reset'), null, 'operator');

      expect(text(fixture, 'reset-no-token')).toContain('Ask your platform admin');
      expect(byId(fixture, 'reset-to-forgot')).toBeNull();
    });

    it('names the admin on an expired operator link', async () => {
      const fixture = await render(authStub('invalid-token'), 'op-tok', 'operator');

      setModel(fixture, 'passphrase-123', 'passphrase-123');
      submit(fixture);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(text(fixture, 'reset-error')).toContain('Ask your platform admin for a new one.');
    });
  });

  it('keeps the tourist sign-in link free of an audience', async () => {
    const fixture = await render(authStub('reset'), 'tok');

    setModel(fixture, 'passphrase-123', 'passphrase-123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId(fixture, 'reset-to-signin')!.getAttribute('href')).toBe('/account/sign-in');
  });
});
