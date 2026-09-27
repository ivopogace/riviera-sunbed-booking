package ai.riviera.platform.notification.adapter.in;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.StayConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.ConfirmationAttemptRecorder;
import ai.riviera.platform.notification.application.ConfirmationSendOutcome;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.StayConfirmationMail;
import ai.riviera.platform.notification.application.StayMailFacts;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The stay listener's own behaviour over stubbed collaborators: it hands the event's frozen birth terms
 * to the resolver, logs each outcome once per stretch the mail covers, counts an abandonment under its
 * reason, and lets a transport failure propagate after recording it. {@code StayConfirmationMailIT}
 * covers the registry path end-to-end.
 */
class StayConfirmationMailListenerTest {

	private static final StayId STAY = new StayId(9L);
	private static final StayConfirmed EVENT = new StayConfirmed(STAY, CancellationWindow.LATE, 2500);
	private static final List<BookingId> STRETCHES = List.of(new BookingId(41L), new BookingId(42L));
	private static final StayConfirmationFacts FACTS = new StayConfirmationFacts(STAY, "STAYCODE", new CustomerId(5L),
			List.of(new StayConfirmationFacts.Stop(STRETCHES.get(0), new SetId(1L), LocalDate.of(2026, 8, 1),
							LocalDate.of(2026, 8, 2)),
					new StayConfirmationFacts.Stop(STRETCHES.get(1), new SetId(2L), LocalDate.of(2026, 8, 3),
							LocalDate.of(2026, 8, 4))),
			18000, "EUR", true, CancellationWindow.FREE, 0);
	private static final StayConfirmationMail MAIL = new StayConfirmationMail("STAYCODE", "Vala Beach",
			LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 4), List.of(), 18000, "EUR", CancellationWindow.LATE, 2500);

	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final ConfirmationAttemptRecorder attempts = mock(ConfirmationAttemptRecorder.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final StayConfirmationMailListener listener =
			new StayConfirmationMailListener(bookings, facts, mails, attempts, meters);

	@BeforeEach
	void theStayResolves() {
		when(bookings.stayConfirmationFacts(STAY)).thenReturn(Optional.of(FACTS));
	}

	@Test
	void sendsWithTheEventsBirthTermsAndLogsEveryStretch() {
		when(facts.resolveStay(FACTS, CancellationWindow.LATE, 2500))
				.thenReturn(new StayMailFacts.Resolved("guest@example.com", MAIL));
		when(mails.sendStayConfirmation("guest@example.com", MAIL)).thenReturn(ConfirmationSendOutcome.SENT);

		listener.on(EVENT);

		verify(attempts).recordAttempts(STRETCHES, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.SENT);
		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
	}

	@Test
	void aTransportFailureIsRecordedThenPropagated() {
		when(facts.resolveStay(FACTS, CancellationWindow.LATE, 2500))
				.thenReturn(new StayMailFacts.Resolved("guest@example.com", MAIL));
		when(mails.sendStayConfirmation("guest@example.com", MAIL)).thenThrow(new IllegalStateException("smtp down"));

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);

		verify(attempts).recordAttempts(STRETCHES, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.TRANSPORT_FAILED);
	}

	@Test
	void aMissingFactIsCountedAndAbandonedOnEveryStretch() {
		when(facts.resolveStay(FACTS, CancellationWindow.LATE, 2500))
				.thenReturn(new StayMailFacts.Missing(MissingBookingFact.NO_CONTACT));

		listener.on(EVENT);

		verify(attempts).recordAttempts(STRETCHES, MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
		assertThat(abandoned(MissingBookingFact.NO_CONTACT)).isEqualTo(1.0);
		verifyNoInteractions(mails);
	}

	@Test
	void anUnknownStayIsCountedAsNoBooking() {
		when(bookings.stayConfirmationFacts(STAY)).thenReturn(Optional.empty());

		listener.on(EVENT);

		assertThat(abandoned(MissingBookingFact.NO_BOOKING)).isEqualTo(1.0);
		verifyNoInteractions(facts, mails);
	}

	private double abandoned(MissingBookingFact fact) {
		return meters.counter(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED, MissingBookingFact.TAG,
				fact.tagValue()).count();
	}
}
