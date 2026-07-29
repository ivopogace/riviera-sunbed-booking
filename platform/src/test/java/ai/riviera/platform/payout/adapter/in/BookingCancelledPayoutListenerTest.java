package ai.riviera.platform.payout.adapter.in;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The reversal listener's behaviour when the accrual it must mirror is <strong>not there yet</strong>
 * — the money-path sibling of #428, found by that slice's generalization audit.
 *
 * <p>The two publications are independent, so their delivery order is not guaranteed across a crash
 * or a shed send: {@code BookingCancelled} can reach this listener while {@code BookingConfirmed}'s
 * publication is still outstanding. Until this slice the branch logged one {@code WARN} and returned
 * normally, which completed the publication — so the reversal was lost, the ledger kept overstating
 * what the venue was owed (invariant #9), and no gauge moved.
 *
 * <p>It now <strong>throws</strong>, which is the correct half of the #423/#428 asymmetry for a fact
 * that <em>can</em> appear later: the publication stays outstanding, {@code riviera.outbox.pending}
 * rises (already watched by {@code MoneyPathAlertCheck}), and the restart republish retries the
 * reversal against a ledger that by then has the accrual. Idempotency makes the retry safe.
 */
class BookingCancelledPayoutListenerTest {

	private static final VenueId VENUE_ID = new VenueId(3L);
	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final long REFUND_MINOR = 4500L;

	private static final BookingCancelled REFUNDED = new BookingCancelled(BOOKING_ID, VENUE_ID,
			new SetId(7L), LocalDate.of(2026, 8, 1), REFUND_MINOR, "EUR", RefundReason.POLICY);
	private static final BookingCancelled NOT_REFUNDED = new BookingCancelled(BOOKING_ID, VENUE_ID,
			new SetId(7L), LocalDate.of(2026, 8, 1), 0L, "EUR", RefundReason.POLICY);
	private static final PayoutLedgerEntry ACCRUAL = PayoutLedgerEntry.accrual(VENUE_ID,
			BOOKING_ID.value(), REFUND_MINOR, 1500, "EUR");

	private final PayoutLedger ledger = mock(PayoutLedger.class);
	private final BookingCancelledPayoutListener listener = new BookingCancelledPayoutListener(ledger);

	private final ListAppender<ILoggingEvent> logged = new ListAppender<>();
	private ch.qos.logback.classic.Logger logger;

	@BeforeEach
	void captureLogs() {
		logger = (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(BookingCancelledPayoutListener.class);
		logged.start();
		logger.addAppender(logged);
	}

	@AfterEach
	void releaseLogs() {
		logger.detachAppender(logged);
		logged.stop();
	}

	@Test
	void aRefundedCancellationWithNoAccrualThrowsSoThePublicationIsRetried() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.empty());

		assertThatThrownBy(() -> listener.on(REFUNDED)).isInstanceOf(IllegalStateException.class);

		verify(ledger, never()).reverse(any());
	}

	@Test
	void theUnreversableCancellationLogsAnErrorNamingTheLedgerRisk() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.empty());

		assertThatThrownBy(() -> listener.on(REFUNDED)).isInstanceOf(IllegalStateException.class);

		List<ILoggingEvent> events = logged.list;
		assertThat(events).hasSize(1);
		assertThat(events.getFirst().getLevel()).isEqualTo(Level.ERROR);
		assertThat(events.getFirst().getFormattedMessage())
				.contains(String.valueOf(BOOKING_ID.value()))
				.contains(String.valueOf(VENUE_ID.value()));
	}

	@Test
	void anAccruedBookingStillPostsTheProportionalReversal() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.of(ACCRUAL));

		assertThatCode(() -> listener.on(REFUNDED)).doesNotThrowAnyException();

		ArgumentCaptor<PayoutLedgerEntry> posted = ArgumentCaptor.forClass(PayoutLedgerEntry.class);
		verify(ledger).reverse(posted.capture());
		assertThat(posted.getValue().entryType()).isEqualTo(EntryType.REVERSAL);
		assertThat(posted.getValue().grossMinor()).isEqualTo(REFUND_MINOR);
		assertThat(posted.getValue().reason()).isEqualTo(RefundReason.POLICY);
	}

	@Test
	void aCancellationWithNoRefundTouchesTheLedgerNotAtAll() {
		assertThatCode(() -> listener.on(NOT_REFUNDED)).doesNotThrowAnyException();

		verifyNoInteractions(ledger);
	}
}
