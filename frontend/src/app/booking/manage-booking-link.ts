import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** The two skins the link's surfaces need: the pay page's block CTA, confirmation's quiet link. */
const SKINS = {
  primary:
    'mt-4 block w-full rounded-2xl border border-riv-cta-border bg-(image:--riv-cta-grad) p-[15px] text-center text-[15px] font-bold text-white shadow-[0_12px_28px_rgba(11,120,150,0.5),inset_0_1px_0_rgba(255,255,255,0.5)] [transition:filter_0.15s_ease] hover:brightness-[1.06] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink motion-reduce:transition-none',
  link: 'mt-3 inline-block text-[14.5px] font-semibold text-riv-accent-ink focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink',
} as const;

export type ManageBookingLinkVariant = keyof typeof SKINS;

/**
 * The link from a completed booking to its management page. Owns the anchor: label, route
 * (`/booking/{code}`), skin (by {@link ManageBookingLinkVariant}) and the `manage-link` test id all
 * live here, and the `contents` host keeps the caller's card laying out the anchor itself.
 *
 * <p>Rendering the anchor in this template (rather than augmenting a caller-owned `<a>` by
 * attribute) is what lets `elements-content` see the link's content — the attribute form needed an
 * `allowList` entry in `eslint.config.js`. It became possible when #739 turned the pages'
 * page-scoped `.btn-primary`/`.link` rules into global utilities.
 */
@Component({
  selector: 'app-manage-booking-link',
  imports: [RouterLink],
  host: { class: 'contents' },
  template: `<a [routerLink]="['/booking', code()]" [class]="skin()" data-testid="manage-link"
    >View or manage this booking</a
  >`,
})
export class ManageBookingLink {
  readonly code = input.required<string>();
  readonly variant = input.required<ManageBookingLinkVariant>();

  protected readonly skin = computed(() => SKINS[this.variant()]);
}
