package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.core.EventSerializer;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.SeededStay;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.events.StayConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * {@link StayFixtures#cleanup} waits only for the publications naming its own venue's bookings or stays: a
 * pending publication another class left in the shared registry never holds it up (#1444), while one of its
 * own does. Payloads come from the registry's own serializer. Real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class StayFixturesCleanupScopeIT {

	private static final String LISTENER = "test.stay-fixtures-cleanup-scope";

	@Autowired
	JdbcClient jdbc;

	@Autowired
	EventSerializer serializer;

	private final List<UUID> planted = new ArrayList<>();

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		planted.forEach(id -> jdbc.sql("DELETE FROM event_publication WHERE id = :id").param("id", id).update());
		venues.forEach(venue -> StayFixtures.cleanupNow(jdbc, venue));
	}

	@Test
	void aForeignPendingPublicationDoesNotHoldUpCleanup() {
		Venue venue = venue();
		SeededStay stay = seedStay(venue, "SCOPE-FOREIGN");
		plant(serializer.serialize(confirmed(Long.MAX_VALUE, Long.MAX_VALUE, venue.online().get(0), null)));
		plant(serializer.serialize(new StayConfirmed(new StayId(Long.MAX_VALUE), CancellationWindow.FREE, 0)));
		plant("not json");

		assertEquals(0L, StayFixtures.pendingPublicationsOf(jdbc, venue.id()));
		StayFixtures.cleanup(jdbc, venue.id());

		assertEquals(0L, jdbc.sql("SELECT count(*) FROM venue WHERE id = :v").param("v", venue.id())
				.query(Long.class).single(), "the fixture is deleted despite the foreign pending rows");
		assertEquals(0L, jdbc.sql("SELECT count(*) FROM stay WHERE id = :s").param("s", stay.id())
				.query(Long.class).single());
	}

	@Test
	void aPendingPublicationNamingTheVenuesBookingOrStayIsWaitedFor() {
		Venue venue = venue();
		SeededStay stay = seedStay(venue, "SCOPE-OWN");
		long booking = stay.stretches().get(0);
		plant(serializer.serialize(confirmed(booking, venue.id(), venue.online().get(0), new StayId(stay.id()))));
		plant(serializer.serialize(new StayConfirmed(new StayId(stay.id()), CancellationWindow.FREE, 0)));
		plant(serializer.serialize(new PaymentConfirmed(new BookingRef(booking), "pi_cleanup_scope")));
		UUID completed = plant(serializer.serialize(new PaymentConfirmed(new BookingRef(booking), "pi_done")));
		jdbc.sql("UPDATE event_publication SET completion_date = now() WHERE id = :id").param("id", completed).update();

		assertEquals(3L, StayFixtures.pendingPublicationsOf(jdbc, venue.id()),
				"each of the venue's own incomplete publications, by bookingId, stayId and bookingRef");
	}

	private Venue venue() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		return venue;
	}

	private SeededStay seedStay(Venue venue, String code) {
		return StayFixtures.insertStay(jdbc, venue, code + "-" + System.nanoTime(), firstDay(),
				venue.online().get(0), 1, "CONFIRMED", venue.online().get(1), 1, "CONFIRMED");
	}

	private static BookingConfirmed confirmed(long booking, long venue, SetId set, StayId stay) {
		LocalDate day = firstDay();
		return new BookingConfirmed(new BookingId(booking), new VenueId(venue), set, day,
				StayFixtures.PRICE, "EUR", CancellationWindow.FREE, 0, day, stay);
	}

	private UUID plant(Object payload) {
		UUID id = UUID.randomUUID();
		jdbc.sql("""
				INSERT INTO event_publication (id, listener_id, event_type, serialized_event, publication_date)
				VALUES (:id, :listener, 'ai.riviera.test.CleanupScopeProbe', :payload, now())
				""").param("id", id).param("listener", LISTENER).param("payload", payload.toString()).update();
		planted.add(id);
		return id;
	}
}
