package ai.riviera.platform.payout.application;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.payout.domain.EntryType;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The per-venue payout-ledger read, behind {@link ViewPayoutLedger} (invariant #11). Folds the
 * entries of {@link PayoutLedger#entriesForVenue} oldest-first into a <strong>running net
 * owed</strong>: only an {@code ACCRUAL} adds; every other type ({@code REVERSAL}, {@code FEE})
 * deducts (invariant #9), so the result may be negative. Integer minor units (invariant #5).
 *
 * <p>Asserts {@code operator} owns {@code venueId} before reading anything (invariant #13).
 */
@Service
class PayoutLedgerQueryService implements ViewPayoutLedger {

	private static final String DEFAULT_CURRENCY = "EUR"; // v1 collection currency (invariant #5)

	private final PayoutLedger ledger;
	private final VenueOwnership ownership;

	PayoutLedgerQueryService(PayoutLedger ledger, VenueOwnership ownership) {
		this.ledger = ledger;
		this.ownership = ownership;
	}

	@Override
	public VenueLedger forVenue(OperatorId operator, VenueId venueId) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
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
