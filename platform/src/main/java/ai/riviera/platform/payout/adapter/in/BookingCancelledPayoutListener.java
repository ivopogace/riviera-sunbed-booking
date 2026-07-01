package ai.riviera.platform.payout.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;

/**
 * The {@code payout} module's reaction to a cancelled booking (U6, issue #11) — a driving adapter
 * listening for the {@code BookingCancelled} fact {@code booking} announces (invariant #11). It posts
 * a REVERSAL that backs out the prior ACCRUAL <strong>proportionally to the refund</strong>
 * (ADR-0005): a full refund reverses the whole accrual, a partial refund reverses the matching share,
 * and <strong>no refund posts no reversal</strong> (the venue keeps its share of money the platform
 * kept).
 *
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (registry-backed, at-least-once):
 * the reversal is <strong>idempotent</strong> via {@code UNIQUE(booking_id, REVERSAL)} so a redelivered
 * event posts no second row. The original accrual is re-read here to mirror it exactly (so a later
 * commission-rate change can't make the reversal fail to net out); cancellation happens long after
 * confirmation, so the accrual is present (absence ⇒ nothing to reverse).
 */
@Component
class BookingCancelledPayoutListener {

	private static final Logger log = LoggerFactory.getLogger(BookingCancelledPayoutListener.class);

	private final PayoutLedger ledger;

	BookingCancelledPayoutListener(PayoutLedger ledger) {
		this.ledger = ledger;
	}

	@ApplicationModuleListener
	void on(BookingCancelled event) {
		long bookingId = event.bookingId().value();
		if (event.refundMinor() <= 0) {
			// No refund ⇒ the accrual stands; the venue keeps its share (ADR-0005).
			log.debug("no refund for cancelled booking {} — accrual stands, no reversal", bookingId);
			return;
		}
		ledger.findAccrual(bookingId).ifPresentOrElse(
				accrual -> {
					ledger.reverse(PayoutLedgerEntry.reversalOf(accrual, event.refundMinor(),
							event.reason()));
					log.info("reversed payout for cancelled booking {} (refund {} {}, reason {})", bookingId,
							event.refundMinor(), event.currency(), event.reason());
				},
				() -> log.warn("no ACCRUAL found for cancelled booking {} — nothing to reverse", bookingId));
	}
}
