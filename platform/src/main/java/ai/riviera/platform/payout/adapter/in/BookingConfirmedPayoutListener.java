package ai.riviera.platform.payout.adapter.in;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.api.BookingConfirmed;
import ai.riviera.platform.payout.application.PayoutLedger;
import ai.riviera.platform.payout.domain.PayoutLedgerEntry;
import ai.riviera.platform.venue.api.VenueRates;

/**
 * The {@code payout} module's reaction to a confirmed booking (U5, issue #9) — a driving adapter
 * listening for the {@code BookingConfirmed} fact the {@code booking} module announces (invariant
 * #11: collaboration by published event, never a call into {@code booking}). It accrues the venue's
 * payout ledger entry: {@code net = gross − commission} (invariant #9).
 *
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (= {@code @Async} +
 * {@code @Transactional} + {@code @TransactionalEventListener(AFTER_COMMIT)}): the publication is
 * persisted by the Event Publication Registry when the producer's transaction commits, then this
 * listener runs after commit in its own transaction. A payout failure therefore never rolls back a
 * confirmed booking, and an incomplete publication is re-submitted (at-least-once). Because delivery
 * is at-least-once, accrual is <strong>idempotent</strong> — {@code PayoutLedger.accrue} is
 * {@code INSERT … ON CONFLICT DO NOTHING} on {@code UNIQUE(booking_id, entry_type)}, so a
 * re-delivered event accrues no second entry.
 *
 * <p>The commission rate is re-read from {@code venue::api} here rather than taken from the event:
 * it is mutable venue configuration, not a fixed fact of the booking (invariant #11). The gross
 * amount and currency are immutable facts carried on the event.
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
