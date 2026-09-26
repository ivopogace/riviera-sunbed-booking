package ai.riviera.platform.payout.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.events.BookingCancelled;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.application.VenueChangeFeeAmount;
import ai.riviera.platform.payout.application.VenueChangeFeeSetting;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;

/**
 * On {@code BookingCancelled}, posts a REVERSAL of the prior ACCRUAL <strong>proportional to the refund</strong>
 * (ADR-0005; no refund, no reversal), mirroring the re-read accrual so a rate change cannot break the netting,
 * plus a FEE when {@code reason == VENUE_CHANGE} (ADR-0021; its position after the zero-refund return and the
 * accrual lookup is load-bearing). Idempotent under redelivery via {@code UNIQUE(booking_id, entry_type)}. A
 * refund with no accrual yet <strong>throws</strong>, leaving the publication outstanding rather than letting
 * the ledger overstate what the venue is owed (invariant #9). Rationale: RESPONSIBILITIES.md §payout.
 */
@Component
class BookingCancelledPayoutListener {

	private static final Logger log = LoggerFactory.getLogger(BookingCancelledPayoutListener.class);

	private final PayoutLedger ledger;
	private final VenueChangeFeeSetting venueChangeFee;

	BookingCancelledPayoutListener(PayoutLedger ledger, VenueChangeFeeSetting venueChangeFee) {
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
			VenueChangeFeeAmount fee = venueChangeFee.current();
			ledger.charge(PayoutLedgerEntry.fee(event.venueId(), bookingId, fee.minorUnits(),
					event.currency()));
			log.info("charged venue {} a venue-change fee of {} {} for booking {}", event.venueId().value(),
					fee.minorUnits(), event.currency(), bookingId);
		}
	}

	/**
	 * Refuses a reversal with no accrual to mirror yet (see the class doc). {@code ERROR} because the republish
	 * waits for the next restart, so the ledger can overstate for days; ids only, never a booking code
	 * (invariant #7).
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
