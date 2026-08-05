package ai.riviera.platform.venue;

import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code venue.api} booking-info lookup the {@code booking} module relies on
 * (issue #6): an ONLINE seeded set resolves to its venue, pool, price (minor units) and the
 * venue's evening-before cutoff; an unknown set is empty. Real Postgres + seed (V3) via
 * Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetBookingInfoIT {

	@Autowired
	SetBookingFacts catalog;

	@Autowired
	VenueRates rates;

	@Autowired
	JdbcClient jdbc;

	@Test
	void resolvesBookingInfoForOnlineSet() {
		// Scope to Miramar (the venue this test asserts on): the highest-priced ONLINE set is its front-row
		// premium (4500). A global "ORDER BY price_minor DESC" would be order-dependent in a shared
		// Testcontainers DB — other ITs (concurrency #226, reprice) leave higher-priced ONLINE sets, so a
		// class-ordering shift would otherwise pick one of theirs (riviera-local-debug: isolate the key).
		long setId = jdbc.sql("""
				SELECT sp.id FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE' AND v.name = 'Miramar Beach Club'
				ORDER BY sp.price_minor DESC LIMIT 1
				""")
				.query(Long.class).single();

		Optional<SetBookingInfo> info = catalog.setBookingInfo(new SetId(setId));

		assertTrue(info.isPresent(), "a seeded online set must resolve booking info");
		SetBookingInfo i = info.get();
		assertEquals("ONLINE", i.pool());
		assertEquals("EUR", i.price().currency());
		assertEquals(4500L, i.price().minorUnits(), "front-row premium price is €45.00 minor units");
		assertEquals(LocalTime.of(18, 0), i.bookingCutoff(), "Miramar cutoff is 18:00 Europe/Tirane");
		assertEquals("Miramar Beach Club", i.venueName());
		assertEquals("Front row · Sea view", i.rowLabel());
	}

	@Test
	void emptyForUnknownSet() {
		assertTrue(catalog.setBookingInfo(new SetId(999_999L)).isEmpty());
	}

	@Test
	void resolvesBatchBookingInfoInOneCall() {
		// #246 F3: every Miramar ONLINE set resolves in one map, each entry equal to the single-id read.
		List<Long> setIds = jdbc.sql("""
				SELECT sp.id FROM set_position sp JOIN venue v ON v.id = sp.venue_id
				WHERE sp.pool = 'ONLINE' AND v.name = 'Miramar Beach Club'
				""")
				.query(Long.class).list();
		assertTrue(setIds.size() >= 2, "the seed must provide at least two ONLINE Miramar sets");
		Set<SetId> ids = setIds.stream().map(SetId::new).collect(java.util.stream.Collectors.toSet());

		Map<SetId, SetBookingInfo> batch = catalog.setBookingInfos(ids);

		assertEquals(ids, batch.keySet(), "every requested existing set resolves exactly once");
		for (SetId id : ids) {
			assertEquals(catalog.setBookingInfo(id).orElseThrow(), batch.get(id),
					"the batch entry must equal the single-id read for the same set");
		}
	}

	@Test
	void batchOmitsUnknownSetsAndAnswersEmptyInputEmpty() {
		long known = jdbc.sql("SELECT id FROM set_position ORDER BY id LIMIT 1").query(Long.class).single();

		Map<SetId, SetBookingInfo> batch = catalog.setBookingInfos(
				Set.of(new SetId(known), new SetId(999_999L)));

		assertEquals(Set.of(new SetId(known)), batch.keySet(), "an unknown id is absent, not an error");
		assertTrue(catalog.setBookingInfos(Set.of()).isEmpty(), "an empty request is an empty map");
	}

	@Test
	void resolvesCommissionBpsForSeededVenue() {
		// payout reads the commission rate here at accrual time (issue #9, invariant #9).
		long venueId = jdbc.sql("SELECT id FROM venue WHERE name = 'Miramar Beach Club'")
				.query(Long.class).single();

		var bps = rates.commissionBps(new VenueId(venueId));

		assertTrue(bps.isPresent(), "a seeded venue must expose its commission rate");
		assertEquals(1500, bps.getAsInt(), "Miramar commission is 1500 bps (15.00%)");
	}

	@Test
	void emptyCommissionForUnknownVenue() {
		assertTrue(rates.commissionBps(new VenueId(999_999L)).isEmpty());
	}
}
