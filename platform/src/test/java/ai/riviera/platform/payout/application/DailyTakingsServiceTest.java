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

	private static VenueRates rates(int bps) {
		return new VenueRates() {
			@Override
			public OptionalInt commissionBps(VenueId id) {
				return OptionalInt.of(bps);
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
