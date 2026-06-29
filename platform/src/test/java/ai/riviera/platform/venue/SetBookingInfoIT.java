package ai.riviera.platform.venue;

import java.time.LocalTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.SetBookingInfo;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueCatalog;

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
	VenueCatalog catalog;

	@Autowired
	JdbcClient jdbc;

	@Test
	void resolvesBookingInfoForOnlineSet() {
		long setId = jdbc.sql(
				"SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY price_minor DESC LIMIT 1")
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
}
