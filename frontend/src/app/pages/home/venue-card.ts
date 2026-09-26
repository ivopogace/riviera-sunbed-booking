import { Amenity } from '../../shared/amenities';
import { BeachCode } from '../../shared/beaches';
import { MoneyView } from '../../shared/money';
import { PhotoView, StayVerdictView, VenueLocation } from '../../shared/venue-views';

/**
 * A discovery card's ready-to-render view: every per-venue display value the template needs,
 * precomputed once from a {@link VenueSummary} by `Home.venuesView` rather than re-derived per
 * item on each change-detection tick. The pure `shared/` helpers stay signal-free; this record is
 * where their outputs are memoized off the `venues` signal.
 *
 * <p>The riviera map's pins and its preview card read the SAME record the list card renders, so
 * the two surfaces cannot disagree about a venue's price, rating or closed state.
 */
export interface VenueCard {
  readonly id: number;
  readonly name: string;
  /** The catalogue code — what the pins group on and the filter narrows to. */
  readonly beach: BeachCode;
  /** The beach and region as the tourist reads them (`shared/beaches.ts`). */
  readonly beachLabel: string;
  readonly regionLabel: string;
  /** The slideshow's photo URLs in slot order (cover first); empty → the gradient placeholder. */
  readonly photos: readonly PhotoView[];
  readonly modeLabel: string;
  /** The venue books the platform's default way, so {@link modeLabel} is not worth naming again. */
  readonly instantBook: boolean;
  readonly isRated: boolean;
  readonly rating: string;
  /** The count with its noun already agreed — "1 review", "2 reviews" (shared/rating.ts). */
  readonly reviewsLabel: string;
  readonly water: string | null;
  readonly amenities: readonly { readonly code: Amenity; readonly label: string }[];
  readonly freePercent: number;
  /** The "from €X / set" price string, or `null` when the venue has no sets ("No sets yet"). */
  readonly priceLabel: string | null;
  /** The same from-price in integer minor units, for anything that compares prices (invariant #5). */
  readonly fromPrice: MoneyView | null;
  readonly free: number;
  readonly total: number;
  /** True when the server's verdict says online sales for the selected date have closed. */
  readonly salesClosed: boolean;
  /** True when the venue is closed for the season — the badge outranks the sales-closed chip. */
  readonly closedForSeason: boolean;
  /** The reopen day while closed with one set, for the badge's copy; else `null`. */
  readonly reopensOn: string | null;
  /** The venue's riviera-map pin, or `null` when it has none — it then draws no pin. */
  readonly location: VenueLocation | null;
  /** The server's verdict for the chosen stay, or `null` on a one-day page. */
  readonly stay: StayVerdictView | null;
  /** False only for a chosen stay this venue cannot host: the card wears dusk and sinks in its group. */
  readonly canHost: boolean;
  /** The stay line in the free count's slot (`shared/stay-label.ts`), or `null` on a one-day page. */
  readonly stayLabel: string | null;
  /** The single accessible name carrying every card fact (nothing conveyed by layout alone). */
  readonly ariaLabel: string;
}
