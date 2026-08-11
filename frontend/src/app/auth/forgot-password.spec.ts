import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, ForgotPasswordResult } from '../core/customer-auth';
import { ForgotPassword } from './forgot-password';

function authStub(result: ForgotPasswordResult): Partial<CustomerAuth> & {
  forgotPassword: ReturnType<typeof vi.fn>;
} {
  return { forgotPassword: vi.fn(async () => result) };
}

async function render(auth: Partial<CustomerAuth>): Promise<ComponentFixture<ForgotPassword>> {
  await TestBed.configureTestingModule({
    imports: [ForgotPassword],
    providers: [provideRouter([]), { provide: CustomerAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ForgotPassword);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setEmail(fixture: ComponentFixture<ForgotPassword>, email: string): void {
  (
    fixture.componentInstance as unknown as { model: { set(v: { email: string }): void } }
  ).model.set({
    email,
  });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<ForgotPassword>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

function text(fixture: ComponentFixture<ForgotPassword>, testid: string): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)
      ?.textContent ?? ''
  ).trim();
}

describe('ForgotPassword', () => {
  it('sends the request with the trimmed email and shows the neutral confirmation', async () => {
    const auth = authStub('sent');
    const fixture = await render(auth);

    setEmail(fixture, '  ana@example.com ');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.forgotPassword).toHaveBeenCalledWith('ana@example.com');
    expect(text(fixture, 'forgot-sent')).toContain('If an account exists');
  });

  it('requires an email before calling the service', async () => {
    const auth = authStub('sent');
    const fixture = await render(auth);

    setEmail(fixture, '');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.forgotPassword).not.toHaveBeenCalled();
    expect(text(fixture, 'forgot-error')).toBe('Enter your email.');
  });

  it('shows the rate-limit copy on a 429', async () => {
    const auth = authStub('rate-limited');
    const fixture = await render(auth);

    setEmail(fixture, 'ana@example.com');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'forgot-error')).toContain('Too many attempts');
  });
});
