package ai.riviera.platform.itinerary.application;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.IsolationBeaches;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Measures the coast verdict at a peak shape — 40 venues × 60 online sets × a 14-day span at ~70 %
 * per-day occupancy — through the {@link StayVerdicts} seam, and prints the median wall time, the
 * rows read and the range read's {@code EXPLAIN (ANALYZE, BUFFERS)} for the plan to record. The bound
 * asserted is a never-flaking ceiling; the numbers, not the pass, are the result.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CoastVerdictCostIT {

	private static final String BEACH = IsolationBeaches.STAY_COST_IT_BEACH;
	private static final int VENUES = 40;
	private static final int SETS_PER_VENUE = 60;
	private static final int DAYS = 14;
	private static final double OCCUPANCY = 0.7;
	private static final long CEILING_MS = 2_000;
	private static final LocalDate D1 = LocalDate.of(2026, 8, 1);
	private static final StaySpan SPAN = new StaySpan(D1, D1.plusDays(DAYS - 1L));

	@Autowired
	StayVerdicts verdicts;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	JdbcTemplate template;

	private final List<VenueId> venueIds = new ArrayList<>();
	private final List<Long> setIds = new ArrayList<>();

	@BeforeEach
	void seedPeakShape() {
		Random random = new Random(1206);
		for (int v = 0; v < VENUES; v++) {
			long venueId = jdbc.sql("""
					INSERT INTO venue (name, beach, rating_tenths, reviews_count, booking_mode,
					                   commission_bps, payout_currency)
					VALUES (:name, :beach, 40, 1, 'INSTANT', 1500, 'EUR')
					RETURNING id
					""")
					.param("name", "cost-it venue " + v).param("beach", BEACH)
					.query(Long.class).single();
			OwnershipFixtures.grantToBootstrap(jdbc, venueId);
			venueIds.add(new VenueId(venueId));
			for (int s = 1; s <= SETS_PER_VENUE; s++) {
				setIds.add(jdbc.sql("""
						INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
						                          price_currency, grid_x, grid_y)
						VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2500, 'EUR', :pos, 1)
						RETURNING id
						""")
						.param("v", venueId).param("pos", s)
						.query(Long.class).single());
			}
		}
		List<Object[]> rows = new ArrayList<>();
		for (long setId : setIds) {
			for (int day = 0; day < DAYS; day++) {
				if (random.nextDouble() < OCCUPANCY) {
					rows.add(new Object[] { setId, D1.plusDays(day) });
				}
			}
		}
		template.batchUpdate("INSERT INTO set_availability (set_id, booking_date, state) VALUES (?, ?, 'BOOKED_ONLINE')",
				new BatchPreparedStatementSetter() {
					@Override
					public void setValues(PreparedStatement ps, int i) throws SQLException {
						ps.setLong(1, (Long) rows.get(i)[0]);
						ps.setObject(2, rows.get(i)[1]);
					}

					@Override
					public int getBatchSize() {
						return rows.size();
					}
				});
		template.execute("ANALYZE set_availability");
	}

	@AfterEach
	void cleanup() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (SELECT id FROM venue WHERE beach = :b)")
				.param("b", BEACH).update();
		jdbc.sql("DELETE FROM venue WHERE beach = :b").param("b", BEACH).update();
	}

	@Test
	void peakShapeCoastReadIsMeasured() {
		int rows = jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id IN (:ids)")
				.param("ids", setIds).query(Integer.class).single();
		verdicts.forCoast(venueIds, SPAN);
		List<Long> timesMs = new ArrayList<>();
		for (int run = 0; run < 5; run++) {
			long started = System.nanoTime();
			assertEquals(VENUES, verdicts.forCoast(venueIds, SPAN).size());
			timesMs.add((System.nanoTime() - started) / 1_000_000);
		}
		List<Long> sorted = timesMs.stream().sorted().toList();
		long median = sorted.get(sorted.size() / 2);
		String plan = String.join("\n", jdbc.sql("""
				EXPLAIN (ANALYZE, BUFFERS)
				SELECT set_id, booking_date
				FROM set_availability
				WHERE set_id IN (:ids)
				  AND booking_date BETWEEN :from AND :to
				ORDER BY set_id, booking_date
				""")
				.param("ids", setIds).param("from", SPAN.firstDay()).param("to", SPAN.lastDay())
				.query(String.class).list());
		System.out.printf("COAST-COST shape=%d venues x %d sets x %d days occupancy=%.2f rows=%d times_ms=%s median_ms=%d%n",
				VENUES, SETS_PER_VENUE, DAYS, OCCUPANCY, rows, timesMs, median);
		System.out.println("COAST-COST plan:\n" + plan);
		assertTrue(median < CEILING_MS, "median " + median + " ms over the " + CEILING_MS + " ms ceiling");
	}
}
