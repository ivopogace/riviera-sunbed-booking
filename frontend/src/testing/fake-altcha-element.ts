import { vi } from 'vitest';

/** Stamped on the class so a copy of it from another spec bundle is recognised as the same fake. */
const FAKE = Symbol.for('riviera.fake-altcha-element');

/**
 * The one stand-in for the real `<altcha-widget>` element in jsdom specs — the contract the
 * wrapper drives (the `reset`/`verify` methods, the `load`, `statechange` and `expired` events, the
 * footer and logo the wrapper stamps), never a solve: jsdom has no Web Workers, and the real solve is
 * proven in the mocked Playwright suite.
 *
 * <p>One source, registered once per jsdom, because `isolate` is `false`: spec files in a worker
 * share a single jsdom, and `customElements` keeps the first definition of a tag name for the life
 * of that jsdom. The class registered there is not necessarily *this module instance's* class —
 * the Angular test builder bundles every spec with its own copy of this file — so the guard in
 * {@link defineFakeAltchaElement} accepts any registered class that carries the {@link FAKE} mark
 * (same source, same contract) and rejects only a foreign definition, i.e. the real bundle. Every
 * spec that renders the wrapper with the fence on calls {@link defineFakeAltchaElement} and also
 * `vi.mock('altcha', () => ({}))`, so the real bundle never registers the tag.
 */
export class FakeAltchaElement extends HTMLElement {
  /** The mark {@link defineFakeAltchaElement} recognises another spec bundle's copy by. */
  static readonly [FAKE] = true;

  readonly reset = vi.fn();
  /** Like the real element, asking for a solve reports `verifying` at once; a spec then settles it. */
  readonly verify = vi.fn(() => {
    this.changeState('verifying');
    return Promise.resolve(null);
  });

  connectedCallback(): void {
    this.innerHTML =
      '<div class="altcha"><a class="altcha-logo" aria-hidden="true" tabindex="-1"></a><div class="altcha-footer"><p>Protected by <a href="https://altcha.org/">ALTCHA</a></p></div></div>';
    this.dispatchEvent(new CustomEvent('load'));
  }

  changeState(state: string, payload?: string): void {
    this.dispatchEvent(new CustomEvent('statechange', { detail: { state, payload } }));
  }

  solve(payload: string): void {
    this.changeState('verified', payload);
  }
}

/** Register the fake once per jsdom; fails loudly if a foreign class (the real bundle) owns the tag. */
export function defineFakeAltchaElement(): void {
  const defined = customElements.get('altcha-widget');
  if (defined === undefined) {
    customElements.define('altcha-widget', FakeAltchaElement);
  } else if (!(FAKE in defined)) {
    throw new Error(
      'another altcha-widget definition leaked into jsdom — is `vi.mock("altcha")` missing?',
    );
  }
}
