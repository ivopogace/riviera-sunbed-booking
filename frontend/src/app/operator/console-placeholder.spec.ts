import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { ConsolePlaceholder } from './console-placeholder';

/**
 * The placeholder is a CHILD route of `/operator/:venueId`; under the router's default `emptyOnly`
 * inheritance the non-empty child does NOT inherit the parent's `:venueId`, so the component reads it
 * from `route.parent`. The mock mirrors that: `data`/`tab` on the child, `venueId` on the parent.
 */
function render(tab: string, venueId = '1'): HTMLElement {
  TestBed.configureTestingModule({
    imports: [ConsolePlaceholder],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { data: { tab }, paramMap: convertToParamMap({}) },
          parent: { snapshot: { paramMap: convertToParamMap({ venueId }) } },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ConsolePlaceholder);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ConsolePlaceholder (#170)', () => {
  function link(el: HTMLElement): HTMLAnchorElement | null {
    return el.querySelector<HTMLAnchorElement>('[data-testid="console-placeholder-link"]');
  }

  it('names the Venue & commodities section and forward-links to the surviving venue editor', () => {
    // beach-map (O3 #172), pricing (O4 #174) and daily view (O5 #175) have graduated to their real
    // tabs; Venue & commodities is still a placeholder that forward-links to the legacy venue editor.
    const el = render('venue');
    expect(el.querySelector('[data-testid="console-placeholder"]')?.textContent).toContain(
      'Venue & commodities',
    );
    expect(link(el)?.getAttribute('href')).toBe('/venue-admin');
  });

  it('forward-links the Requests placeholder to the legacy daily route with the venue id (until O6)', () => {
    // The Requests tab is still a placeholder (O6 #176); it points at the legacy daily view, where
    // accept/decline lives today, with the parent venue id.
    const el = render('requests', '7');
    expect(link(el)?.getAttribute('href')).toBe('/venue-admin/daily/7');
  });

  it('notes that Payouts arrives in a later slice and shows no legacy link', () => {
    const el = render('payouts');
    expect(el.querySelector('[data-testid="console-placeholder"]')?.textContent).toContain(
      'Payouts',
    );
    expect(link(el)).toBeNull();
  });
});
