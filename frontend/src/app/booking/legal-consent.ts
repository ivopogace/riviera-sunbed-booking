import { Component, input } from '@angular/core';

import { localePath } from '../shared/display-locale';

/**
 * The pre-commitment consent line, for every surface that takes a commitment from a guest. Only the
 * opening clause varies between surfaces, and it is a closed set; the sentence, both document links
 * and the `legal-agreement` test id are fixed here.
 *
 * <p>Both links open in a new tab rather than routing, so a modal's checkout state and a mounted
 * Payment Element survive the guest reading the document. The touch-target exemption is the
 * documented inline-link class (WCAG 2.5.5) and belongs to this content wherever it renders.
 */
/** The clause a surface opens the sentence with — a closed set, each a whole translated sentence. */
export type ConsentLead = 'By continuing' | 'By paying';

@Component({
  selector: 'p[appLegalConsent]',
  host: {
    'data-testid': 'legal-agreement',
    'data-touch-exempt': 'links inside a sentence (WCAG 2.5.5 inline exception)',
  },
  template: `@if (lead() === 'By paying') {
      <ng-container i18n
        >By paying you agree to our
        <a
          class="underline"
          data-testid="legal-terms-link"
          [href]="termsHref"
          target="_blank"
          rel="noopener"
          >Terms of Service</a
        >
        and acknowledge our
        <a
          class="underline"
          data-testid="legal-privacy-link"
          [href]="privacyHref"
          target="_blank"
          rel="noopener"
          >Privacy Policy</a
        >.</ng-container
      >
    } @else {
      <ng-container i18n
        >By continuing you agree to our
        <a
          class="underline"
          data-testid="legal-terms-link"
          [href]="termsHref"
          target="_blank"
          rel="noopener"
          >Terms of Service</a
        >
        and acknowledge our
        <a
          class="underline"
          data-testid="legal-privacy-link"
          [href]="privacyHref"
          target="_blank"
          rel="noopener"
          >Privacy Policy</a
        >.</ng-container
      >
    }`,
})
export class LegalConsent {
  readonly lead = input.required<ConsentLead>();

  protected readonly termsHref = localePath('/legal/terms');
  protected readonly privacyHref = localePath('/legal/privacy');
}
