import { Component } from '@angular/core';

import { CardGlass } from '../../shared/card-glass';

/**
 * The hosted terms-of-service document at `/legal/terms` — the target of the
 * checkout agreement links and the footer link.
 *
 * <p><strong>Deliberately a DRAFT</strong> under the same rule as {@link PrivacyPolicy}: banner
 * + [bracketed] placeholder entities until the counsel text lands (pinned by
 * `terms-of-service.spec.ts`); swapping it in is a copy-only edit.
 *
 * <p>The booking terms restate only server-enforced rules, generically: online sales for a day
 * close at a venue-set time up to and including that day, while free cancellation keeps its own,
 * separate evening-before deadline (invariant #4 — no clock time is stated, since both are
 * configurable per venue and the tourist UI shows only a display default); after that deadline
 * the refund is none-or-partial per the venue's configured share, computed server-side and shown
 * in the booking view (invariant #10); and the booking code is the guest's bearer credential
 * (invariant #7).
 */
@Component({
  selector: 'app-terms-of-service',
  imports: [CardGlass],
  templateUrl: './terms-of-service.html',
})
export class TermsOfService {}
