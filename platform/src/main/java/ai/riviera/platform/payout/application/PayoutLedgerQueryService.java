package ai.riviera.platform.payout.application;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.payout.application.in.LedgerEntryView;
import ai.riviera.platform.payout.application.in.VenueLedger;
import ai.riviera.platform.payout.application.in.ViewPayoutLedger;
import ai.riviera.platform.payout.application.out.LedgerEntryRow;
import ai.riviera.platform.payout.application.out.PayoutLedger;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The per-venue payout-ledger read use case (U9, issue #12). Reads the venue's entries oldest-first
 * via {@link PayoutLedger#entriesForVenue} and folds the <strong>running net owed</strong> — an
 * {@code ACCRUAL} adds its net, a {@code REVERSAL} subtracts it (invariant #9) — so the final running
 * value is the venue's current net owed. Pure integer arithmetic (invariant #5). Read-only, so no
 * {@code @Transactional}. Package-private behind {@link ViewPayoutLedger} (invariant #11).
 */
@Service
class PayoutLedgerQueryService implements ViewPayoutLedger {

	private static final String DEFAULT_CURRENCY = "EUR"; // v1 collection currency (invariant #5)

	private final PayoutLedger ledger;

	PayoutLedgerQueryService(PayoutLedger ledger) {
		this.ledger = ledger;
	}

	@Override
	public VenueLedger forVenue(VenueId venueId) {
		List<LedgerEntryRow> rows = ledger.entriesForVenue(venueId);
		List<LedgerEntryView> entries = new ArrayList<>(rows.size());
		long runningNetMinor = 0;
		String currency = DEFAULT_CURRENCY;
		for (LedgerEntryRow row : rows) {
			runningNetMinor += row.entryType() == EntryType.ACCRUAL ? row.netMinor() : -row.netMinor();
			currency = row.currency();
			entries.add(new LedgerEntryView(row.entryType(), row.bookingId(), row.grossMinor(),
					row.commissionMinor(), row.netMinor(), row.currency(), row.reason(), row.createdAt(),
					runningNetMinor));
		}
		return new VenueLedger(venueId, currency, runningNetMinor, entries);
	}
}
