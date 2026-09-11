import { Directive } from '@angular/core';

// The decorative wash over a photo band — the Discover card's and the beach-map banner's, which
// wrote it out identically until #1066. A reused surface is shared at the directive layer, never
// duplicated in markup or faked with `@apply` (riviera-tailwind rule 1), the way shared/card-glass.ts
// and shared/panel-glass.ts already are; two call sites is enough, because the pair had already
// drifted once — the card gained `pointer-events-none` in #1044 and the banner stayed a pointer
// target until #1064 caught up. One definition makes that class of divergence impossible instead of
// something a second ticket has to find.
//
// `photo-scrim` leads the host classes as an inert marker: home.spec.ts, venue-map.spec.ts and
// e2e/discover-photos.e2e.ts all query it (rule 2). What the wash IS — its stops, its alpha ladder
// and the AA duty of its 0.68 stop under the card's location text — belongs to the
// `--riv-photo-scrim` token and pages/home/home.contrast.spec.ts, not here.
//
// NOTE — the full-bleed geometry IS bundled, unlike the border-radius that card-glass and
// panel-glass deliberately leave to each consumer (rule 3). The radius carve-out exists because two
// competing radius utilities resolve by generated-stylesheet order, so a directive radius plus a
// consumer's own is a coin flip; `absolute inset-0` has no such competitor here, and covering the
// positioned parent exactly is not a consumer's styling choice but what makes this a scrim at all.
// Every class below is a divergence surface the two spans could disagree about, `aria-hidden`
// included — so every one of them lives here. A third call site wanting different geometry re-opens
// this on purpose rather than by drift.
//
// Apply to an empty span inside a `relative` photo band: `<span appPhotoScrim></span>`.
@Directive({
  selector: '[appPhotoScrim]',
  host: {
    class: 'photo-scrim pointer-events-none absolute inset-0 bg-(image:--riv-photo-scrim)',
    'aria-hidden': 'true',
  },
})
export class PhotoScrim {}
