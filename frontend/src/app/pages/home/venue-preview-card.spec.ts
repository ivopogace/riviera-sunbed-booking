import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { VenueCard } from './venue-card';
import { VenuePreviewCard } from './venue-preview-card';

function card(overrides: Partial<VenueCard> = {}): VenueCard {
  return {
    id: 7,
    name: 'Miramar Beach Club',
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    photos: [
      {
        url: '/api/venues/7/photos/aaa',
        sources: [{ url: '/api/venues/7/photos/aaa', width: 720 }],
      },
      {
        url: '/api/venues/7/photos/bbb',
        sources: [{ url: '/api/venues/7/photos/bbb', width: 720 }],
      },
    ],
    modeLabel: 'Instant Book',
    isRated: true,
    rating: '4.8',
    reviewsLabel: '326 reviews',
    water: null,
    amenities: [],
    freePercent: 75,
    priceLabel: '€25.00',
    free: 18,
    total: 24,
    salesClosed: false,
    closedForSeason: false,
    reopensOn: null,
    location: { latitude: 39.7712, longitude: 20.0021 },
    ariaLabel: 'Miramar Beach Club, …',
    ...overrides,
  };
}

describe('VenuePreviewCard', () => {
  function render(
    view: VenueCard = card(),
    date = '2026-07-01',
  ): ComponentFixture<VenuePreviewCard> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenuePreviewCard],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(VenuePreviewCard);
    fixture.componentRef.setInput('card', view);
    fixture.componentRef.setInput('date', date);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<VenuePreviewCard>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(fixture: ComponentFixture<VenuePreviewCard>, id: string): HTMLElement | null {
    return host(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  it('is a dialog named by the venue it previews', () => {
    const fixture = render();

    const element = host(fixture);
    expect(element.getAttribute('role')).toBe('dialog');
    const heading = element.querySelector(`#${element.getAttribute('aria-labelledby')}`);
    expect(heading?.textContent?.trim()).toBe('Miramar Beach Club');
  });

  it('carries the name, beach · region, rating and from-price the list card shows', () => {
    const fixture = render();

    expect(byTestId(fixture, 'preview-name')?.textContent?.trim()).toBe('Miramar Beach Club');
    expect(byTestId(fixture, 'preview-location')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Ksamil · Albanian Riviera',
    );
    expect(byTestId(fixture, 'preview-rating')?.textContent).toContain('4.8');
    expect(byTestId(fixture, 'preview-price')?.textContent?.replace(/\s+/g, ' ')).toContain(
      '€25.00',
    );
  });

  it('shows the cover photo alone, not the whole slideshow', () => {
    const fixture = render();

    expect(fixture.componentInstance.coverPhoto()).toEqual([
      {
        url: '/api/venues/7/photos/aaa',
        sources: [{ url: '/api/venues/7/photos/aaa', width: 720 }],
      },
    ]);
  });

  it('falls back to the gradient placeholder when the venue has no photo', () => {
    const fixture = render(card({ photos: [] }));

    expect(fixture.componentInstance.coverPhoto()).toEqual([]);
    expect(byTestId(fixture, 'preview-photo-placeholder')).not.toBeNull();
  });

  it('leads to the venue beach map with the chosen date carried', () => {
    const fixture = render(card(), '2026-08-14');

    const link = byTestId(fixture, 'preview-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/venues/7?date=2026-08-14');
  });

  it('shows the closed-for-season state', () => {
    const fixture = render(card({ closedForSeason: true, reopensOn: '2027-05-01' }));

    expect(byTestId(fixture, 'preview-closed')).not.toBeNull();
  });

  it('shows no closed-for-season state for an open venue', () => {
    expect(byTestId(render(), 'preview-closed')).toBeNull();
  });

  it('says "No sets yet" where a venue has no price', () => {
    const fixture = render(card({ priceLabel: null }));

    expect(byTestId(fixture, 'preview-price')?.textContent?.trim()).toBe('No sets yet');
  });

  it('shows the unrated state instead of a score', () => {
    const fixture = render(card({ isRated: false }));

    expect(byTestId(fixture, 'preview-rating')?.textContent?.trim()).toBe('New');
  });

  it('asks to be closed when its close control is pressed', () => {
    const fixture = render();
    const closes: unknown[] = [];
    fixture.componentInstance.closed.subscribe(() => closes.push(true));

    (byTestId(fixture, 'preview-close') as HTMLButtonElement).click();

    expect(closes).toHaveLength(1);
  });

  // The rendered 44 px box is the touch-target e2e sweep's job; jsdom has no layout.
  it('gives its close control an accessible name', () => {
    const close = byTestId(render(), 'preview-close') as HTMLButtonElement;

    expect(close.getAttribute('aria-label')).toBe('Close preview');
  });
});
