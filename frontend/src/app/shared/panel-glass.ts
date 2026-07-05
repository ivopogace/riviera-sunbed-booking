import { Directive } from '@angular/core';

// Tailwind twin of the shared/_glass.scss `panel-glass` mixin (spike: SCSS-vs-Tailwind comparison).
// The dark, AA-proven header glass — the surface for hero/state panels and the map header, where
// white ink over the bare gradient's light stops would fail WCAG AA. A directive, not a mixin (see
// shared/retry-button.ts). Apply to any panel host: `<header appPanelGlass>`.
//
// NOTE — border-radius is deliberately UNBUNDLED from this recipe (the mixin bundled 26px). In
// Tailwind two border-radius utilities on one element resolve by generated-stylesheet order, not
// `class` order, so a directive `rounded-[26px]` + a consumer's `rounded-full` (the back pill) is
// unreliable. Each consumer sets its own radius (`rounded-[26px]` for panels, `rounded-full` for
// the pill) — a friction finding of the spike.
@Directive({
  selector: '[appPanelGlass]',
  host: {
    class:
      'bg-(--riv-header-glass) backdrop-blur-[22px] backdrop-saturate-[1.7] border border-(--riv-header-border)',
  },
})
export class PanelGlass {}
