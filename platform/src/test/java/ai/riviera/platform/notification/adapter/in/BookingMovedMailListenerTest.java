package ai.riviera.platform.notification.adapter.in;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.BookingMoved;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingMoveFacts;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The changed-spot notice: the contact, code and venue resolve on the set the booking now holds, the
 * spots, distance and deadline come from {@code booking}'s move facts, the link is the code-gated view;
 * a missing fact — or a booking with no move on record — is counted and abandoned, never thrown.
 */
class BookingMovedMailListenerTest {

	private static final BookingId BOOKING_ID = new BookingId(84L);
	private static final SetId FROM = new SetId(9L);
	private static final SetId TO = new SetId(12L);
	private static final String CODE = "QQ7R3M5T";
	private static final String EMAIL = "tourist@example.com";
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 9, 20);
	private static final Instant MOVED_AT = Instant.parse("2026-09-10T13:00:00Z");
	private static final Instant DEADLINE = Instant.parse("2026-09-11T13:00:00Z");

	private static final BookingMoved EVENT = new BookingMoved(BOOKING_ID, new VenueId(4L), FROM, TO, BOOKING_DATE);
	private static final BookingMailFacts.Resolved FACTS = new BookingMailFacts.Resolved(EMAIL, CODE, "Vala Beach", "A", 7);
	private static final BookingMoveFacts MOVE = new BookingMoveFacts(BOOKING_DATE, "A", 3, "A", 7, 0, 4, MOVED_AT, DEADLINE);

	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final BookingMovedMailListener listener = new BookingMovedMailListener(facts, bookings, mails,
			new BookingLinks("https://riviera.example"), meters);

	@Test
	void mailsTheResolvedContactBothSpotsTheDistanceAndTheDeadline() {
		when(facts.resolve(BOOKING_ID, TO)).thenReturn(FACTS);
		when(bookings.moveFacts(BOOKING_ID)).thenReturn(Optional.of(MOVE));

		listener.on(EVENT);

		verify(mails).sendBookingMoved(EMAIL, new BookingMovedMail(CODE, "Vala Beach", BOOKING_DATE, "A", 3, "A", 7,
				0, 4, DEADLINE, URI.create("https://riviera.example/booking/" + CODE)));
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void anyMissingFactIsCountedUnderItsOwnReasonAndAbandoned(MissingBookingFact fact) {
		when(facts.resolve(BOOKING_ID, TO)).thenReturn(new BookingMailFacts.Missing(fact));

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(meters.counter(ObservabilityMetrics.MAIL_MOVE_ABANDONED, MissingBookingFact.TAG, fact.tagValue())
				.count()).isEqualTo(1.0);
		verifyNoInteractions(mails);
	}

	@Test
	void aBookingWithNoMoveOnRecordIsAbandonedAsANoBookingFact() {
		when(facts.resolve(BOOKING_ID, TO)).thenReturn(FACTS);
		when(bookings.moveFacts(BOOKING_ID)).thenReturn(Optional.empty());

		listener.on(EVENT);

		assertThat(meters.counter(ObservabilityMetrics.MAIL_MOVE_ABANDONED, MissingBookingFact.TAG,
				MissingBookingFact.NO_BOOKING.tagValue()).count()).isEqualTo(1.0);
		verifyNoInteractions(mails);
	}
}
