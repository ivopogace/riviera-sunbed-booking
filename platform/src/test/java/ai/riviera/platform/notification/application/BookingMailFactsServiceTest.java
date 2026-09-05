package ai.riviera.platform.notification.application;

import java.time.LocalTime;
import java.util.Optional;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The assembly every booking mail needs, and the one thing it must say when it cannot finish.
 * Extracted from {@code BookingConfirmationMailListener} so the cancellation listener is a
 * second <em>caller</em> rather than a second copy — the duplication that would otherwise be
 * literal, down to the field block and the three reason literals.
 *
 * <p>The ordering specs are not ceremony. Short-circuiting is a <strong>preserved</strong> behavior
 * of the listener this service was carved out of: a missing booking must not go on to query
 * {@code venue} and {@code customer}, both because the reads are pointless and because the reason
 * an operator is handed has to name the <em>first</em> fact that failed, not the last. Nothing else
 * in the suite would notice if the extraction quietly made all three reads unconditional.
 */
class BookingMailFactsServiceTest {

	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final SetId SET_ID = new SetId(7L);
	private static final CustomerId CUSTOMER_ID = new CustomerId(11L);

	private static final BookingNotificationInfo BOOKING =
			new BookingNotificationInfo("ABCD2345", CUSTOMER_ID);
	private static final SetBookingInfo SET = new SetBookingInfo(SET_ID, new VenueId(3L), "Vala Beach",
			"A", 3, Pool.ONLINE, new MoneyView(4500, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0),
			BookingMode.INSTANT);
	private static final GuestContact CONTACT =
			new GuestContact("tourist@example.com", "Tourist", "+355691234567");

	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final SetBookingFacts sets = mock(SetBookingFacts.class);
	private final CustomerLookup customers = mock(CustomerLookup.class);

	private final BookingMailFactsService facts = new BookingMailFactsService(bookings, sets, customers);

	@Test
	void resolvesEveryFactAMailRenders() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.of(BOOKING));
		when(sets.setBookingInfo(SET_ID)).thenReturn(Optional.of(SET));
		when(customers.findById(CUSTOMER_ID)).thenReturn(Optional.of(CONTACT));

		BookingMailFacts resolved = facts.resolve(BOOKING_ID, SET_ID);

		assertThat(resolved).isEqualTo(new BookingMailFacts.Resolved(
				"tourist@example.com", "ABCD2345", "Vala Beach", "A", 3));
	}

	@Test
	void aMissingBookingIsNamedAndStopsTheOtherTwoReads() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.empty());

		assertThat(facts.resolve(BOOKING_ID, SET_ID))
				.isEqualTo(new BookingMailFacts.Missing(MissingBookingFact.NO_BOOKING));
		verifyNoInteractions(sets, customers);
	}

	@Test
	void aMissingSetIsNamedAndStopsTheContactRead() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.of(BOOKING));
		when(sets.setBookingInfo(SET_ID)).thenReturn(Optional.empty());

		assertThat(facts.resolve(BOOKING_ID, SET_ID))
				.isEqualTo(new BookingMailFacts.Missing(MissingBookingFact.NO_SET));
		verifyNoInteractions(customers);
	}

	@Test
	void aMissingContactIsNamed() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.of(BOOKING));
		when(sets.setBookingInfo(SET_ID)).thenReturn(Optional.of(SET));
		when(customers.findById(CUSTOMER_ID)).thenReturn(Optional.empty());

		assertThat(facts.resolve(BOOKING_ID, SET_ID))
				.isEqualTo(new BookingMailFacts.Missing(MissingBookingFact.NO_CONTACT));
	}

	/**
	 * The tag values are the metric vocabulary both abandon counters are read through, and the
	 * observability runbook tells an on-call reader to filter on them by name. Changing one breaks a
	 * dashboard rather than renaming a constant — the {@code MailKind} argument, applied to
	 * the dimension those two counters do <em>not</em> share.
	 */
	@Test
	void theReasonVocabularyIsTheShippedOne() {
		assertThat(MissingBookingFact.NO_BOOKING.tagValue()).isEqualTo("no-booking");
		assertThat(MissingBookingFact.NO_SET.tagValue()).isEqualTo("no-set");
		assertThat(MissingBookingFact.NO_CONTACT.tagValue()).isEqualTo("no-contact");
		assertThat(MissingBookingFact.TAG).isEqualTo("reason");
	}
}
