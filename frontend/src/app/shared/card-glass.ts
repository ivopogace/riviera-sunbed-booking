import { Directive } from '@angular/core';

// Tailwind twin of the shared/_glass.scss `card-glass` mixin (spike: SCSS-vs-Tailwind comparison).
// The light, per-theme card-glass surface carrying the dark card inks — the base for cards, bars
// and the failure panel. A directive, not a mixin — Tailwind has no CSS-level sharing primitive, so
// a surface recipe applied to arbitrary hosts moves to the directive layer (see shared/retry-button.ts).
// Apply to any card/panel host: `<article appCardGlass>`. (No border-radius here — the mixin didn't
// set one either; each consumer keeps its own radius utility.)
@Directive({
  selector: '[appCardGlass]',
  host: {
    class: 'bg-(--riv-card-glass) border border-(--riv-card-border) text-(--riv-card-ink)',
  },
})
export class CardGlass {}
