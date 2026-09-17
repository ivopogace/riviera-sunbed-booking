import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { venueCard } from '../../../testing/venue-cards';
import { CrowdStack } from './pin-crowding';
import { VenueCard } from './venue-card';
import { VenuePreviewCard } from './venue-preview-card';

/** Folie Marine, second of the three at Dhërmi that no zoom separates. */
const FOLIE = venueCard({ id: 12, name: 'Folie Marine', beach: 'Dhërmi' });
const FOLIE_STACK: CrowdStack = { index: 1, count: 3, place: 'Dhërmi', prevId: '11', nextId: '13' };

function card(overrides: Partial<VenueCard> = {}): VenueCard {
  return venueCard({
    id: 7,
    name: 'Miramar Beach Club',
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
    location: { latitude: 39.7712, longitude: 20.0021 },
    ...overrides,
  });
}

describe('VenuePreviewCard', () => {
  function render(
    view: VenueCard = card(),
    date = '2026-07-01',
    stack: CrowdStack | null = null,
  ): ComponentFixture<VenuePreviewCard> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenuePreviewCard],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(VenuePreviewCard);
    fixture.componentRef.setInput('card', view);
    fixture.componentRef.setInput('date', date);
    fixture.componentRef.setInput('stack', stack);
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<VenuePreviewCard>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(fixture: ComponentFixture<VenuePreviewCard>, id: string): HTMLElement | null {
    return host(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function text(element: Element | null | undefined): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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
    expect(text(byTestId(fixture, 'preview-location'))).toBe('Ksamil · Albanian Riviera');
    expect(byTestId(fixture, 'preview-rating')?.textContent).toContain('4.8');
    expect(text(byTestId(fixture, 'preview-price'))).toContain('€25');
  });

  it('says how many sets are free, as the list card’s footer does', () => {
    const fixture = render();

    const line = byTestId(fixture, 'preview-availability');
    expect(text(line)).toBe('18 of 24 free');
    expect(line?.querySelector('app-sets-free strong')?.textContent?.trim()).toBe('18');
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

  it('badges sales closed for today, outranked by the season closure', () => {
    const closedToday = render(card({ salesClosed: true }));
    const chip = byTestId(closedToday, 'preview-sales-closed');
    expect(text(chip)).toBe('Sales closed for today');
    expect(chip?.querySelector('.sales-closed-chip')).not.toBeNull();
    expect(byTestId(closedToday, 'preview-closed')).toBeNull();

    const closedForSeason = render(card({ salesClosed: true, closedForSeason: true }));
    expect(byTestId(closedForSeason, 'preview-closed')).not.toBeNull();
    expect(byTestId(closedForSeason, 'preview-sales-closed')).toBeNull();

    expect(byTestId(render(), 'preview-sales-closed')).toBeNull();
  });

  it('says No sets yet and 0 of 0 free where a venue has no sets', () => {
    const fixture = render(card({ priceLabel: null, fromPrice: null, free: 0, total: 0 }));

    expect(text(byTestId(fixture, 'preview-price'))).toContain('No sets yet');
    expect(text(byTestId(fixture, 'preview-availability'))).toBe('0 of 0 free');
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

  describe('the crowd stepper', () => {
    it('carries the crowd stepper while its venue is one of an inseparable crowd', () => {
      const fixture = render(FOLIE, '2026-07-01', FOLIE_STACK);

      const stepper = byTestId(fixture, 'preview-stack');
      expect(stepper?.getAttribute('role')).toBe('group');
      expect(stepper?.getAttribute('aria-label')).toBe('3 venues at Dhërmi');
      const prev = byTestId(fixture, 'preview-stack-prev') as HTMLButtonElement;
      const next = byTestId(fixture, 'preview-stack-next') as HTMLButtonElement;
      expect(prev.type).toBe('button');
      expect(prev.getAttribute('aria-label')).toBe('Previous venue at Dhërmi');
      expect(next.getAttribute('aria-label')).toBe('Next venue at Dhërmi');
      expect(text(prev)).toBe('‹');
      expect(text(next)).toBe('›');
      const dots = byTestId(fixture, 'preview-stack-dots');
      expect(dots?.getAttribute('aria-hidden')).toBe('true');
      const marks = [...dots!.children].map((dot) => dot.hasAttribute('data-current'));
      expect(marks).toEqual([false, true, false]);
      expect(byTestId(fixture, 'preview-stack-count')).toBeNull();
      const position = byTestId(fixture, 'preview-stack-position');
      expect(position?.getAttribute('aria-live')).toBe('polite');
      expect(text(position)).toBe('2 of 3 here, Folie Marine');
    });

    it('carries no stepper for a venue on its own, keeping the live region mounted', () => {
      const fixture = render();

      expect(byTestId(fixture, 'preview-stack')).toBeNull();
      const position = byTestId(fixture, 'preview-stack-position');
      expect(position).not.toBeNull();
      expect(text(position)).toBe('');
    });

    it('steps to the neighbour on either side', () => {
      const fixture = render(FOLIE, '2026-07-01', FOLIE_STACK);
      const stepped: string[] = [];
      fixture.componentInstance.stepped.subscribe((id) => stepped.push(id));

      (byTestId(fixture, 'preview-stack-prev') as HTMLButtonElement).click();
      (byTestId(fixture, 'preview-stack-next') as HTMLButtonElement).click();

      expect(stepped).toEqual(['11', '13']);
    });

    it('keeps its controls across a step', () => {
      const fixture = render(FOLIE, '2026-07-01', FOLIE_STACK);
      const next = byTestId(fixture, 'preview-stack-next');

      fixture.componentRef.setInput('card', venueCard({ id: 13, name: 'Dhërmi Sun Club' }));
      fixture.componentRef.setInput('stack', {
        ...FOLIE_STACK,
        index: 2,
        prevId: '12',
        nextId: '11',
      });
      fixture.detectChanges();

      expect(byTestId(fixture, 'preview-stack-next')).toBe(next);
      expect(text(byTestId(fixture, 'preview-stack-position'))).toBe(
        '3 of 3 here, Dhërmi Sun Club',
      );
      const marks = [...byTestId(fixture, 'preview-stack-dots')!.children].map((dot) =>
        dot.hasAttribute('data-current'),
      );
      expect(marks).toEqual([false, false, true]);
    });

    it('shows a count instead of dots past six venues', () => {
      const six = render(FOLIE, '2026-07-01', { ...FOLIE_STACK, count: 6 });
      expect(byTestId(six, 'preview-stack-dots')?.children.length).toBe(6);
      expect(byTestId(six, 'preview-stack-count')).toBeNull();

      const seven = render(FOLIE, '2026-07-01', { ...FOLIE_STACK, index: 2, count: 7 });
      expect(byTestId(seven, 'preview-stack-dots')).toBeNull();
      const count = byTestId(seven, 'preview-stack-count');
      expect(text(count)).toBe('3 / 7');
      expect(count?.getAttribute('aria-hidden')).toBe('true');
      expect(text(byTestId(seven, 'preview-stack-position'))).toBe('3 of 7 here, Folie Marine');
    });
  });
});
