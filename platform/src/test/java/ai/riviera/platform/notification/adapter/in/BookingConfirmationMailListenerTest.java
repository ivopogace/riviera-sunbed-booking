package ai.riviera.platform.notification.adapter.in;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
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
import org.junit.jupiter.params.provider.ValueSource;
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
 * {@code riviera.outbox.pending} cannot show.
 *
 * <p>The three early returns complete normally, so the Event Publication Registry marks the
 * publication done and no gauge moves: #423's registry-asymmetry argument ("a transport failure
 * propagates, so the outbox already carries it") holds only for failures that <em>throw</em>. These
 * specs pin the accounting that closes it, and just as deliberately pin where it stays silent — a
 * healthy send and a propagating transport failure are not abandonments, and counting either would
 * make this counter unreadable as the data-integrity signal the runbook says it is.
 *
 * <p>Companion to {@code BookingConfirmationMailIT}, which covers the happy registry path
 * end-to-end against Postgres; the abandoned paths are pure listener logic over three stubbed
 * ports, so they belong in a fast unit test.
 */
class BookingConfirmationMailListenerTest {

	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final SetId SET_ID = new SetId(7L);
	private static final CustomerId CUSTOMER_ID = new CustomerId(11L);
	private static final String CODE = "ABCD2345";
	private static final String EMAIL = "tourist@example.com";

	private static final BookingConfirmed EVENT = new BookingConfirmed(BOOKING_ID, new VenueId(3L),
			SET_ID, LocalDate.of(2026, 8, 1), 4500, "EUR");
	private static final BookingNotificationInfo BOOKING = new BookingNotificationInfo(CODE, CUSTOMER_ID);
	private static final SetBookingInfo SET = new SetBookingInfo(SET_ID, new VenueId(3L), "Vala Beach",
			"A", 3, "ONLINE", new MoneyView(4500, "EUR"), LocalTime.of(18, 0), BookingMode.INSTANT);
	private static final GuestContact CONTACT = new GuestContact(EMAIL, "Tourist", "+355691234567");

	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final SetBookingFacts sets = mock(SetBookingFacts.class);
	private final CustomerLookup customers = mock(CustomerLookup.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final BookingConfirmationMailListener listener =
			new BookingConfirmationMailListener(bookings, sets, customers, mails, meters);

	private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
	private ch.qos.logback.classic.Logger logger;

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

	@Test
	void aMissingBookingIsCountedAndAbandoned() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.empty());

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(abandoned("no-booking")).isEqualTo(1.0);
		verifyNoInteractions(sets, customers, mails);
	}

	@Test
	void aMissingSetIsCountedUnderItsOwnReason() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.of(BOOKING));
		when(sets.setBookingInfo(SET_ID)).thenReturn(Optional.empty());

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(abandoned("no-set")).isEqualTo(1.0);
		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED)
				.tag("reason", "no-booking").counter()).isNull();
		verifyNoInteractions(customers, mails);
	}

	@Test
	void aMissingContactIsCountedUnderItsOwnReason() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.of(BOOKING));
		when(sets.setBookingInfo(SET_ID)).thenReturn(Optional.of(SET));
		when(customers.findById(CUSTOMER_ID)).thenReturn(Optional.empty());

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		assertThat(abandoned("no-contact")).isEqualTo(1.0);
		verifyNoInteractions(mails);
	}

	@Test
	void aCompleteConfirmationCountsNothing() {
		givenEveryFactResolves();

		listener.on(EVENT);

		verify(mails).sendBookingConfirmation(eq(EMAIL), any());
		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
	}

	/**
	 * All three paths, not one: a level or redaction regression on a single branch must not hide behind
	 * a green spec for its siblings, and the three branches log through one helper precisely so this
	 * can be asserted uniformly.
	 */
	@ParameterizedTest(name = "reason={0}")
	@ValueSource(strings = { "no-booking", "no-set", "no-contact" })
	void everyAbandonedPathLogsAnErrorCarryingNoCredential(String reason) {
		givenTheFactsResolveUpTo(reason);

		listener.on(EVENT);

		List<ILoggingEvent> events = logged.list;
		assertThat(events).hasSize(1);
		assertThat(events.getFirst().getLevel()).isEqualTo(Level.ERROR);
		assertThat(events.getFirst().getFormattedMessage())
				.contains(reason)
				.contains(String.valueOf(BOOKING_ID.value()))
				.contains(String.valueOf(SET_ID.value()))
				.doesNotContain(CODE)
				.doesNotContain(EMAIL);
	}

	/** Stub just enough for the listener to reach — and abandon at — the named branch. */
	private void givenTheFactsResolveUpTo(String reason) {
		when(bookings.notificationInfo(BOOKING_ID))
				.thenReturn("no-booking".equals(reason) ? Optional.empty() : Optional.of(BOOKING));
		if (!"no-booking".equals(reason)) {
			when(sets.setBookingInfo(SET_ID))
					.thenReturn("no-set".equals(reason) ? Optional.empty() : Optional.of(SET));
		}
		if ("no-contact".equals(reason)) {
			when(customers.findById(CUSTOMER_ID)).thenReturn(Optional.empty());
		}
	}

	@Test
	void aTransportFailureStillPropagatesAndCountsNothing() {
		givenEveryFactResolves();
		doThrow(new IllegalStateException("relay down")).when(mails).sendBookingConfirmation(any(), any());

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);

		assertThat(meters.find(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED).counters()).isEmpty();
	}

	private void givenEveryFactResolves() {
		when(bookings.notificationInfo(BOOKING_ID)).thenReturn(Optional.of(BOOKING));
		when(sets.setBookingInfo(SET_ID)).thenReturn(Optional.of(SET));
		when(customers.findById(CUSTOMER_ID)).thenReturn(Optional.of(CONTACT));
	}

	private double abandoned(String reason) {
		return meters.get(ObservabilityMetrics.MAIL_CONFIRMATION_ABANDONED)
				.tag("reason", reason).counter().count();
	}

}
