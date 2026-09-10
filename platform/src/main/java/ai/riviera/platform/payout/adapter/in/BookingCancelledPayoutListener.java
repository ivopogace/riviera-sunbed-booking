package ai.riviera.platform.payout.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.application.VenueChangeFee;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;

/**
 * The {@code payout} module's reaction to a cancelled booking — a driving adapter listening for the
 * {@code BookingCancelled} fact {@code booking} announces (invariant #11).
 *
 * <p>It posts a REVERSAL backing out the prior ACCRUAL <strong>proportionally to the refund</strong>
 * (ADR-0005): a full refund reverses the whole accrual, a partial refund the matching share, and
 * <strong>no refund posts no reversal</strong> — the venue keeps its share of money the platform
 * kept. The accrual is re-read here to mirror it exactly, so a later commission-rate change cannot
 * make the reversal fail to net out.
 *
 * <p>A refund the venue's own change caused also posts a FEE (ADR-0021), keyed on
 * {@code reason == VENUE_CHANGE} and nothing else, so it covers both shapes that reason carries: the
 * remodel refunding a booking it could not move, and a moved guest taking the free exit that move
 * earned them. Its two positions in the method are load-bearing. After the zero-refund return, so a
 * remodel <em>release</em> of an unpaid booking stays free — that leg publishes {@code VENUE_CHANGE}
 * with a zero refund because nothing was collected. After the accrual lookup, so a deferred reversal
 * defers its fee with it rather than charging for a refund the ledger has not reversed.
 *
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (registry-backed,
 * at-least-once). Both rows are idempotent via {@code UNIQUE(booking_id, entry_type)}, so a
 * redelivered event writes neither twice.
 *
 * <p><strong>A refund with no accrual to mirror defers; it is not a no-op.</strong> This listener
 * throws, leaving the publication outstanding for the restart republish, so
 * {@code riviera.outbox.pending} — which {@code MoneyPathAlertCheck} watches — carries the loss
 * instead of the ledger silently overstating what the venue is owed (invariant #9). Idempotency
 * makes the retry free, so it needs no counter of its own. The accepted risk: a permanently broken
 * accrual parks this publication in the outbox and keeps the gauge non-zero until someone acts,
 * which is the intended outcome — the alternative is paying a venue for a refunded booking.
 * Rationale: {@code RESPONSIBILITIES.md} §{@code payout}.
 */
@Component
class BookingCancelledPayoutListener {

	private static final Logger log = LoggerFactory.getLogger(BookingCancelledPayoutListener.class);

	private final PayoutLedger ledger;
	private final VenueChangeFee venueChangeFee;

	BookingCancelledPayoutListener(PayoutLedger ledger, VenueChangeFee venueChangeFee) {
		this.ledger = ledger;
		this.venueChangeFee = venueChangeFee;
	}

	@ApplicationModuleListener
	void on(BookingCancelled event) {
		long bookingId = event.bookingId().value();
		if (event.refundMinor() <= 0) {
			// No refund ⇒ the accrual stands; the venue keeps its share (ADR-0005).
			log.debug("no refund for cancelled booking {} — accrual stands, no reversal", bookingId);
			return;
		}
		PayoutLedgerEntry accrual = ledger.findAccrual(bookingId).orElseThrow(() -> deferReversal(event));

		ledger.reverse(PayoutLedgerEntry.reversalOf(accrual, event.refundMinor(), event.reason()));
		log.info("reversed payout for cancelled booking {} (refund {} {}, reason {})", bookingId,
				event.refundMinor(), event.currency(), event.reason());

		if (event.reason() == RefundReason.VENUE_CHANGE) {
			ledger.charge(PayoutLedgerEntry.fee(event.venueId(), bookingId, venueChangeFee.minorUnits(),
					event.currency()));
			log.info("charged venue {} a venue-change fee of {} {} for booking {}", event.venueId().value(),
					venueChangeFee.minorUnits(), event.currency(), bookingId);
		}
	}

	/**
	 * Refuse to complete a reversal that has no accrual to mirror yet — see this class's Javadoc for why
	 * throwing keeps the ledger from overstating. The {@code ERROR} is deliberate even though the
	 * publication survives: the republish only happens at the next restart, so a venue's ledger can
	 * overstate for days. The line carries ids only — no booking code (invariant #7).
	 */
	private IllegalStateException deferReversal(BookingCancelled event) {
		long bookingId = event.bookingId().value();
		log.error("refunded booking {} (venue {}) has no ACCRUAL to reverse — its confirmation is "
				+ "presumably still outstanding, so this reversal stays outstanding too and the venue's "
				+ "ledger overstates by the refund until both are republished", bookingId,
				event.venueId().value());
		return new IllegalStateException("no ACCRUAL to reverse for refunded booking " + bookingId);
	}
}
