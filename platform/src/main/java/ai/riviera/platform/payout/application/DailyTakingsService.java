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
 * Computes a venue's "online takings today" for the operator console: reads the gross of
 * a venue's CONFIRMED online bookings for the service date from {@code booking::api}, then applies
 * the venue's commission to yield net owed. {@code payout} owns the commission arithmetic
 * ({@code venue} stores the rate; invariant #9) and reuses the same {@link CommissionSplit} as the
 * ledger accrual, so the formula never diverges. Read-only, so no {@code @Transactional}.
 *
 * <p>Per-venue authorization (invariant #13): asserts {@code operator} owns {@code venueId}
 * <strong>before</strong> reading any financial data, so one venue's takings never leak to another
 * operator. The figure is indicative per service date — it reads booking amounts, never the ledger.
 *
 * <p><strong>The rate is read by service date, not live</strong> (A7, epic #348). Reading
 * {@code VenueRates#commissionBps} here meant a rate change silently re-split every <em>past</em> day
 * at the new rate, while {@code payout_ledger_entry} kept the {@code commissionMinor} it had accrued
 * for those same days. Invariant #9 makes the ledger right — history is never repriced and past
 * statements stay as sent — so this read asks for the rate that applied on the date being reported.
 * The accrual path is unaffected and still reads the live rate at accrual time, which is what
 * fixes each entry permanently. Agreement with the ledger is close but not exact by construction (the
 * ledger is per booking at accrual, this is one rate per service date); what it guarantees is that a
 * past date's figure never changes.
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
