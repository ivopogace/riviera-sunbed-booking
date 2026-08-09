import { QrScanner } from './qr-scanner';

/** How often a camera frame is decoded. QR decoding is CPU work; ~4 Hz is plenty for a hand-held scan. */
const DECODE_INTERVAL_MS = 250;

/**
 * The real {@link QrScanner}: streams the device camera into the preview `video` element and
 * decodes frames with a lazy `jsqr` import (pure JS — one deterministic decoder everywhere rather
 * than the patchy native `BarcodeDetector`). Decoded payloads are handed to the caller as-is; no
 * frame or payload is retained or logged (a payload may be a booking code, invariant #7).
 */
export class CameraQrScanner extends QrScanner {
  private stream: MediaStream | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  override async start(
    video: HTMLVideoElement | undefined,
    onCode: (text: string) => void,
  ): Promise<void> {
    if (video === undefined) {
      throw new Error('camera scanning needs a preview element');
    }
    this.stop();
    const [{ default: jsQR }, stream] = await Promise.all([
      import('jsqr'),
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }),
    ]);
    this.stream = stream;
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    this.timer = setInterval(() => {
      if (context === null || video.videoWidth === 0) {
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const hit = jsQR(frame.data, frame.width, frame.height);
      if (hit !== null && hit.data.length > 0) {
        onCode(hit.data);
      }
    }, DECODE_INTERVAL_MS);
  }

  override stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
}
