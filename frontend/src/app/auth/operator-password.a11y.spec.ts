import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth, OperatorPasswordChangeResult } from '../core/operator-auth';
import { OperatorPassword } from './operator-password';

/**
 * Structural a11y audit for the operator password-change page (#326). Both outcome states are audited,
 * not just the clean form: each renders a live region that only exists after a submit — the success
 * notice (`role="status"`) and the failure message (`role="alert"`) — so auditing the initial render
 * alone would never see either.
 *
 * (Colour contrast is proven by `auth-page.contrast.spec.ts`, which covers the shared `auth.scss`
 * card tokens this page reuses; axe cannot measure contrast under jsdom.)
 */
describe('OperatorPassword a11y (#326)', () => {
  let fixture: ComponentFixture<OperatorPassword>;

  async function render(result: OperatorPasswordChangeResult): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: OperatorAuth,
          useValue: {
            signedIn: signal(true),
            restoring: signal(false),
            username: signal('adriatica'),
            changePassword: vi.fn(async () => result),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(OperatorPassword);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  async function submitWith(host: HTMLElement, current: string, next: string): Promise<void> {
    for (const [testId, value] of [
      ['oppw-current', current],
      ['oppw-new', next],
    ]) {
      const input = host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    host.querySelector<HTMLButtonElement>('[data-testid="oppw-submit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('has no serious violations on the untouched form', async () => {
    await expectNoAxeViolations(await render('changed'));
  });

  it('announces the success notice through a live region', async () => {
    const host = await render('changed');
    await submitWith(host, 'current-pass1', 'rotated-pass2');

    expect(host.querySelector('[data-testid="oppw-notice"]')!.getAttribute('role')).toBe('status');
    await expectNoAxeViolations(host);
  });

  it('announces the failure message through a live region', async () => {
    const host = await render('invalid-current');
    await submitWith(host, 'wrong', 'rotated-pass2');

    expect(host.querySelector('[data-testid="oppw-error"]')!.getAttribute('role')).toBe('alert');
    await expectNoAxeViolations(host);
  });
});
