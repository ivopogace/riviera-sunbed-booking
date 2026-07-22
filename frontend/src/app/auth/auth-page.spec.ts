import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { CustomerAuth } from '../core/customer-auth';
import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { AuthPage } from './auth-page';

class FakeCustomerAuth {
  readonly signedIn = signal(false);
  readonly signIn = vi.fn().mockResolvedValue('signed-in');
  readonly register = vi.fn().mockResolvedValue('registered');
  readonly startSso = vi.fn();
  whenReady(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOperatorAuth {
  readonly signedIn = signal(false);
  readonly signIn = vi.fn().mockResolvedValue('signed-in');
  readonly register = vi.fn().mockResolvedValue('submitted');
  whenReady(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOwnedVenues {
  result: OwnedVenuesResult = { status: 'loaded', venues: [{ id: 12, name: 'A', beach: 'X' }] };
  readonly reset = vi.fn();
  load(): Promise<OwnedVenuesResult> {
    return Promise.resolve(this.result);
  }
}

describe('AuthPage', () => {
  let fixture: ComponentFixture<AuthPage>;
  let customer: FakeCustomerAuth;
  let operator: FakeOperatorAuth;
  let owned: FakeOwnedVenues;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(queryParams: Record<string, string> = {}): Promise<void> {
    customer = new FakeCustomerAuth();
    operator = new FakeOperatorAuth();
    owned = new FakeOwnedVenues();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CustomerAuth, useValue: customer },
        { provide: OperatorAuth, useValue: operator },
        { provide: OwnedVenues, useValue: owned },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(AuthPage);
    await fixture.whenStable();
  }

  function el<T extends HTMLElement>(testId: string): T {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as T;
  }

  function type(testId: string, value: string): void {
    const input = el<HTMLInputElement>(testId);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    el<HTMLFormElement>('auth-form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function chooseAudience(testId: string): Promise<void> {
    el(testId).click();
    await fixture.whenStable();
  }

  describe('routes sign-in by audience', () => {
    it('signs a tourist in through CustomerAuth only', async () => {
      await render();
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'password123');
      await submit();

      expect(customer.signIn).toHaveBeenCalledWith('ana@example.com', 'password123');
      expect(operator.signIn).not.toHaveBeenCalled();
    });

    it('signs an operator in through OperatorAuth only', async () => {
      await render();
      await chooseAudience('audience-operator');
      type('auth-identifier', 'sereno');
      type('auth-password', 'password123');
      await submit();

      expect(operator.signIn).toHaveBeenCalledWith('sereno', 'password123');
      expect(customer.signIn).not.toHaveBeenCalled();
    });

    it('labels the credential field per audience', async () => {
      await render();
      expect(el('auth-identifier-label').textContent).toContain('Email');

      await chooseAudience('audience-operator');
      expect(el('auth-identifier-label').textContent).toContain('Username');
    });

    it('clears the password when the audience switches', async () => {
      // R-6: a tourist password must never be carried into an operator submit.
      await render();
      type('auth-password', 'tourist-secret');
      await chooseAudience('audience-operator');

      expect(el<HTMLInputElement>('auth-password').value).toBe('');
    });

    it('preselects audience and mode from the query params', async () => {
      await render({ audience: 'operator', mode: 'register' });

      expect(el('auth-identifier-label').textContent).toContain('Username');
      expect(el('auth-contact-email')).not.toBeNull();
    });
  });

  describe('shows only generic failures', () => {
    it('uses the shared customer message on a failed tourist sign-in', async () => {
      await render();
      customer.signIn.mockResolvedValue('invalid-credentials');
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'wrong');
      await submit();

      expect(el('auth-error').textContent).toContain('Sign-in failed. Check your email and password.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('uses the shared operator message on a failed operator sign-in', async () => {
      await render({ audience: 'operator' });
      operator.signIn.mockResolvedValue('rate-limited');
      type('auth-identifier', 'sereno');
      type('auth-password', 'wrong');
      await submit();

      expect(el('auth-error').textContent).toContain('Too many sign-in attempts.');
    });

    it('gates on non-empty before calling the backend', async () => {
      await render();
      await submit();

      expect(customer.signIn).not.toHaveBeenCalled();
      expect(el('auth-error').textContent).toContain('Enter your email and password.');
    });
  });

  describe('tourist register', () => {
    it('registers and lands on home', async () => {
      await render({ mode: 'register' });
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'password123');
      await submit();

      expect(customer.register).toHaveBeenCalledWith('ana@example.com', 'password123');
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('keeps the user on the card when the email is already taken', async () => {
      await render({ mode: 'register' });
      customer.register.mockResolvedValue('exists');
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'password123');
      await submit();

      expect(el('auth-error').textContent).toContain('may already have an account');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('enforces the shared password minimum client-side', async () => {
      await render({ mode: 'register' });
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'short');
      await submit();

      expect(customer.register).not.toHaveBeenCalled();
      expect(el('auth-error').textContent).toContain('8–72 characters');
    });
  });

  describe('operator register lands pending', () => {
    it('submits for approval without establishing a session or navigating', async () => {
      await render({ audience: 'operator', mode: 'register' });
      type('auth-identifier', 'sereno');
      type('auth-contact-email', 'ops@sereno.al');
      type('auth-password', 'password123');
      await submit();

      expect(operator.register).toHaveBeenCalledWith('sereno', 'password123', 'ops@sereno.al');
      expect(navigate).not.toHaveBeenCalled();
      expect(el('auth-pending')).not.toBeNull();
      expect(el('auth-form')).toBeNull();
    });

    it('names no venue in the pending copy — none exists at registration', async () => {
      await render({ audience: 'operator', mode: 'register' });
      type('auth-identifier', 'sereno');
      type('auth-contact-email', 'ops@sereno.al');
      type('auth-password', 'password123');
      await submit();

      expect(el('auth-pending').textContent).not.toContain('venue name');
      expect(el('auth-pending').textContent).toContain('approv');
    });

    it('returns to the sign-in form from the pending card', async () => {
      await render({ audience: 'operator', mode: 'register' });
      type('auth-identifier', 'sereno');
      type('auth-contact-email', 'ops@sereno.al');
      type('auth-password', 'password123');
      await submit();

      el('auth-pending-back').click();
      await fixture.whenStable();

      expect(el('auth-form')).not.toBeNull();
      expect(el('auth-pending')).toBeNull();
    });
  });

  describe('post-sign-in landing', () => {
    it('sends a single-venue operator straight into that console', async () => {
      await render({ audience: 'operator' });
      type('auth-identifier', 'sereno');
      type('auth-password', 'password123');
      await submit();

      expect(navigate).toHaveBeenCalledWith('/operator/12');
    });

    it('sends a multi-venue operator to the picker', async () => {
      await render({ audience: 'operator' });
      owned.result = {
        status: 'loaded',
        venues: [
          { id: 12, name: 'A', beach: 'X' },
          { id: 15, name: 'B', beach: 'Y' },
        ],
      };
      type('auth-identifier', 'sereno');
      type('auth-password', 'password123');
      await submit();

      expect(navigate).toHaveBeenCalledWith('/operator');
    });

    it('honors a returnUrl over the venue-count rule', async () => {
      await render({ audience: 'operator', returnUrl: '/operator/15/payouts' });
      type('auth-identifier', 'sereno');
      type('auth-password', 'password123');
      await submit();

      expect(navigate).toHaveBeenCalledWith('/operator/15/payouts');
    });

    it('sends the operator to the picker when the venue read fails', async () => {
      // R-12: a failed read must not be mistaken for "owns nothing" and forwarded to onboarding.
      await render({ audience: 'operator' });
      owned.result = { status: 'error' };
      type('auth-identifier', 'sereno');
      type('auth-password', 'password123');
      await submit();

      expect(navigate).toHaveBeenCalledWith('/operator');
    });

    it('honors a returnUrl for a tourist too', async () => {
      await render({ returnUrl: '/my-bookings' });
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'password123');
      await submit();

      expect(navigate).toHaveBeenCalledWith('/my-bookings');
    });

    it('refuses an off-origin returnUrl', async () => {
      await render({ returnUrl: 'https://evil.example' });
      type('auth-identifier', 'ana@example.com');
      type('auth-password', 'password123');
      await submit();

      expect(navigate).toHaveBeenCalledWith('/');
    });
  });

  describe('already signed in', () => {
    it('shows the landed card instead of a blank form for a signed-in tourist', async () => {
      await render();
      customer.signedIn.set(true);
      await fixture.whenStable();

      expect(el('auth-signed-in')).not.toBeNull();
      expect(el('auth-form')).toBeNull();
    });
  });

  describe('SSO', () => {
    it('offers SSO to tourists and hides it from operators until #276', async () => {
      await render();
      expect(el('sso-google')).not.toBeNull();

      await chooseAudience('audience-operator');
      expect(el('sso-google')).toBeNull();
    });
  });

  describe('focus management', () => {
    it('focuses the first field on load and again on every switch', async () => {
      await render();
      expect(document.activeElement).toBe(el('auth-identifier'));

      el<HTMLInputElement>('auth-password').focus();
      await chooseAudience('audience-operator');

      expect(document.activeElement).toBe(el('auth-identifier'));
    });
  });
});
