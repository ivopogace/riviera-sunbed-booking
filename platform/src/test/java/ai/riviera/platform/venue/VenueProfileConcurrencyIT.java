package ai.riviera.platform.venue;

import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
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
import ai.riviera.platform.venue.application.EditVenueProfile;
import ai.riviera.platform.venue.application.ProfileUpdateOutcome;
import ai.riviera.platform.venue.application.VenueProfileCommand;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The headline #224 concurrency test: two operators both load the same venue at {@code version = V}
 * and both save their edit off it — exactly one must {@code APPLY} and the other get
 * {@code STALE_WRITE}, so a stale tab can never silently clobber {@code booking_mode}/{@code booking_cutoff}
 * back (the auto-charge-reversal scenario). Backed by the conditional
 * {@code UPDATE … WHERE id AND version = :expected} against a real Postgres — an in-memory fake
 * could not prove the READ COMMITTED re-evaluation that makes the loser see 0 rows. Mirrors the
 * {@code ConcurrentReservationIT} discipline (RepeatedTest + a {@link CountDownLatch} start-gate) but
 * the invariant under test is #224's optimistic lock, not the availability claim (invariant #2).
 *
 * <p>Also asserts the row ends at {@code version = V+1} (bumped exactly once, never twice) and the
 * surviving {@code name} is one writer's — the winner's — never a half-merge of both.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueProfileConcurrencyIT {

	@Autowired
	EditVenueProfile editVenueProfile;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(5)
	void exactlyOneWriteWins(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue());
		OperatorId owner = insertOperator("conc-owner-" + rep);
		grant(owner, venue.value());

		// Both writers loaded version 0; each writes a distinct name so the winner is identifiable.
		String nameA = "Writer-A-" + rep;
		String nameB = "Writer-B-" + rep;
		List<ProfileUpdateOutcome> outcomes = race(owner, venue, List.of(nameA, nameB));

		assertEquals(1, count(outcomes, ProfileUpdateOutcome.APPLIED),
				() -> "exactly one writer may APPLY off the same version, got " + outcomes);
		assertEquals(1, count(outcomes, ProfileUpdateOutcome.STALE_WRITE),
				() -> "the other writer must be STALE_WRITE (no double-clobber, no exception), got " + outcomes);
		assertEquals(1L, versionOf(venue), "the surviving row is bumped exactly once (version 0 → 1)");
		String survivingName = nameOf(venue);
		assertTrue(survivingName.equals(nameA) || survivingName.equals(nameB),
				() -> "the surviving name must be a single writer's (the winner's), got " + survivingName);
	}

	/** Fire every writer off the same loaded version behind a start-gate to maximise overlap. */
	private List<ProfileUpdateOutcome> race(OperatorId owner, VenueId venue, List<String> names)
			throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		List<Callable<ProfileUpdateOutcome>> attempts = names.stream()
				.map(name -> (Callable<ProfileUpdateOutcome>) () -> {
					startGate.await();
					return editVenueProfile.updateProfile(owner, venue, 0L, command(name));
				})
				.toList();
		try (ExecutorService pool = Executors.newFixedThreadPool(names.size())) {
			List<Future<ProfileUpdateOutcome>> futures = attempts.stream().map(pool::submit).toList();
			startGate.countDown();
			List<ProfileUpdateOutcome> outcomes = new ArrayList<>();
			for (Future<ProfileUpdateOutcome> f : futures) {
				outcomes.add(f.get(20, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}

	private static long count(List<ProfileUpdateOutcome> outcomes, ProfileUpdateOutcome target) {
		return outcomes.stream().filter(o -> o == target).count();
	}

	private static VenueProfileCommand command(String name) {
		return new VenueProfileCommand(name, "Ksamil", "Riviera", "desc", "INSTANT",
				LocalTime.of(18, 0), Set.of(), null);
	}

	private long insertVenue() {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Concurrency Club', 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
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

	private long versionOf(VenueId venue) {
		return jdbc.sql("SELECT version FROM venue WHERE id = :id")
				.param("id", venue.value()).query(Long.class).single();
	}

	private String nameOf(VenueId venue) {
		return jdbc.sql("SELECT name FROM venue WHERE id = :id")
				.param("id", venue.value()).query(String.class).single();
	}
}
