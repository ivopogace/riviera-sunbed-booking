package ai.riviera.platform.notification.adapter.in;

import java.net.URI;
import java.time.LocalDate;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.BookingLinks;
import ai.riviera.platform.notification.application.BookingMailFacts;
import ai.riviera.platform.notification.application.BookingMailFactsService;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.MissingBookingFact;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.shared.ObservabilityMetrics;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.booking.vocabulary.RefundReason;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The refunded-day listener over stubbed collaborators: the event's ids resolve to the code, venue and
 * contact, the mail carries the payload's day and refund with the code-gated link; a missing fact is
 * counted and abandoned, never thrown; a transport failure propagates. {@code DayRefundMailIT} covers
 * the registry path end-to-end.
 */
class BookingDayRefundMailListenerTest {

	private static final BookingId BOOKING = new BookingId(42L);
	private static final SetId SET = new SetId(7L);
	private static final LocalDate DAY = LocalDate.of(2026, 7, 8);
	private static final BookingDayRefunded EVENT = new BookingDayRefunded(BOOKING, new VenueId(3L), SET, DAY, 3000L,
			"EUR", null, RefundReason.WEATHER, false);
	private static final URI LINK = URI.create("https://riviera.example/booking/STAYCODE");

	private final BookingMailFactsService facts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final MeterRegistry meters = new SimpleMeterRegistry();

	private final BookingDayRefundMailListener listener = new BookingDayRefundMailListener(facts, mails,
			new BookingLinks("https://riviera.example"), meters);

	@Test
	void mailsTheResolvedContactTheDayAndTheRefundWithTheLink() {
		when(facts.resolve(BOOKING, SET)).thenReturn(new BookingMailFacts.Resolved("guest@example.com", "STAYCODE",
				"Vala Beach", "A", 3));

		listener.on(EVENT);

		verify(mails).sendDayRefund("guest@example.com",
				new DayRefundMail("STAYCODE", "Vala Beach", DAY, 3000L, "EUR", RefundReason.WEATHER, false, LINK));
		assertThat(meters.find(ObservabilityMetrics.MAIL_DAY_REFUND_ABANDONED).counters()).isEmpty();
	}

	/** ADR-0027: the venue's reason and the released mark ride into the mail; a payload without a reason is weather's. */
	@Test
	void carriesTheReasonAndTheReleasedMarkIntoTheMail() {
		when(facts.resolve(BOOKING, SET)).thenReturn(new BookingMailFacts.Resolved("guest@example.com", "STAYCODE",
				"Vala Beach", "A", 3));

		listener.on(new BookingDayRefunded(BOOKING, new VenueId(3L), SET, DAY, 3000L, "EUR", null, RefundReason.VENUE,
				true));
		listener.on(new BookingDayRefunded(BOOKING, new VenueId(3L), SET, DAY, 3000L, "EUR", null, null, false));

		verify(mails).sendDayRefund("guest@example.com",
				new DayRefundMail("STAYCODE", "Vala Beach", DAY, 3000L, "EUR", RefundReason.VENUE, true, LINK));
		verify(mails).sendDayRefund("guest@example.com",
				new DayRefundMail("STAYCODE", "Vala Beach", DAY, 3000L, "EUR", RefundReason.WEATHER, false, LINK));
	}

	@Test
	void aMissingFactIsCountedAndAbandoned() {
		when(facts.resolve(BOOKING, SET)).thenReturn(new BookingMailFacts.Missing(MissingBookingFact.NO_CONTACT));

		assertThatCode(() -> listener.on(EVENT)).doesNotThrowAnyException();

		verifyNoInteractions(mails);
		assertThat(meters.counter(ObservabilityMetrics.MAIL_DAY_REFUND_ABANDONED, MissingBookingFact.TAG,
				MissingBookingFact.NO_CONTACT.tagValue()).count()).isEqualTo(1.0);
	}

	@Test
	void aTransportFailurePropagatesSoTheRegistryRetries() {
		when(facts.resolve(BOOKING, SET)).thenReturn(new BookingMailFacts.Resolved("guest@example.com", "STAYCODE",
				"Vala Beach", "A", 3));
		doThrow(new IllegalStateException("smtp down")).when(mails).sendDayRefund(org.mockito.ArgumentMatchers.any(),
				org.mockito.ArgumentMatchers.any());

		assertThatThrownBy(() -> listener.on(EVENT)).isInstanceOf(IllegalStateException.class);
	}
}
