import { describe, expect, it, vi } from 'vitest';

import { FakeQrScanner } from './fake-qr-scanner';

describe('FakeQrScanner', () => {
  it('emits the queued fake payloads one start() at a time, like successive real scans', async () => {
    (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__ = [
      'CODE-ONE',
      'CODE-TWO',
    ];
    const scanner = new FakeQrScanner();
    const onCode = vi.fn();

    await scanner.start(undefined, onCode);
    expect(onCode).toHaveBeenCalledWith('CODE-ONE');
    await scanner.start(undefined, onCode);
    expect(onCode).toHaveBeenCalledWith('CODE-TWO');

    delete (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__;
  });

  it('emits nothing when the queue is exhausted', async () => {
    (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__ = [];
    const scanner = new FakeQrScanner();
    const onCode = vi.fn();

    await scanner.start(undefined, onCode);
    expect(onCode).not.toHaveBeenCalled();

    delete (globalThis as { __RIVIERA_FAKE_QR__?: string[] }).__RIVIERA_FAKE_QR__;
  });
});
