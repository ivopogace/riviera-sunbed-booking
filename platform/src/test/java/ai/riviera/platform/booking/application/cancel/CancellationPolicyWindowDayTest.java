package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.OptionalInt;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy.RefundQuote;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SeasonClosure;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * A stretch of a stitched stay is quoted with the window judged on the stay's first day, not its own
 * (ADR-0024, invariant #10): the later stretch of a stay that starts tomorrow is LATE like the stay,
 * although its own first day is still days off. Pure unit test, fixed clock.
 */
class CancellationPolicyWindowDayTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final SetId SET = new SetId(77L);
	private static final VenueId VENUE = new VenueId(9L);
	private static final LocalDate STAY_FIRST_DAY = LocalDate.of(2026, 8, 30);
	private static final LocalDate STRETCH_FIRST_DAY = LocalDate.of(2026, 9, 2);

	private final SetBookingFacts setFacts = mock(SetBookingFacts.class);
	private final VenueRates rates = mock(VenueRates.class);

	private CancellationPolicy policyAt(ZonedDateTime tiraneNow) {
		Clock clock = Clock.fixed(tiraneNow.toInstant(), ZoneId.of("UTC"));
		when(setFacts.setBookingInfo(SET)).thenReturn(Optional.of(new SetBookingInfo(SET, VENUE,
				"Blue Marlin", "A", 1, Pool.ONLINE, new MoneyView(4500, "EUR"), LocalTime.of(18, 0),
				LocalTime.of(16, 0), BookingMode.INSTANT, SeasonClosure.open(), null)));
		when(rates.lateCancelRefundBps(VENUE)).thenReturn(OptionalInt.of(2500));
		return new CancellationPolicy(setFacts, rates, new BookingCutoff(clock), clock);
	}

	private static BookingRecord laterStretch() {
		return new BookingRecord(2L, "STAY-2", BookingStatus.CONFIRMED, VENUE, SET, new CustomerId(5L),
				STRETCH_FIRST_DAY, STRETCH_FIRST_DAY.plusDays(2), 13500, "EUR", null, null, null, null,
				Instant.parse("2026-08-20T10:00:00Z"), null, null);
	}

	@Test
	void aLaterStretchIsQuotedOnTheStaysFirstDay() {
		CancellationPolicy policy = policyAt(ZonedDateTime.of(2026, 8, 29, 21, 0, 0, 0, TIRANE));

		RefundQuote onItsOwnDay = policy.quote(laterStretch());
		RefundQuote onTheStaysDay = policy.quote(laterStretch(), STAY_FIRST_DAY);

		assertEquals(CancellationWindow.FREE, onItsOwnDay.window(), "alone, the stretch would still be free to cancel");
		assertEquals(13500, onItsOwnDay.refundMinor());
		assertEquals(CancellationWindow.LATE, onTheStaysDay.window(), "as part of the stay it is LATE, like the stay");
		assertEquals(3375, onTheStaysDay.refundMinor(), "the venue's late share of the stretch, 25%");
	}
}
