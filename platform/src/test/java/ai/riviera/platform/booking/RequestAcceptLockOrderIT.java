package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.LockOrderRace;
import ai.riviera.platform.PausingPorts;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.application.EditBeachMap;
import ai.riviera.platform.venue.application.LayoutCommand;
import ai.riviera.platform.venue.application.ReplaceLayoutOutcome;
import ai.riviera.platform.venue.application.SetCommand;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A stay accept takes its venue row before any set lock, as the layout writes do (#1305 pair 2): an accept paused
 * after claiming its first stretch's set, the higher-id one, and a layout save over the venue serialize instead of
 * deadlocking on the other set.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, PausingPorts.class})
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class RequestAcceptLockOrderIT {

	@Autowired
	RespondToRequest respondToRequest;
	@Autowired
	EditBeachMap editBeachMap;
	@Autowired
	JdbcClient jdbc;

	private StayFixtures.Venue venue;
	private OperatorId owner;

	@BeforeEach
	void seed() {
		venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		owner = StayFixtures.ownerOf(jdbc, venue);
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	@Test
	void aStayAcceptAndALayoutSaveSerialize() throws Exception {
		SetId lower = venue.online().get(0);
		SetId higher = venue.online().get(1);
		LocalDate first = StayFixtures.firstDay();
		StayFixtures.SeededStay stay = StayFixtures.insertPendingStay(jdbc, venue,
				"LOA" + System.nanoTime() % 100_000_000L, first, higher, 1, lower, 1, Instant.now().plusSeconds(3600));
		VenueId venueId = new VenueId(venue.id());
		LayoutCommand sameLayout = currentLayout();
		long version = jdbc.sql("SELECT set_version FROM venue WHERE id = :v").param("v", venue.id())
				.query(Long.class).single();

		LockOrderRace.Outcome<AcceptOutcome, ReplaceLayoutOutcome> outcome = LockOrderRace.race(jdbc, "claim",
				args -> higher.equals(args[0]),
				() -> respondToRequest.acceptStay(owner, venueId, new StayId(stay.id())),
				() -> editBeachMap.replaceLayout(owner, venueId, version, sameLayout));

		assertThat(outcome.racerWaited()).as("the layout save waited on the accept").isTrue();
		assertThat(outcome.held()).isInstanceOf(AcceptOutcome.Accepted.class);
		assertThat(outcome.raced()).isNotNull();
	}

	private LayoutCommand currentLayout() {
		return new LayoutCommand(jdbc.sql("""
				SELECT row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y
				FROM set_position WHERE venue_id = :v AND retired_at IS NULL ORDER BY id
				""").param("v", venue.id())
				.query((rs, rowNum) -> new SetCommand(rs.getString("row_label"), rs.getInt("position_no"),
						rs.getString("tier"), Pool.valueOf(rs.getString("pool")), rs.getLong("price_minor"),
						rs.getString("price_currency"), rs.getInt("grid_x"), rs.getInt("grid_y")))
				.list());
	}
}
