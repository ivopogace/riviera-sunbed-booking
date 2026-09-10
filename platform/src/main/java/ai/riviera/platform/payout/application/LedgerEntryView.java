package ai.riviera.platform.payout.application;

import java.time.Instant;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.domain.EntryType;

/**
 * One row of the per-venue payout ledger view (U9): an entry plus the <strong>running net owed</strong>
 * after it. {@code runningNetMinor} is the cumulative balance — only an {@code ACCRUAL} adds its net,
 * every other entry type deducts it (invariant #9) — so the last row's running value is the venue's
 * current net owed, which a venue that owes the platform may leave negative. Money is integer minor
 * units (invariant #5); {@code reason} is {@code null} on an ACCRUAL; {@code createdAt} is UTC
 * (invariant #6).
 */
public record LedgerEntryView(EntryType entryType, long bookingId, long grossMinor, long commissionMinor,
		long netMinor, String currency, RefundReason reason, Instant createdAt, long runningNetMinor) {
}
