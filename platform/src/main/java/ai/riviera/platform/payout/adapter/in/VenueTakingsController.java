package ai.riviera.platform.payout.adapter.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.payout.application.ViewDailyTakings;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Operator-gated read of a venue's "online takings today" (O2): the gross of the online bookings
 * for a service date + the net after commission (invariant #9), via the {@link ViewDailyTakings}
 * port (invariant #11). {@code date} defaults to today in {@code Europe/Tirane} (invariant #6).
 *
 * <p>{@code SecurityConfig} matches this GET to {@code OPERATOR} <em>before</em> the public venue
 * GET (unauthenticated → {@code 401}); the service asserts ownership (invariant #13) → {@code 403}.
 */
@RestController
@RequestMapping("/api/venues")
class VenueTakingsController {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final ViewDailyTakings viewDailyTakings;
	private final CurrentOperator currentOperator;
	private final Clock clock;

	VenueTakingsController(ViewDailyTakings viewDailyTakings, CurrentOperator currentOperator, Clock clock) {
		this.viewDailyTakings = viewDailyTakings;
		this.currentOperator = currentOperator;
		this.clock = clock;
	}

	@GetMapping("/{venueId}/takings")
	TakingsResponse takings(Authentication authentication, @PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = currentOperator.require(authentication);
		LocalDate effectiveDate = date != null ? date : LocalDate.ofInstant(clock.instant(), TIRANE);
		return TakingsResponse.of(viewDailyTakings.forVenueOn(operator, new VenueId(venueId), effectiveDate));
	}
}
