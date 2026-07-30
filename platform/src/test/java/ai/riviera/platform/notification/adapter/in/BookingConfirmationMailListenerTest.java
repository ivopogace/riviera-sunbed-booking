package ai.riviera.platform.notification.adapter.in;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.ConfirmationAttemptRecorder;
import ai.riviera.platform.notification.application.ConfirmationSendOutcome;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * What the listener does when it <em>gives up</em> (#428) — the one mail loss
 * {@code riviera.outbox.pending} cannot show — and, since #374, that it maps the resolved facts onto
 * the right message fields.
 *
 * <p>The abandoned paths complete normally, so the Event Publication Registry marks the publication
 * done and no gauge moves: #423's registry-asymmetry argument ("a transport failure propagates, so
 * the outbox already carries it") holds only for failures that <em>throw</em>. These specs pin the
 * accounting that closes it, and just as deliberately pin where it stays silent — a healthy send and
 * a propagating transport failure are not abandonments, and counting either would make this counter
 * unreadable as the data-integrity signal the runbook says it is.
 *
 * <p><strong>Stubs the resolver, not three ports</strong> (#374): the three reads and their
 * short-circuit ordering moved into {@code BookingMailFactsService} and are pinned by
 * {@code BookingMailFactsServiceTest}, which is now the only place that knows their order. What is
 * left here is exactly this adapter's own behavior. The field-mapping spec below is new with that
 * move and is the reason it is not merely a mechanical rewrite: the listener now copies five values
 * out of one record into another, so a transposed {@code venueName}/{@code rowLabel} would compile,
 * pass every old spec, and mail nonsense.
 *
 * <p>Companion to {@code BookingConfirmationMailIT}, which covers the happy registry path
 * end-to-end against Postgres; these are pure listener logic over one stubbed collaborator.
 */
class BookingConfirmationMailListenerTest {

	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final SetId SET_ID = new SetId(7L);
	private static final String CODE = "ABCD2345";
	private static final String EMAIL = "tourist@example.com";

	private static final BookingConfirmed EVENT = new BookingConfirmed(BOOKING_ID, new VenueId(3L),
			SET_ID, LocalDate.of(2026, 8, 1), 4500, "EUR");
	private static final BookingMailFacts.Resolved FACTS =
			new BookingMailFacts.Resolved(EMAIL, CODE, "Vala Beach", "A", 3);

	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final ConfirmationAttemptRecorder attempts = mock(ConfirmationAttemptRecorder.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final BookingConfirmationMailListener listener =
			new BookingConfirmationMailListener(facts, mails, attempts, meters);

	private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
	private ch.qos.logback.classic.Logger logger;

	/** The ordinary answer, so only the specs that care about a withheld or failed send restate it. */
	@BeforeEach
	void theSendReportsSentByDefault() {
		when(mails.sendBookingConfirmation(any(), any())).thenReturn(ConfirmationSendOutcome.SENT);
	}

	@BeforeEach
	void captureLogs() {
		logger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(BookingConfirmationMailListener.class);
		logged.start();
		logger.addAppender(logged);
	}

	@AfterEach
	void releaseLogs() {
		logger.detachAppender(logged);
		logged.stop();
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void anyMissingFactIsCountedUnderItsOwnReasonAndAbandoned(MissingBookingFact fact) {
		givenTheFactsAre(new BookingMailFacts.Missing(fact));

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(abandoned(fact.tagValue())).isEqualTo(1.0);
		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).hasSize(1);
		verifyNoInteractions(mails);
	}

	@Test
	void aCompleteConfirmationCountsNothing() {
		givenTheFactsAre(FACTS);

		listener.on(EVENT);

		verify(mails).sendBookingConfirmation(eq(EMAIL), any());
		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
	}

	/**
	 * The five resolved fields and the three that ride the event, each in its own slot. Positional
	 * records make a transposition of two same-typed neighbours ({@code venueName}/{@code rowLabel})
	 * invisible to the compiler, so it is asserted rather than eyeballed.
	 */
	@Test
	void mapsEveryResolvedFactOntoTheMessage() {
		givenTheFactsAre(FACTS);

		listener.on(EVENT);

		verify(mails).sendBookingConfirmation(EMAIL, new BookingConfirmationMail(
				CODE, "Vala Beach", LocalDate.of(2026, 8, 1), "A", 3, 4500, "EUR"));
	}

	/**
	 * All three paths, not one: a level or redaction regression on a single branch must not hide behind
	 * a green spec for its siblings, and the three branches log through one helper precisely so this
	 * can be asserted uniformly.
	 */
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

	@Test
	void aTransportFailureStillPropagatesAndCountsNothing() {
		givenTheFactsAre(FACTS);
		doThrow(new IllegalStateException("relay down")).when(mails).sendBookingConfirmation(any(), any());

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);

		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
	}

	@Test
	void recordsASentAttemptForADeliveredConfirmation() {
		givenTheFactsAre(FACTS);
		givenTheSendReports(ConfirmationSendOutcome.SENT);

		listener.on(EVENT);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.SENT);
	}

	/**
	 * The whole reason #380 records attempts rather than reading the registry: this send never happened,
	 * yet the publication completes exactly as a delivery does. The attempt row is the only artefact
	 * that tells them apart.
	 */
	@Test
	void recordsAWithheldAttemptWhenTheAddressIsSuppressed() {
		givenTheFactsAre(FACTS);
		givenTheSendReports(ConfirmationSendOutcome.WITHHELD_SUPPRESSED);

		listener.on(EVENT);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.WITHHELD_SUPPRESSED);
	}

	/**
	 * Recording must not swallow the transport failure — the throw is what keeps the publication
	 * outstanding for the at-least-once retry (#371) — and the row must survive it, which is why the
	 * attempt log takes no ambient transaction (see {@code JdbcConfirmationMailAttempts}).
	 */
	@Test
	void recordsTheFailedAttemptAndStillRethrows() {
		givenTheFactsAre(FACTS);
		doThrow(new IllegalStateException("relay down")).when(mails).sendBookingConfirmation(any(), any());

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.TRANSPORT_FAILED);
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void recordsAnAbandonedAttemptForAnyMissingFact(MissingBookingFact fact) {
		givenTheFactsAre(new BookingMailFacts.Missing(fact));

		listener.on(EVENT);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.ABANDONED_MISSING_FACTS);
	}

	private void givenTheFactsAre(BookingMailFacts outcome) {
		when(facts.resolve(BOOKING_ID, SET_ID)).thenReturn(outcome);
	}

	private void givenTheSendReports(ConfirmationSendOutcome outcome) {
		when(mails.sendBookingConfirmation(any(), any())).thenReturn(outcome);
	}

	private double abandoned(String reason) {
		return meters.get(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED)
				.tag(MissingBookingFact.TAG, reason).counter().count();
	}

}
