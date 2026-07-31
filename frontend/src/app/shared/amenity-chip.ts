import { booleanAttribute, computed, Directive, input } from '@angular/core';

/**
 * Tailwind twin of the retired `shared/_glass.scss` `amenity-chip` mixin (spike: SCSS-vs-Tailwind
 * comparison). A soft pill-tag with OPAQUE SOLID fills (the css:S7924 treatment — reads AA-safely on
 * both the light Discover card and the dark glass map header without a per-theme composited proof;
 * every ink/fill pair is proven AA in `shared/amenities.contrast.spec.ts`). The `water` variant is
 * the accent "Xm to water" tag. A variant directive, not a mixin (see `shared/retry-button.ts`).
 *
 * <p>The host owns its whole class list via one `[class]` computed, so the variant's classes live in
 * one place — **not** to avoid a clobber: #477 measured it, and in Angular 22 a static `class` on the
 * element and a host `[class]` binding merge rather than replace one another. The literal marker
 * classes `amenity-chip` / `amenity-chip--water` are RETAINED as inert test hooks — here that claim
 * is real, `venue-map.spec.ts` and the discovery-flow / venue-map e2e do query them — while the
 * utilities do the styling.
 */
@Directive({
  selector: '[appAmenityChip]',
  host: { '[class]': 'classes()' },
})
export class AmenityChip {
  /** The accent "to-water" tag (teal), vs the neutral default amenity tag. */
  readonly water = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(
    () =>
      'amenity-chip inline-flex items-center shrink-0 text-[11px] rounded-full px-2.5 py-1 whitespace-nowrap border ' +
      (this.water()
        ? 'amenity-chip--water font-bold text-[#0a5f74] bg-[#d7eef4] border-[#b9e0ea]'
        : 'font-semibold text-[#2f4a54] bg-[#eef2f4] border-[#dbe4e7]'),
  );
}
