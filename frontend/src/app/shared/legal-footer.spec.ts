import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LegalFooter } from './legal-footer';

@Component({
  imports: [LegalFooter],
  template: `<div appLegalFooter class="riv-footer-inner"></div>`,
})
class Host {}

describe('LegalFooter', () => {
  function footer(): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('div')!;
  }

  it('states the notice in one voice, for both chromes', () => {
    expect(footer().textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '© Riviera Sunbed Booking · Privacy · Terms',
    );
  });

  it('opens both documents in a new tab, so a mounted checkout survives', () => {
    const links = footer().querySelectorAll<HTMLAnchorElement>('a');

    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      '/legal/privacy',
      '/legal/terms',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener');
    }
  });

  it('declares the inline-link touch exemption and keeps the call site’s skin', () => {
    expect(footer().getAttribute('data-touch-exempt')).toContain('links inside a sentence');
    expect(footer().classList.contains('riv-footer-inner')).toBe(true);
  });
});
