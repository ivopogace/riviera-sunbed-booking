import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeClock } from '../../testing/freeze-clock';
import { CameraQrScanner } from './camera-qr-scanner';

vi.mock('jsqr', () => ({
  default: vi.fn(() => ({ data: 'DECODED-PAYLOAD' })),
}));

function fakeVideo(width: number): HTMLVideoElement {
  const listeners = new Map<string, () => void>();
  const video = {
    videoWidth: width,
    videoHeight: width,
    srcObject: null as unknown,
    muted: false,
    playsInline: false,
    autoplay: false,
    play: vi.fn(() => Promise.resolve(undefined)),
    addEventListener: vi.fn((type: string, handler: () => void) => listeners.set(type, handler)),
    fire: (type: string) => listeners.get(type)?.(),
  };
  return video as unknown as HTMLVideoElement;
}

describe('CameraQrScanner', () => {
  let stream: MediaStream;
  let stopTrack: Mock<() => void>;
  let getUserMedia: Mock<() => Promise<MediaStream>>;

  beforeEach(() => {
    vi.useFakeTimers();
    stopTrack = vi.fn();
    stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    getUserMedia = vi.fn(() => Promise.resolve(stream));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    freezeClock();
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
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(onCode).toHaveBeenCalledWith('DECODED-PAYLOAD');

    scanner.stop();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('sets the WebKit-gating properties before playing — attributes alone do not (Safari)', async () => {
    const scanner = new CameraQrScanner();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const video = fakeVideo(640);

    await scanner.start(video, vi.fn());

    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.autoplay).toBe(true);
    scanner.stop();
  });

  it('retries a rejected first play() once the metadata loads (Safari)', async () => {
    const scanner = new CameraQrScanner();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const video = fakeVideo(640) as unknown as HTMLVideoElement & {
      fire: (t: string) => void;
      play: Mock<() => Promise<undefined>>;
    };
    video.play
      .mockRejectedValueOnce(new DOMException('gesture', 'NotAllowedError'))
      .mockResolvedValue(undefined);

    const pending = scanner.start(video, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    video.fire('loadedmetadata');
    await pending;

    expect(video.play).toHaveBeenCalledTimes(2);
    scanner.stop();
  });

  it('refuses distinctly when the browser has no camera capture at all', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const scanner = new CameraQrScanner();

    await expect(scanner.start(fakeVideo(640), vi.fn())).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
  });

  it('discards a superseded attempt’s late play() failure instead of reporting it (stale retry race)', async () => {
    const scanner = new CameraQrScanner();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const abandoned = fakeVideo(640);
    (abandoned.play as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException('gesture', 'NotAllowedError'),
    );

    const first = scanner.start(abandoned, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    scanner.stop();
    const second = scanner.start(fakeVideo(640), vi.fn());
    await vi.advanceTimersByTimeAsync(3100);

    await expect(first).resolves.toBeUndefined();
    await second;
    scanner.stop();
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

    expect(stopTrack).toHaveBeenCalled();
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
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
});
