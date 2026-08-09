import { describe, expect, it } from 'vitest';

import { appConfig } from './app.config';
import { CameraQrScanner } from './operator/camera-qr-scanner';
import { FakeQrScanner } from './operator/fake-qr-scanner';
import { QrScanner } from './operator/qr-scanner';

interface FactoryProvider {
  readonly provide?: unknown;
  readonly useFactory?: () => unknown;
}

/** The QrScanner factory as registered — the same swap seam the Stripe gateway uses. */
function qrScannerFactory(): () => unknown {
  const entry = (appConfig.providers as FactoryProvider[]).find((p) => p.provide === QrScanner);
  if (entry?.useFactory === undefined) {
    throw new Error('QrScanner factory provider missing from appConfig');
  }
  return entry.useFactory;
}

describe('appConfig QrScanner factory (#583)', () => {
  it('serves the camera adapter by default', () => {
    delete (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__;
    expect(qrScannerFactory()()).toBeInstanceOf(CameraQrScanner);
  });

  it('serves the deterministic fake once the e2e arms the queue', () => {
    (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__ = [];
    try {
      expect(qrScannerFactory()()).toBeInstanceOf(FakeQrScanner);
    } finally {
      delete (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__;
    }
  });
});
