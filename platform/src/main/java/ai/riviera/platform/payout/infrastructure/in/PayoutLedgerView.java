package ai.riviera.platform.payout.infrastructure.in;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.payout.application.in.VenueLedger;

/**
 * The HTTP response for the per-venue payout ledger (U9, issue #12): the venue id, currency, total net
 * owed, and the ordered entries (each with its running net owed). A thin wire DTO over
 * {@link VenueLedger} — exposes {@code venueId} as a plain {@code long} and the enums as their tokens.
 * Money is integer minor units (invariant #5); {@code reason} is {@code null} on an ACCRUAL.
 */
record PayoutLedgerView(long venueId, String currency, long netOwedMinor, List<Entry> entries) {

	record Entry(String type, long bookingId, long grossMinor, long commissionMinor, long netMinor,
			String currency, String reason, Instant createdAt, long runningNetMinor) {
	}

	static PayoutLedgerView of(VenueLedger ledger) {
		List<Entry> entries = ledger.entries().stream()
				.map(e -> new Entry(e.entryType().name(), e.bookingId(), e.grossMinor(), e.commissionMinor(),
						e.netMinor(), e.currency(), e.reason() == null ? null : e.reason().name(),
						e.createdAt(), e.runningNetMinor()))
				.toList();
		return new PayoutLedgerView(ledger.venueId().value(), ledger.currency(), ledger.netOwedMinor(),
				entries);
	}
}
