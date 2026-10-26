import { Directive } from '@angular/core';

/**
 * The dark, AA-proven header glass for hero/state panels and the map header, where white ink over the
 * bare gradient's light stops would fail WCAG AA. Apply to any panel host: `<header appPanelGlass>`.
 * Carries no border-radius: two radius utilities on one element resolve by stylesheet order, not
 * `class` order, so each consumer sets its own (`rounded-[26px]` for panels, `rounded-full` for the pill).
 */
@Directive({
  selector: '[appPanelGlass]',
  host: {
    class:
      'bg-riv-header-glass backdrop-blur-[22px] backdrop-saturate-[1.7] border border-riv-header-border',
  },
})
export class PanelGlass {}
