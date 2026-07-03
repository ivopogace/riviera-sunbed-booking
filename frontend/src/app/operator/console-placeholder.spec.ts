import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { ConsolePlaceholder } from './console-placeholder';

function render(tab: string, venueId = '1'): HTMLElement {
  TestBed.configureTestingModule({
    imports: [ConsolePlaceholder],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { data: { tab }, paramMap: convertToParamMap({ venueId }) } },
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

  it('names the Beach map section and forward-links to the surviving venue editor', () => {
    const el = render('beach-map');
    expect(el.querySelector('[data-testid="console-placeholder"]')?.textContent).toContain(
      'Beach map',
    );
    expect(link(el)?.getAttribute('href')).toBe('/venue-admin');
  });

  it('forward-links the Daily view placeholder to the legacy daily route with the venue id', () => {
    const el = render('daily', '7');
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
