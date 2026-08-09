import { TestBed } from '@angular/core/testing';
import { toString as qrSvg } from 'qrcode';
import { describe, expect, it } from 'vitest';

import { BookingQr, QR_OPTIONS } from './booking-qr';

describe('BookingQr', () => {
  async function render(code: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(BookingQr);
    fixture.componentRef.setInput('code', code);
    fixture.detectChanges();
    await fixture.whenStable();
    // The effect kicks off a floating async render (lazy import + encode); flush it.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the booking as a QR image encoding the absolute booking-view URL', async () => {
    const el = await render('ABCD123456');

    const img = el.querySelector<HTMLImageElement>('[data-testid="booking-qr"]');
    expect(img).not.toBeNull();
    const expected = await qrSvg(`${location.origin}/booking/ABCD123456`, QR_OPTIONS);
    expect(img!.getAttribute('src')).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(expected)}`,
    );
  });

  it('labels the image for screen readers without relying on the visual alone', async () => {
    const el = await render('WXYZ987654');

    const img = el.querySelector<HTMLImageElement>('[data-testid="booking-qr"]');
    expect(img!.alt).toContain('WXYZ987654');
    expect(img!.alt.toLowerCase()).toContain('check');
  });
});
