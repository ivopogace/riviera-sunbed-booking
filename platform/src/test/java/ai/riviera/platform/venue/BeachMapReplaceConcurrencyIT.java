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
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.ReplaceRejection;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The headline concurrency test for the beach-map replace (AC-1): two operators both load a venue's
 * layout at {@code set_version = V} and both submit a {@code replaceLayout} off it — exactly one must
 * return {@code Replaced} and the other {@code Rejected(STALE_WRITE)}, so a stale layout tab can never
 * silently clobber another writer's map. Backed by the conditional
 * {@code UPDATE venue SET set_version = set_version + 1 WHERE id AND set_version = :expected} against a
 * real Postgres — an in-memory fake could not prove the READ COMMITTED re-evaluation that makes the loser
 * see 0 rows. Mirrors {@link VenueProfileConcurrencyIT} (RepeatedTest + a {@link CountDownLatch}
 * start-gate) but the token under test is the SEPARATE {@code set_version}, not the profile
 * {@code version}.
 *
 * <p>Also asserts the row ends at {@code set_version = V+1} (bumped exactly once, never twice) and the
 * surviving single-cell layout is one writer's — the winner's — never a half-merge of both.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BeachMapReplaceConcurrencyIT {

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(5)
	void exactlyOneReplaceWins(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue());
		OperatorId owner = insertOperator("replace-conc-owner-" + rep);
		grant(owner, venue.value());

		// Both writers loaded set_version 0; each submits a distinct price so the winner is identifiable.
		long priceA = 3000 + rep;
		long priceB = 7000 + rep;
		List<ReplaceLayoutOutcome> outcomes = race(owner, venue, List.of(priceA, priceB));

		assertEquals(1, outcomes.stream().filter(o -> o instanceof ReplaceLayoutOutcome.Replaced).count(),
				() -> "exactly one writer may replace off the same set_version, got " + outcomes);
		assertEquals(1, outcomes.stream().filter(BeachMapReplaceConcurrencyIT::isStaleWrite).count(),
				() -> "the other writer must be STALE_WRITE (no double-clobber, no exception), got " + outcomes);
		assertEquals(1L, setVersionOf(venue), "the surviving row is bumped exactly once (set_version 0 -> 1)");
		long survivingPrice = survivingPrice(venue);
		assertTrue(survivingPrice == priceA || survivingPrice == priceB,
				() -> "the surviving layout must be a single writer's (the winner's), got " + survivingPrice);
	}

	private static boolean isStaleWrite(ReplaceLayoutOutcome outcome) {
		return outcome instanceof ReplaceLayoutOutcome.Rejected rejected
				&& rejected.reason() == ReplaceRejection.STALE_WRITE;
	}

	/** Fire every writer off the same loaded set_version behind a start-gate to maximise overlap. */
	private List<ReplaceLayoutOutcome> race(OperatorId owner, VenueId venue, List<Long> prices)
			throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		List<Callable<ReplaceLayoutOutcome>> attempts = prices.stream()
				.map(price -> (Callable<ReplaceLayoutOutcome>) () -> {
					startGate.await();
					return editBeachMap.replaceLayout(owner, venue, 0L, layout(price));
				})
				.toList();
		try (ExecutorService pool = Executors.newFixedThreadPool(prices.size())) {
			List<Future<ReplaceLayoutOutcome>> futures = attempts.stream().map(pool::submit).toList();
			startGate.countDown();
			List<ReplaceLayoutOutcome> outcomes = new ArrayList<>();
			for (Future<ReplaceLayoutOutcome> f : futures) {
				outcomes.add(f.get(20, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}

	/** A single-cell layout at the given price — distinct per writer so the winner is identifiable. */
	private static LayoutCommand layout(long priceMinor) {
		return new LayoutCommand(List.of(new SetCommand("A", 1, "PREMIUM", Pool.ONLINE, priceMinor, "EUR", 1, 1)));
	}

	private long insertVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Replace Concurrency Club', 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
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

	/** The price of the venue's single surviving set — identifies which writer's layout landed. */
	private long survivingPrice(VenueId venue) {
		return jdbc.sql("SELECT price_minor FROM set_position WHERE venue_id = :id")
				.param("id", venue.value()).query(Long.class).single();
	}
}
