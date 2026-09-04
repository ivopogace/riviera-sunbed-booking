import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, ForgotPasswordResult } from '../core/customer-auth';
import { ProofOfWork } from '../core/proof-of-work';
import { defineFakeAltchaElement, FakeAltchaElement } from '../../testing/fake-altcha-element';
import { CHALLENGE_EXPIRED_MESSAGE } from '../shared/challenge';
import { ForgotPassword } from './forgot-password';

// jsdom has no Web Workers: the widget is the element stand-in, never the real bundle.
vi.mock('altcha', () => ({}));

class FakeProofOfWork {
  readonly enabled = signal<boolean | undefined>(false);
}

let proofOfWork: FakeProofOfWork;

function authStub(result: ForgotPasswordResult): Partial<CustomerAuth> & {
  forgotPassword: ReturnType<typeof vi.fn>;
} {
  return { forgotPassword: vi.fn(() => Promise.resolve(result)) };
}

async function render(auth: Partial<CustomerAuth>): Promise<ComponentFixture<ForgotPassword>> {
  proofOfWork = new FakeProofOfWork();
  await TestBed.configureTestingModule({
    imports: [ForgotPassword],
    providers: [
      provideRouter([]),
      { provide: CustomerAuth, useValue: auth },
      { provide: ProofOfWork, useValue: proofOfWork },
    ],
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

/** The handler is async — it awaits the widget's solution and then the request — so settle it. */
async function submit(fixture: ComponentFixture<ForgotPassword>): Promise<void> {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  await fixture.whenStable();
  fixture.detectChanges();
}

function text(fixture: ComponentFixture<ForgotPassword>, testid: string): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)
      ?.textContent ?? ''
  ).trim();
}

describe('ForgotPassword', () => {
  beforeAll(defineFakeAltchaElement);

  it('sends the request with the trimmed email and shows the neutral confirmation', async () => {
    const auth = authStub('sent');
    const fixture = await render(auth);

    setEmail(fixture, '  ana@example.com ');
    await submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.forgotPassword).toHaveBeenCalledWith('ana@example.com', undefined);
    expect(text(fixture, 'forgot-sent')).toContain('If an account exists');
  });

  it('requires an email before calling the service', async () => {
    const auth = authStub('sent');
    const fixture = await render(auth);

    setEmail(fixture, '');
    await submit(fixture);
    await fixture.whenStable();

    expect(auth.forgotPassword).not.toHaveBeenCalled();
    expect(text(fixture, 'forgot-error')).toBe('Enter your email.');
  });

  it('shows the rate-limit copy on a 429', async () => {
    const auth = authStub('rate-limited');
    const fixture = await render(auth);

    setEmail(fixture, 'ana@example.com');
    await submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'forgot-error')).toContain('Too many attempts');
  });
});

describe('ForgotPassword behind the proof-of-work fence', () => {
  beforeAll(defineFakeAltchaElement);

  function widgetOf(fixture: ComponentFixture<ForgotPassword>): FakeAltchaElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<FakeAltchaElement>('altcha-widget');
  }

  async function renderFenced(
    auth: Partial<CustomerAuth>,
  ): Promise<[ComponentFixture<ForgotPassword>, FakeAltchaElement]> {
    const fixture = await render(auth);
    proofOfWork.enabled.set(true);
    await fixture.whenStable();
    fixture.detectChanges();
    return [fixture, widgetOf(fixture)!];
  }

  it('sends the widget’s solved challenge with the request', async () => {
    const auth = authStub('sent');
    const [fixture, widget] = await renderFenced(auth);
    widget.solve('solved-payload');
    await fixture.whenStable();

    setEmail(fixture, 'ana@example.com');
    await submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.forgotPassword).toHaveBeenCalledWith('ana@example.com', 'solved-payload');
    expect(text(fixture, 'forgot-sent')).toContain('If an account exists');
  });

  it('waits for the solve rather than posting ahead of it', async () => {
    const auth = authStub('sent');
    const [fixture, widget] = await renderFenced(auth);

    setEmail(fixture, 'ana@example.com');
    await submit(fixture);
    await fixture.whenStable();
    expect(auth.forgotPassword).not.toHaveBeenCalled();

    widget.solve('late-payload');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.forgotPassword).toHaveBeenCalledWith('ana@example.com', 'late-payload');
  });

  it('says why and restarts the widget when the server refuses the challenge', async () => {
    const auth = authStub('challenge-expired');
    const [fixture, widget] = await renderFenced(auth);
    widget.solve('stale');
    await fixture.whenStable();
    const solvesBefore = widget.verify.mock.calls.length;

    setEmail(fixture, 'ana@example.com');
    await submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text(fixture, 'forgot-error')).toContain(CHALLENGE_EXPIRED_MESSAGE);
    expect(text(fixture, 'forgot-sent')).toBe('');
    expect(widget.reset).toHaveBeenCalledTimes(1);
    expect(widget.verify).toHaveBeenCalledTimes(solvesBefore + 1);
  });

  it('hides the widget and still sends when the platform switches the fence off', async () => {
    const auth = authStub('sent');
    const fixture = await render(auth);

    expect(widgetOf(fixture)).toBeNull();
    setEmail(fixture, 'ana@example.com');
    await submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.forgotPassword).toHaveBeenCalledWith('ana@example.com', undefined);
    expect(text(fixture, 'forgot-sent')).toContain('If an account exists');
  });
});
