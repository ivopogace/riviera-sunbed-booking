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

function byId(fixture: ComponentFixture<VerifyEmail>, testid: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="${testid}"]`,
  );
}

function text(fixture: ComponentFixture<VerifyEmail>, testid: string): string {
  return (byId(fixture, testid)?.textContent ?? '').trim();
}

/**
 * An auth stub whose verification stays in flight until the returned `release` is called, so the
 * `verifying` state is observable instead of raced past — the transition out of it is the half
 * this page's announcement depends on.
 */
function heldAuth(result: VerifyEmailResult): {
  auth: Partial<CustomerAuth>;
  release: () => void;
} {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  return {
    auth: {
      whenReady: vi.fn(() => Promise.resolve(undefined)),
      verifyEmail: vi.fn(async () => {
        await held;
        return result;
      }),
    },
    release,
  };
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

  it('announces through one region that survives verifying → verified (#1076)', async () => {
    const { auth, release } = heldAuth('verified');
    const fixture = await render(auth, 'tok');

    const announcer = byId(fixture, 'load-announcer');
    expect(announcer?.textContent?.trim()).toBe('Verifying your email…');
    // The visible copy is decoration; the announcer alone carries the words (RV-FE-10).
    expect(byId(fixture, 'verify-pending')?.getAttribute('aria-hidden')).toBe('true');

    release();
    // Two settles, as `render` does: the held promise resolves one microtask hop before
    // `verify()` resumes and writes the state.
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Same node, mutated text: the mechanism that makes a live region speak. A region rebuilt
    // together with its sentence — what this page did — announces nothing.
    expect(byId(fixture, 'load-announcer')).toBe(announcer);
    expect(announcer?.textContent?.trim()).toBe('Your email is verified. Thanks!');
    expect(byId(fixture, 'verify-success')?.getAttribute('aria-hidden')).toBe('true');
  });

  // `ready` is bound to the verified branch alone, so an exit nobody described stays silent
  // rather than announcing "verified" over a panel saying the opposite. The failures announce
  // themselves: inserting a role="alert" is the one case a live region speaks without a prior
  // mutation, which is why they are not on the announcer.
  it.each([
    ['an invalid token', 'invalid-token' as const, 'tok', 'verify-failed'],
    ['a transport error', 'error' as const, 'tok', 'verify-error'],
    ['a link with no token at all', 'verified' as const, null, 'verify-failed'],
  ])('leaves the announcer silent on %s (#1076)', async (_case, result, token, panelTestId) => {
    const fixture = await render(authStub(result), token);

    // Present, not absent: an announcer that never mounted would read as empty too.
    expect(byId(fixture, 'load-announcer')).not.toBeNull();
    expect(text(fixture, 'load-announcer')).toBe('');
    expect(byId(fixture, panelTestId)?.getAttribute('role')).toBe('alert');
  });
});
