import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { CustomerAuth } from '../core/customer-auth';
import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { AuthPage } from './auth-page';

const stubAuth = () => ({
  signedIn: signal(false),
  signIn: vi.fn().mockResolvedValue('signed-in'),
  register: vi.fn().mockResolvedValue('submitted'),
  startSso: vi.fn(),
  whenReady: () => Promise.resolve(),
});

/**
 * Structural a11y audit for the unified auth card. axe runs over all four
 * flows — both modes × both audiences — plus the two landed states, because the card swaps its
 * whole field set and control shape between them. The audience/mode toggle is a `radiogroup` whose
 * keyboard contract is pinned separately by `shared/segmented-control.spec.ts`.
 *
 * (Colour contrast is proven by `auth-page.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('AuthPage a11y (#277)', () => {
  let fixture: ComponentFixture<AuthPage>;

  async function render(queryParams: Record<string, string> = {}): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CustomerAuth, useValue: stubAuth() },
        { provide: OperatorAuth, useValue: stubAuth() },
        {
          provide: OwnedVenues,
          useValue: {
            load: (): Promise<OwnedVenuesResult> =>
              Promise.resolve({ status: 'loaded', venues: [] }),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(queryParams) },
            queryParamMap: of(convertToParamMap(queryParams)),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(AuthPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations in tourist sign-in', async () => {
    await expectNoAxeViolations(await render());
  });

  it('has no serious violations in operator sign-in', async () => {
    await expectNoAxeViolations(await render({ audience: 'operator' }));
  });

  it('has no serious violations in tourist register', async () => {
    await expectNoAxeViolations(await render({ mode: 'register' }));
  });

  it('has no serious violations in operator register', async () => {
    await expectNoAxeViolations(await render({ audience: 'operator', mode: 'register' }));
  });

  it('exposes the audience toggle as a named radiogroup in both modes', async () => {
    const modes: Record<string, string>[] = [{}, { mode: 'register' }];
    for (const params of modes) {
      const host = await render(params);
      const group = host.querySelector('[role="radiogroup"]')!;
      expect(group.getAttribute('aria-label')).toBeTruthy();
      expect(group.querySelectorAll('[role="radio"]').length).toBe(2);
    }
  });

  it('announces the failure message through a live region', async () => {
    const host = await render();
    host
      .querySelector<HTMLFormElement>('[data-testid="auth-form"]')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    const alert = host.querySelector('[data-testid="auth-error"]')!;
    expect(alert.getAttribute('role')).toBe('alert');
    await expectNoAxeViolations(host);
  });

  it('has no serious violations on the pending-approval landed card', async () => {
    const host = await render({ audience: 'operator', mode: 'register' });
    for (const [testId, value] of [
      ['auth-identifier', 'sereno'],
      ['auth-contact-email', 'ops@sereno.al'],
      ['auth-password', 'password123'],
    ]) {
      const input = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    host
      .querySelector<HTMLFormElement>('[data-testid="auth-form"]')!
      .dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(host.querySelector('[data-testid="auth-pending"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});
