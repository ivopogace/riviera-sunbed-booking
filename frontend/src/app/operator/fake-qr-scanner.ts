import { QrScanner } from './qr-scanner';

/**
 * The deterministic {@link QrScanner} the Playwright e2e swaps in by arming
 * `window.__RIVIERA_FAKE_QR__` with a queue of payloads before the page loads — no camera, no
 * third-party decode. Each `start()` emits the next queued payload, so a spec scripts successive
 * scans (a valid code, the same code again, garbage) exactly like `FakeStripePaymentGateway`
 * scripts payment outcomes.
 */
export class FakeQrScanner extends QrScanner {
  override async start(
    _video: HTMLVideoElement | undefined,
    onCode: (text: string) => void,
  ): Promise<void> {
    const queue = (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__;
    const next = queue?.shift();
    if (next !== undefined) {
      onCode(next);
    }
  }

  override stop(): void {
    // Nothing to release — the fake holds no camera.
  }
}
