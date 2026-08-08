package ai.riviera.platform.venue;

import java.util.ArrayList;
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
import ai.riviera.platform.venue.application.RowPriceCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The concurrency test for the per-row reprice (AC-2): two operators both load a venue at
 * {@code set_version = V} and both submit a {@code repriceRow} for the same row off it — exactly one
 * must return {@code Applied} and the other {@code Rejected(STALE_WRITE)}, so a stale pricing tab can
 * never silently clobber another writer's prices. Backed by the conditional {@code set_version} bump
 * against a real Postgres (READ COMMITTED re-evaluation). Mirrors {@link VenueProfileConcurrencyIT} /
 * {@link BeachMapReplaceConcurrencyIT}, on the SAME {@code set_version} token the replace uses.
 *
 * <p>Also asserts the row ends at {@code set_version = V+1} (bumped exactly once) and the surviving
 * price is one writer's — the winner's — never a half-merge of both.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueRepriceConcurrencyIT {

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(5)
	void exactlyOneRepriceWins(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue());
		seedRowA(venue.value()); // set_version stays 0 (the column DEFAULT) — both writers load 0
		OperatorId owner = insertOperator("reprice-conc-owner-" + rep);
		grant(owner, venue.value());

		// Both writers loaded set_version 0; each reprices row A to a distinct price so the winner shows.
		long priceA = 3000 + rep;
		long priceB = 7000 + rep;
		List<ChangeOutcome> outcomes = race(owner, venue, List.of(priceA, priceB));

		assertEquals(1, outcomes.stream().filter(o -> o instanceof ChangeOutcome.Applied).count(),
				() -> "exactly one writer may reprice off the same set_version, got " + outcomes);
		assertEquals(1, outcomes.stream().filter(VenueRepriceConcurrencyIT::isStaleWrite).count(),
				() -> "the other writer must be STALE_WRITE (no double-clobber, no exception), got " + outcomes);
		assertEquals(1L, setVersionOf(venue), "the surviving row is bumped exactly once (set_version 0 -> 1)");
		long survivingPrice = survivingPriceOfRowA(venue);
		assertTrue(survivingPrice == priceA || survivingPrice == priceB,
				() -> "the surviving price must be a single writer's (the winner's), got " + survivingPrice);
	}

	private static boolean isStaleWrite(ChangeOutcome outcome) {
		return outcome instanceof ChangeOutcome.Rejected rejected
				&& rejected.reason() == SetRejection.STALE_WRITE;
	}

	/** Fire every writer off the same loaded set_version behind a start-gate to maximise overlap. */
	private List<ChangeOutcome> race(OperatorId owner, VenueId venue, List<Long> prices) throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		List<Callable<ChangeOutcome>> attempts = prices.stream()
				.map(price -> (Callable<ChangeOutcome>) () -> {
					startGate.await();
					return editBeachMap.repriceRow(owner, venue, 0L,
							new RowPriceCommand("A", price, "EUR"));
				})
				.toList();
		try (ExecutorService pool = Executors.newFixedThreadPool(prices.size())) {
			List<Future<ChangeOutcome>> futures = attempts.stream().map(pool::submit).toList();
			startGate.countDown();
			List<ChangeOutcome> outcomes = new ArrayList<>();
			for (Future<ChangeOutcome> f : futures) {
				outcomes.add(f.get(20, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}

	private long insertVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Reprice Concurrency Club', 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
	}

	/** Two ONLINE sets in row A at the seed price; leaves set_version at its 0 DEFAULT. */
	private void seedRowA(long venueId) {
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1),
				       (:v, 'A', 2, 'PREMIUM', 'ONLINE', 3500, 'EUR', 2, 1)
				""").param("v", venueId).update();
	}

	private OperatorId insertOperator(String username) {
		// Defensive cleanup so a reused Testcontainers volume can't collide on the username.
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", username).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
		long id = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES (:u, 'ACTIVE') RETURNING id")
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

	/** Every set in row A carries the winner's price; read the first (all equal after a row reprice). */
	private long survivingPriceOfRowA(VenueId venue) {
		return jdbc.sql("SELECT price_minor FROM set_position WHERE venue_id = :id AND row_label = 'A' "
						+ "ORDER BY position_no LIMIT 1")
				.param("id", venue.value()).query(Long.class).single();
	}
}
