import { MapPin } from '../../shared/riviera-map';
import { VenueCard } from './venue-card';

/**
 * The riviera-map pins a result set contributes: one per card that carries a venue location, in
 * list order, wearing the venue's from-price for the selected date on its face and named
 * "<venue>, from <price>" — the one fact that decides most tourists, readable off the map
 * without pressing a pin, and announced to a screen reader the same way. A venue with no
 * priced set draws the plain dot under its name alone: nothing to sell, nothing to say.
 *
 * <p>A pin's id is its venue's id as a string — the map seam speaks strings, the catalogue
 * numbers — which is how a selected pin is matched back to the card it stands for.
 *
 * <p>Derived from the very cards the list renders, so the map cannot drift from the list — the
 * beach/region/date filters and the availability-aware from-price are already baked into the
 * input, and the pin shows the card's own `priceLabel` string. A card with no location is
 * omitted: an unpinned venue stays in the list and is simply not drawn. `undefined` is the
 * list's own loading state and draws nothing.
 */
export function venuePins(cards: readonly VenueCard[] | undefined): readonly MapPin[] {
  return (cards ?? []).flatMap((card) =>
    card.location
      ? [
          {
            id: String(card.id),
            at: { lng: card.location.longitude, lat: card.location.latitude },
            label: card.priceLabel ? `${card.name}, from ${card.priceLabel}` : card.name,
            ...(card.priceLabel ? { badge: card.priceLabel } : {}),
          },
        ]
      : [],
  );
}
