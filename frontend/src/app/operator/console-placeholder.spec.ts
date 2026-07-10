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
    // beach-map (O3 #172), pricing (O4 #174), daily view (O5 #175), requests (O6 #176) and payouts
    // (O7 #173) have all graduated to their real tabs; Venue & commodities is the last placeholder,
    // forward-linking to the legacy venue editor until O8 (#177).
    const el = render('venue');
    expect(el.querySelector('[data-testid="console-placeholder"]')?.textContent).toContain(
      'Venue & commodities',
    );
    expect(link(el)?.getAttribute('href')).toBe('/venue-admin');
  });
});
