import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, CustomerSignInResult } from '../core/customer-auth';
import { SignIn } from './sign-in';

type AuthStub = Partial<CustomerAuth> & {
  signIn: ReturnType<typeof vi.fn>;
  startSso: ReturnType<typeof vi.fn>;
};

/** A CustomerAuth stub whose signIn resolves to the given result; other members are inert. */
function authStub(result: CustomerSignInResult): AuthStub {
  return { signIn: vi.fn(async () => result), startSso: vi.fn() } as unknown as AuthStub;
}

async function render(auth: Partial<CustomerAuth>): Promise<ComponentFixture<SignIn>> {
  await TestBed.configureTestingModule({
    imports: [SignIn],
    providers: [provideRouter([]), { provide: CustomerAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SignIn);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setModel(fixture: ComponentFixture<SignIn>, email: string, password: string): void {
  (
    fixture.componentInstance as unknown as { model: { set(v: { email: string; password: string }): void } }
  ).model.set({ email, password });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<SignIn>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

function errorText(fixture: ComponentFixture<SignIn>): string {
  return (
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="signin-error"]')
      ?.textContent ?? ''
  ).trim();
}

describe('SignIn', () => {
  it('signs in with the trimmed email and navigates home on success', async () => {
    const auth = authStub('signed-in');
    const fixture = await render(auth);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setModel(fixture, '  ana@example.com  ', 'password123');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.signIn).toHaveBeenCalledWith('ana@example.com', 'password123');
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(errorText(fixture)).toBe('');
  });

  it('shows the generic error and does not navigate on invalid credentials', async () => {
    const auth = authStub('invalid-credentials');
    const fixture = await render(auth);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    setModel(fixture, 'ana@example.com', 'nope');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('Sign-in failed. Check your email and password.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the rate-limit copy on a 429', async () => {
    const auth = authStub('rate-limited');
    const fixture = await render(auth);

    setModel(fixture, 'ana@example.com', 'password123');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('Too many attempts. Please wait a minute and try again.');
  });

  it('requires email and password before calling the service', async () => {
    const auth = authStub('signed-in');
    const fixture = await render(auth);

    setModel(fixture, '', '');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.signIn).not.toHaveBeenCalled();
    expect(errorText(fixture)).toBe('Enter your email and password.');
  });

  it('starts SSO when a provider button is clicked', async () => {
    const auth = authStub('signed-in');
    const fixture = await render(auth);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('[data-testid="sso-google"]')!.click();
    expect(auth.startSso).toHaveBeenCalledWith('google');

    el.querySelector<HTMLButtonElement>('[data-testid="sso-apple"]')!.click();
    expect(auth.startSso).toHaveBeenCalledWith('apple');
  });
});
