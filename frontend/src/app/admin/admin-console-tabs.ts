import { Component, ElementRef, effect, inject, input, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';

import { TouchTarget } from '../shared/touch-target';

/**
 * The console's canonical tab order — the strip's
 * information architecture is an ORDER, not a layout (see {@link AdminConsoleTabs}).
 *
 * <p>Ordered by what each tab <em>is</em>, not by when it shipped: the console home, then the money
 * the platform sets and pays, then the two outbox re-drive levers (Email and Refunds share
 * `OutboxLever`), then moderation, then erasure, and Audit last because it is the record of
 * all of the above. One slot is still reserved for a tab that does not exist yet —
 * <strong>Payouts</strong>; every tab that ships has landed in its slot without the order
 * being renegotiated, which is what writing it down bought.
 *
 * <p>This is the contract, not a snapshot: `admin-console-tabs.spec.ts` pins that the rendered tabs
 * are a <em>subsequence</em> of it, so adding a tab in its slot needs no spec edit while appending
 * one out of slot fails.
 */
export const ADMIN_CONSOLE_TAB_ORDER = [
  'Operators',
  'Commissions',
  'Payouts',
  'Email',
  'Refunds',
  'Photos',
  'Privacy',
  'Audit',
] as const;

/**
 * The platform-admin console's tab strip, drawn from the admin-console design canvas
 * (`docs/design/riviera-admin-console.dc.html`): porcelain glass pills, the active one lifted.
 *
 * <p><strong>Routed tabs, not local state.</strong> The canvas models tabs as a `tab` state field
 * because it is a single demo page; here each tab is its own child route of {@code AdminConsole},
 * so it is deep-linkable, back-button-correct, and only the tab you opened is downloaded — the
 * operator console's own shape (`riviera-frontend`: "the one nested child-route tree... follow
 * that shape for further tabbed sub-apps"). Mounted once by the shell and kept alive across tab
 * switches, so its scroll position is never lost or reset.
 *
 * <p><strong>Scrolls, doesn't wrap.</strong> Originally a flat wrapping strip (measured to stay
 * within 3 rows at 360px through 8 tabs, never scrolling sideways) — moved to a single scrolling
 * row, matching the operator console's own tab bar (`operator-console.html`, #710) so the two navs
 * behave the same rather than diverging on which one happened to get uneven labels first. An
 * overflow menu was rejected for the same reason #710 rejected it there: it can strand
 * `aria-current` inside a collapsed menu. The active tab auto-scrolls into view on load and on every
 * switch, via the same `tabLink`/`scrollIntoView` mechanism. `e2e/admin-console-tabs.e2e.ts` pins the
 * scrolling-row shape.
 *
 * <p><strong>Which tabs exist is a backend question.</strong> This strip lists what ships, which is
 * why Photos appears here without appearing on the canvas at all: the canvas's Privacy tab
 * is scoped to GDPR data-subject erasure (built as drawn), and content moderation is a
 * different job. The canvas's own five-tab strip predates four of the tabs that ship and is not the
 * target IA.
 *
 * <p>Rendered only inside {@code AdminConsole}'s authorized branch, so a signed-out visitor is never
 * told which admin surfaces exist. The active tab carries `aria-current="page"`, which is what makes
 * the lift visible to assistive tech rather than to sighted users alone.
 */
@Component({
  selector: 'app-admin-console-tabs',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  template: `
    <nav
      class="mt-3 mb-1 flex w-full flex-nowrap items-center gap-2 overflow-x-auto scroll-px-1 px-1 py-1 [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] [-webkit-mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] scrollbar-none"
      [attr.aria-label]="label()"
    >
      @for (tab of tabs; track tab.path) {
        <a
          #tabLink
          [routerLink]="tab.path"
          routerLinkActive
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          appTouchTarget
          class="riv-tab inline-flex shrink-0 items-center gap-2 rounded-full border border-white/70 bg-white/45 px-[18px] py-[9px] text-[13.5px] font-semibold text-riv-ink-soft backdrop-blur-[10px] [transition:background_0.15s_ease] hover:bg-white/65 aria-[current=page]:border-white/95 aria-[current=page]:bg-white/85 aria-[current=page]:text-[#0a4f5e] aria-[current=page]:shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff]"
          [attr.data-testid]="tab.testId"
          >{{ tab.label }}</a
        >
      }
    </nav>
  `,
})
export class AdminConsoleTabs {
  /** Names the strip for assistive tech; each page passes its own so two navs never read alike. */
  readonly label = input('Admin console');

  protected readonly tabs = [
    { path: '/admin', label: 'Operators', testId: 'admin-tab-operators' },
    { path: '/admin/commissions', label: 'Commissions', testId: 'admin-tab-commissions' },
    { path: '/admin/email', label: 'Email', testId: 'admin-tab-email' },
    { path: '/admin/refunds', label: 'Refunds', testId: 'admin-tab-refunds' },
    { path: '/admin/photos', label: 'Photos', testId: 'admin-tab-photos' },
    { path: '/admin/privacy', label: 'Privacy', testId: 'admin-tab-privacy' },
    { path: '/admin/audit', label: 'Audit', testId: 'admin-tab-audit' },
  ];

  private readonly router = inject(Router);
  /** The pill anchors, in tab order — used to scroll the active one into the scrolling row's
   *  viewport so it's visible without the admin having to scroll manually. */
  private readonly tabLinks = viewChildren<ElementRef<HTMLAnchorElement>>('tabLink');
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    // Scroll the active tab into view on load/switch — the row scrolls instead of wrapping.
    effect(() => {
      const url = this.currentUrl();
      const links = this.tabLinks();
      const index = this.tabs.findIndex((tab) => tab.path === url);
      links[index]?.nativeElement.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    });
  }
}
