package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.request.PendingRequest;
import ai.riviera.platform.booking.application.request.PendingRequests;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The operator queue shows a stay request as one item with every stop (#1267, stories 25–26), and counts
 * each rival request once, never a stay against itself.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class StayRequestQueueIT {

	@Autowired
	PendingRequests pendingRequests;

	@Autowired
	JdbcClient jdbc;

	private StayFixtures.Venue venue;

	@BeforeEach
	void seed() {
		venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	@Test
	void oneItemPerStayWithEveryStop() {
		LocalDate d0 = StayFixtures.firstDay();
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		SetId c = venue.online().get(2);
		Instant expires = Instant.now().plusSeconds(3600);
		String tag = String.valueOf(System.nanoTime() % 100_000_000L);
		StayFixtures.SeededStay stay = StayFixtures.insertPendingStay(jdbc, venue, "SQS" + tag, d0, a, 2, b, 2, expires);
		long lone = StayFixtures.insertPendingLone(jdbc, venue, "SQL" + tag, b, d0.plusDays(2), d0.plusDays(2), expires);
		StayFixtures.SeededStay rival = StayFixtures.insertPendingStay(jdbc, venue, "SQR" + tag, d0, c, 1, a, 1, expires);

		List<PendingRequest> queue = pendingRequests.forVenue(StayFixtures.ownerOf(jdbc, venue), new VenueId(venue.id()));

		assertEquals(3, queue.size());
		PendingRequest.Stay item = stayItem(queue, stay.id());
		assertEquals("Stay Guest", item.guestName());
		assertEquals(d0, item.firstDate());
		assertEquals(d0.plusDays(3), item.lastDate());
		assertEquals(4 * StayFixtures.PRICE, item.amountMinor());
		assertEquals(List.of(
				new PendingRequest.Stop(a, d0, d0.plusDays(1), 2 * StayFixtures.PRICE, 1),
				new PendingRequest.Stop(b, d0.plusDays(2), d0.plusDays(3), 2 * StayFixtures.PRICE, 1)), item.stops());
		assertEquals(2, item.competingRequests(), "the lone request and the rival stay, each once");
		assertEquals(1, stayItem(queue, rival.id()).competingRequests());
		PendingRequest.Lone loneItem = queue.stream().filter(PendingRequest.Lone.class::isInstance)
				.map(PendingRequest.Lone.class::cast).findFirst().orElseThrow();
		assertEquals(lone, loneItem.bookingId());
		assertEquals(1, loneItem.competingRequests(), "the stay competes once");
	}

	private static PendingRequest.Stay stayItem(List<PendingRequest> queue, long stayId) {
		return queue.stream().filter(PendingRequest.Stay.class::isInstance).map(PendingRequest.Stay.class::cast)
				.filter(item -> item.stayId().equals(new StayId(stayId))).findFirst().orElseThrow();
	}
}
