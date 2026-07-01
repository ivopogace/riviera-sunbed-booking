package ai.riviera.platform.payout;

import java.time.Duration;
import java.time.LocalDate;
import java.util.OptionalInt;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.test.ApplicationModuleTest;
import org.springframework.modulith.test.Scenario;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.BookingConfirmed;
import ai.riviera.platform.booking.api.BookingId;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.api.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * The {@code payout} module in <strong>isolation</strong> (issue #9) — the Spring Modulith
 * {@code @ApplicationModuleTest} counterpart to the full-stack {@code PayoutAccrualIT} /
 * {@code PayoutSpineScenarioIT}. Only {@code payout} (and its infrastructure) is bootstrapped; its
 * sole cross-module collaborator, {@code venue::api}'s {@link VenueCatalog}, is supplied as a
 * {@code @MockitoBean} rather than the real adapter, so the test pins "given a
 * {@link BookingConfirmed}, the listener accrues correctly" without dragging in the {@code booking}
 * create flow. {@code @ApplicationModuleTest} enables the {@link Scenario} DSL implicitly — no
 * {@code @EnableScenarios} needed (contrast the {@code @SpringBootTest} ITs).
 *
 * <p>Flyway still migrates the full schema and the ledger's FKs are real, so a backing {@code booking}
 * row is inserted; the commission rate, however, comes entirely from the mocked port — which is the
 * point of the isolation. Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@ApplicationModuleTest
class PayoutModuleTest {

	private static final Duration WAIT = Duration.ofSeconds(15);

	@MockitoBean
	VenueCatalog venues;

	// The ledger-read service (PayoutLedgerQueryService) depends on operator::api's ownership port,
	// and the root edge (SecurityConfig + its beans) depends on operator::api too — CurrentOperator on
	// OperatorDirectory, the DB-backed UserDetailsService on OperatorAccounts, and the #74 boot
	// provisioner on OperatorProvisioning. In module isolation the operator module isn't bootstrapped,
	// so these operator::api ports are supplied as mocks to let the payout context load; the accrual
	// listener under test uses none of them.
	@MockitoBean
	VenueOwnership ownership;

	@MockitoBean
	CurrentOperator currentOperator;

	@MockitoBean
	OperatorAccounts accounts;

	@MockitoBean
	OperatorProvisioning provisioning;

	@Autowired
	JdbcClient jdbc;

	private record Ref(long bookingId, long venueId, long setId) {
	}

	/** Insert a CONFIRMED booking on a seeded online set (the ledger FK target). */
	private Ref insertBooking(String code) {
		var set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new long[] {rs.getLong("id"), rs.getLong("venue_id")}).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED')
				RETURNING id
				""")
				.param("code", code).param("venue", set[1]).param("set", set[0])
				.param("cust", customer).param("date", LocalDate.of(2029, 9, 1))
				.query(Long.class).single();
		return new Ref(booking, set[1], set[0]);
	}

	private BookingConfirmed event(Ref b) {
		return new BookingConfirmed(new BookingId(b.bookingId()), new VenueId(b.venueId()),
				new SetId(b.setId()), LocalDate.of(2029, 9, 1), 4500L, "EUR");
	}

	private long accrualRows(long bookingId) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	private long netFor(long bookingId) {
		return jdbc.sql("SELECT net_minor FROM payout_ledger_entry "
						+ "WHERE booking_id = :id AND entry_type = 'ACCRUAL'")
				.param("id", bookingId).query(Long.class).single();
	}

	@Test
	void accruesOnBookingConfirmed(Scenario scenario) {
		Ref b = insertBooking("MODTEST0001");
		when(venues.commissionBps(any(VenueId.class))).thenReturn(OptionalInt.of(1500));

		scenario.publish(event(b))
				.andWaitAtMost(WAIT)
				.forStateChange(() -> accrualRows(b.bookingId()), (Long rows) -> rows == 1L)
				.andVerify(rows -> {
					assertEquals(1L, rows, "the listener accrues exactly one entry");
					assertEquals(3825L, netFor(b.bookingId()), "net = 4500 - 15% (675)");
				});
	}

	@Test
	void usesCommissionRateFromVenuePort(Scenario scenario) {
		// The isolation payoff: swapping the mocked rate changes the accrual, proving the commission
		// comes from venue::api at accrual time, not from the event (invariant #11).
		Ref b = insertBooking("MODTEST0002");
		when(venues.commissionBps(any(VenueId.class))).thenReturn(OptionalInt.of(1000)); // 10.00%

		scenario.publish(event(b))
				.andWaitAtMost(WAIT)
				.forStateChange(() -> accrualRows(b.bookingId()), (Long rows) -> rows == 1L)
				.andVerify(rows -> assertEquals(4050L, netFor(b.bookingId()),
						"net = 4500 - 10% (450); the rate comes from the venue port, not the event"));
	}
}
