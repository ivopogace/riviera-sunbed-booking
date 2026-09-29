package ai.riviera.platform.payout.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.events.BookingDayRefunded;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.payout.domain.Reversed;

/**
 * On {@code BookingDayRefunded}, posts the {@code DAY_REVERSAL} of that day's share of the booking's
 * {@code ACCRUAL}, keyed by the day and stamped with the event's reason, never a fee (ADR-0026, ADR-0027): pro rata like a cancellation's reversal, reading what
 * earlier reversals took so the one that exhausts the accrual returns the commission exactly. Idempotent
 * under redelivery via {@code UNIQUE (booking_id, entry_type, service_date)}. A day refund with no
 * accrual yet <strong>throws</strong>, leaving the publication outstanding rather than letting the ledger
 * overstate what the venue is owed (invariant #9). Rationale: RESPONSIBILITIES.md §payout.
 */
@Component
class BookingDayRefundedPayoutListener {

	private static final Logger log = LoggerFactory.getLogger(BookingDayRefundedPayoutListener.class);

	private final PayoutLedger ledger;

	BookingDayRefundedPayoutListener(PayoutLedger ledger) {
		this.ledger = ledger;
	}

	@ApplicationModuleListener
	void on(BookingDayRefunded event) {
		long bookingId = event.bookingId().value();
		if (event.refundMinor() <= 0) {
			log.debug("day {} of booking {} refunded nothing — accrual stands, no reversal", event.serviceDate(),
					bookingId);
			return;
		}
		PayoutLedgerEntry accrual = ledger.findAccrual(bookingId).orElseThrow(() -> deferReversal(event));
		Reversed prior = ledger.findReversed(bookingId);
		ledger.reverse(PayoutLedgerEntry.dayReversalOf(accrual, event.serviceDate(), event.refundMinor(), prior,
				event.refundReason()));
		log.info("reversed day {} of booking {} (refund {} {}, {})", event.serviceDate(), bookingId,
				event.refundMinor(), event.currency(), event.refundReason());
	}

	private IllegalStateException deferReversal(BookingDayRefunded event) {
		long bookingId = event.bookingId().value();
		log.error("booking {} (venue {}) had day {} refunded but has no ACCRUAL to reverse — its confirmation "
				+ "is presumably still outstanding, so this reversal stays outstanding too and the venue's "
				+ "ledger overstates by the refund until both are republished", bookingId,
				event.venueId().value(), event.serviceDate());
		return new IllegalStateException("no ACCRUAL to reverse for booking " + bookingId + " day "
				+ event.serviceDate());
	}
}
