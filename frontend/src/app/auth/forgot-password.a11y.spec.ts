import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { CustomerAuth } from '../core/customer-auth';
import { ProofOfWork } from '../core/proof-of-work';
import { defineFakeAltchaElement } from '../../testing/fake-altcha-element';
import { ForgotPassword } from './forgot-password';

// jsdom has no Web Workers: the widget is the element stand-in, never the real bundle.
vi.mock('altcha', () => ({}));

/**
 * Structural a11y audit for the reset-request card, in each state the page can be in: the form
 * with the proof-of-work fence off and on, the error state, and the neutral confirmation. The
 * widget's own markup is audited by `shared/challenge-widget.a11y.spec.ts`; what this adds is the
 * card around it — the field's label, the alert, and the status region living together.
 *
 * <p>(Colour contrast is proven by `auth-page.contrast.spec.ts` for the shared card tokens and
 * `shared/challenge-widget.contrast.spec.ts` for the widget's, in all three themes — axe cannot
 * measure it under jsdom.)
 */
describe('ForgotPassword a11y', () => {
  beforeAll(defineFakeAltchaElement);

  async function render(options: {
    readonly fenced: boolean;
    readonly result?: 'sent' | 'challenge-expired';
  }): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CustomerAuth,
          useValue: { forgotPassword: vi.fn().mockResolvedValue(options.result ?? 'sent') },
        },
        { provide: ProofOfWork, useValue: { enabled: signal(options.fenced) } },
      ],
    });
    const fixture = TestBed.createComponent(ForgotPassword);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    if (options.result) {
      (
        fixture.componentInstance as unknown as { model: { set(v: { email: string }): void } }
      ).model.set({ email: 'ana@example.com' });
      fixture.detectChanges();
      host.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return host;
  }

  it('has no serious violations with the fence off', async () => {
    await expectNoAxeViolations(await render({ fenced: false }));
  });

  it('has no serious violations with the fence on', async () => {
    await expectNoAxeViolations(await render({ fenced: true }));
  });

  it('has no serious violations showing a refused challenge', async () => {
    await expectNoAxeViolations(await render({ fenced: true, result: 'challenge-expired' }));
  });

  it('has no serious violations on the neutral confirmation', async () => {
    await expectNoAxeViolations(await render({ fenced: true, result: 'sent' }));
  });
});
