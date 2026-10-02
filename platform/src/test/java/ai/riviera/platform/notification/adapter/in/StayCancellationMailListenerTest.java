package ai.riviera.platform.notification.adapter.in;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.StayCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.booking.vocabulary.StayConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.StayCancellationMailFacts;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The stay cancellation listener over stubbed collaborators: it hands the event's summed refund and reason
 * to the resolver, counts an abandonment under the cancellation series, logs ids only, and lets a
 * transport failure propagate. {@code StayCancellationMailIT} covers the registry path end-to-end.
 */
class StayCancellationMailListenerTest {

	private static final StayId STAY = new StayId(9L);
	private static final String CODE = "STAYCODE";
	private static final StayCancelled EVENT = new StayCancelled(STAY, 6750, "EUR", RefundReason.POLICY);
	private static final StayConfirmationFacts FACTS = new StayConfirmationFacts(STAY, CODE, new CustomerId(5L),
			List.of(new StayConfirmationFacts.Stop(new BookingId(41L), new SetId(1L), LocalDate.of(2026, 8, 1),
					LocalDate.of(2026, 8, 4))),
			18000, "EUR", true, CancellationWindow.FREE, 0);
	private static final BookingCancellationMail MAIL = new BookingCancellationMail(CODE, "Vala Beach",
			LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 4), 6750, "EUR", RefundReason.POLICY, null);

	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final StayCancellationMailListener listener =
			new StayCancellationMailListener(bookings, facts, mails, meters);

	private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
	private ch.qos.logback.classic.Logger logger;

	@BeforeEach
	void theStayResolves() {
		when(bookings.stayConfirmationFacts(STAY)).thenReturn(Optional.of(FACTS));
		logger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(StayCancellationMailListener.class);
		logged.start();
		logger.addAppender(logged);
	}

	@AfterEach
	void releaseLogs() {
		logger.detachAppender(logged);
		logged.stop();
	}

	@Test
	void mailsTheStayOnceWithTheEventsSummedRefund() {
		when(facts.resolveStayCancellation(FACTS, 6750, "EUR", RefundReason.POLICY, false))
				.thenReturn(new StayCancellationMailFacts.Resolved("guest@example.com", MAIL));

		listener.on(EVENT);

		verify(mails).sendBookingCancellation("guest@example.com", MAIL);
		assertThat(meters.find(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED).counters()).isEmpty();
	}

	@Test
	void aGuestsOwnCancelNeverAsksWhetherARemodelEndedIt() {
		when(facts.resolveStayCancellation(FACTS, 6750, "EUR", RefundReason.POLICY, false))
				.thenReturn(new StayCancellationMailFacts.Resolved("guest@example.com", MAIL));

		listener.on(EVENT);

		verify(bookings, never()).endedByRemodel(any());
	}

	/** #1292: a stay a remodel released ends under {@code VENUE_CHANGE} with no refund, and its mail offers the way back. */
	@Test
	void aStayARemodelReleasedCarriesARebookLink() {
		StayCancelled released = new StayCancelled(STAY, 0, "EUR", RefundReason.VENUE_CHANGE);
		when(bookings.endedByRemodel(new BookingId(41L))).thenReturn(true);
		when(facts.resolveStayCancellation(FACTS, 0, "EUR", RefundReason.VENUE_CHANGE, true))
				.thenReturn(new StayCancellationMailFacts.Resolved("guest@example.com", MAIL));

		listener.on(released);

		verify(mails).sendBookingCancellation("guest@example.com", MAIL);
	}

	@Test
	void aFreeExitAfterAMoveIsTheSameReasonWithNoWayBack() {
		StayCancelled freeExit = new StayCancelled(STAY, 18000, "EUR", RefundReason.VENUE_CHANGE);
		when(bookings.endedByRemodel(new BookingId(41L))).thenReturn(false);
		when(facts.resolveStayCancellation(FACTS, 18000, "EUR", RefundReason.VENUE_CHANGE, false))
				.thenReturn(new StayCancellationMailFacts.Resolved("guest@example.com", MAIL));

		listener.on(freeExit);

		verify(mails).sendBookingCancellation("guest@example.com", MAIL);
	}

	@Test
	void aTransportFailurePropagatesToKeepThePublicationOpen() {
		when(facts.resolveStayCancellation(FACTS, 6750, "EUR", RefundReason.POLICY, false))
				.thenReturn(new StayCancellationMailFacts.Resolved("guest@example.com", MAIL));
		doThrow(new IllegalStateException("smtp down")).when(mails).sendBookingCancellation("guest@example.com", MAIL);

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void aMissingFactIsCountedUnderTheCancellationSeriesAndLogsNoCode() {
		when(facts.resolveStayCancellation(FACTS, 6750, "EUR", RefundReason.POLICY, false))
				.thenReturn(new StayCancellationMailFacts.Missing(MissingBookingFact.NO_CONTACT));

		listener.on(EVENT);

		assertThat(abandoned(MissingBookingFact.NO_CONTACT)).isEqualTo(1.0);
		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
		verifyNoInteractions(mails);
		assertThat(logged.list).singleElement().satisfies(line -> {
			assertThat(line.getFormattedMessage()).contains("stay 9").doesNotContain(CODE);
		});
	}

	@Test
	void anUnknownStayIsCountedAsNoBooking() {
		when(bookings.stayConfirmationFacts(STAY)).thenReturn(Optional.empty());

		listener.on(EVENT);

		assertThat(abandoned(MissingBookingFact.NO_BOOKING)).isEqualTo(1.0);
		verifyNoInteractions(facts, mails);
	}

	private double abandoned(MissingBookingFact fact) {
		return meters.counter(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED, MissingBookingFact.TAG,
				fact.tagValue()).count();
	}
}
