package ai.riviera.platform.payout.adapter.in;

import java.time.LocalDate;
import java.util.Optional;

import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.payout.domain.Reversed;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The day-refund listener's decisions at the seam where the ledger is a mock: a day with no accrual yet
 * throws (the publication stays outstanding, as the cancellation listener's does), a zero refund touches
 * nothing, and a refunded day posts one {@code DAY_REVERSAL} keyed by its day, pro rata after what
 * earlier reversals took.
 */
class BookingDayRefundedPayoutListenerTest {

	private static final VenueId VENUE_ID = new VenueId(3L);
	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final LocalDate DAY = LocalDate.of(2026, 7, 8);
	private static final PayoutLedgerEntry ACCRUAL = PayoutLedgerEntry.accrual(VENUE_ID,
			BOOKING_ID.value(), 42000L, 1500, "EUR");

	private final PayoutLedger ledger = mock(PayoutLedger.class);
	private final BookingDayRefundedPayoutListener listener = new BookingDayRefundedPayoutListener(ledger);

	private static BookingDayRefunded refunded(long refundMinor) {
		return refunded(refundMinor, RefundReason.WEATHER, false);
	}

	private static BookingDayRefunded refunded(long refundMinor, RefundReason reason, boolean released) {
		return new BookingDayRefunded(BOOKING_ID, VENUE_ID, new SetId(7L), DAY, refundMinor, "EUR", null, reason,
				released);
	}

	@Test
	void aRefundedDayWithNoAccrualThrowsSoThePublicationIsRetried() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.empty());

		assertThatThrownBy(() -> listener.on(refunded(3000L))).isInstanceOf(IllegalStateException.class);

		verify(ledger, never()).reverse(any());
	}

	@Test
	void aRefundedDayPostsItsDayReversal() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.of(ACCRUAL));
		when(ledger.findReversed(BOOKING_ID.value())).thenReturn(Reversed.NONE);

		listener.on(refunded(3000L));

		ArgumentCaptor<PayoutLedgerEntry> posted = ArgumentCaptor.forClass(PayoutLedgerEntry.class);
		verify(ledger).reverse(posted.capture());
		assertThat(posted.getValue().entryType()).isEqualTo(EntryType.DAY_REVERSAL);
		assertThat(posted.getValue().serviceDate()).isEqualTo(DAY);
		assertThat(posted.getValue().grossMinor()).isEqualTo(3000L);
		assertThat(posted.getValue().commissionMinor()).isEqualTo(450L);
		assertThat(posted.getValue().reason()).isEqualTo(RefundReason.WEATHER);
	}

	/** ADR-0027: the venue's own day refund reverses under its reason, with no fee. */
	@Test
	void aVenueRefundedDayCarriesItsReason() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.of(ACCRUAL));
		when(ledger.findReversed(BOOKING_ID.value())).thenReturn(Reversed.NONE);

		listener.on(refunded(3000L, RefundReason.VENUE, true));

		ArgumentCaptor<PayoutLedgerEntry> posted = ArgumentCaptor.forClass(PayoutLedgerEntry.class);
		verify(ledger).reverse(posted.capture());
		assertThat(posted.getValue().entryType()).isEqualTo(EntryType.DAY_REVERSAL);
		assertThat(posted.getValue().reason()).isEqualTo(RefundReason.VENUE);
		assertThat(posted.getValue().commissionMinor()).isEqualTo(450L);
	}

	/** A publication serialized before the reason existed is a weather refund's. */
	@Test
	void aPayloadWithoutAReasonReversesForWeather() {
		when(ledger.findAccrual(BOOKING_ID.value())).thenReturn(Optional.of(ACCRUAL));
		when(ledger.findReversed(BOOKING_ID.value())).thenReturn(Reversed.NONE);

		listener.on(new BookingDayRefunded(BOOKING_ID, VENUE_ID, new SetId(7L), DAY, 3000L, "EUR", null, null, false));

		ArgumentCaptor<PayoutLedgerEntry> posted = ArgumentCaptor.forClass(PayoutLedgerEntry.class);
		verify(ledger).reverse(posted.capture());
		assertThat(posted.getValue().reason()).isEqualTo(RefundReason.WEATHER);
	}

	@Test
	void aDayThatRefundedNothingTouchesTheLedgerNotAtAll() {
		listener.on(refunded(0L));

		verifyNoInteractions(ledger);
	}
}
