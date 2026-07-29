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
 * event posts no second row. The original accrual is re-read here to mirror it exactly, so a later
 * commission-rate change cannot make the reversal fail to net out.
 *
 * <p><strong>A refund with no accrual to mirror is a deferral, not a no-op</strong> (found by #428's
 * generalization audit). This branch used to log one {@code WARN} and return normally, on the
 * reasoning that "cancellation happens long after confirmation, so the accrual is present; absence ⇒
 * nothing to reverse". The first half is usually true and the conclusion does not follow from it: the
 * two publications are <em>independent</em>, so their order is not guaranteed across a crash or a shed
 * send. {@code BookingConfirmed}'s publication can still be outstanding — waiting for the next start's
 * republish — when {@code BookingCancelled} arrives here. Returning normally completed <em>this</em>
 * publication, so the accrual posted later was never reversed and the ledger overstated what the venue
 * was owed, permanently and silently (invariant #9). A refund only exists for a captured payment, so
 * the accrual is always <em>coming</em>; it is simply not here yet.
 *
 * <p>So this listener <strong>throws</strong>, and the choice is the #423/#428 asymmetry applied to a
 * fact that <em>can</em> appear later. #428 counts-and-completes for the confirmation mail's three
 * missing facts precisely because none of them can ever appear, making a retry a permanently-failing
 * publication. The mirror image holds here: the publication stays outstanding, so
 * {@code riviera.outbox.pending} — a money-path signal {@code MoneyPathAlertCheck} already watches —
 * carries the loss, and the restart republish retries this reversal against a ledger that by then has
 * the accrual. Idempotency makes the retry free, so no counter of its own is warranted; a second
 * series would count one deferral twice, exactly as {@code TransactionalMailService} argues for its
 * own vehicle. <strong>The accepted risk:</strong> if the accrual is <em>permanently</em> broken (its
 * own listener throws on a venue with no commission rate), this publication parks in the outbox and
 * keeps the gauge non-zero until someone acts — which is the intended outcome, since the alternative
 * is a ledger that quietly pays a venue for a refunded booking.
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
		PayoutLedgerEntry accrual = ledger.findAccrual(bookingId).orElseThrow(() -> deferReversal(event));

		ledger.reverse(PayoutLedgerEntry.reversalOf(accrual, event.refundMinor(), event.reason()));
		log.info("reversed payout for cancelled booking {} (refund {} {}, reason {})", bookingId,
				event.refundMinor(), event.currency(), event.reason());
	}

	/**
	 * Refuse to complete a reversal that has no accrual to mirror yet — see this class's Javadoc for why
	 * throwing (rather than returning, as this branch did before #428's audit) is what keeps the ledger
	 * from overstating. The {@code ERROR} is deliberate even though the publication survives: the
	 * republish only happens at the next restart, so a venue's ledger can overstate for days, the same
	 * argument #408 made for the shed send. The line carries ids only — no booking code (invariant #7).
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
