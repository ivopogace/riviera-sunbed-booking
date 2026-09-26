import { Directive } from '@angular/core';

/**
 * The decorative wash a photo band paints over its image (Discover card band, beach-map banner).
 * Apply to an empty span inside a `relative` band: `<span appPhotoScrim></span>`.
 * `photo-scrim` is an inert marker class for the unit specs and e2e. The wash's stops and the AA
 * duty of its 0.68 stop belong to `--riv-photo-scrim` and `pages/home/home.contrast.spec.ts`.
 * `pointer-events-none` keeps a band's own controls tappable under it; the full-bleed geometry is
 * what makes it a scrim, so a call site needing other geometry re-opens that deliberately.
 */
@Directive({
  selector: '[appPhotoScrim]',
  host: {
    class: 'photo-scrim pointer-events-none absolute inset-0 bg-(image:--riv-photo-scrim)',
    'aria-hidden': 'true',
  },
})
export class PhotoScrim {}
