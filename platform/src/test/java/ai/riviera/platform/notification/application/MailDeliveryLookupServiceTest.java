package ai.riviera.platform.notification.application;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.api.CustomerBookings;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CustomerBookingSummary;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The assembly behind the admin mail-delivery view: address → guest contact → bookings →
 * attempts, with the venue name read live.
 *
 * <p>Three of these specs pin decisions rather than mechanics. The <strong>same empty answer</strong>
 * for an unknown address and for a known one with no bookings is what stops the surface being an
 * address oracle. The <strong>single</strong> attempt read for the whole page is why a 20-booking lookup
 * is not 21 round trips. And a <strong>set that no longer resolves</strong> still lists its booking:
 * the attempt history is the point of the row, so losing the venue name must not lose the answer.
 */
class MailDeliveryLookupServiceTest {

	private static final String EMAIL = "tourist@example.com";
	private static final CustomerId GUEST = new CustomerId(9L);
	private static final BookingId FIRST = new BookingId(41L);
	private static final BookingId SECOND = new BookingId(42L);
	private static final SetId SET = new SetId(7L);

	private final CustomerLookup customers = mock(CustomerLookup.class);
	private final CustomerBookings customerBookings = mock(CustomerBookings.class);
	private final ConfirmationMailAttempts attempts = mock(ConfirmationMailAttempts.class);
	private final SetBookingFacts sets = mock(SetBookingFacts.class);

	private final MailDeliveryLookupService service =
			new MailDeliveryLookupService(customers, customerBookings, attempts, sets);

	@Test
	void pairsEachBookingWithItsOwnAttempts() {
		givenTheGuestHas(booking(FIRST, LocalDate.of(2026, 8, 1)), booking(SECOND, LocalDate.of(2026, 8, 2)));
		givenTheVenueIsNamed("Vala Beach");
		when(attempts.historyFor(List.of(FIRST, SECOND))).thenReturn(List.of(
				attempt(SECOND, MailAttemptOutcome.SENT), attempt(FIRST, MailAttemptOutcome.WITHHELD_SUPPRESSED)));

		List<MailDeliveryBooking> found = service.forEmail(EMAIL);

		assertThat(found).extracting(MailDeliveryBooking::bookingId).containsExactly(FIRST, SECOND);
		assertThat(found.getFirst().attempts()).extracting(MailAttempt::outcome)
				.containsExactly(MailAttemptOutcome.WITHHELD_SUPPRESSED);
		assertThat(found.getLast().attempts()).extracting(MailAttempt::outcome)
				.containsExactly(MailAttemptOutcome.SENT);
		assertThat(found.getFirst().venueName()).isEqualTo("Vala Beach");
	}

	/** A confirmed booking with nothing recorded is a real state (it predates V36) — an empty list, not a gap. */
	@Test
	void listsABookingWithNoRecordedAttempts() {
		givenTheGuestHas(booking(FIRST, LocalDate.of(2026, 8, 1)));
		givenTheVenueIsNamed("Vala Beach");
		when(attempts.historyFor(List.of(FIRST))).thenReturn(List.of());

		assertThat(service.forEmail(EMAIL)).singleElement()
				.satisfies(booking -> assertThat(booking.attempts()).isEmpty());
	}

	@Test
	void answersAnEmptyListForAnUnknownAddressWithoutReadingAnythingElse() {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.empty());

		assertThat(service.forEmail(EMAIL)).isEmpty();

		verifyNoInteractions(customerBookings);
		verifyNoInteractions(attempts);
	}

	/**
	 * Byte-for-byte the same answer as the unknown address above — deliberately indistinguishable, so an
	 * admin surface cannot be read as an "is this address known" oracle.
	 */
	@Test
	void answersTheSameEmptyListForAKnownAddressWithNoBookings() {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.of(GUEST));
		when(customerBookings.forCustomer(GUEST)).thenReturn(List.of());

		assertThat(service.forEmail(EMAIL)).isEmpty();

		verifyNoInteractions(attempts);
	}

	/** One read for the page, not one per booking — the reason the 20-booking cap is not 21 round trips. */
	@Test
	void readsTheAttemptsOnceForEveryBookingOnThePage() {
		givenTheGuestHas(booking(FIRST, LocalDate.of(2026, 8, 1)), booking(SECOND, LocalDate.of(2026, 8, 2)));
		givenTheVenueIsNamed("Vala Beach");
		when(attempts.historyFor(any())).thenReturn(List.of());

		service.forEmail(EMAIL);

		verify(attempts).historyFor(List.of(FIRST, SECOND));
	}

	@Test
	void stillListsABookingWhoseSetNoLongerResolves() {
		givenTheGuestHas(booking(FIRST, LocalDate.of(2026, 8, 1)));
		when(sets.setBookingInfo(SET)).thenReturn(Optional.empty());
		when(attempts.historyFor(List.of(FIRST))).thenReturn(List.of(attempt(FIRST, MailAttemptOutcome.SENT)));

		assertThat(service.forEmail(EMAIL)).singleElement().satisfies(booking -> {
			assertThat(booking.venueName()).isEqualTo("Unknown venue");
			assertThat(booking.attempts()).hasSize(1);
		});
	}

	@Test
	void carriesWhetherAConfirmationWasEverDue() {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.of(GUEST));
		when(customerBookings.forCustomer(GUEST)).thenReturn(List.of(
				new CustomerBookingSummary(FIRST, SET, LocalDate.of(2026, 8, 1), false)));
		givenTheVenueIsNamed("Vala Beach");
		when(attempts.historyFor(List.of(FIRST))).thenReturn(List.of());

		assertThat(service.forEmail(EMAIL)).singleElement()
				.satisfies(booking -> assertThat(booking.everConfirmed()).isFalse());
	}

	private void givenTheGuestHas(CustomerBookingSummary... bookings) {
		when(customers.findByEmail(EMAIL)).thenReturn(Optional.of(GUEST));
		when(customerBookings.forCustomer(GUEST)).thenReturn(List.of(bookings));
	}

	private void givenTheVenueIsNamed(String venueName) {
		when(sets.setBookingInfo(SET)).thenReturn(Optional.of(
				new SetBookingInfo(SET, new VenueId(3L), venueName, "A", 3, "ONLINE",
						new MoneyView(4500, "EUR"), LocalTime.of(18, 0), BookingMode.INSTANT)));
	}

	private static CustomerBookingSummary booking(BookingId id, LocalDate date) {
		return new CustomerBookingSummary(id, SET, date, true);
	}

	private static MailAttempt attempt(BookingId id, MailAttemptOutcome outcome) {
		return new MailAttempt(id, MailAttemptSource.AUTOMATIC, outcome,
				Instant.parse("2026-07-29T14:02:11Z"));
	}
}
