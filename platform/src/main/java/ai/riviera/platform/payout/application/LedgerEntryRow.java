package ai.riviera.platform.payout.application;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.payout.domain.EntryType;

/**
 * A read projection of one {@code payout_ledger_entry} row for the per-venue ledger view.
 * Unlike the write-side {@link ai.riviera.platform.payout.domain.PayoutLedgerEntry} (the home of
 * the commission arithmetic), this carries the persisted-row facts a reader needs: the entry
 * {@code type}, the {@code bookingId} behind it, the money in integer minor units (invariant #5), the
 * {@link RefundReason} ({@code null} on an ACCRUAL), a DAY_REVERSAL's {@code serviceDate} ({@code null}
 * otherwise), and the {@code createdAt} (UTC, invariant #6) that orders the ledger. Module-internal.
 */
public record LedgerEntryRow(EntryType entryType, long bookingId, long grossMinor, long commissionMinor,
		long netMinor, String currency, RefundReason reason, LocalDate serviceDate, Instant createdAt) {
}
