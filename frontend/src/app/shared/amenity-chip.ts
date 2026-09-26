import { booleanAttribute, computed, Directive, input } from '@angular/core';

/**
 * The amenity pill-tag variant directive; `water` is the accent "Xm to water" tag. OPAQUE SOLID
 * fills read AA on the light Discover card and the dark glass map header (pairs proven in
 * `shared/amenities.contrast.spec.ts`). Nothing here may theme: hosts differ in theme, and a themed
 * ink over the fixed `--riv-amenity-*` fills resolves light on light (reasoning: `tailwind.css`'s
 * declaration; guard: `shared/fixed-fill-token-skins.contrast.spec.ts`). The marker classes
 * `amenity-chip` / `amenity-chip--water` are inert test hooks that specs and e2e query.
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
        ? 'amenity-chip--water font-bold text-riv-amenity-water-ink bg-riv-amenity-water-fill border-riv-amenity-water-border'
        : 'font-semibold text-riv-amenity-tag-ink bg-riv-amenity-tag-fill border-riv-amenity-tag-border'),
  );
}
