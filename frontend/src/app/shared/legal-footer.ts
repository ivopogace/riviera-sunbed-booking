import { Component } from '@angular/core';

/**
 * The legal footer line, for every chrome that shows it. The surrounding surface is the call site's;
 * the notice and its two document links are fixed here.
 *
 * <p>New tab rather than in-app nav: routing away would unmount a mounted Payment Element or swap a
 * signed-in admin out of the tourist chrome. The touch-target exemption is the documented
 * inline-link class (WCAG 2.5.5) and belongs to this content wherever it renders.
 */
@Component({
  selector: 'div[appLegalFooter]',
  host: { 'data-touch-exempt': 'links inside a sentence (WCAG 2.5.5 inline exception)' },
  template: `© Riviera Sunbed Booking ·
    <a class="underline" href="/legal/privacy" target="_blank" rel="noopener">Privacy</a> ·
    <a class="underline" href="/legal/terms" target="_blank" rel="noopener">Terms</a>`,
})
export class LegalFooter {}
