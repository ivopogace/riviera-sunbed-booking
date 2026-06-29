package ai.riviera.platform.venue.infrastructure.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueId;
import ai.riviera.platform.venue.api.VenueMapView;

/**
 * Public tourist read endpoint for a venue and its beach map (U1, issue #4; date-aware since
 * issue #44). Driving adapter — depends only on the {@code venue.api} port (invariant #11).
 * Returns 200 with the map for the requested day, or 404 if no venue has that id.
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
