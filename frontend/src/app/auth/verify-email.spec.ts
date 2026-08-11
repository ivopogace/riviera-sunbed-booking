import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth, VerifyEmailResult } from '../core/customer-auth';
import { VerifyEmail } from './verify-email';

function authStub(result: VerifyEmailResult): Partial<CustomerAuth> & {
  verifyEmail: ReturnType<typeof vi.fn>;
} {
  return {
    whenReady: vi.fn(() => Promise.resolve(undefined)),
    verifyEmail: vi.fn(() => Promise.resolve(result)),
  };
}

async function render(
  auth: Partial<CustomerAuth>,
  token: string | null,
): Promise<ComponentFixture<VerifyEmail>> {
  await TestBed.configureTestingModule({
    imports: [VerifyEmail],
    providers: [
      provideRouter([]),
      { provide: CustomerAuth, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(VerifyEmail);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable(); // let the on-load verify() settle
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<VerifyEmail>, testid: string): string {
  return (
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`)
      ?.textContent ?? ''
  ).trim();
}

describe('VerifyEmail', () => {
  it('verifies on load with a valid token', async () => {
    const auth = authStub('verified');
    const fixture = await render(auth, 'tok');

    expect(auth.verifyEmail).toHaveBeenCalledWith('tok');
    expect(text(fixture, 'verify-success')).toContain('verified');
  });

  it('shows the dead-end with no token and never calls the service', async () => {
    const auth = authStub('verified');
    const fixture = await render(auth, null);

    expect(auth.verifyEmail).not.toHaveBeenCalled();
    expect(text(fixture, 'verify-failed')).toContain('invalid or has expired');
  });

  it('shows the dead-end on an invalid token', async () => {
    const auth = authStub('invalid-token');
    const fixture = await render(auth, 'tok');

    expect(text(fixture, 'verify-failed')).toContain('invalid or has expired');
  });

  it('shows a distinct try-again message on a transport error (not the invalid-link copy)', async () => {
    const auth = authStub('error');
    const fixture = await render(auth, 'tok');

    expect(text(fixture, 'verify-error')).toContain('Something went wrong');
    expect(text(fixture, 'verify-failed')).toBe(''); // not the invalid-link message
  });
});
