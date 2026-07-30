package ai.riviera.platform.notification.adapter.in;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The cancellation listener's own logic (#374): what it puts in the message, and what it does when a
 * fact it needs is missing. The end-to-end registry path is {@code BookingCancellationMailIT}'s;
 * these are three collaborators and no Spring context.
 *
 * <p><strong>The abandoned paths are counted under their own metric, not the confirmation's</strong>
 * — {@link ObservabilityMetrics#MAIL_CANCELLATION_ABANDONED}. The two losses are not the same event
 * and must not be summed: one is a tourist with no arrival code, the other a tourist with no written
 * record of money owed back. The specs below assert both halves of that separation, because a
 * copy-paste of the confirmation listener would pass every other assertion here while quietly
 * incrementing the wrong series.
 *
 * <p>The {@code reason} vocabulary <em>is</em> shared, deliberately (#442): both series are read
 * through the same three tag values, so a runbook filter written for one works on the other.
 */
class BookingCancellationMailListenerTest {

	private static final BookingId BOOKING_ID = new BookingId(84L);
	private static final SetId SET_ID = new SetId(9L);
	private static final String CODE = "QQ7R3M5T";
	private static final String EMAIL = "tourist@example.com";
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 8, 12);

	private static final BookingCancelled EVENT = new BookingCancelled(BOOKING_ID, new VenueId(4L),
			SET_ID, BOOKING_DATE, 4500, "EUR", RefundReason.POLICY);
	private static final BookingMailFacts.Resolved FACTS =
			new BookingMailFacts.Resolved(EMAIL, CODE, "Vala Beach", "A", 3);

	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final BookingCancellationMailListener listener =
			new BookingCancellationMailListener(facts, mails, meters);

	private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
	private ch.qos.logback.classic.Logger logger;

	@BeforeEach
	void captureLogs() {
		logger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(BookingCancellationMailListener.class);
		logged.start();
		logger.addAppender(logged);
	}

	@AfterEach
	void releaseLogs() {
		logger.detachAppender(logged);
		logged.stop();
	}

	/**
	 * Every field the mail renders, in its own slot: the three the event owns (date, refund, currency
	 * — plus the reason that decides the copy) and the two resolved by port. Asserted as a whole
	 * record because positional records make a transposition of same-typed neighbours invisible to the
	 * compiler.
	 */
	@Test
	void mailsTheResolvedContactTheCancellationRecord() {
		givenTheFactsAre(FACTS);

		listener.on(EVENT);

		verify(mails).sendBookingCancellation(EMAIL, new BookingCancellationMail(
				CODE, "Vala Beach", BOOKING_DATE, 4500, "EUR", RefundReason.POLICY));
	}

	/** The refund is the event's number, never re-derived — invariant #10 has one owner, upstream. */
	@Test
	void carriesTheEventsRefundVerbatimIncludingZero() {
		givenTheFactsAre(FACTS);
		BookingCancelled nothingRefunded = new BookingCancelled(BOOKING_ID, new VenueId(4L), SET_ID,
				BOOKING_DATE, 0, "EUR", RefundReason.POLICY);

		listener.on(nothingRefunded);

		verify(mails).sendBookingCancellation(EMAIL, new BookingCancellationMail(
				CODE, "Vala Beach", BOOKING_DATE, 0, "EUR", RefundReason.POLICY));
	}

	/** AC-3: one event, every channel — the reason reaches the transport rather than being flattened. */
	@ParameterizedTest(name = "{0}")
	@EnumSource(RefundReason.class)
	void everyCancellationChannelMails(RefundReason reason) {
		givenTheFactsAre(FACTS);
		BookingCancelled event = new BookingCancelled(BOOKING_ID, new VenueId(4L), SET_ID,
				BOOKING_DATE, 4500, "EUR", reason);

		listener.on(event);

		verify(mails).sendBookingCancellation(EMAIL, new BookingCancellationMail(
				CODE, "Vala Beach", BOOKING_DATE, 4500, "EUR", reason));
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void anyMissingFactIsCountedUnderItsOwnReasonAndAbandoned(MissingBookingFact fact) {
		givenTheFactsAre(new BookingMailFacts.Missing(fact));

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(abandoned(fact.tagValue())).isEqualTo(1.0);
		assertThat(meters.find(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED).counters()).hasSize(1);
		verifyNoInteractions(mails);
	}

	/**
	 * The separation, asserted from the other side. Incrementing the confirmation counter here would
	 * inflate a series the runbook tells an operator to read as "a tourist has no arrival code", and
	 * would leave this loss invisible — the failure a copy-paste makes and nothing else catches.
	 */
	@Test
	void neverTouchesTheConfirmationCounter() {
		givenTheFactsAre(new BookingMailFacts.Missing(MissingBookingFact.NO_CONTACT));

		listener.on(EVENT);

		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void everyAbandonedPathLogsAnErrorCarryingNoCredential(MissingBookingFact fact) {
		givenTheFactsAre(new BookingMailFacts.Missing(fact));

		listener.on(EVENT);

		List<ILoggingEvent> events = logged.list;
		assertThat(events).hasSize(1);
		assertThat(events.getFirst().getLevel()).isEqualTo(Level.ERROR);
		assertThat(events.getFirst().getFormattedMessage())
				.contains(fact.tagValue())
				.contains(String.valueOf(BOOKING_ID.value()))
				.contains(String.valueOf(SET_ID.value()))
				.doesNotContain(CODE)
				.doesNotContain(EMAIL);
	}

	/**
	 * AC-6: the throw is what leaves the publication outstanding for the restart republish. It is also
	 * not an abandonment — counting it would make a relay outage read as a data-integrity fault, which
	 * is the one thing the runbook says this counter never means.
	 */
	@Test
	void aTransportFailurePropagates() {
		givenTheFactsAre(FACTS);
		doThrow(new IllegalStateException("relay down")).when(mails).sendBookingCancellation(any(), any());

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);

		assertThat(meters.find(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED).counters()).isEmpty();
	}

	private void givenTheFactsAre(BookingMailFacts outcome) {
		when(facts.resolve(BOOKING_ID, SET_ID)).thenReturn(outcome);
	}

	private double abandoned(String reason) {
		return meters.get(ObservabilityMetrics.MAIL_CANCELLATION_ABANDONED)
				.tag(MissingBookingFact.TAG, reason).counter().count();
	}

}
