import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** What a placeholder tab shows: its title, an upcoming-slice note, and an optional forward-link to
 *  the surviving legacy surface. After O7 only Venue & commodities remains a placeholder (O8). */
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

  protected readonly info: TabPlaceholder = describeTab(String(this.route.snapshot.data['tab'] ?? ''));
}

/** Per-tab copy + the legacy surface each forward-links to while its restyle slice is pending. */
function describeTab(tab: string): TabPlaceholder {
  const editor: readonly string[] = ['/venue-admin'];
  const openEditor = 'Open the current venue editor';

  switch (tab) {
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
