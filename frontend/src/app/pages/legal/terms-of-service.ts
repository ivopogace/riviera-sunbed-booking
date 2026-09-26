import { Component } from '@angular/core';

import { CardGlass } from '../../shared/card-glass';

/**
 * The hosted terms of service at `/legal/terms`, target of the checkout agreement and footer links.
 * A DRAFT under the same rule as {@link PrivacyPolicy}: banner + [bracketed] placeholders until the
 * counsel text lands (pinned by `terms-of-service.spec.ts`); swapping it in is a copy-only edit.
 * The booking terms restate only server-enforced rules, generically: no clock time for sales close
 * or the evening-before cancellation deadline (#4; both per venue, the UI shows only a default), a
 * none-or-partial late refund computed server-side (#10), and the code as bearer credential (#7).
 */
@Component({
  selector: 'app-terms-of-service',
  imports: [CardGlass],
  templateUrl: './terms-of-service.html',
})
export class TermsOfService {}
