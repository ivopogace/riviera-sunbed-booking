package ai.riviera.platform.payout.application;

import java.time.LocalDate;
import java.util.OptionalInt;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.api.DailyTakings;
import ai.riviera.platform.booking.vocabulary.OnlineTakings;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The console daily-takings read (#171, O2): applies the venue commission once to the aggregate
 * gross ({@code payout} owns the arithmetic, invariant #9) and enforces per-venue ownership
 * <strong>before</strong> reading any financial data (invariant #13). Fakes at every seam — the SQL
 * gross lives in {@code JdbcBookingsDailyTakingsIT}, this pins the composition.
 */
class DailyTakingsServiceTest {

	private static final OperatorId OPERATOR = new OperatorId(7);
	private static final VenueId VENUE = new VenueId(3);
	private static final LocalDate DAY = LocalDate.of(2026, 7, 7);

	@Test
	void appliesVenueCommissionOnceOnAggregate() {
		DailyTakingsService service =
				new DailyTakingsService((venue, date) -> new OnlineTakings(11000, "EUR"), rates(1500), allowAll());

		DailyTakingsView view = service.forVenueOn(OPERATOR, VENUE, DAY);

		assertEquals(11000, view.grossMinor());
		assertEquals(1650, view.commissionMinor());
		assertEquals(9350, view.netMinor());
		assertEquals(1500, view.commissionBps());
		assertEquals("EUR", view.currency());
		assertEquals(DAY, view.date());
	}

	@Test
	void emptyDayYieldsZerosInEur() {
		DailyTakingsService service =
				new DailyTakingsService((venue, date) -> new OnlineTakings(0, "EUR"), rates(1500), allowAll());

		DailyTakingsView view = service.forVenueOn(OPERATOR, VENUE, DAY);

		assertEquals(0, view.grossMinor());
		assertEquals(0, view.commissionMinor());
		assertEquals(0, view.netMinor());
		assertEquals("EUR", view.currency());
	}

	@Test
	void aVenueWithNoCommissionRateOwesTheFullGross() {
		// VenueRates returns empty (no rate configured) -> 0 bps -> net == gross, no exception.
		DailyTakingsService service = new DailyTakingsService(
				(venue, date) -> new OnlineTakings(4000, "EUR"), noRates(), allowAll());

		DailyTakingsView view = service.forVenueOn(OPERATOR, VENUE, DAY);

		assertEquals(4000, view.grossMinor());
		assertEquals(0, view.commissionMinor());
		assertEquals(4000, view.netMinor());
		assertEquals(0, view.commissionBps());
	}

	@Test
	void pastServiceDatesKeepTheRateTheyWereSoldAt() {
		// The venue's rate rose 15% -> 20% with effect from the day after DAY (A7, #348). DAY's
		// bookings were sold — and their ledger entries accrued — at 15%, so DAY must still split at
		// 15%; reading the live rate here would silently reprice a day already reported (invariant #9).
		LocalDate effectiveFrom = DAY.plusDays(1);
		DailyTakingsService service = new DailyTakingsService((venue, date) -> new OnlineTakings(11000, "EUR"),
				ratesChanging(1500, 2000, effectiveFrom), allowAll());

		DailyTakingsView pastDay = service.forVenueOn(OPERATOR, VENUE, DAY);

		assertEquals(1500, pastDay.commissionBps(), "a past service date keeps its own rate");
		assertEquals(1650, pastDay.commissionMinor());
		assertEquals(9350, pastDay.netMinor());
	}

	@Test
	void serviceDatesFromTheEffectiveDateOnwardSplitAtTheNewRate() {
		LocalDate effectiveFrom = DAY.plusDays(1);
		DailyTakingsService service = new DailyTakingsService((venue, date) -> new OnlineTakings(11000, "EUR"),
				ratesChanging(1500, 2000, effectiveFrom), allowAll());

		DailyTakingsView newDay = service.forVenueOn(OPERATOR, VENUE, effectiveFrom);

		assertEquals(2000, newDay.commissionBps());
		assertEquals(2200, newDay.commissionMinor());
		assertEquals(8800, newDay.netMinor());
	}

	@Test
	void assertsOwnershipBeforeReadingAnyFinancialData() {
		boolean[] takingsRead = {false};
		DailyTakings spyTakings = (venue, date) -> {
			takingsRead[0] = true;
			return new OnlineTakings(1, "EUR");
		};

		DailyTakingsService service = new DailyTakingsService(spyTakings, rates(1500), denyAll());

		assertThrows(NotVenueOwnerException.class, () -> service.forVenueOn(OPERATOR, VENUE, DAY));
		assertFalse(takingsRead[0], "ownership is asserted before any takings read (invariant #13, BOLA)");
	}

	/**
	 * A venue whose rate is {@code bps} on every service date — the shape of every venue whose rate
	 * has never changed. The live read answers the same value, so a service reading either one passes;
	 * {@link #pastServiceDatesKeepTheRateTheyWereSoldAt} is what distinguishes them.
	 */
	private static VenueRates rates(int bps) {
		return ratesChanging(bps, bps, DAY);
	}

	/**
	 * A venue whose rate changed to {@code liveBps} with effect from {@code effectiveFrom}, having been
	 * {@code scheduledBps} before. The <strong>live</strong> read answers the new rate (that is what
	 * "live" means — the next accrual uses it); the dated read answers per service date. A service
	 * reading the live rate therefore re-splits past days at the new rate, which is the defect.
	 */
	private static VenueRates ratesChanging(int scheduledBps, int liveBps, LocalDate effectiveFrom) {
		return new VenueRates() {
			@Override
			public OptionalInt commissionBps(VenueId id) {
				return OptionalInt.of(liveBps);
			}

			@Override
			public OptionalInt commissionBpsOn(VenueId id, LocalDate serviceDate) {
				return OptionalInt.of(serviceDate.isBefore(effectiveFrom) ? scheduledBps : liveBps);
			}

			@Override
			public OptionalInt lateCancelRefundBps(VenueId id) {
				return OptionalInt.empty();
			}
		};
	}

	private static VenueRates noRates() {
		return new VenueRates() {
			@Override
			public OptionalInt commissionBps(VenueId id) {
				return OptionalInt.empty();
			}

			@Override
			public OptionalInt commissionBpsOn(VenueId id, LocalDate serviceDate) {
				return OptionalInt.empty();
			}

			@Override
			public OptionalInt lateCancelRefundBps(VenueId id) {
				return OptionalInt.empty();
			}
		};
	}

	private static VenueOwnership allowAll() {
		return new VenueOwnership() {
			@Override
			public void assertOwns(OperatorId operator, VenueRef venue) {
				// owns everything
			}

			@Override
			public Set<VenueRef> ownedVenues(OperatorId operator) {
				return Set.of();
			}

			@Override
			public void assignOwner(OperatorId operator, VenueRef venue) {
				// not exercised by the takings read
			}
		};
	}

	private static VenueOwnership denyAll() {
		return new VenueOwnership() {
			@Override
			public void assertOwns(OperatorId operator, VenueRef venue) {
				throw new NotVenueOwnerException(operator, venue);
			}

			@Override
			public Set<VenueRef> ownedVenues(OperatorId operator) {
				return Set.of();
			}

			@Override
			public void assignOwner(OperatorId operator, VenueRef venue) {
				// not exercised by the takings read
			}
		};
	}
}
