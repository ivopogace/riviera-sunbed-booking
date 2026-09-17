import { GeolocationGateway, GeolocationOutcome } from '../app/shared/geolocation';

/**
 * The deterministic {@link GeolocationGateway} for specs: no prompt, no browser API, and a call
 * that can be left hanging — `locate()` answers with whatever {@link FakeGeolocationGateway.answerWith}
 * queued, or waits for it, which is how a spec observes a control while it is still locating.
 *
 * <p>Test-only, so it lives here rather than in `shared/` and never reaches the app bundle: the
 * mocked Playwright suite drives the real adapter through Playwright's own permissions instead.
 */
export class FakeGeolocationGateway extends GeolocationGateway {
  /** How many asks the caller has made — one press must not become two calls. */
  calls = 0;

  private queued: GeolocationOutcome | undefined;
  private waiting: ((outcome: GeolocationOutcome) => void) | undefined;

  constructor(private readonly isSupported = true) {
    super();
  }

  override supported(): boolean {
    return this.isSupported;
  }

  override locate(): Promise<GeolocationOutcome> {
    this.calls++;
    const queued = this.queued;
    this.queued = undefined;
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve) => (this.waiting = resolve));
  }

  /** Answer the ask in flight, or the next one to come. */
  answerWith(outcome: GeolocationOutcome): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    if (waiting) {
      waiting(outcome);
    } else {
      this.queued = outcome;
    }
  }
}
