import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The legal footer line, for every chrome that shows it. The surrounding surface is the call site's;
 * the notice, the Help link and the two document links are fixed here.
 *
 * <p>The documents open a new tab: routing away would unmount a mounted Payment Element or swap a
 * signed-in admin out of the tourist chrome. The opt-in "For venues" link routes in-app like the
 * header's links. The touch-target exemption is the inline-link class (WCAG 2.5.5).
 */
@Component({
  selector: 'div[appLegalFooter]',
  imports: [RouterLink],
  host: { 'data-touch-exempt': 'links inside a sentence (WCAG 2.5.5 inline exception)' },
  template: `© Riviera Sunbed Booking ·
    <a class="underline" href="/help" target="_blank" rel="noopener">Help</a> ·
    <a class="underline" href="/legal/privacy" target="_blank" rel="noopener">Privacy</a> ·
    <a class="underline" href="/legal/terms" target="_blank" rel="noopener">Terms</a>
    @if (venuesLink()) {
      · <a class="underline" routerLink="/for-venues" data-testid="footer-for-venues">For venues</a>
    }`,
})
export class LegalFooter {
  /** The tourist chrome's in-app link to the venue-owner page; the console footer leaves it off. */
  readonly venuesLink = input(false);
}
