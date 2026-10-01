package ai.riviera.platform;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.application.checkin.MarkNoShows;
import ai.riviera.platform.booking.application.refund.RefundForWeather;
import ai.riviera.platform.booking.application.refund.WeatherRefundOutcome;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.remodel.application.RemodelCommitOutcome;
import ai.riviera.platform.remodel.application.RemodelCommitService;
import ai.riviera.platform.venue.vocabulary.LayoutCell;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The weather refund locks its bookings in {@code (booking_date, id)} order before any write, the order the no-show
 * sweep and a remodel commit take (#1305 pairs 3 and 4). Two bookings covering the storm day, the lower id with the
 * later first day, are refunded while the sweep or a remodel reaches for them: the two serialize instead of
 * deadlocking. The refund is paused after its first booking write.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest(properties = {"booking.no-show.enabled=false", "booking.awaiting-payment.initial-delay=PT2H"})
class WeatherRefundLockOrderIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	RefundForWeather weather;
	@Autowired
	MarkNoShows noShows;
	@Autowired
	RemodelCommitService remodels;
	@Autowired
	RemodelClaims claims;
	@Autowired
	JdbcClient jdbc;

	private VenueId venue;
	private OperatorId owner;
	private List<Long> sets;

	@BeforeEach
	void seedVenue() {
		long venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", "Storm Lock " + System.nanoTime()).query(Long.class).single();
		venue = new VenueId(venueId);
		owner = new OperatorId(jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "storm-lock-" + System.nanoTime()).query(Long.class).single());
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", owner.value()).update();
		sets = List.of(insertSet(1), insertSet(2), insertSet(3), insertSet(4));
	}

	@Test
	void aWeatherRefundAndTheNoShowSweepSerialize() throws Exception {
		LocalDate storm = LocalDate.of(2019, 1, 1).plusDays(System.nanoTime() % 2000);
		long lone = confirmed(sets.get(0), storm, storm);
		long stay = confirmed(sets.get(1), storm.minusDays(1), storm);

		LockOrderRace.Outcome<WeatherRefundOutcome, Integer> outcome = LockOrderRace.race(jdbc, "cancelByVenue",
				args -> args[0].equals(lone),
				() -> weather.refundForWeather(owner, venue, storm),
				() -> noShows.sweep());

		assertThat(outcome.racerWaited()).as("the sweep waited on the refund").isTrue();
		assertThat(outcome.held().refundedCount()).isEqualTo(1);
		assertThat(outcome.held().dayRefundCount()).isEqualTo(1);
		assertThat(status(stay)).isEqualTo("NO_SHOW");
	}

	@Test
	void aWeatherRefundAndARemodelCommitSerialize() throws Exception {
		LocalDate storm = LocalDate.now(TIRANE).plusDays(20);
		long later = confirmed(sets.get(0), storm, storm.plusDays(1));
		long earlier = confirmed(sets.get(1), storm.minusDays(1), storm);
		PreviewToken token = PreviewToken.of(claims.classify(owner, venue,
				List.of(new SetId(sets.get(0)), new SetId(sets.get(1)))));

		LockOrderRace.Outcome<WeatherRefundOutcome, RemodelCommitOutcome> outcome = LockOrderRace.race(jdbc,
				"refundDay", args -> args[0].equals(later),
				() -> weather.refundForWeather(owner, venue, storm),
				() -> remodels.commit(owner, venue, 0L, List.of(cell(3), cell(4)), token, RefundConfirmation.NONE));

		assertThat(outcome.racerWaited()).as("the remodel waited on the refund").isTrue();
		assertThat(outcome.held().dayRefundCount()).isEqualTo(2);
		assertThat(outcome.raced()).isInstanceOf(RemodelCommitOutcome.Committed.class);
		assertThat(List.of(setOf(later), setOf(earlier))).containsExactlyInAnyOrder(sets.get(2), sets.get(3));
	}

	private long confirmed(long setId, LocalDate first, LocalDate last) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", "storm-lock-" + System.nanoTime() + "@example.com").query(Long.class).single();
		for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
			jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:s, :d, 'BOOKED_ONLINE')")
					.param("s", setId).param("d", day).update();
		}
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :v, :s, :c, :first, :last, 4000, 'EUR', 'CONFIRMED', NOW())
				RETURNING id
				""")
				.param("code", "SL" + System.nanoTime() % 100_000_000L).param("v", venue.value()).param("s", setId)
				.param("c", customer).param("first", first).param("last", last)
				.query(Long.class).single();
	}

	private long insertSet(int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency,
				                          grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2000, 'EUR', :pos, 1)
				RETURNING id
				""").param("v", venue.value()).param("pos", position).query(Long.class).single();
	}

	private static LayoutCell cell(int position) {
		return new LayoutCell("A", position, "STANDARD", Pool.ONLINE, 2000, "EUR", position, 1);
	}

	private String status(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId).query(String.class).single();
	}

	private long setOf(long bookingId) {
		return jdbc.sql("SELECT set_id FROM booking WHERE id = :id").param("id", bookingId).query(Long.class).single();
	}
}
