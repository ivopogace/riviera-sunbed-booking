import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { toString as qrSvg } from 'qrcode';

/**
 * Renders a booking as a scannable QR image encoding the absolute `/booking/{code}` URL, so a
 * phone camera lands on the booking page and the console scanner reads the code out of it.
 * Client-side only — an SVG data URL via a static, canvas-free `qrcode` import (rationale:
 * `docs/plans/booking-checkin-qr.md`, F-3); the code travels nowhere new (invariant #7). The
 * white tile keeps the QR's quiet zone on glass and porcelain; `alt` names the booking (WCAG AA).
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
