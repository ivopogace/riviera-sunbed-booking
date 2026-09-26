package ai.riviera.platform.payout.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.api.VenueRates;

/**
 * Accrues the venue's payout-ledger entry, {@code net = gross − commission} (invariant #9), on
 * the {@code BookingConfirmed} event {@code booking} publishes (invariant #11). Runs after commit
 * in its own transaction, so a payout failure never rolls back a confirmed booking.
 *
 * <p>Delivery is at-least-once: the accrual must stay idempotent ({@code ON CONFLICT DO NOTHING}).
 * Gross and currency come from the event; the commission rate is re-read live from {@code venue}
 * at accrual. Rationale: RESPONSIBILITIES.md §payout.
 */
@Component
class BookingConfirmedPayoutListener {

	private static final Logger log = LoggerFactory.getLogger(BookingConfirmedPayoutListener.class);

	private final PayoutLedger ledger;
	private final VenueRates venues;

	BookingConfirmedPayoutListener(PayoutLedger ledger, VenueRates venues) {
		this.ledger = ledger;
		this.venues = venues;
	}

	@ApplicationModuleListener
	void on(BookingConfirmed event) {
		long venueId = event.venueId().value();
		int commissionBps = venues.commissionBps(event.venueId())
				.orElseThrow(() -> new IllegalStateException(
						"no commission rate for venue " + venueId + " — cannot accrue payout"));

		ledger.accrue(PayoutLedgerEntry.accrual(event.venueId(), event.bookingId().value(),
				event.amountMinor(), commissionBps, event.currency()));

		log.info("accrued payout for booking {} (venue {}, gross {} {})", event.bookingId().value(),
				venueId, event.amountMinor(), event.currency());
	}
}
