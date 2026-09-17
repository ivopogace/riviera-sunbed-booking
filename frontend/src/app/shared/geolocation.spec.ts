import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserGeolocationGateway } from './geolocation';

type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

/** The three `GeolocationPositionError` codes the W3C API defines. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/**
 * The one adapter in the tree that touches `navigator.geolocation`, against a stubbed API — the
 * shape `camera-qr-scanner.spec.ts` uses for `navigator.mediaDevices`. What it proves is the
 * mapping every caller above the seam relies on: an answer for each browser outcome and never a
 * rejection, so a failure is a value to render rather than an exception to catch.
 */
describe('BrowserGeolocationGateway', () => {
  let getCurrentPosition: ReturnType<typeof vi.fn>;

  function stubApi(): void {
    getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });
  }

  /** Answer the call the gateway has made with a position at `lat`/`lng`. */
  function answerWithPosition(lat: number, lng: number): void {
    const onSuccess = getCurrentPosition.mock.calls[0][0] as Success;
    onSuccess({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition);
  }

  /** Answer the call the gateway has made with the browser's error for `code`. */
  function answerWithError(code: number): void {
    const onError = getCurrentPosition.mock.calls[0][1] as Failure;
    onError({ code } as GeolocationPositionError);
  }

  beforeEach(stubApi);

  // The worker's jsdom is shared (isolate: false); a browser left "supporting" it would leak.
  afterEach(() => Reflect.deleteProperty(navigator, 'geolocation'));

  it('reports a browser with the API as supported', () => {
    expect(new BrowserGeolocationGateway().supported()).toBe(true);
  });

  it('reports a browser without the API as unsupported, and answers unavailable anyway', async () => {
    Reflect.deleteProperty(navigator, 'geolocation');
    const gateway = new BrowserGeolocationGateway();

    expect(gateway.supported()).toBe(false);
    await expect(gateway.locate()).resolves.toEqual({ kind: 'unavailable' });
  });

  it('answers a granted position as lng/lat degrees', async () => {
    const located = new BrowserGeolocationGateway().locate();
    answerWithPosition(40.1468, 19.6482);

    await expect(located).resolves.toEqual({ kind: 'located', at: { lng: 19.6482, lat: 40.1468 } });
  });

  it.each([
    [PERMISSION_DENIED, 'denied'],
    [POSITION_UNAVAILABLE, 'unavailable'],
    [TIMEOUT, 'timeout'],
  ])('answers error code %i as %s, never a rejection', async (code, kind) => {
    const located = new BrowserGeolocationGateway().locate();
    answerWithError(code);

    await expect(located).resolves.toEqual({ kind });
  });

  it('asks for a coarse fix with a deadline — there is no timeout outcome without one', () => {
    void new BrowserGeolocationGateway().locate();

    const options = getCurrentPosition.mock.calls[0][2] as PositionOptions;
    expect(options.enableHighAccuracy).toBe(false);
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(15_000);
  });
});
