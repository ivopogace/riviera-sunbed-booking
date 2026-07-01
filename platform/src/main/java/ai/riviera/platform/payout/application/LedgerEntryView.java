package ai.riviera.platform.payout.application;

import java.time.Instant;

import ai.riviera.platform.booking.api.RefundReason;
import ai.riviera.platform.payout.domain.EntryType;

/**
 * One row of the per-venue payout ledger view (U9, issue #12): an entry plus the
 * <strong>running net owed</strong> after it. {@code runningNetMinor} is the cumulative balance — an
 * {@code ACCRUAL} adds its net, a {@code REVERSAL} subtracts its net — so the last row's running value
 * is the venue's current net owed. Money is integer minor units (invariant #5); {@code reason} is
 * {@code null} on an ACCRUAL; {@code createdAt} is UTC (invariant #6).
 */
public record LedgerEntryView(EntryType entryType, long bookingId, long grossMinor, long commissionMinor,
		long netMinor, String currency, RefundReason reason, Instant createdAt, long runningNetMinor) {
}
