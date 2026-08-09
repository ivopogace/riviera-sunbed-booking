import { DOCUMENT } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';

/**
 * Renders a booking's code as a scannable QR image encoding the absolute `/booking/{code}` URL —
 * the same place the code already lives (the URL-path contract), so a generic phone camera lands
 * on the booking page and the operator console's scanner reads the code out of it. Rendering is
 * client-side only via a lazy `qrcode` import: the code travels nowhere new (invariant #7). The
 * image sits on its own white tile so the QR keeps its quiet zone and scan contrast on glass and
 * porcelain surfaces alike; the status it attests is conveyed by the surrounding surface, and the
 * `alt` names the booking for screen readers (WCAG AA).
 */
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
    const { toDataURL } = await import('qrcode');
    const url = await toDataURL(`${origin}/booking/${code}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 352,
    });
    // A stale async render must not overwrite a newer code's image.
    if (code === this.code()) {
      this.dataUrl.set(url);
    }
  }
}
