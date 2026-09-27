package ai.riviera.platform.notification.adapter.in;

import java.net.URI;
import java.time.LocalDate;
import java.util.Optional;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.StayMoveDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.vocabulary.StayMoveFacts;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.MoveReminderMail;
import ai.riviera.platform.notification.application.MoveReminderMailFacts;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The move-reminder listener over stubbed collaborators: the event's stretch resolves to the move facts,
 * the resolver gets the code-gated link, the mail leaves through the chokepoint; a missing fact — or a
 * move that no longer stands — is counted and abandoned, never thrown; a transport failure propagates.
 * {@code MoveReminderMailIT} covers the registry path end-to-end.
 */
class StayMoveReminderMailListenerTest {

	private static final StayId STAY = new StayId(9L);
	private static final BookingId ARRIVING = new BookingId(42L);
	private static final LocalDate MOVE_DAY = LocalDate.of(2026, 8, 13);
	private static final StayMoveDue EVENT = new StayMoveDue(STAY, ARRIVING, MOVE_DAY);
	private static final StayMoveFacts MOVE = new StayMoveFacts(STAY, "STAYCODE", new CustomerId(5L), MOVE_DAY,
			MOVE_DAY.plusDays(2), new SetId(1L), new SetId(2L), 1, 3);
	private static final URI LINK = URI.create("https://riviera.example/booking/STAYCODE");
	private static final MoveReminderMail MAIL = new MoveReminderMail("STAYCODE", "Vala Beach", MOVE_DAY,
			MOVE_DAY.plusDays(2), "A", 3, "B", 6, 1, 3, LINK);

	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final StayMoveReminderMailListener listener = new StayMoveReminderMailListener(bookings, facts, mails,
			new BookingLinks("https://riviera.example"), meters);

	@Test
	void mailsTheResolvedContactTomorrowsSpotWithTheLink() {
		when(bookings.moveReminderFacts(ARRIVING)).thenReturn(Optional.of(MOVE));
		when(facts.resolveMoveReminder(MOVE, LINK)).thenReturn(new MoveReminderMailFacts.Resolved("guest@example.com", MAIL));

		listener.on(EVENT);

		verify(mails).sendMoveReminder("guest@example.com", MAIL);
		assertThat(meters.find(ObservabilityMetrics.MAIL_MOVE_REMINDER_ABANDONED).counters()).isEmpty();
	}

	@Test
	void aTransportFailurePropagatesSoTheRegistryRetries() {
		when(bookings.moveReminderFacts(ARRIVING)).thenReturn(Optional.of(MOVE));
		when(facts.resolveMoveReminder(MOVE, LINK)).thenReturn(new MoveReminderMailFacts.Resolved("guest@example.com", MAIL));
		org.mockito.Mockito.doThrow(new IllegalStateException("smtp down")).when(mails)
				.sendMoveReminder("guest@example.com", MAIL);

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void anyMissingFactIsCountedUnderItsOwnReasonAndAbandoned(MissingBookingFact fact) {
		when(bookings.moveReminderFacts(ARRIVING)).thenReturn(Optional.of(MOVE));
		when(facts.resolveMoveReminder(any(), any())).thenReturn(new MoveReminderMailFacts.Missing(fact));

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(abandoned(fact)).isEqualTo(1.0);
		verifyNoInteractions(mails);
	}

	@Test
	void aMoveThatNoLongerStandsIsAbandonedAsANoBookingFact() {
		when(bookings.moveReminderFacts(ARRIVING)).thenReturn(Optional.empty());

		listener.on(EVENT);

		assertThat(abandoned(MissingBookingFact.NO_BOOKING)).isEqualTo(1.0);
		verifyNoInteractions(facts, mails);
	}

	private double abandoned(MissingBookingFact fact) {
		return meters.counter(ObservabilityMetrics.MAIL_MOVE_REMINDER_ABANDONED, MissingBookingFact.TAG, fact.tagValue())
				.count();
	}
}
