package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;
import java.util.OptionalInt;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Verifies the pre-reserve terms quote (#795, AC-1..3): the window the booking would be born in,
 * the free-cancellation deadline as an {@code Instant}, and the venue's late share — quoted "now"
 * against a fixed clock, before any booking exists. Pure unit test (real {@link BookingCutoff},
 * mocked {@code venue::api} ports).
 */
class CancellationPolicyTermsTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final SetId SET = new SetId(77L);
	private static final VenueId VENUE = new VenueId(9L);
	private static final LocalDate DATE = LocalDate.of(2026, 8, 30);
	private static final LocalTime CUTOFF = LocalTime.of(18, 0);

	private final SetBookingFacts setFacts = mock(SetBookingFacts.class);
	private final VenueRates rates = mock(VenueRates.class);

	private CancellationPolicy policyAt(ZonedDateTime tiraneNow) {
		return new CancellationPolicy(setFacts, rates,
				new BookingCutoff(Clock.fixed(tiraneNow.toInstant(), ZoneId.of("UTC"))));
	}

	private void givenSet() {
		when(setFacts.setBookingInfo(SET)).thenReturn(Optional.of(new SetBookingInfo(SET, VENUE,
				"Blue Marlin", "A", 1, Pool.ONLINE, new MoneyView(4500, "EUR"), CUTOFF,
				LocalTime.of(16, 0), BookingMode.INSTANT)));
	}

	@Test
	void freeWindowQuotesDeadline() {
		givenSet();
		CancellationTerms terms =
				policyAt(ZonedDateTime.of(2026, 8, 28, 9, 0, 0, 0, TIRANE)).terms(SET, DATE)
						.orElseThrow();
		assertEquals(CancellationWindow.FREE, terms.window());
		assertEquals(ZonedDateTime.of(2026, 8, 29, 18, 0, 0, 0, TIRANE).toInstant(),
				terms.freeCancellationEndsAt());
		assertEquals(0, terms.lateCancelRefundBps());
	}

	@Test
	void lateWindowCarriesVenueShare() {
		givenSet();
		when(rates.lateCancelRefundBps(VENUE)).thenReturn(OptionalInt.of(2500));
		CancellationTerms terms =
				policyAt(ZonedDateTime.of(2026, 8, 29, 21, 0, 0, 0, TIRANE)).terms(SET, DATE)
						.orElseThrow();
		assertEquals(CancellationWindow.LATE, terms.window());
		assertEquals(2500, terms.lateCancelRefundBps());
	}

	@Test
	void sameDayQuotesClosed() {
		givenSet();
		CancellationTerms terms =
				policyAt(ZonedDateTime.of(2026, 8, 30, 9, 0, 0, 0, TIRANE)).terms(SET, DATE)
						.orElseThrow();
		assertEquals(CancellationWindow.CLOSED, terms.window());
		assertEquals(0, terms.lateCancelRefundBps());
	}

	@Test
	void unknownSetQuotesNothing() {
		// Empty, not a throw: a stale map in a tourist's hands is an expected flow (unlike quote's FK breach).
		when(setFacts.setBookingInfo(SET)).thenReturn(Optional.empty());
		assertTrue(policyAt(ZonedDateTime.of(2026, 8, 28, 9, 0, 0, 0, TIRANE)).terms(SET, DATE)
				.isEmpty());
	}
}
