package ai.riviera.platform.payout.application;

import java.time.LocalDate;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.DailyTakings;
import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.payout.domain.CommissionSplit;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The operator console's "online takings today": the gross of the venue's online bookings it keeps
 * the money for on {@code date} (confirmed, checked-in, no-show), less commission via the ledger's
 * own {@link CommissionSplit}. Indicative: it reads booking amounts, never the ledger. Asserts
 * ownership (invariant #13) <strong>before</strong> reading any financial data. <strong>Reads the
 * rate in force on {@code date}, not the live rate</strong>, so a rate change never reprices a past
 * day (invariant #9). Rationale: {@code RESPONSIBILITIES.md} §payout.
 */
@Service
class DailyTakingsService implements ViewDailyTakings {

	private final DailyTakings bookingTakings;
	private final VenueRates rates;
	private final VenueOwnership ownership;

	DailyTakingsService(DailyTakings bookingTakings, VenueRates rates, VenueOwnership ownership) {
		this.bookingTakings = bookingTakings;
		this.rates = rates;
		this.ownership = ownership;
	}

	@Override
	public DailyTakingsView forVenueOn(OperatorId operator, VenueId venueId, LocalDate date) {
		ownership.assertOwns(operator, new VenueRef(venueId.value()));
		OnlineTakings gross = bookingTakings.grossOnlineTakings(venueId, date);
		int commissionBps = rates.commissionBpsOn(venueId, date).orElse(0);
		CommissionSplit split = CommissionSplit.of(gross.grossMinor(), commissionBps);
		return new DailyTakingsView(split.grossMinor(), split.commissionMinor(), split.netMinor(),
				commissionBps, gross.currency(), date);
	}
}
