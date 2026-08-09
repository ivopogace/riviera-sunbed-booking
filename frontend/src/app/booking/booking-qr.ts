import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { toString as qrSvg } from 'qrcode';

/**
 * Renders a booking's code as a scannable QR image encoding the absolute `/booking/{code}` URL —
 * the same place the code already lives (the URL-path contract), so a generic phone camera lands
 * on the booking page and the operator console's scanner reads the code out of it. Rendering is
 * client-side only, as an SVG data URL via the `qrcode` lib — canvas-free, so the same real
 * encoder runs in jsdom specs; statically imported, because the consuming surfaces are already
 * lazy route chunks and a dynamic import trips the dev-server's first-use dependency
 * optimization mid-e2e. The code travels nowhere new (invariant #7). The
 * image sits on its own white tile so the QR keeps its quiet zone and scan contrast on glass and
 * porcelain surfaces alike; the status it attests is conveyed by the surrounding surface, and the
 * `alt` names the booking for screen readers (WCAG AA).
 */
/** One shared options object so the spec can reproduce the exact expected SVG. */
export const QR_OPTIONS = { type: 'svg', errorCorrectionLevel: 'M', margin: 1 } as const;

@Component({
  selector: 'app-booking-qr',
  template: `
    @if (dataUrl(); as url) {
      <img
        [src]="url"
        [width]="size()"
        [height]="size()"
        class="block rounded-[12px] border border-[rgba(10,42,51,0.12)] bg-white p-1.5"
        [alt]="'QR code for booking ' + code() + ' — staff scan it on arrival to check you in'"
        data-testid="booking-qr"
      />
    }
  `,
})
export class BookingQr {

  readonly code = input.required<string>();
  readonly size = input(176);

  private readonly document = inject(DOCUMENT);
  protected readonly dataUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.render(this.code());
    });
  }

  private async render(code: string): Promise<void> {
    const origin = this.document.location?.origin ?? '';
    const svg = await qrSvg(`${origin}/booking/${code}`, QR_OPTIONS);
    // A stale async render must not overwrite a newer code's image.
    if (code === this.code()) {
      this.dataUrl.set(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    }
  }
}
