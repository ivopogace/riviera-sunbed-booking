import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CameraQrScanner } from './camera-qr-scanner';

vi.mock('jsqr', () => ({
  default: vi.fn(() => ({ data: 'DECODED-PAYLOAD' })),
}));

function fakeStream(): MediaStream {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function fakeVideo(width: number): HTMLVideoElement {
  const video = {
    videoWidth: width,
    videoHeight: width,
    srcObject: null as unknown,
    play: vi.fn(async () => undefined),
  };
  return video as unknown as HTMLVideoElement;
}

describe('CameraQrScanner', () => {
  let stream: MediaStream;

  beforeEach(() => {
    vi.useFakeTimers();
    stream = fakeStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses to start without a preview element (the fake path never reaches it)', async () => {
    await expect(new CameraQrScanner().start(undefined, vi.fn())).rejects.toThrow(
      /preview element/,
    );
  });

  it('streams the camera, decodes frames on the interval, and hands payloads to the caller', async () => {
    const scanner = new CameraQrScanner();
    const onCode = vi.fn();
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    await scanner.start(fakeVideo(640), onCode);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(onCode).toHaveBeenCalledWith('DECODED-PAYLOAD');

    scanner.stop();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
  });

  it('releases a camera granted only after stop() was already called (stop-during-start race)', async () => {
    const scanner = new CameraQrScanner();
    let grant: (s: MediaStream) => void;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(() => new Promise<MediaStream>((r) => (grant = r))) },
    });

    const pending = scanner.start(fakeVideo(640), vi.fn());
    scanner.stop();
    grant!(stream);
    await pending;

    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
  });

  it('skips decoding while the camera has no frame yet (videoWidth 0), and stop() is idempotent', async () => {
    const scanner = new CameraQrScanner();
    const onCode = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await scanner.start(fakeVideo(0), onCode);
    await vi.advanceTimersByTimeAsync(600);
    expect(onCode).not.toHaveBeenCalled();

    scanner.stop();
    scanner.stop();
    expect(stream.getTracks()[0].stop).toHaveBeenCalledTimes(1);
  });
});
