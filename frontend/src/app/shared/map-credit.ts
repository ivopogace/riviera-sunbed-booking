import { Component, input } from '@angular/core';

/**
 * The credit on the phone's foot row, whichever side it is on: wrapped to 200 px — less on the
 * narrowest phone, where it leaves the consumer's control at the other end its 150 px
 * (`You are here`), the two insets and a 10 px gap. Symmetric, so the mirror needs no second sum.
 */
const FOOT_CREDIT_BOX =
  'max-w-[min(200px,calc(100%-184px))] px-[10px] py-[4px] text-[11px] leading-[16px]';
export const FOOT_CREDIT_PLACEMENT = `left-3 ${FOOT_CREDIT_BOX}`;
/**
 * The foot credit on the other side. A lone venue pin is never moved, so when one sits under the
 * foot row the row changes sides — the credit and the consumer's control together, never one of
 * them, or they would land on each other.
 */
export const FOOT_CREDIT_PLACEMENT_SWAPPED = `right-3 ${FOOT_CREDIT_BOX}`;

/**
 * The tiles' licence credits (OpenMapTiles CC-BY, OSM ODbL) — ADR-0022 decision 6 — as the pill
 * every map state carries, and the poster carries in the live map's place: "© OpenMapTiles ©
 * OpenStreetMap contributors", each name a link to its licence page, in the theme-invariant
 * solid-button pair because it sits on imagery. 13 px radius: a full pill on one line, still
 * rounded when it wraps.
 *
 * <p>It covers whatever sits under it, and stays that way: `pointer-events-none` would read a
 * press on the pill as a press on the map, which places a pin in the operator console. The
 * consumer places it (`placement`: position, padding and leading together, since two utilities
 * for one property resolve by stylesheet order) and may lift it (`bottom`); a consumer that hides
 * the map from assistive technology takes the links out of the tab order, since focusable
 * content inside `aria-hidden` is a stop on nothing.
 */
@Component({
  selector: 'app-map-credit',
  host: { class: 'contents' },
  template: `
    <p
      data-testid="map-attribution"
      class="absolute z-10 rounded-[13px] border border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink"
      [class]="placement()"
      [style.bottom.px]="bottom()"
    >
      ©
      <a
        class="underline"
        href="https://openmaptiles.org/"
        target="_blank"
        rel="noopener noreferrer"
        data-touch-exempt="a link inside a sentence (WCAG 2.5.5 inline exception)"
        [attr.tabindex]="linksFocusable() ? null : -1"
        >OpenMapTiles</a
      >
      ©
      <a
        class="underline"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        data-touch-exempt="a link inside a sentence (WCAG 2.5.5 inline exception)"
        [attr.tabindex]="linksFocusable() ? null : -1"
        >OpenStreetMap</a
      >
      contributors
    </p>
  `,
})
export class MapCredit {
  /** Where the pill sits and how it is set: position, max width, padding, size and leading. */
  readonly placement = input.required<string>();
  /** A lift from the box's bottom edge in px, for a foot row over a sheet; `null` leaves it to `placement`. */
  readonly bottom = input<number | null>(null);
  readonly linksFocusable = input(true);
}
