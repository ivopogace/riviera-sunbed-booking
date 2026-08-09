/**
 * The QR-scanning seam for the operator console's check-in — an external browser capability
 * (camera + frame decoding), so it sits behind a DI token with a real and a fake adapter, the
 * exact shape of `StripePaymentGateway`: {@link CameraQrScanner} in the browser,
 * {@link FakeQrScanner} when the Playwright e2e arms `window.__RIVIERA_FAKE_QR__` (the factory
 * lives in `app.config.ts`); unit specs override the token directly.
 */
export abstract class QrScanner {
  /**
   * Start scanning and invoke `onCode` with each decoded payload (raw text — the caller parses it
   * via `codeFromScan`). `video` is the live preview element when the adapter drives a camera; the
   * fake ignores it. Resolves once scanning is underway; rejects when the camera is unavailable.
   */
  abstract start(video: HTMLVideoElement | undefined, onCode: (text: string) => void): Promise<void>;

  /** Stop scanning and release the camera. Safe to call when never started. */
  abstract stop(): void;
}
