import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../../testing/axe';
import { ChallengeWidget } from './challenge-widget';

vi.mock('altcha', () => ({}));

@Component({
  imports: [ChallengeWidget],
  template: `
    <form>
      <label>Email <input type="email" /></label>
      <app-challenge-widget [enabled]="enabled()" />
    </form>
  `,
})
class Host {
  readonly enabled = signal<boolean | undefined>(true);
}

/**
 * Structural a11y audit of the wrapper's own markup — the live status region and the host — in
 * the off and on states. The widget's inner control is a third-party element whose real render
 * (and its axe pass) is proven in the mocked Playwright suite; here it is whatever jsdom makes of
 * the custom element.
 */
describe('ChallengeWidget a11y', () => {
  async function render(enabled: boolean | undefined): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.enabled.set(enabled);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with the fence on', async () => {
    await expectNoAxeViolations(await render(true));
  });

  it('has no serious violations with the fence off', async () => {
    await expectNoAxeViolations(await render(false));
  });

  it('announces through a polite status region that outlives every state', async () => {
    const host = await render(true);
    const region = host.querySelector('[data-testid="challenge-status"]');
    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });
});
