package ai.riviera.platform.booking.adapter.out;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.BookingTransition;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Binds {@link BookingTransition} to the guarded {@code UPDATE}s that enforce it: every transition is
 * driven against a booking in every one of the nine statuses, and must write exactly where the table
 * says it may. Nothing here derives SQL from the table — the two are written independently and this
 * is where they are made to agree, the way {@code BookingMigrationIT.everyEnumStatusAccepted} binds
 * {@link BookingStatus} to {@code booking_status_check}.
 *
 * <p>Fixtures are dated far enough back that the no-show sweep's date bound reaches this class's rows
 * and nothing else's, and are deleted after each transition. Testcontainers; skipped where Docker is
 * absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class JdbcBookingTransitionTableIT {

	private static final Instant NOW = Instant.parse("2001-05-05T10:00:00Z");

	/** Older than every other suite's fixtures, so this class's sweep call selects only its own rows. */
	private static final LocalDate SERVICE_DATE = LocalDate.of(2001, 5, 5);

	private static final String CODE_PREFIX = "TBL";

	private static final int SWEEP_BATCH = 500;

	@Autowired
	Bookings bookings;

	@Autowired
	JdbcClient jdbc;

	@AfterEach
	void removeFixtures() {
		jdbc.sql("DELETE FROM booking WHERE code LIKE :prefix").param("prefix", CODE_PREFIX + "%").update();
		jdbc.sql("DELETE FROM customer WHERE email LIKE :prefix").param("prefix", CODE_PREFIX + "%").update();
	}

	@ParameterizedTest
	@EnumSource(BookingTransition.class)
	void eachTransitionWritesExactlyWhereTheTableAdmitsIt(BookingTransition transition) {
		for (BookingStatus before : BookingStatus.values()) {
			Seeded booking = seed(transition, before);

			boolean reported = drive(transition, booking);
			BookingStatus after = statusOf(booking.id());

			assertEquals(transition.admits(before) ? transition.target() : before, after,
					transition + " on a " + before + " booking wrote " + after
							+ " — the table and the guarded UPDATE disagree");
			if (transition != BookingTransition.SWEEP_NO_SHOW) {
				// The sweep reports a batch count; every other call reports its own write.
				assertEquals(transition.admits(before), reported,
						transition + " on a " + before + " booking must report what it wrote");
			}
		}
	}

	private boolean drive(BookingTransition transition, Seeded booking) {
		return switch (transition) {
			case ACCEPT_REQUEST ->
				bookings.acceptPendingRequest(booking.id(), booking.venueId(), NOW).isPresent();
			case DECLINE_REQUEST -> bookings.declinePending(booking.id(), booking.venueId()).isPresent();
			case WITHDRAW_REQUEST -> bookings.withdrawPendingRequest(booking.code()).isPresent();
			case EXPIRE_REQUEST -> bookings.expirePendingRequest(booking.id(), NOW).isPresent();
			case REVERT_ACCEPT -> bookings.revertAcceptToPending(booking.id());
			case CONFIRM_PAYMENT -> bookings.confirmFromPayment(booking.id(), NOW).isPresent();
			case RELEASE_UNPAID -> bookings.cancelAwaitingPayment(booking.id()).isPresent();
			case CANCEL_BY_GUEST -> bookings.cancelConfirmed(booking.id(), NOW, 0L).isPresent();
			case CHECK_IN ->
				bookings.completeConfirmed(booking.code(), booking.venueId(), SERVICE_DATE, NOW).isPresent();
			case SWEEP_NO_SHOW -> bookings.markPastConfirmedAsNoShow(SERVICE_DATE.plusDays(1), SWEEP_BATCH) > 0;
			case WEATHER_REFUND -> bookings.cancelForWeather(booking.id(), NOW, 0L).isPresent();
		};
	}

	private record Seeded(long id, String code, VenueId venueId) {
	}

	private record SetRef(long setId, long venueId) {
	}

	private Seeded seed(BookingTransition transition, BookingStatus status) {
		SetRef set = jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
		String code = CODE_PREFIX + transition.ordinal() + "S" + status.ordinal();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:email, 'Guest', '+355600') RETURNING id")
				.param("email", code + "@example.test").query(Long.class).single();
		// Only the expiry sweep wants a deadline behind it; every other guard here is on status alone.
		Instant expiresAt = transition == BookingTransition.EXPIRE_REQUEST
				? NOW.minus(Duration.ofHours(1))
				: NOW.plus(Duration.ofHours(1));
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :customer, :date, 4500, 'EUR', :status, :expires)
				RETURNING id
				""")
				.param("code", code)
				.param("venue", set.venueId())
				.param("set", set.setId())
				.param("customer", customer)
				.param("date", SERVICE_DATE)
				.param("status", status.name())
				.param("expires", java.sql.Timestamp.from(expiresAt))
				.query(Long.class).single();
		return new Seeded(id, code, new VenueId(set.venueId()));
	}

	private BookingStatus statusOf(long bookingId) {
		return BookingStatus.valueOf(jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single());
	}
}
