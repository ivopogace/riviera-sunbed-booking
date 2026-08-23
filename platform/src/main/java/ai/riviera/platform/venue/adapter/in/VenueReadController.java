package ai.riviera.platform.venue.adapter.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * Public tourist read endpoints for venues (invariant #11 — depends only on the {@code venue.api}
 * port). Two of them are the originals: the discovery <strong>list</strong>
 * ({@code GET /api/venues?beach=&region=&date=}) and a single venue + its beach
 * <strong>map</strong> ({@code GET /api/venues/{id}}, date-aware — 200 with the map, or 404 for an
 * unknown id).
 *
 * <p>A third read, {@code GET /api/venues/{id}/availability-calendar?from=&to=}, answers the same
 * availability question for a <em>window</em> of days at once, so a date picker can show which days
 * are worth choosing. Its path deliberately does not reuse the {@code /availability} segment, which
 * is the operator-only per-set state read.
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

	/** Days in the calendar window when the caller does not name {@code to}. */
	private static final int DEFAULT_WINDOW_DAYS = 14;

	/** The widest window served, so one request cannot ask for years of days. */
	private static final int MAX_WINDOW_DAYS = 62;

	private final VenueCatalog catalog;
	private final Clock clock;

	VenueReadController(VenueCatalog catalog, Clock clock) {
		this.catalog = catalog;
		this.clock = clock;
	}

	/**
	 * Discovery list: the venues matching the optional {@code beach}/{@code region}
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

	/**
	 * Per-day free/total set counts across {@code [from, to]} — the calendar behind date choice.
	 * Both bounds are optional: {@code from} defaults to tomorrow in {@code Europe/Tirane} like the
	 * reads above, {@code to} to a fortnight from {@code from}. A window that is inverted or wider
	 * than {@link #MAX_WINDOW_DAYS} days is rejected {@code 400} before the catalogue is asked.
	 *
	 * <p>The counts are a snapshot, not a hold, and past days are answered like any other: this
	 * reports availability, not bookability. The cutoff (invariant #4) stays enforced at booking time.
	 */
	@GetMapping("/{venueId}/availability-calendar")
	ResponseEntity<List<DailyAvailabilityView>> availabilityCalendar(
			@PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		LocalDate start = from != null ? from : tomorrowInTirane();
		LocalDate end = to != null ? to : start.plusDays(DEFAULT_WINDOW_DAYS - 1L);
		if (end.isBefore(start)) {
			throw new InvalidApiRequestException("availability-calendar: 'to' precedes 'from'");
		}
		if (ChronoUnit.DAYS.between(start, end) + 1 > MAX_WINDOW_DAYS) {
			throw new InvalidApiRequestException(
					"availability-calendar: window exceeds " + MAX_WINDOW_DAYS + " days");
		}
		return catalog.availabilityBetween(new VenueId(venueId), start, end)
				.map(days -> ResponseEntity.ok(days.stream().map(DailyAvailabilityView::of).toList()))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	private LocalDate tomorrowInTirane() {
		return LocalDate.ofInstant(clock.instant(), TIRANE).plusDays(1);
	}
}
