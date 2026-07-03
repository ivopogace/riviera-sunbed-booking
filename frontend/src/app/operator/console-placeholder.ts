import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** What a placeholder tab shows: its title, an upcoming-slice note, and an optional forward-link to
 *  the surviving legacy surface (Payouts has none — it is new in O7). */
interface TabPlaceholder {
  readonly title: string;
  readonly note: string;
  readonly link: readonly string[] | null;
  readonly linkLabel: string | null;
}

/**
 * A console tab whose Liquid Glass content arrives in a later epic-#141 slice (O3–O8). O1 ships the
 * shell; each placeholder names its section + upcoming slice and **forward-links to the surviving
 * legacy surface** so nothing is lost while the console is being built out (the legacy routes stay
 * live with their `legacySurface` flags — scope guardrail). Reads its tab identity from the route
 * `data.tab` and the venue id from the inherited `:venueId` param.
 */
@Component({
  selector: 'app-console-placeholder',
  imports: [RouterLink],
  template: `
    <section class="oc-placeholder" data-testid="console-placeholder">
      <h1 class="oc-placeholder-title">{{ info.title }}</h1>
      <p class="oc-placeholder-note">{{ info.note }}</p>
      @if (info.link; as link) {
        <a class="oc-placeholder-link" data-testid="console-placeholder-link" [routerLink]="link">
          {{ info.linkLabel }}
        </a>
      }
    </section>
  `,
  styleUrl: './console-placeholder.scss',
})
export class ConsolePlaceholder {
  private readonly route = inject(ActivatedRoute);

  protected readonly info: TabPlaceholder = describeTab(
    String(this.route.snapshot.data['tab'] ?? ''),
    // The child route does NOT inherit the parent's :venueId (router default emptyOnly strategy),
    // so read it from the parent (the /operator/:venueId route); fall back to own for safety.
    this.route.parent?.snapshot.paramMap.get('venueId') ??
      this.route.snapshot.paramMap.get('venueId') ??
      '',
  );
}

/** Per-tab copy + the legacy surface each forward-links to while its restyle slice is pending. */
function describeTab(tab: string, venueId: string): TabPlaceholder {
  const editor: readonly string[] = ['/venue-admin'];
  const daily: readonly string[] = ['/venue-admin/daily', venueId];
  const openEditor = 'Open the current venue editor';
  const openDaily = 'Open the current daily view';

  switch (tab) {
    case 'beach-map':
      return {
        title: 'Beach map',
        note: 'The Liquid Glass layout editor arrives in a later slice (O3). For now, lay out your beach map in the current venue editor.',
        link: editor,
        linkLabel: openEditor,
      };
    case 'pricing':
      return {
        title: 'Pricing',
        note: 'Per-row pricing gets its Liquid Glass tab in a later slice (O4). For now, set prices in the current venue editor.',
        link: editor,
        linkLabel: openEditor,
      };
    case 'daily':
      return {
        title: 'Daily view',
        note: 'The restyled daily view arrives in a later slice (O5). For now, mark walk-ins and see arrivals in the current daily view.',
        link: daily,
        linkLabel: openDaily,
      };
    case 'requests':
      return {
        title: 'Requests',
        note: 'A dedicated Requests tab arrives in a later slice (O6). For now, accept or decline booking requests in the daily view — new requests show a badge on this tab.',
        link: daily,
        linkLabel: openDaily,
      };
    case 'payouts':
      return {
        title: 'Payouts',
        note: 'The payout ledger, period statement and weather refunds arrive in a later slice (O7).',
        link: null,
        linkLabel: null,
      };
    case 'venue':
      return {
        title: 'Venue & commodities',
        note: 'The restyled venue details + commodities tab arrives in a later slice (O8). For now, edit venue details in the current venue editor.',
        link: editor,
        linkLabel: openEditor,
      };
    default:
      return {
        title: 'Operator console',
        note: 'This section is being restyled.',
        link: null,
        linkLabel: null,
      };
  }
}
