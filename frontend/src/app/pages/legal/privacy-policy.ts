import { Component } from '@angular/core';

import { CardGlass } from '../../shared/card-glass';

/**
 * The hosted privacy-policy document at `/legal/privacy` — the target of the
 * checkout agreement links and the footer link.
 *
 * <p><strong>Deliberately a DRAFT.</strong> The final text is a counsel-gated remainder still pending
 * (dual Albanian/GDPR framing, the real sh.p.k. controller and processor names). Until that
 * lands, this page must not read as a binding policy: it carries a prominent draft banner and
 * keeps every not-yet-real entity in [brackets] — both pinned by `privacy-policy.spec.ts`.
 * Swapping in the counsel text is a copy-only edit to this template.
 *
 * <p>What it states is grounded in shipped behavior, not aspiration: the guest-contact fields
 * the booking dialog collects, the self-service erasure + statutory-retention split (ADR-0010),
 * the automated retention sweep, and the single strictly-necessary session
 * cookie. Styled Tailwind-only on the shared card glass (contrast: `legal-pages.contrast.spec.ts`).
 */
@Component({
  selector: 'app-privacy-policy',
  imports: [CardGlass],
  templateUrl: './privacy-policy.html',
})
export class PrivacyPolicy {}
