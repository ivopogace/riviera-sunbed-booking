import { Component } from '@angular/core';

import { CardGlass } from '../../shared/card-glass';

/**
 * The privacy policy at `/legal/privacy` (checkout and footer links). A DRAFT until counsel's text
 * lands: it must not read as binding, so it keeps a prominent draft banner and every
 * not-yet-real entity in [brackets] (pinned by `privacy-policy.spec.ts`). Every claim is grounded
 * in shipped behaviour — erasure vs retention (ADR-0010), the one session cookie, the challenge's
 * no-cookie/no-fingerprint/no-third-party properties (ADR-0016), the self-hosted OSM map
 * (ADR-0022) — so change it only with the behaviour. Contrast: `legal-pages.contrast.spec.ts`.
 */
@Component({
  selector: 'app-privacy-policy',
  imports: [CardGlass],
  templateUrl: './privacy-policy.html',
})
export class PrivacyPolicy {}
