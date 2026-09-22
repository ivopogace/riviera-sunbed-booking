import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { venueCard } from '../../../testing/venue-cards';
import { photoViews } from '../../../testing/photo-views';
import { VenueCard } from './venue-card';
import { VenueRow } from './venue-row';

/**
 * The desktop panel's row — the pin's preview on that surface, as the card is on the sheet. What
 * it says at rest, and what the one selected row says extra. The 92 → 121 px it measures is a
 * browser fact, pinned in `discover-map.e2e.ts`; here it is the content rule.
 */
describe('VenueRow', () => {
  let fixture: ComponentFixture<VenueRow>;

  function render(card: VenueCard, selected = false): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [VenueRow], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(VenueRow);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(host: HTMLElement, id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  /** A line's own parts: adjacent flex children share no text node, so `textContent` runs them together. */
  function parts(node: Element | null): string {
    return [...(node?.childNodes ?? [])]
      .filter((child) => child.nodeType !== Node.COMMENT_NODE)
      .map((child) => child.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((run) => run !== '')
      .join(' ');
  }

  const PALASA = venueCard({
    id: 3,
    name: 'Palasa Sands',
    rating: '4.6',
    reviewsLabel: '143 reviews',
    water: '20 m to water',
    priceLabel: '€26',
    free: 11,
    total: 26,
    freePercent: 42,
    amenities: [
      { code: 'SNORKELLING', label: 'Snorkelling' },
      { code: 'BEACH_BAR', label: 'Beach bar' },
    ],
  });

  it('says the name, the price and one facts line carrying the review count', () => {
    const host = render(PALASA);

    expect(text(byTestId(host, 'row-name'))).toBe('Palasa Sands');
    expect(text(byTestId(host, 'row-price'))).toBe('€26');
    expect(parts(byTestId(host, 'row-facts'))).toBe('★ 4.6 · 143 reviews · 20 m to water');
  });

  it('wears dusk when sales for today have closed, the price giving way to the fact that outranks it', () => {
    const host = render(venueCard({ ...PALASA, salesClosed: true }));
    const row = byTestId(host, 'venue-row')!;

    expect(row.classList.contains('saturate-0')).toBe(true);
    // Desaturated, never faded: a faded row put its name under 3:1 in every theme (round 7).
    expect([...row.classList].some((cls) => cls.startsWith('opacity-'))).toBe(false);
    expect(byTestId(host, 'row-price')).toBeNull();
    expect(text(byTestId(host, 'row-closed'))).toBe('Closed today');
    expect(byTestId(host, 'row-closed')!.classList.contains('semantic-chip')).toBe(true);
  });

  it('says closed for season instead, the badge that outranks today’s close', () => {
    const host = render(
      venueCard({ ...PALASA, salesClosed: true, closedForSeason: true, reopensOn: '2026-05-15' }),
    );

    // The reopen day rides the accessible name; the price slot has no room for it.
    expect(text(byTestId(host, 'row-closed'))).toBe('Closed for season');
    expect(byTestId(host, 'row-price')).toBeNull();
  });

  it('leaves a selling row its price and its colour', () => {
    const host = render(PALASA);

    expect(byTestId(host, 'venue-row')!.classList.contains('saturate-0')).toBe(false);
    expect(text(byTestId(host, 'row-price'))).toBe('€26');
    expect(byTestId(host, 'row-closed')).toBeNull();
  });

  it('leaves the water off the facts line when the venue has no distance', () => {
    expect(parts(byTestId(render(venueCard({ id: 1, name: 'Aurora' })), 'row-facts'))).toBe(
      '★ 4.8 · 326 reviews',
    );
  });

  it('says New in place of a rating the venue has not earned', () => {
    const host = render(venueCard({ id: 1, name: 'Aurora', isRated: false }));

    expect(text(byTestId(host, 'row-facts'))).toContain('New');
    expect(text(byTestId(host, 'row-facts'))).not.toContain('326 reviews');
  });

  it('puts a 72 px availability bar beside its own number', () => {
    const host = render(PALASA);

    expect(text(byTestId(host, 'row-availability'))).toBe('11 of 26 free');
    const bar = byTestId(host, 'row-avail-track')!;
    expect(bar.classList.contains('w-[72px]')).toBe(true);
    expect(byTestId(host, 'row-avail-fill')!.style.width).toBe('42%');
  });

  it('carries a hairline under it, and none under the group’s last row', () => {
    const row = render(PALASA).querySelector('[data-testid="venue-row"]')!;

    expect(row.classList.contains('border-b')).toBe(true);
    expect(row.classList.contains('group-last/row:border-b-0')).toBe(true);
  });

  it('shows no amenity chips and no mode until it is the selected row', () => {
    const host = render(venueCard({ ...PALASA, modeLabel: 'Request to Book', instantBook: false }));

    expect(byTestId(host, 'row-chips')).toBeNull();
    expect(text(host)).not.toContain('Request to Book');
  });

  it('expands the selected row to its amenity chips and its non-default mode', () => {
    const host = render(
      venueCard({ ...PALASA, modeLabel: 'Request to Book', instantBook: false }),
      true,
    );

    expect(parts(byTestId(host, 'row-chips'))).toBe('Request to Book Snorkelling Beach bar');
  });

  it('names no mode on the selected row when the venue books the default way', () => {
    const host = render(PALASA, true);

    expect(parts(byTestId(host, 'row-chips'))).toBe('Snorkelling Beach bar');
  });

  it('leaves the chip row out of a selected venue that has nothing to put in it', () => {
    const host = render(venueCard({ id: 1, name: 'Aurora' }), true);
    expect(byTestId(host, 'row-chips')).toBeNull();
  });

  it('marks the selected row current, and links to its beach map with the date carried', () => {
    const host = render(PALASA, true);

    const link = byTestId(host, 'venue-row')!;
    expect(link.getAttribute('aria-current')).toBe('true');
    expect(link.getAttribute('aria-label')).toBe(PALASA.ariaLabel);
    expect(render(PALASA).querySelector('[aria-current]')).toBeNull();
  });

  it('reports the pointer arriving and leaving, and the keyboard doing the same', () => {
    const host = render(PALASA);
    const pointed: boolean[] = [];
    fixture.componentInstance.pointed.subscribe((on) => pointed.push(on));
    const row = byTestId(host, 'venue-row')!;

    row.dispatchEvent(new MouseEvent('mouseenter'));
    row.dispatchEvent(new MouseEvent('mouseleave'));
    row.dispatchEvent(new FocusEvent('focus'));
    row.dispatchEvent(new FocusEvent('blur'));

    expect(pointed).toEqual([true, false, true, false]);
  });

  it('draws the venue’s cover photo, and the gradient placeholder without one', () => {
    expect(byTestId(render(PALASA), 'row-photo-empty')).not.toBeNull();

    const withPhoto = render(
      venueCard({ ...PALASA, photos: photoViews(['/api/venues/3/photos/aa01']) }),
    );
    expect(byTestId(withPhoto, 'row-photo-empty')).toBeNull();
    expect(byTestId(withPhoto, 'row-photo')!.getAttribute('src')).not.toBe('');
  });
});
