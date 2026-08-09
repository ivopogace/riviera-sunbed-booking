import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { BookingQr } from './booking-qr';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async (text: string) => `data:image/png;base64,MOCK-${encodeURIComponent(text)}`),
}));

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
    expect(img!.src).toContain('data:image/png;base64,MOCK-');
    expect(decodeURIComponent(img!.src)).toContain(`${location.origin}/booking/ABCD123456`);
  });

  it('labels the image for screen readers without relying on the visual alone', async () => {
    const el = await render('WXYZ987654');

    const img = el.querySelector<HTMLImageElement>('[data-testid="booking-qr"]');
    expect(img!.alt).toContain('WXYZ987654');
    expect(img!.alt.toLowerCase()).toContain('check');
  });
});
