package ai.riviera.platform.venue;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.RepetitionInfo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.ReplaceRejection;
import ai.riviera.platform.venue.application.RowPriceCommand;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The #226 cross-write concurrency test (AC-3): a {@code replaceLayout} and a {@code repriceRow} race
 * off the <strong>same</strong> {@code set_version = V} — exactly one applies and the other is
 * {@code STALE_WRITE}, proving the two set-writes share ONE token (they write overlapping columns:
 * map-replace re-sends {@code price_minor}, reprice overwrites it, so they must not both win). Also
 * exercises the R-1 lock ordering: both paths take the venue row (the {@code set_version} bump) before
 * its {@code set_position} rows, so replace-vs-reprice on one venue can never deadlock — the loser
 * blocks on the venue row, re-reads a bumped token, and returns {@code STALE_WRITE} without touching any
 * set row. Repeated to exercise both interleavings against a real Postgres.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueSetWriteConcurrencyIT {

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(6)
	void replaceAndRepriceCannotBothWin(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue());
		seedRowA(venue.value()); // set_version stays 0 (the DEFAULT); no holds/bookings, so replace isn't LAYOUT_IN_USE
		OperatorId owner = insertOperator("crosswrite-owner-" + rep);
		grant(owner, venue.value());

		CountDownLatch gate = new CountDownLatch(1);
		Callable<ReplaceLayoutOutcome> replace = () -> {
			gate.await();
			return editBeachMap.replaceLayout(owner, venue, 0L, new LayoutCommand(
					List.of(new SetCommand("A", 1, "PREMIUM", "ONLINE", 9100 + rep, "EUR", 1, 1))));
		};
		Callable<ChangeOutcome> reprice = () -> {
			gate.await();
			return editBeachMap.repriceRow(owner, venue, 0L, new RowPriceCommand("A", 9200 + rep, "EUR"));
		};

		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<ReplaceLayoutOutcome> replacedF = pool.submit(replace);
			Future<ChangeOutcome> repricedF = pool.submit(reprice);
			gate.countDown();
			ReplaceLayoutOutcome replaced = replacedF.get(20, TimeUnit.SECONDS);
			ChangeOutcome repriced = repricedF.get(20, TimeUnit.SECONDS);

			int applied = (replaced instanceof ReplaceLayoutOutcome.Replaced ? 1 : 0)
					+ (repriced instanceof ChangeOutcome.Applied ? 1 : 0);
			int stale = (isStale(replaced) ? 1 : 0) + (isStale(repriced) ? 1 : 0);

			assertEquals(1, applied,
					() -> "exactly one of replace/reprice may apply off the same set_version, got replace="
							+ replaced + " reprice=" + repriced);
			assertEquals(1, stale,
					() -> "the other must be STALE_WRITE (they share one token), got replace=" + replaced
							+ " reprice=" + repriced);
			assertEquals(1L, setVersionOf(venue), "the shared token is bumped exactly once (0 -> 1)");
		}
	}

	private static boolean isStale(ReplaceLayoutOutcome outcome) {
		return outcome instanceof ReplaceLayoutOutcome.Rejected r && r.reason() == ReplaceRejection.STALE_WRITE;
	}

	private static boolean isStale(ChangeOutcome outcome) {
		return outcome instanceof ChangeOutcome.Rejected r && r.reason() == SetRejection.STALE_WRITE;
	}

	private long insertVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Cross-write Concurrency Club', 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	/** Two ONLINE sets in row A; leaves set_version at its 0 DEFAULT and the venue unclaimed. */
	private void seedRowA(long venueId) {
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1),
				       (:v, 'A', 2, 'PREMIUM', 'ONLINE', 3500, 'EUR', 2, 1)
				""").param("v", venueId).update();
	}

	private OperatorId insertOperator(String username) {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", username).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
		long id = jdbc.sql("INSERT INTO operator (username, status, owns_all_venues) "
						+ "VALUES (:u, 'ACTIVE', FALSE) RETURNING id")
				.param("u", username).query(Long.class).single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}

	private long setVersionOf(VenueId venue) {
		return jdbc.sql("SELECT set_version FROM venue WHERE id = :id")
				.param("id", venue.value()).query(Long.class).single();
	}
}
