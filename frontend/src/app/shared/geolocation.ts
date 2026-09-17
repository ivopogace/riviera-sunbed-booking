import { Injectable } from '@angular/core';

import { LngLat } from './map-engine';

/** Why a position could not be had. Each one is a sentence the visitor reads, never an exception. */
export type GeolocationFailure = 'denied' | 'unavailable' | 'timeout';

/** What one ask for the visitor's position came to. */
export type GeolocationOutcome =
  { readonly kind: 'located'; readonly at: LngLat } | { readonly kind: GeolocationFailure };

/**
 * The geolocation seam — an external browser capability behind its own permission prompt, so it
 * sits behind a DI token with a real and a fake adapter, the shape of `MapEngine`, `QrScanner` and
 * `StripePaymentGateway`: {@link BrowserGeolocationGateway} in the browser (wired in
 * `app.config.ts`), `src/testing/fake-geolocation.ts` in specs, which override the token directly.
 * The mocked Playwright suite drives the REAL adapter through `context.grantPermissions` and
 * `setGeolocation` — a fake there would prove nothing about the browser's own prompt.
 *
 * <p>A position obtained through this seam reaches the map's camera and nothing else — never a
 * request, a URL, storage or a log. That is what the privacy policy's map section promises, and
 * what the mocked suite's `discover-map` network guard fails the build over. What a consumer then
 * does with the camera is its own: the operator's pin placer publishes a venue location the
 * operator commits by hand, which is the venue's business data rather than this position.
 */
export abstract class GeolocationGateway {
  /**
   * Whether this browser has the API at all — an insecure context or an old browser has none. A
   * caller offers no control when it does not, rather than one that can only fail.
   */
  abstract supported(): boolean;

  /**
   * Ask the browser for the visitor's position, raising its own permission prompt the first time.
   * Resolves with the outcome and **never rejects**, so every caller handles all four the same way.
   */
  abstract locate(): Promise<GeolocationOutcome>;
}

/** A map centring wants a quick coarse fix, not a GPS-grade one the visitor waits for. */
const TIMEOUT_MS = 10_000;
/** A position from the last minute is still "here", and answers without waking the radio. */
const MAX_AGE_MS = 60_000;

/** The `GeolocationPositionError` codes, as the W3C Geolocation API numbers them. */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

/**
 * The real adapter: `navigator.geolocation` with a coarse, deadlined ask. It keeps nothing — the
 * position is handed to the caller and never stored on the instance.
 */
@Injectable()
export class BrowserGeolocationGateway extends GeolocationGateway {
  override supported(): boolean {
    return navigator.geolocation !== undefined;
  }

  override locate(): Promise<GeolocationOutcome> {
    if (!this.supported()) {
      return Promise.resolve({ kind: 'unavailable' });
    }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) =>
          resolve({ kind: 'located', at: { lng: coords.longitude, lat: coords.latitude } }),
        (error) => resolve({ kind: failureOf(error) }),
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
      );
    });
  }
}

function failureOf(error: GeolocationPositionError): GeolocationFailure {
  if (error.code === PERMISSION_DENIED) {
    return 'denied';
  }
  return error.code === TIMEOUT ? 'timeout' : 'unavailable';
}
