import { Component, Type } from '@angular/core';

/**
 * The console's glyph set — one component per venue and admin destination, plus More, `Your
 * venues` and `Admin console` — drawn for the phone rail (`console-shell.ts`) and its More sheet,
 * on the `clock-icon.ts` contract (`riviera-tailwind` ICON-1..6): inline SVG in `currentColor`, so
 * the slot's ink cascades in; sized by presentation attributes, which any call-site class outranks
 * (`[&_svg]:size-[21px]` on the slot); a `display: contents` host, so the svg is what the slot's
 * flex column lays out; `aria-hidden` at the host and the svg, because the slot's label carries the
 * meaning. One component per glyph rather than a `name` switch: a shared glyph takes no variant
 * (ICON-2), and a destination descriptor names its glyph by class, picked with `NgComponentOutlet`.
 *
 * <p>Geometry is 24-unit, 1.9 stroke, rounded caps — one weight across the set so the rail reads as
 * one family. `CONSOLE_GLYPHS` is the whole set, which is what `console-glyphs.spec.ts` sweeps.
 */

const HOST = { 'aria-hidden': 'true', class: 'contents' } as const;

/** Daily view: a calendar page. */
@Component({
  selector: 'app-daily-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </svg>`,
})
export class DailyGlyph {}

/** Requests: an inbox tray. */
@Component({
  selector: 'app-requests-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M3 13v6h18v-6" />
    <path d="M3 13l3-8h12l3 8" />
    <path d="M3 13h5l2 3h4l2-3h5" />
  </svg>`,
})
export class RequestsGlyph {}

/** Beach map: a two-by-two grid of sets. */
@Component({
  selector: 'app-beach-map-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>`,
})
export class BeachMapGlyph {}

/** Pricing: a price tag. */
@Component({
  selector: 'app-pricing-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M20 12l-8 8-9-9V3h8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>`,
})
export class PricingGlyph {}

/** Venue & commodities: a house. */
@Component({
  selector: 'app-venue-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-5h4v5" />
  </svg>`,
})
export class VenueGlyph {}

/** Payouts: a banknote. */
@Component({
  selector: 'app-payouts-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>`,
})
export class PayoutsGlyph {}

/** Operators: two people. */
@Component({
  selector: 'app-operators-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="M16 4a4 4 0 0 1 0 8" />
    <path d="M18 14a6 6 0 0 1 4 7" />
  </svg>`,
})
export class OperatorsGlyph {}

/** Commissions: a percent sign. */
@Component({
  selector: 'app-commissions-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M19 5L5 19" />
    <circle cx="7" cy="7" r="2.5" />
    <circle cx="17" cy="17" r="2.5" />
  </svg>`,
})
export class CommissionsGlyph {}

/** Email: an envelope. */
@Component({
  selector: 'app-email-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>`,
})
export class EmailGlyph {}

/** Refunds: a return arrow. */
@Component({
  selector: 'app-refunds-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </svg>`,
})
export class RefundsGlyph {}

/** Photos: a picture frame. */
@Component({
  selector: 'app-photos-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="M21 16l-5-5-8 8" />
  </svg>`,
})
export class PhotosGlyph {}

/** Reviews: a star. */
@Component({
  selector: 'app-reviews-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z" />
  </svg>`,
})
export class ReviewsGlyph {}

/** Privacy: a shield. */
@Component({
  selector: 'app-privacy-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
  </svg>`,
})
export class PrivacyGlyph {}

/** Audit: a ledger of lines. */
@Component({
  selector: 'app-audit-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </svg>`,
})
export class AuditGlyph {}

/** Admin console: a shield with a tick. */
@Component({
  selector: 'app-admin-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>`,
})
export class AdminGlyph {}

/** Your venues: a row of buildings on the shore. */
@Component({
  selector: 'app-venues-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M3 21h18" />
    <path d="M5 21V8l7-4 7 4v13" />
    <path d="M9 21v-6h6v6" />
  </svg>`,
})
export class VenuesGlyph {}

/** More: three dots — the only glyph that names no destination. */
@Component({
  selector: 'app-more-glyph',
  host: HOST,
  template: `<svg
    class="shrink-0"
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>`,
})
export class MoreGlyph {}

/** The whole set, for the spec's sweep. */
export const CONSOLE_GLYPHS: readonly Type<unknown>[] = [
  DailyGlyph,
  RequestsGlyph,
  BeachMapGlyph,
  PricingGlyph,
  VenueGlyph,
  PayoutsGlyph,
  OperatorsGlyph,
  CommissionsGlyph,
  EmailGlyph,
  RefundsGlyph,
  PhotosGlyph,
  ReviewsGlyph,
  PrivacyGlyph,
  AuditGlyph,
  AdminGlyph,
  VenuesGlyph,
  MoreGlyph,
];
