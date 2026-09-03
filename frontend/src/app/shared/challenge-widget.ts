import {
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  effect,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import { CHALLENGE_URL } from './challenge';

/** The widget's own state names, plus `idle` for "not mounted or not started". */
type WidgetState = 'idle' | 'unverified' | 'verifying' | 'verified' | 'expired' | 'error' | 'code';

const STATES: readonly WidgetState[] = [
  'unverified',
  'verifying',
  'verified',
  'expired',
  'error',
  'code',
];

/** What assistive tech hears at each transition; the visual tick, spinner and footer say the same. */
const STATUS: Readonly<Record<WidgetState, string>> = {
  idle: '',
  unverified: '',
  code: '',
  verifying: 'Checking that you’re not a robot…',
  verified: 'Robot check passed.',
  expired: 'The robot check expired — starting a new one.',
  error: 'The robot check failed. Tick the box to try again.',
};

interface StateChangeDetail {
  readonly state: string;
  readonly payload?: string | null;
}

/** The two methods this wrapper drives on the element; the element's own typings cover the rest. */
interface AltchaElement extends HTMLElement {
  reset(): void;
  verify(): Promise<unknown>;
}

let widgetBundle: Promise<unknown> | undefined;

/**
 * Register `<altcha-widget>` once, and only once a form actually shows it: the bundle (workers and
 * styles included) stays out of the initial chunk and out of every test that never turns the
 * fence on. An already-inserted element upgrades in place when the definition lands.
 */
function loadWidget(): Promise<unknown> {
  widgetBundle ??= import('altcha');
  return widgetBundle;
}

/**
 * The one proof-of-work control every fenced form hosts (ADR-0016): the bundled ALTCHA widget —
 * self-hosted, no third party, no cookie — fetching its challenge from the platform's own endpoint
 * and solving it in Web Workers as soon as the surrounding `<form>` receives focus. Owns everything
 * the forms must not drift on: the custom-element registration, the `auto` solve, the attribution
 * footer, re-solving on expiry, the assistive-tech status line, and the payload the host attaches
 * as the request header (`shared/challenge.ts`).
 *
 * <p>`enabled` is the platform's answer (`core/proof-of-work.ts`): `false` renders nothing, and a
 * host that sends no payload then is right to. `payload` is two-way — the widget's base64 solution
 * while one is verified, undefined otherwise. After the server refuses a submission for its
 * challenge the host calls {@link refresh}; before submitting it awaits {@link solved} so a fast
 * typist never posts ahead of the solve.
 *
 * <p>`CUSTOM_ELEMENTS_SCHEMA` is the one deviation from the house rules: `<altcha-widget>` is a
 * third-party element, not a component. The widget's `--altcha-*` variables are mapped from the
 * `--riv-*` tokens on the host, so it themes with the card it sits in; the checkbox is sized to the
 * 44 px touch floor and the attribution link is the sentence-inline exemption.
 */
@Component({
  selector: 'app-challenge-widget',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: {
    class: 'block',
    style:
      '--altcha-color-base: var(--riv-field-fill); --altcha-color-base-content: var(--riv-card-ink);' +
      ' --altcha-border-color: var(--riv-field-border); --altcha-border-radius: 14px;' +
      ' --altcha-color-neutral: var(--riv-field-border); --altcha-color-neutral-content: var(--riv-card-ink);' +
      ' --altcha-checkbox-border-color: var(--riv-field-border); --altcha-checkbox-size: 44px;' +
      ' --altcha-checkbox-border-radius: 10px; --altcha-checkbox-outline-color: var(--riv-accent-ink);' +
      ' --altcha-color-primary: var(--riv-accent-ink); --altcha-color-primary-content: var(--riv-on-accent-ink);' +
      ' --altcha-color-success: var(--riv-accent-ink); --altcha-color-success-content: var(--riv-on-accent-ink);' +
      ' --altcha-color-error: var(--riv-form-error-fill); --altcha-color-error-content: var(--riv-form-error-ink);' +
      ' --altcha-input-background-color: var(--riv-field-fill); --altcha-max-width: 100%;',
  },
  template: `
    @if (enabled() === true) {
      <altcha-widget
        #widget
        data-testid="challenge-widget"
        [attr.challenge]="challengeUrl"
        auto="onfocus"
        (load)="onLoad()"
        (statechange)="onStateChange($event)"
        (expired)="onExpired()"
      ></altcha-widget>
    }
    <p class="sr-only" role="status" aria-live="polite" data-testid="challenge-status">
      {{ statusText() }}
    </p>
  `,
})
export class ChallengeWidget {
  /** The platform's answer; undefined while unknown, in which case nothing renders yet. */
  readonly enabled = input<boolean | undefined>(undefined);
  /** The verified solution the host sends as the request header; undefined until (and unless) verified. */
  readonly payload = model<string | undefined>(undefined);

  protected readonly challengeUrl = CHALLENGE_URL;
  protected readonly state = signal<WidgetState>('idle');
  protected readonly statusText = computed(() => STATUS[this.state()]);

  private readonly widget = viewChild<ElementRef<AltchaElement>>('widget');
  private waiting: ((payload: string | undefined) => void)[] = [];

  constructor() {
    effect(() => {
      if (this.enabled() === true) {
        void loadWidget();
      }
    });
  }

  /**
   * Discard the current solution and solve a fresh challenge — after a server refusal
   * (`shared/challenge.ts`'s rejections) or an expiry.
   */
  refresh(): void {
    this.payload.set(undefined);
    const element = this.element();
    if (element) {
      element.reset();
      void element.verify();
    }
  }

  /**
   * The solution to submit with: the current one, or the next one once the widget has it —
   * starting a solve if none is under way. Resolves undefined when the fence is off.
   */
  solved(): Promise<string | undefined> {
    const current = this.payload();
    const element = this.element();
    if (current !== undefined || this.enabled() !== true || !element) {
      return Promise.resolve(current);
    }
    if (this.state() !== 'verifying') {
      if (this.state() !== 'idle' && this.state() !== 'unverified') {
        element.reset();
      }
      void element.verify();
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /**
   * The widget only watches for focus changes from the moment it mounts; a form that was
   * autofocused before the bundle arrived would otherwise wait for the next Tab. So a form already
   * holding focus starts the solve here, and the two links inside the widget get their exemptions.
   */
  protected onLoad(): void {
    const element = this.element();
    if (!element) {
      return;
    }
    element
      .querySelector('.altcha-footer')
      ?.setAttribute('data-touch-exempt', 'attribution link inside a sentence (WCAG 2.5.5)');
    element
      .querySelector('.altcha-logo')
      ?.setAttribute(
        'data-touch-exempt',
        'decorative logo (aria-hidden, tabindex -1); the footer link is the target',
      );
    const form = element.closest('form');
    if (form?.contains(document.activeElement) && this.state() !== 'verifying') {
      void element.verify();
    }
  }

  protected onStateChange(event: Event): void {
    const detail = (event as CustomEvent<StateChangeDetail>).detail;
    const state = STATES.find((known) => known === detail.state) ?? 'idle';
    this.state.set(state);
    const payload = state === 'verified' ? (detail.payload ?? undefined) : undefined;
    this.payload.set(payload);
    if (state === 'verified' || state === 'error') {
      const waiting = this.waiting;
      this.waiting = [];
      waiting.forEach((resolve) => resolve(payload));
    }
  }

  protected onExpired(): void {
    this.refresh();
  }

  private element(): AltchaElement | undefined {
    return this.widget()?.nativeElement;
  }
}
