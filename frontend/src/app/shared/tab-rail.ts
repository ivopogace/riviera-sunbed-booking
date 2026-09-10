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
 * The rail a row of {@link TabRailTab}s sits on: one hairline every tab shares, so the
 * current tab's underline reads as a marker on a baseline rather than a decoration under a word.
 * It scrolls sideways with NO edge mask — the cut-off tab at the edge is the overflow cue a pill
 * row could never show.
 *
 * <p>The hairline is an inset shadow, not a border: the rail is a scroll container, which clips
 * anything a child paints past its box, so a marker cannot overlap a border from inside it. The
 * shadow paints on the rail's own box, under the tabs and unmoved by the scroll, and the marker at
 * `bottom-0` covers its bottom pixel. `--riv-ink-faint` rather than the header's white border
 * because the line has to clear 1.4.11's 3:1 on the header glass (`tab-rail.contrast.spec.ts`).
 *
 * <p>Carries no padding, margin or radius of its own (`riviera-tailwind` rule 3). A consumer may
 * add a horizontal inset (`px-6 scroll-px-6`) and top padding, never bottom padding — the tabs
 * stretch to the rail's content edge, and bottom padding would float the marker off the hairline.
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
 * The current-page marker both console rows share: full ink plus a 3px bar in that ink, keyed on
 * `aria-current="page"`, drawn by an `after:` pseudo-element on a `relative` host. The host adds
 * the bar's vertical position — `after:bottom-0` on a rail tab (onto the rail's inset hairline),
 * `after:-bottom-px` on the shell's section slots (over the header's border) — so section and
 * tab read as one structure one level apart.
 */
export const TAB_RAIL_MARKER =
  "relative after:absolute after:inset-x-0 after:h-[3px] after:rounded-full after:bg-current after:opacity-0 after:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:after:opacity-100";

/**
 * The focus ring of a slot on an edge-to-edge bar — the tourist tab bar's three tabs and the
 * console's four phone slots. The baseline ring paints 3px at `outline-offset: 2px`, OUTSIDE the
 * box; the last slot of these bars ends at (or 4px from) the viewport edge, and the bar's own
 * border and safe-area padding sit under the ring's other sides, so the ring showed as an
 * "L" — its right and bottom sides off-screen. Inset instead: `-7px` puts the whole 3px
 * ring 4–7px inside the slot, clear of the 3px current-page marker by 1px at the slot's top
 * (`app.ts`'s tab, `before:top-0`) and by 2px at its bottom (`TAB_RAIL_MARKER` at
 * `after:-bottom-px`, which overhangs the edge by one), so on the current slot the ring and
 * the marker never merge into one thicker bar. Colour and width are the
 * baseline's (`riviera-tailwind` rule 6: an offset change, not a second ring); the ring covers
 * the bars' `<a>` slots too, which the `button`-only base rule never reached.
 */
export const EDGE_SLOT_RING =
  'focus-visible:outline-[3px] focus-visible:-outline-offset-[7px] focus-visible:outline-riv-accent-ink';

/** The live Requests count on a rail tab, a phone slot or a palette row: the one solid-fill element
 *  among the tabs, so it outranks every one of them. `oc-badge` is the inert marker the e2e reads. */
export const TAB_RAIL_BADGE =
  'oc-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-riv-solid-fill-brand px-1.5 text-[11.5px] font-bold leading-none text-white';

/**
 * An underlined text tab on a {@link TabRail}: soft ink at rest, and when `routerLinkActive`
 * marks it `aria-current="page"`, full ink plus a 3px bar in that ink on the rail's hairline —
 * never the accent ink alone, which vanishes on the header glass. The call site keeps the
 * native `<a routerLink routerLinkActive ariaCurrentWhenActive="page">` (with
 * {@link TAB_RAIL_MATCH}) and declares `appTouchTarget`; `inline-flex` here is what makes that
 * 44px floor live on an anchor (`riviera-tailwind` rule 4).
 *
 * <p>The tab scrolls itself into the rail's viewport whenever it becomes current — on load and on
 * every navigation — from the sibling `RouterLinkActive`'s `isActiveChange`, so no consumer
 * keeps a `viewChildren` + `effect` copy of that mechanism. Optional-called: jsdom does not
 * implement `scrollIntoView`.
 */
@Directive({
  selector: 'a[appTabRailTab]',
  host: {
    class: `inline-flex shrink-0 items-center gap-[7px] px-0.5 text-[13.5px] font-semibold whitespace-nowrap text-riv-ink-soft no-underline hover:text-riv-ink after:bottom-0 ${TAB_RAIL_MARKER}`,
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
