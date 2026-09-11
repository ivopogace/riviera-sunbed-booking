import { Directive } from '@angular/core';

/**
 * The decorative wash a photo band paints over its image — the Discover card's band and the
 * beach-map banner's wear the same one. Apply to an empty span inside a `relative` band:
 * `<span appPhotoScrim></span>`.
 *
 * <p>`photo-scrim` leads the host classes as an inert marker the unit specs and the e2e query.
 * What the wash IS — its stops, and the AA duty of its 0.68 stop under the card's location text —
 * belongs to the `--riv-photo-scrim` token and `pages/home/home.contrast.spec.ts`.
 *
 * <p>The recipe bundles `pointer-events-none` and the full-bleed geometry, where `card-glass` and
 * `panel-glass` leave border-radius to each consumer: a band's own controls must stay tappable
 * under the wash, and covering the positioned parent exactly is what makes this a scrim rather
 * than a consumer's styling choice. A call site needing other geometry re-opens that deliberately.
 */
@Directive({
  selector: '[appPhotoScrim]',
  host: {
    class: 'photo-scrim pointer-events-none absolute inset-0 bg-(image:--riv-photo-scrim)',
    'aria-hidden': 'true',
  },
})
export class PhotoScrim {}
