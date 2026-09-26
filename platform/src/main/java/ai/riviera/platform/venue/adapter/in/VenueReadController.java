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

import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.application.ListVenueReviews;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueFilter;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;
import ai.riviera.platform.venue.vocabulary.VenueSummaryView;

/**
 * The public tourist venue reads, on this module's ports only (invariant #11): the discovery list,
 * a venue's beach map, its availability calendar and its reviews; a hidden venue reads as unknown.
 * A missing {@code date} or {@code from} is today in {@code Europe/Tirane} off the injected UTC
 * {@link Clock}, never the JVM zone (invariant #6); it is a display default, and sales close
 * (invariant #4) is enforced at booking. The calendar must not reuse the {@code /availability}
 * segment, which is the operator-only per-set state read.
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
	private final ListVenueReviews reviews;
	private final Clock clock;

	VenueReadController(VenueCatalog catalog, ListVenueReviews reviews, Clock clock) {
		this.catalog = catalog;
		this.reviews = reviews;
		this.clock = clock;
	}

	/**
	 * The venues matching the optional {@code beach}/{@code region} filters, with free/total set
	 * counts for {@code date} (default today in {@code Europe/Tirane}). Always 200: a filter hitting no
	 * venue is an empty array, not a 404.
	 */
	@GetMapping
	List<VenueSummaryView> listVenues(
			@RequestParam(required = false) String beach,
			@RequestParam(required = false) String region,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		LocalDate effectiveDate = date != null ? date : todayInTirane();
		return catalog.listVenues(VenueFilter.of(beach, region), effectiveDate);
	}

	/**
	 * The venue's beach map for one day ({@code date}, defaulting to today in {@code Europe/Tirane})
	 * or for a stay ({@code date} to {@code lastDate}, inclusive). A last day before the first, or a
	 * stay wider than {@link StaySpan#MAX_DAYS}, is rejected {@code 400} before the catalogue is asked.
	 */
	@GetMapping("/{venueId}")
	ResponseEntity<VenueMapView> getVenue(@PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate lastDate) {
		LocalDate firstDay = date != null ? date : todayInTirane();
		StaySpan stay = InvalidApiRequestException.parsing(() -> StaySpan.of(firstDay, lastDate));
		return catalog.findVenueMap(new VenueId(venueId), stay)
				.map(ResponseEntity::ok)
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	/**
	 * Per-day free/total counts over {@code [from, to]}, {@code to} defaulting to a fortnight on; a
	 * window inverted or over {@link #MAX_WINDOW_DAYS} days is {@code 400}. A snapshot, not a hold, past
	 * days too; {@code salesOpen} is display only, and booking enforces invariant #4.
	 */
	@GetMapping("/{venueId}/availability-calendar")
	ResponseEntity<List<DailyAvailabilityView>> availabilityCalendar(
			@PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		LocalDate start = from != null ? from : todayInTirane();
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

	/**
	 * One page of listed reviews, newest first; {@code cursor} is a previous page's {@code nextCursor},
	 * omitted for the first page. A cursor that cannot name a review is {@code 400} before the list is
	 * asked; a venue tourists cannot see is {@code 404}, as on the map read.
	 */
	@GetMapping("/{venueId}/reviews")
	ResponseEntity<VenueReviewsResponse> reviews(@PathVariable long venueId,
			@RequestParam(required = false) Long cursor) {
		if (cursor != null && cursor <= 0) {
			throw new InvalidApiRequestException("reviews: 'cursor' must be a positive review id");
		}
		ReviewCursor from = cursor == null ? ReviewCursor.FIRST_PAGE : new ReviewCursor(cursor);
		return reviews.pageFor(new VenueId(venueId), from)
				.map(page -> ResponseEntity.ok(VenueReviewsResponse.from(page)))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	private LocalDate todayInTirane() {
		return LocalDate.ofInstant(clock.instant(), TIRANE);
	}
}
