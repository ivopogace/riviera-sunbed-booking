import { describe, expect, it } from 'vitest';

import { appConfig } from './app.config';
import { CameraQrScanner } from './operator/camera-qr-scanner';
import { FakeQrScanner } from './operator/fake-qr-scanner';
import { QrScanner } from './operator/qr-scanner';
import { BrowserGeolocationGateway, GeolocationGateway } from './shared/geolocation';
import { FakeMapEngine } from './shared/fake-map-engine';
import { MapEngine } from './shared/map-engine';
import { MapLibreMapEngine } from './shared/maplibre-map-engine';

interface FactoryProvider {
  readonly provide?: unknown;
  readonly useFactory?: () => unknown;
}

interface ClassProvider {
  readonly provide?: unknown;
  readonly useClass?: unknown;
}

/** A registered factory provider — the swap seam the Stripe gateway, the QR scanner and the map engine share. */
function factoryFor(token: unknown): () => unknown {
  const entry = (appConfig.providers as FactoryProvider[]).find((p) => p.provide === token);
  if (entry?.useFactory === undefined) {
    throw new Error(`factory provider missing from appConfig for ${String(token)}`);
  }
  return entry.useFactory;
}

function qrScannerFactory(): () => unknown {
  return factoryFor(QrScanner);
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

describe('appConfig MapEngine factory', () => {
  it('serves the MapLibre adapter by default', () => {
    delete (globalThis as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__;
    expect(factoryFor(MapEngine)()).toBeInstanceOf(MapLibreMapEngine);
  });

  it('serves the deterministic fake once the e2e arms the flag', () => {
    (globalThis as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
    try {
      expect(factoryFor(MapEngine)()).toBeInstanceOf(FakeMapEngine);
    } finally {
      delete (globalThis as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__;
    }
  });
});

/**
 * No fake to swap in: the mocked Playwright suite drives the real adapter through
 * `context.grantPermissions` + `setGeolocation`, and jsdom has no `navigator.geolocation` at all,
 * so the adapter reports itself unsupported there and no near-me control renders.
 */
describe('appConfig GeolocationGateway provider', () => {
  it('serves the browser adapter', () => {
    const entry = (appConfig.providers as ClassProvider[]).find(
      (provider) => provider.provide === GeolocationGateway,
    );

    expect(entry?.useClass).toBe(BrowserGeolocationGateway);
  });
});
