package ai.riviera.platform.booking.application.request;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingRequestDeclined;
import ai.riviera.platform.booking.events.BookingRequestExpired;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The decline/expiry facts of issue #124, at the SQL seam against real Postgres: each terminal leg
 * of {@code RequestReleaseService} publishes its fact exactly when its guarded transition wins —
 * and the two legs that must stay silent stay silent.
 *
 * <p><strong>Why the recorder is a {@code @TransactionalEventListener}.</strong> The property under
 * test is not "publishEvent was called" but "the fact rides the leg's commit": an after-commit
 * listener observes nothing unless a real transaction committed around the publish — the same
 * property {@code PaymentDueAnnouncerIT} pins for the accept branch, observed here from the
 * delivery side. A lost race (0-row transition) must publish nothing, which is what keeps the
 * facts truthful under the row-lock exclusivity argument ({@code ConcurrentRequestTerminationIT}).
 *
 * <p>The withdraw case is this slice's stated non-event (#123/#124): guest-initiated, so no notice
 * — pinned here so a future "complete the set" refactor fails a test, not a product expectation.
 *
 * <p>The background sweep is pushed out of the test window ({@code initial-delay=PT2H}, the #98
 * lesson) — this IT seeds overdue rows and must be the one to sweep them.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, RequestTerminationEventPublicationIT.RecordedFacts.class})
@SpringBootTest(properties = "booking.request.initial-delay=PT2H")
class RequestTerminationEventPublicationIT {

	@Autowired
	RequestReleaseService requestRelease;

	@Autowired
	ExpireRequests expireRequests;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	RecordedFacts recorded;

	private long venueId;
	private long setId;

	@BeforeEach
	void seedRequestVenue() {
		recorded.reset();
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Notice Club', 'Notice Beach', 'Notice Region', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				RETURNING id
				""").param("venue", venueId).query(Long.class).single();
	}

	/** A PENDING_REQUEST row with its (set, date) soft-held; overdue when {@code expiresAt} is past. */
	private long insertRequest(String code, LocalDate date, Instant expiresAt) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long booking = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", date)
				.param("expires", java.sql.Timestamp.from(expiresAt))
				.query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE') ON CONFLICT DO NOTHING")
				.param("set", setId).param("date", date).update();
		return booking;
	}

	private static String uniqueCode(String prefix) {
		return prefix + System.nanoTime() % 1_000_000;
	}

	@Test
	void declinePublishesTheDeclineFact() {
		LocalDate date = LocalDate.now().plusMonths(3);
		long bookingId = insertRequest(uniqueCode("DECMAIL"), date, Instant.now().plusSeconds(3600));

		assertThat(requestRelease.decline(new BookingId(bookingId), new VenueId(venueId))).isTrue();

		assertThat(recorded.all()).containsExactly(
				new BookingRequestDeclined(new BookingId(bookingId), new SetId(setId), date));
	}

	@Test
	void expiryPublishesTheExpiryFact() {
		LocalDate date = LocalDate.now().plusMonths(3);
		long bookingId = insertRequest(uniqueCode("EXPMAIL"), date, Instant.now().minusSeconds(30));

		assertThat(expireRequests.sweep()).isEqualTo(1);

		assertThat(recorded.all()).containsExactly(
				new BookingRequestExpired(new BookingId(bookingId), new SetId(setId), date));
	}

	@Test
	void cleanSweepPublishesNothing() {
		insertRequest(uniqueCode("FRESH"), LocalDate.now().plusMonths(3), Instant.now().plusSeconds(3600));

		assertThat(expireRequests.sweep()).isZero();

		assertThat(recorded.all()).isEmpty();
	}

	@Test
	void withdrawPublishesNothing() {
		String code = uniqueCode("WDQUIET");
		insertRequest(code, LocalDate.now().plusMonths(3), Instant.now().plusSeconds(3600));

		assertThat(requestRelease.withdraw(code)).isPresent();

		assertThat(recorded.all()).as("guest-initiated: no notice, deliberately (#123)").isEmpty();
	}

	@Test
	void lostDeclinePublishesNothing() {
		String code = uniqueCode("DECLOST");
		long bookingId = insertRequest(code, LocalDate.now().plusMonths(3), Instant.now().plusSeconds(3600));
		requestRelease.withdraw(code);
		recorded.reset();

		assertThat(requestRelease.decline(new BookingId(bookingId), new VenueId(venueId)))
				.as("the row already left PENDING_REQUEST — a 0-row no-op").isFalse();

		assertThat(recorded.all()).as("no transition, no fact").isEmpty();
	}

	/** After-commit observer: records only facts a really-committed transaction published. Access is
	 * methods-only — Modulith's completion-registering post-processor CGLIB-proxies any bean with a
	 * {@code @TransactionalEventListener}, and the proxy's own fields are never initialized. */
	static class RecordedFacts {

		private final List<Object> facts = new CopyOnWriteArrayList<>();

		@TransactionalEventListener
		public void on(BookingRequestDeclined fact) {
			facts.add(fact);
		}

		@TransactionalEventListener
		public void on(BookingRequestExpired fact) {
			facts.add(fact);
		}

		public List<Object> all() {
			return List.copyOf(facts);
		}

		public void reset() {
			facts.clear();
		}
	}
}
