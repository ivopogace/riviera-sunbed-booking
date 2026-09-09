package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;
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
import org.springframework.dao.DataIntegrityViolationException;
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
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The two races the diff-based bulk save must survive, against a real Postgres (an in-memory fake
 * could prove neither the READ COMMITTED re-read behind {@code STALE_WRITE} nor the FK lock behind
 * invariant #2). Modelled on {@link BeachMapReplaceConcurrencyIT}, whose seed is an empty venue;
 * here the venue already has sets, because a diff is only a diff against something.
 *
 * <p>{@link #exactlyOneDiffSaveWins}: two owners load {@code set_version = V} and both save off it —
 * one keeping the map and adding a set, the other only repricing — exactly one is {@code Replaced},
 * the other {@code Rejected(STALE_WRITE)}, the token ends at {@code V+1}, and the kept set keeps its
 * id under whichever writer won. {@link #aRacingMarkOnARemovedSetIsSeenOrBlocks}: a staff walk-in
 * mark on a set the save removes is either seen by the probe (the save is {@code SetsInUse} naming
 * that set, and the mark survives) or blocked on its FK until the delete commits (the mark fails) —
 * never both, never a silently swept hold.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BeachMapDiffConcurrencyIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	EditBeachMap editBeachMap;

	@Autowired
	JdbcClient jdbc;

	@RepeatedTest(5)
	void exactlyOneDiffSaveWins(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue("Diff Concurrency Club " + rep));
		long a1 = insertSet(venue, "A", 1, 1, 1);
		OperatorId owner = insertOperator("diff-conc-owner-" + rep);
		grant(owner, venue.value());

		long priceA = 3000 + rep;
		long priceB = 7000 + rep;
		LayoutCommand growing = new LayoutCommand(List.of(cell(priceA, 1), cell(priceA, 2)));
		LayoutCommand repricing = new LayoutCommand(List.of(cell(priceB, 1)));
		List<ReplaceLayoutOutcome> outcomes = race(owner, venue, List.of(growing, repricing));

		assertEquals(1, outcomes.stream().filter(o -> o instanceof ReplaceLayoutOutcome.Replaced).count(),
				() -> "exactly one writer may save off the same set_version, got " + outcomes);
		assertEquals(1, outcomes.stream().filter(BeachMapDiffConcurrencyIT::isStaleWrite).count(),
				() -> "the other writer must be STALE_WRITE (no double-write, no exception), got " + outcomes);
		assertEquals(1L, setVersionOf(venue), "the surviving row is bumped exactly once (set_version 0 -> 1)");
		long survivingPrice = priceOf(a1);
		assertTrue(survivingPrice == priceA || survivingPrice == priceB,
				() -> "the kept set keeps its id and carries one writer's price, got " + survivingPrice);
		assertEquals(survivingPrice == priceA ? 2 : 1, activeSetCount(venue),
				"the map is one writer's — the growing save's two sets or the repricing save's one");
	}

	@RepeatedTest(4)
	void aRacingMarkOnARemovedSetIsSeenOrBlocks(RepetitionInfo info) throws Exception {
		int rep = info.getCurrentRepetition();
		VenueId venue = new VenueId(insertVenue("Diff Race Club " + rep));
		insertSet(venue, "A", 1, 1, 1);
		long a2 = insertSet(venue, "A", 2, 2, 1);
		OperatorId owner = insertOperator("diff-race-owner-" + rep);
		grant(owner, venue.value());
		LocalDate date = LocalDate.now(TIRANE).plusYears(2).plusDays(rep);

		CountDownLatch gate = new CountDownLatch(1);
		Callable<Boolean> mark = () -> {
			gate.await();
			try {
				jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, 'STAFF_MARKED')")
						.param("s", a2).param("d", date).update();
				return true;
			}
			catch (DataIntegrityViolationException deletedBySave) {
				return false;
			}
		};
		Callable<ReplaceLayoutOutcome> save = () -> {
			gate.await();
			return editBeachMap.replaceLayout(owner, venue, 0L, new LayoutCommand(List.of(cell(2000, 1))));
		};

		try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
			Future<Boolean> heldF = pool.submit(mark);
			Future<ReplaceLayoutOutcome> savedF = pool.submit(save);
			gate.countDown();
			boolean held = heldF.get(20, TimeUnit.SECONDS);
			ReplaceLayoutOutcome outcome = savedF.get(20, TimeUnit.SECONDS);
			boolean saved = outcome instanceof ReplaceLayoutOutcome.Replaced;

			assertFalse(held && saved,
					"a committed walk-in hold was silently lost by a concurrent bulk save (invariant #2)");
			if (held) {
				assertEquals(List.of(new SetId(a2)), ((ReplaceLayoutOutcome.SetsInUse) outcome).sets().stream()
						.map(blocked -> blocked.set().id()).toList(), "the probe saw the hold and named its set");
				assertEquals(1L, holdsOn(a2), "the refused save left the hold in place");
			}
			else {
				assertTrue(saved, () -> "the mark lost its FK race, so the save must have won, got " + outcome);
			}
		}
	}

	private static boolean isStaleWrite(ReplaceLayoutOutcome outcome) {
		return outcome instanceof ReplaceLayoutOutcome.Rejected rejected
				&& rejected.reason() == ReplaceRejection.STALE_WRITE;
	}

	private List<ReplaceLayoutOutcome> race(OperatorId owner, VenueId venue, List<LayoutCommand> layouts)
			throws Exception {
		CountDownLatch startGate = new CountDownLatch(1);
		List<Callable<ReplaceLayoutOutcome>> attempts = layouts.stream()
				.map(layout -> (Callable<ReplaceLayoutOutcome>) () -> {
					startGate.await();
					return editBeachMap.replaceLayout(owner, venue, 0L, layout);
				})
				.toList();
		try (ExecutorService pool = Executors.newFixedThreadPool(layouts.size())) {
			List<Future<ReplaceLayoutOutcome>> futures = attempts.stream().map(pool::submit).toList();
			startGate.countDown();
			List<ReplaceLayoutOutcome> outcomes = new ArrayList<>();
			for (Future<ReplaceLayoutOutcome> f : futures) {
				outcomes.add(f.get(20, TimeUnit.SECONDS));
			}
			return outcomes;
		}
	}

	private static SetCommand cell(long priceMinor, int position) {
		return new SetCommand("A", position, "PREMIUM", Pool.ONLINE, priceMinor, "EUR", position, 1);
	}

	private long insertVenue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Riviera', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", name).query(Long.class).single();
	}

	private long insertSet(VenueId venue, String row, int position, int x, int y) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, :row, :pos, 'PREMIUM', 'ONLINE', 2000, 'EUR', :x, :y)
				RETURNING id
				""").param("v", venue.value()).param("row", row).param("pos", position)
				.param("x", x).param("y", y).query(Long.class).single();
	}

	private OperatorId insertOperator(String username) {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", username).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", username).update();
		long id = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
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

	private long priceOf(long setId) {
		return jdbc.sql("SELECT price_minor FROM set_position WHERE id = :id")
				.param("id", setId).query(Long.class).single();
	}

	private long activeSetCount(VenueId venue) {
		return jdbc.sql("SELECT COUNT(*) FROM active_set_position WHERE venue_id = :v")
				.param("v", venue.value()).query(Long.class).single();
	}

	private long holdsOn(long setId) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s")
				.param("s", setId).query(Long.class).single();
	}
}
