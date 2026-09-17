import { MapPin } from '../../shared/riviera-map';
import { VenueCard } from './venue-card';

/**
 * A pin's id, keyed by the venue it stands for, so a pin and its card can be matched without a
 * second lookup table. The map speaks strings; the catalogue speaks numbers.
 */
export function pinId(venueId: number): string {
  return String(venueId);
}

/**
 * The riviera-map pins a result set contributes: one per card that carries a venue location, in
 * list order, labelled by the venue's name.
 *
 * <p>Derived from the very cards the list renders, so the map cannot drift from the list — the
 * beach/region/date filters and the availability-aware from-price are already baked into the
 * input. A card with no location is omitted: an unpinned venue stays in the list and is simply
 * not drawn. `undefined` is the list's own loading state and draws nothing.
 */
export function venuePins(cards: readonly VenueCard[] | undefined): readonly MapPin[] {
  return (cards ?? []).flatMap((card) =>
    card.location
      ? [
          {
            id: pinId(card.id),
            at: { lng: card.location.longitude, lat: card.location.latitude },
            label: card.name,
          },
        ]
      : [],
  );
}
