import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CHALLENGE_URL } from './challenge';
import { ChallengeWidget } from './challenge-widget';

// jsdom has no Web Workers; the wrapper is proven against the element contract below, not a solve.
vi.mock('altcha', () => ({}));

/**
 * A stand-in for the real `<altcha-widget>` element: jsdom has no Web Workers, so the wrapper is
 * proven against the element's contract — the two methods it drives and the events it listens to —
 * rather than against a solve. The real solve runs in the mocked Playwright suite.
 */
class FakeAltchaElement extends HTMLElement {
  readonly reset = vi.fn();
  readonly verify = vi.fn(() => Promise.resolve(null));

  connectedCallback(): void {
    this.innerHTML =
      '<div class="altcha"><div class="altcha-footer"><p>Protected by <a href="https://altcha.org/">ALTCHA</a></p></div></div>';
    this.dispatchEvent(new CustomEvent('load'));
  }

  changeState(state: string, payload?: string): void {
    this.dispatchEvent(new CustomEvent('statechange', { detail: { state, payload } }));
  }
}

@Component({
  imports: [ChallengeWidget],
  template: `<app-challenge-widget [enabled]="enabled()" [(payload)]="payload" />`,
})
class Host {
  readonly enabled = signal<boolean | undefined>(undefined);
  readonly payload = signal<string | undefined>(undefined);
  readonly widget = viewChild.required(ChallengeWidget);
}

describe('ChallengeWidget', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeAll(() => {
    const defined = customElements.get('altcha-widget');
    if (defined === undefined) {
      customElements.define('altcha-widget', FakeAltchaElement);
    } else if (defined !== FakeAltchaElement) {
      throw new Error('the real altcha element leaked into jsdom — the vi.mock above must stay');
    }
  });

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function element(): FakeAltchaElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<FakeAltchaElement>('altcha-widget');
  }

  function status(): string {
    return (
      (fixture.nativeElement as HTMLElement)
        .querySelector('[data-testid="challenge-status"]')
        ?.textContent?.trim() ?? ''
    );
  }

  async function enable(): Promise<FakeAltchaElement> {
    host.enabled.set(true);
    await fixture.whenStable();
    return element()!;
  }

  it('renders nothing until the platform says the fence is on', async () => {
    expect(element()).toBeNull();
    host.enabled.set(false);
    await fixture.whenStable();
    expect(element()).toBeNull();
    await enable();
    expect(element()).not.toBeNull();
  });

  it('points the widget at the platform’s challenge endpoint and solves on focus', async () => {
    const widget = await enable();
    expect(widget.getAttribute('challenge')).toBe(CHALLENGE_URL);
    expect(widget.getAttribute('auto')).toBe('onfocus');
  });

  it('keeps the attribution and marks its link as sentence-inline for the touch sweep', async () => {
    const widget = await enable();
    expect(widget.querySelector('.altcha-footer')?.textContent).toContain('Protected by');
    expect(widget.querySelector('.altcha-footer')?.getAttribute('data-touch-exempt')).toContain(
      'WCAG 2.5.5',
    );
  });

  it('announces each state and hands the verified payload to the host', async () => {
    const widget = await enable();

    widget.changeState('verifying');
    await fixture.whenStable();
    expect(status()).toBe('Checking that you’re not a robot…');
    expect(host.payload()).toBeUndefined();

    widget.changeState('verified', 'solved-payload');
    await fixture.whenStable();
    expect(status()).toBe('Robot check passed.');
    expect(host.payload()).toBe('solved-payload');

    widget.changeState('error');
    await fixture.whenStable();
    expect(status()).toContain('failed');
    expect(host.payload()).toBeUndefined();
  });

  it('re-solves on its own when the challenge expires', async () => {
    const widget = await enable();
    widget.changeState('verified', 'stale');
    await fixture.whenStable();

    widget.dispatchEvent(new CustomEvent('expired'));
    await fixture.whenStable();

    expect(host.payload()).toBeUndefined();
    expect(widget.reset).toHaveBeenCalledTimes(1);
    expect(widget.verify).toHaveBeenCalledTimes(1);
  });

  it('refresh() discards the solution and starts over — the host’s move after a server refusal', async () => {
    const widget = await enable();
    widget.changeState('verified', 'refused');
    await fixture.whenStable();

    host.widget().refresh();

    expect(host.payload()).toBeUndefined();
    expect(widget.reset).toHaveBeenCalledTimes(1);
    expect(widget.verify).toHaveBeenCalledTimes(1);
  });

  describe('solved()', () => {
    it('resolves undefined when the fence is off, without touching the widget', async () => {
      host.enabled.set(false);
      await fixture.whenStable();
      await expect(host.widget().solved()).resolves.toBeUndefined();
    });

    it('resolves the current payload at once', async () => {
      const widget = await enable();
      widget.changeState('verified', 'ready');
      await fixture.whenStable();
      await expect(host.widget().solved()).resolves.toBe('ready');
      expect(widget.verify).not.toHaveBeenCalled();
    });

    it('starts a solve when none is under way and resolves on the verified state', async () => {
      const widget = await enable();
      const solved = host.widget().solved();
      expect(widget.verify).toHaveBeenCalledTimes(1);

      widget.changeState('verifying');
      widget.changeState('verified', 'fresh');
      await expect(solved).resolves.toBe('fresh');
    });

    it('waits for a solve already under way rather than starting a second', async () => {
      const widget = await enable();
      widget.changeState('verifying');
      await fixture.whenStable();

      const solved = host.widget().solved();
      expect(widget.verify).not.toHaveBeenCalled();
      widget.changeState('verified', 'in-flight');
      await expect(solved).resolves.toBe('in-flight');
    });

    it('resets a failed or expired widget before solving again', async () => {
      const widget = await enable();
      widget.changeState('error');
      await fixture.whenStable();

      const solved = host.widget().solved();
      expect(widget.reset).toHaveBeenCalledTimes(1);
      expect(widget.verify).toHaveBeenCalledTimes(1);
      widget.changeState('error');
      await expect(solved).resolves.toBeUndefined();
    });
  });
});
