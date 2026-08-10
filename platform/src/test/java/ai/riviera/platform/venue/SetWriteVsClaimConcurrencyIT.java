package ai.riviera.platform.venue;

import java.time.LocalDate;
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
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.ChangeOutcome;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.application.SetRejection;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The per-set layout write racing the online claim (AC-6/AC-7). Both sides lock the one
 * {@code set_position} row — the write with {@code FOR UPDATE}, the claim's pool read with
 * {@code FOR KEY SHARE} — so whichever commits first forces a correct answer out of the other,
 * and neither interleaving can leave a {@code BOOKED_ONLINE} row on a {@code WALK_IN} set
 * (invariant #3) or a hold CASCADE-swept by a delete (invariant #2). Without the locks the
 * loser's stale read wins: the claim checks {@code pool = ONLINE}, the edit flips it, and the
 * insert lands anyway. Repeated to exercise both interleavings against a real Postgres.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetWriteVsClaimConcurrencyIT {

	private static final LocalDate DAY = LocalDate.of(2027, 9, 12);

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(6)
	void claimAndPoolFlipCannotBothWin(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		long venueId = insertVenue("Pool Flip Race " + rep);
		long setId = insertOnlineSet(venueId);
		VenueId venue = new VenueId(venueId);
		OperatorId owner = insertOperator("flip-owner-" + rep);
		grant(owner, venueId);

		CountDownLatch gate = new CountDownLatch(1);
		Callable<ClaimOutcome> claim = () -> {
			gate.await();
			return availability.claim(new SetId(setId), DAY);
		};
		Callable<ChangeOutcome> flip = () -> {
			gate.await();
			return editBeachMap.editSet(owner, venue, new SetId(setId),
					new SetCommand("A", 1, "PREMIUM", "WALK_IN", 3500, "EUR", 1, 1));
		};

		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<ClaimOutcome> claimedF = pool.submit(claim);
			Future<ChangeOutcome> flippedF = pool.submit(flip);
			gate.countDown();
			ClaimOutcome claimed = claimedF.get(20, TimeUnit.SECONDS);
			ChangeOutcome flipped = flippedF.get(20, TimeUnit.SECONDS);

			boolean claimWon = claimed == ClaimOutcome.CLAIMED;
			boolean flipWon = flipped instanceof ChangeOutcome.Applied;
			assertTrue(claimWon != flipWon,
					() -> "exactly one of claim/flip may win, got claim=" + claimed + " flip=" + flipped);
			if (claimWon) {
				assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) flipped).reason(),
						"the claim committed first, so the flip must see the hold");
				assertEquals("ONLINE", poolOf(setId));
			} else {
				assertEquals(ClaimOutcome.NOT_ONLINE_POOL, claimed,
						"the flip committed first, so the claim must re-read the new pool");
				assertEquals("WALK_IN", poolOf(setId));
			}
			assertEquals(claimWon ? 1 : 0, holdsOn(setId),
					"a BOOKED_ONLINE row on a WALK_IN set would break invariant #3");
		}
	}

	@RepeatedTest(6)
	void claimAndRemoveCannotBothWin(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		long venueId = insertVenue("Remove Race " + rep);
		long setId = insertOnlineSet(venueId);
		VenueId venue = new VenueId(venueId);
		OperatorId owner = insertOperator("remove-owner-" + rep);
		grant(owner, venueId);

		CountDownLatch gate = new CountDownLatch(1);
		Callable<ClaimOutcome> claim = () -> {
			gate.await();
			return availability.claim(new SetId(setId), DAY);
		};
		Callable<ChangeOutcome> remove = () -> {
			gate.await();
			return editBeachMap.removeSet(owner, venue, new SetId(setId));
		};

		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<ClaimOutcome> claimedF = pool.submit(claim);
			Future<ChangeOutcome> removedF = pool.submit(remove);
			gate.countDown();
			ClaimOutcome claimed = claimedF.get(20, TimeUnit.SECONDS);
			ChangeOutcome removed = removedF.get(20, TimeUnit.SECONDS);

			boolean claimWon = claimed == ClaimOutcome.CLAIMED;
			boolean removeWon = removed instanceof ChangeOutcome.Applied;
			assertTrue(claimWon != removeWon,
					() -> "exactly one of claim/remove may win, got claim=" + claimed
							+ " remove=" + removed);
			if (claimWon) {
				assertEquals(SetRejection.SET_IN_USE, ((ChangeOutcome.Rejected) removed).reason(),
						"the claim committed first, so the delete must be refused");
				assertEquals(1, setRowsFor(setId), "the set must survive so its hold is not cascaded");
				assertEquals(1, holdsOn(setId));
			} else {
				assertEquals(ClaimOutcome.NO_SUCH_SET, claimed,
						"the delete committed first, so the claim must find no set — never an FK error");
				assertEquals(0, setRowsFor(setId));
			}
		}
	}

	private String poolOf(long setId) {
		return jdbc.sql("SELECT pool FROM set_position WHERE id = :id")
				.param("id", setId).query(String.class).single();
	}

	private int setRowsFor(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_position WHERE id = :id")
				.param("id", setId).query(Integer.class).single();
	}

	private int holdsOn(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :id")
				.param("id", setId).query(Integer.class).single();
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private long insertOnlineSet(long venueId) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'PREMIUM', 'ONLINE', 3500, 'EUR', 1, 1)
				RETURNING id
				""").param("v", venueId).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		long id = jdbc.sql("INSERT INTO operator (username, status) "
						+ "VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", username).query(Long.class).single();
		return new OperatorId(id);
	}

	private void grant(OperatorId operator, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operator.value()).update();
	}
}
