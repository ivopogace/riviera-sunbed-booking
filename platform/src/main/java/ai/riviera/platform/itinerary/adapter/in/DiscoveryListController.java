package ai.riviera.platform.itinerary.adapter.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.itinerary.application.StayVerdicts;
import ai.riviera.platform.itinerary.domain.StayVerdict;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * The public discovery list: {@code venue}'s visibility-fenced summaries for one day, or for a stay
 * ({@code date} to {@code lastDate}) with this module's verdict per venue (design D11). A missing
 * {@code date} is today in {@code Europe/Tirane} off the injected UTC {@link Clock} (invariant #6);
 * a last day before the first, or a stay wider than {@link StaySpan#MAX_DAYS}, is {@code 400} before
 * any read. Always 200 otherwise: a filter hitting no venue is an empty array.
 */
@RestController
@RequestMapping("/api/venues")
class DiscoveryListController {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final VenueCatalog catalog;
	private final StayVerdicts verdicts;
	private final Clock clock;

	DiscoveryListController(VenueCatalog catalog, StayVerdicts verdicts, Clock clock) {
		this.catalog = catalog;
		this.verdicts = verdicts;
		this.clock = clock;
	}

	@GetMapping
	List<DiscoveryVenueView> listVenues(
			@RequestParam(required = false) String beach,
			@RequestParam(required = false) String region,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate lastDate) {
		LocalDate firstDay = date != null ? date : LocalDate.ofInstant(clock.instant(), TIRANE);
		StaySpan stay = InvalidApiRequestException.parsing(() -> StaySpan.of(firstDay, lastDate));
		List<VenueSummaryView> venues = catalog.listVenues(VenueFilter.of(beach, region), firstDay);
		if (stay.isOneDay()) {
			return venues.stream().map(venue -> new DiscoveryVenueView(venue, null)).toList();
		}
		Map<VenueId, StayVerdict> byVenue = verdicts.forCoast(venues.stream().map(venue -> new VenueId(venue.id())).toList(), stay);
		return venues.stream()
				.map(venue -> new DiscoveryVenueView(venue, verdictOf(byVenue.get(new VenueId(venue.id())))))
				.toList();
	}

	private static StayVerdictView verdictOf(StayVerdict verdict) {
		return verdict == null ? null : StayVerdictView.of(verdict);
	}
}
