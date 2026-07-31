import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The platform-admin console's tab strip (#405), drawn from the admin-console design canvas
 * (`docs/design/riviera-admin-console.dc.html`): porcelain glass pills, the active one lifted.
 *
 * <p><strong>Routed tabs, not local state.</strong> The canvas models tabs as a `tab` state field
 * because it is a single demo page; here each tab is its own lazy route, so it is deep-linkable,
 * back-button-correct, and only the tab you opened is downloaded — the operator console's shape
 * (#170), minus the layout component, which the tab count (three, as of #460) does not yet justify.
 *
 * <p><strong>Which tabs exist is a backend question.</strong> The canvas draws five; three of them
 * (Commissions, Payouts, and Privacy's erasure flow) are out of this slice — the canvas itself
 * documents that the first two have no endpoints at all. This strip lists what ships.
 *
 * <p>Rendered only inside each page's admin-authorized branch, so a signed-out visitor is never told
 * which admin surfaces exist. The active tab carries `aria-current="page"`, which is what makes the
 * lift visible to assistive tech rather than to sighted users alone.
 */
@Component({
  selector: 'app-admin-console-tabs',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="mt-5 mb-1 flex flex-wrap gap-2" [attr.aria-label]="label()">
      @for (tab of tabs; track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive="riv-tab-active bg-white/85 text-[#0a4f5e] border-white/95 shadow-[0_6px_18px_rgba(7,42,58,0.25),inset_0_1px_0_#fff]"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          class="riv-tab inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/45 px-[18px] py-[9px] text-[13.5px] font-semibold text-(--riv-ink-soft) backdrop-blur-[10px] [transition:background_0.15s_ease] hover:bg-white/65"
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
    { path: '/admin/email', label: 'Email', testId: 'admin-tab-email' },
    { path: '/admin/refunds', label: 'Refunds', testId: 'admin-tab-refunds' },
  ];
}
