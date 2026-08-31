import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LegalConsent } from './legal-consent';

@Component({
  imports: [LegalConsent],
  template: `<p appLegalConsent lead="By continuing" class="fine"></p>`,
})
class Host {}

describe('LegalConsent', () => {
  function note(): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('p')!;
  }

  it('states the consent in one voice, opening with the call site’s clause', () => {
    expect(note().textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'By continuing you agree to our Terms of Service and acknowledge our Privacy Policy.',
    );
  });

  it('points both documents at the legal pages, opened in a new tab', () => {
    const p = note();
    const terms = p.querySelector<HTMLAnchorElement>('[data-testid="legal-terms-link"]')!;
    const privacy = p.querySelector<HTMLAnchorElement>('[data-testid="legal-privacy-link"]')!;

    expect(terms.getAttribute('href')).toBe('/legal/terms');
    expect(privacy.getAttribute('href')).toBe('/legal/privacy');
    // rel=noopener with target=_blank: the opened tab must not reach back through window.opener.
    for (const a of [terms, privacy]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener');
    }
  });

  it('carries the agreement test id and the inline-link touch exemption', () => {
    const p = note();

    expect(p.getAttribute('data-testid')).toBe('legal-agreement');
    expect(p.getAttribute('data-touch-exempt')).toContain('links inside a sentence');
  });

  it('binds to the caller’s native <p>, keeping its skin', () => {
    expect(note().tagName).toBe('P');
    expect(note().classList.contains('fine')).toBe(true);
  });
});
