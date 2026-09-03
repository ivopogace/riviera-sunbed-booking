import { vi } from 'vitest';

/**
 * The one stand-in for the real `<altcha-widget>` element in jsdom specs — the contract the
 * wrapper drives (the `reset`/`verify` methods, the `load`, `statechange` and `expired` events, the
 * footer and logo the wrapper stamps), never a solve: jsdom has no Web Workers, and the real solve is
 * proven in the mocked Playwright suite.
 *
 * <p>One class, defined once, because `isolate` is `false`: spec files in a worker share a single
 * jsdom, and `customElements` keeps the first definition of a tag name for the life of that jsdom.
 * Two specs each defining their own fake would leave the second one driving the first's class, or
 * throwing on the duplicate name — which order depends on the worker's file order. Every spec that
 * renders the wrapper with the fence on calls {@link defineFakeAltchaElement} and also
 * `vi.mock('altcha', () => ({}))`, so the real bundle never registers the tag.
 */
export class FakeAltchaElement extends HTMLElement {
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

/** Register the fake once per jsdom; fails loudly if another class already owns the tag. */
export function defineFakeAltchaElement(): void {
  const defined = customElements.get('altcha-widget');
  if (defined === undefined) {
    customElements.define('altcha-widget', FakeAltchaElement);
  } else if (defined !== FakeAltchaElement) {
    throw new Error(
      'another altcha-widget definition leaked into jsdom — is `vi.mock("altcha")` missing?',
    );
  }
}
