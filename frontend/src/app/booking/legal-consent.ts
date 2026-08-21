import { Component, input } from '@angular/core';

/**
 * The pre-commitment consent line, stated once for every surface that takes a commitment from a
 * guest — the booking dialog and the payment page today. Only the opening clause differs between
 * them ("By continuing" / "By paying"), so that is the component's one input; the sentence, both
 * document links and the `legal-agreement` test id are shared.
 *
 * <p>Legal copy is the worst possible thing to keep two copies of: each surface's spec pinned its
 * own template, so an edit to one left the other green and stale — the drift shape #735 removed
 * from the cutoff note.
 *
 * <p>Both links open in a new tab rather than routing, so the modal's checkout state and the
 * mounted Payment Element survive the guest reading the document. The touch-target exemption is
 * the documented inline-link class (WCAG 2.5.5), and belongs to this content wherever it renders.
 */
@Component({
  selector: 'p[appLegalConsent]',
  host: {
    'data-testid': 'legal-agreement',
    'data-touch-exempt': 'links inside a sentence (WCAG 2.5.5 inline exception)',
  },
  template: `{{ lead() }} you agree to our
    <a
      class="underline"
      data-testid="legal-terms-link"
      href="/legal/terms"
      target="_blank"
      rel="noopener"
      >Terms of Service</a
    >
    and acknowledge our
    <a
      class="underline"
      data-testid="legal-privacy-link"
      href="/legal/privacy"
      target="_blank"
      rel="noopener"
      >Privacy Policy</a
    >.`,
})
export class LegalConsent {
  readonly lead = input.required<string>();
}
