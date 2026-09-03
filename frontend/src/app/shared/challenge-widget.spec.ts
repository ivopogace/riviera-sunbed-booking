import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { defineFakeAltchaElement, FakeAltchaElement } from '../../testing/fake-altcha-element';
import { CHALLENGE_URL } from './challenge';
import { ChallengeWidget } from './challenge-widget';

// jsdom has no Web Workers; the wrapper is proven against the element contract below, not a solve.
vi.mock('altcha', () => ({}));

@Component({
  imports: [ChallengeWidget],
  template: `
    <form>
      <input data-testid="field" />
      <app-challenge-widget [enabled]="enabled()" [(payload)]="payload" />
    </form>
  `,
})
class Host {
  readonly enabled = signal<boolean | undefined>(undefined);
  readonly payload = signal<string | undefined>(undefined);
  readonly widget = viewChild.required(ChallengeWidget);
}

describe('ChallengeWidget', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeAll(defineFakeAltchaElement);

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
    expect(widget.querySelector('.altcha-logo')?.getAttribute('data-touch-exempt')).toContain(
      'decorative',
    );
  });

  it('starts the solve itself when the form already holds focus at mount', async () => {
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    try {
      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLInputElement>('[data-testid="field"]')!
        .focus();
      const widget = await enable();
      expect(widget.verify).toHaveBeenCalledTimes(1);
    } finally {
      (fixture.nativeElement as HTMLElement).remove();
    }
  });

  it('leaves an unfocused form to the widget’s own focus listener', async () => {
    const widget = await enable();
    expect(widget.verify).not.toHaveBeenCalled();
  });

  it('announces each state and hands the verified payload to the host', async () => {
    const widget = await enable();

    widget.changeState('verifying');
    await fixture.whenStable();
    expect(status()).toBe('Running the security check…');
    expect(host.payload()).toBeUndefined();

    widget.changeState('verified', 'solved-payload');
    await fixture.whenStable();
    expect(status()).toBe('Security check passed.');
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
