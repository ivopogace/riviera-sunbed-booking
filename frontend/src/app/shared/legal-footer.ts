import { Component } from '@angular/core';

/**
 * The legal footer line, stated once for both chromes — the tourist shell and the operator
 * console. Each carried its own copy of the notice and the two document links; only the
 * surrounding surface differs, so the skin stays at the call site and the content lives here.
 *
 * <p>New tab rather than in-app nav: routing away would unmount `/booking/pay`'s Payment Element
 * or swap an admin out of the tourist chrome. The touch-target exemption is the documented
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
