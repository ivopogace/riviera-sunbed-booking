package ai.riviera.platform.payout.application;

import java.time.Instant;

import ai.riviera.platform.booking.api.RefundReason;
import ai.riviera.platform.payout.domain.EntryType;

/**
 * A read projection of one {@code payout_ledger_entry} row for the per-venue ledger view (U9, issue
 * #12). Unlike the write-side {@link ai.riviera.platform.payout.domain.PayoutLedgerEntry} (the home of
 * the commission arithmetic), this carries the persisted-row facts a reader needs: the entry
 * {@code type}, the {@code bookingId} behind it, the money in integer minor units (invariant #5), the
 * {@link RefundReason} ({@code null} on an ACCRUAL), and the {@code createdAt} timestamp (UTC, invariant
 * #6) used to order the ledger. Internal to the {@code payout} module.
 */
public record LedgerEntryRow(EntryType entryType, long bookingId, long grossMinor, long commissionMinor,
		long netMinor, String currency, RefundReason reason, Instant createdAt) {
}
