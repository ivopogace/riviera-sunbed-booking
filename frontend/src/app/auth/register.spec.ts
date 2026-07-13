import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, CustomerRegisterResult } from '../core/customer-auth';
import { Register } from './register';

/** A CustomerAuth stub whose register resolves to the given result; other members are inert. */
function authStub(
  result: CustomerRegisterResult,
): Partial<CustomerAuth> & { register: ReturnType<typeof vi.fn> } {
  return { register: vi.fn(async () => result) } as unknown as Partial<CustomerAuth> & {
    register: ReturnType<typeof vi.fn>;
  };
}

async function render(auth: Partial<CustomerAuth>): Promise<ComponentFixture<Register>> {
  await TestBed.configureTestingModule({
    imports: [Register],
    providers: [provideRouter([]), { provide: CustomerAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(Register);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setModel(fixture: ComponentFixture<Register>, email: string, password: string): void {
  (
    fixture.componentInstance as unknown as { model: { set(v: { email: string; password: string }): void } }
  ).model.set({ email, password });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<Register>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

function errorText(fixture: ComponentFixture<Register>): string {
  return (
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="register-error"]')
      ?.textContent ?? ''
  ).trim();
}

describe('Register', () => {
  it('creates the account and navigates home on success', async () => {
    const auth = authStub('registered');
    const fixture = await render(auth);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setModel(fixture, '  new@example.com  ', 'password123');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.register).toHaveBeenCalledWith('new@example.com', 'password123');
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(errorText(fixture)).toBe('');
  });

  it('points an already-registered email at sign-in without navigating', async () => {
    const auth = authStub('exists');
    const fixture = await render(auth);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setModel(fixture, 'taken@example.com', 'password123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('That email may already have an account. Try signing in instead.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects a short password client-side without calling the service', async () => {
    const auth = authStub('registered');
    const fixture = await render(auth);

    setModel(fixture, 'new@example.com', 'short'); // 5 chars < 8
    submit(fixture);
    await fixture.whenStable();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText(fixture)).toBe('Choose a password of at least 8 characters.');
  });

  it('shows the rate-limit copy on a 429', async () => {
    const auth = authStub('rate-limited');
    const fixture = await render(auth);

    setModel(fixture, 'new@example.com', 'password123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('requires email and password before validating length or calling the service', async () => {
    const auth = authStub('registered');
    const fixture = await render(auth);

    setModel(fixture, '', '');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText(fixture)).toBe('Enter your email and password.');
  });
});
