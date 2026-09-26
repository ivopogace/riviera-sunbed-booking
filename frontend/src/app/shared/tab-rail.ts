import { Directive, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IsActiveMatchOptions, RouterLinkActive } from '@angular/router';

/**
 * `routerLinkActive` matching for a rail tab: the path alone, so a query string (`?date=`,
 * `?variant=`) never unlights the tab and `/admin` stays dark on `/admin/email`.
 */
export const TAB_RAIL_MATCH: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

/**
 * The rail under a row of {@link TabRailTab}s: one shared hairline, scrolling sideways with NO edge
 * mask (the cut-off tab is the overflow cue). The hairline is an inset shadow, not a border: the
 * scroll container would clip a marker overlapping a border. `--riv-ink-faint` clears 3:1 on the
 * header glass (`tab-rail.contrast.spec.ts`). No padding, margin or radius (`riviera-tailwind`
 * rule 3); a consumer may add a horizontal inset and top padding, never bottom padding, which
 * would float the marker off the hairline.
 */
@Directive({
  selector: 'nav[appTabRail]',
  host: {
    class:
      'flex w-full flex-nowrap items-stretch gap-5 overflow-x-auto scroll-smooth shadow-[inset_0_-1px_0_var(--riv-ink-faint)] scrollbar-none motion-reduce:scroll-auto',
  },
})
export class TabRail {}

/**
 * The current-page marker both console rows share: full ink plus a 3px `after:` bar, keyed on
 * `aria-current="page"`, on a `relative` host. The host sets the bar's position: `after:bottom-0`
 * on a rail tab, `after:-bottom-px` on the shell's section slots.
 */
export const TAB_RAIL_MARKER =
  "relative after:absolute after:inset-x-0 after:h-[3px] after:rounded-full after:bg-current after:opacity-0 after:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:after:opacity-100";

/**
 * Focus ring for edge-to-edge bar slots, inset to `-7px` (the baseline's outside ring is cut off at
 * the viewport edge) and 1–2px clear of the 3px current-page marker so the two never merge.
 * Baseline colour and width (`riviera-tailwind` rule 6); it also covers the bars' `<a>` slots.
 */
export const EDGE_SLOT_RING =
  'focus-visible:outline-[3px] focus-visible:-outline-offset-[7px] focus-visible:outline-riv-accent-ink';

/** The live Requests count on a rail tab, a phone slot or a palette row: the one solid-fill element
 *  among the tabs, so it outranks every one of them. `oc-badge` is the inert marker the e2e reads. */
export const TAB_RAIL_BADGE =
  'oc-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-riv-solid-fill-brand px-1.5 text-[11.5px] font-bold leading-none text-white';

/**
 * An underlined text tab on a {@link TabRail}: soft ink at rest; when current, full ink plus a
 * 3px bar on the hairline — never the accent ink alone, which vanishes on the header glass. Call
 * sites keep the native `<a routerLink routerLinkActive ariaCurrentWhenActive="page">` (with
 * {@link TAB_RAIL_MATCH}) and `appTouchTarget`; `inline-flex` makes that 44px floor live on an
 * anchor. It scrolls itself into view whenever it becomes current (optional-called: jsdom lacks
 * `scrollIntoView`).
 */
@Directive({
  selector: 'a[appTabRailTab]',
  host: {
    class: `inline-flex shrink-0 touch-manipulation items-center gap-[7px] px-0.5 text-[13.5px] font-semibold whitespace-nowrap text-riv-ink-soft no-underline hover:text-riv-ink after:bottom-0 ${TAB_RAIL_MARKER}`,
  },
})
export class TabRailTab {
  private readonly host = inject<ElementRef<HTMLAnchorElement>>(ElementRef);
  private readonly active = inject(RouterLinkActive, { self: true });

  constructor() {
    this.active.isActiveChange.pipe(takeUntilDestroyed()).subscribe((isActive) => {
      if (isActive) {
        this.host.nativeElement.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
      }
    });
  }
}

/**
 * A hairline between two groups of tabs on a {@link TabRail} — how nine admin destinations stop
 * reading as nine peers. Decorative: hidden from assistive tech, in the rail's own hairline ink.
 * Apply to an empty `<span appTabRailDivider></span>`.
 */
@Directive({
  selector: '[appTabRailDivider]',
  host: { class: 'my-3.5 w-px shrink-0 bg-riv-ink-faint', 'aria-hidden': 'true' },
})
export class TabRailDivider {}
