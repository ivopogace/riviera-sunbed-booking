package ai.riviera.platform.venue.adapter.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * Public tourist read endpoints for venues (invariant #11 — depends only on the {@code venue.api}
 * port). Two reads: the discovery <strong>list</strong> ({@code GET /api/venues?beach=&region=&date=},
 * issue #61) and a single venue + its beach <strong>map</strong> ({@code GET /api/venues/{id}},
 * U1/#4, date-aware since #44 — 200 with the map, or 404 for an unknown id).
 *
 * <p>The optional {@code date} query param selects the day whose availability the map reflects.
 * When omitted it defaults to <strong>tomorrow in {@code Europe/Tirane}</strong> (invariant #6) —
 * the next bookable day under the evening-before cutoff — computed from the injected UTC
 * {@link Clock}, never the JVM default zone. The booking cutoff (invariant #4) remains enforced
 * server-side at booking time; this default is a display convenience, not a booking guarantee.
 */
@RestController
@RequestMapping("/api/venues")
class VenueReadController {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final VenueCatalog catalog;
	private final Clock clock;

	VenueReadController(VenueCatalog catalog, Clock clock) {
		this.catalog = catalog;
		this.clock = clock;
	}

	/**
	 * Discovery list (issue #61): the venues matching the optional {@code beach}/{@code region}
	 * filters, as summaries with each venue's free/total set count for {@code date}. Always 200 with
	 * a JSON array (empty when nothing matches) — a filter that hits no venue is not a 404. {@code date}
	 * defaults to tomorrow in {@code Europe/Tirane} like the map read above.
	 */
	@GetMapping
	List<VenueSummaryView> listVenues(
			@RequestParam(required = false) String beach,
			@RequestParam(required = false) String region,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		LocalDate effectiveDate = date != null ? date : tomorrowInTirane();
		return catalog.listVenues(VenueFilter.of(beach, region), effectiveDate);
	}

	@GetMapping("/{venueId}")
	ResponseEntity<VenueMapView> getVenue(@PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		LocalDate effectiveDate = date != null ? date : tomorrowInTirane();
		return catalog.findVenueMap(new VenueId(venueId), effectiveDate)
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	private LocalDate tomorrowInTirane() {
		return LocalDate.ofInstant(clock.instant(), TIRANE).plusDays(1);
	}
}
