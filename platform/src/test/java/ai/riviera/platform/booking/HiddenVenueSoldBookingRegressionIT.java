package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.checkin.CheckInBooking;
import ai.riviera.platform.booking.application.checkin.CheckInResult;
import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * #693 AC-5: the visibility fence stops <em>new</em> bookings only — a booking sold while the
 * venue was visible keeps working after the owning operator is suspended. Guest legs (resolve by
 * code, cancel with the refund decision computed) and the staff check-in leg run at the
 * application seam, because suspension already revokes the operator's session at the edge — the
 * point pinned here is that no sold-booking path consults the visibility port.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
class HiddenVenueSoldBookingRegressionIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final String OWNER = "hidden-sold-owner";
	private static final GuestContact GUEST =
			new GuestContact("sold@example.com", "Sol D. Guest", "+355699");

	@Autowired
	CreateBooking createBooking;
	@Autowired
	CancelBooking cancelBooking;
	@Autowired
	ViewBooking viewBooking;
	@Autowired
	CheckInBooking checkInBooking;
	@Autowired
	VenueCatalog catalog;
	@Autowired
	JdbcClient jdbc;

	private OperatorId owner;
	private long venueId;

	@BeforeEach
	void freshOwnedVenue() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username = :u)").param("u", OWNER).update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", OWNER).update();
		long operatorId = jdbc.sql("""
				INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id
				""").param("u", OWNER).query(Long.class).single();
		owner = new OperatorId(operatorId);
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Hidden Sold Club', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
	}

	private long onlineSet(int positionNo) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1) RETURNING id
				""").param("v", venueId).param("pos", positionNo).query(Long.class).single();
	}

	private void suspendOwner() {
		jdbc.sql("UPDATE operator SET status = 'SUSPENDED' WHERE id = :id")
				.param("id", owner.value()).update();
	}

	@Test
	void soldBookingSurvivesOwnerSuspension() {
		LocalDate future = LocalDate.now(TIRANE).plusDays(30);
		long setId = onlineSet(1);
		BookingOutcome outcome =
				createBooking.create(new CreateBookingCommand(new SetId(setId), future, GUEST));
		BookingOutcome.Confirmed confirmed =
				assertInstanceOf(BookingOutcome.Confirmed.class, outcome, "booked while visible");
		String code = confirmed.confirmation().code();

		suspendOwner();
		assertTrue(catalog.findVenueMap(new VenueId(venueId), future).isEmpty(),
				"sanity: the venue is hidden from tourists now");

		assertTrue(viewBooking.byCode(code).isPresent(), "the code-gated view still resolves");

		CancelOutcome cancelled = cancelBooking.cancel(code);
		assertInstanceOf(CancelOutcome.Cancelled.class, cancelled,
				"a guest can still cancel, refund decision computed server-side");
	}

	@Test
	void checkInStillWorksAfterOwnerSuspension() {
		LocalDate today = LocalDate.now(TIRANE);
		long setId = onlineSet(2);
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES ('sold-ci@example.com', 'Guest', '+355600') RETURNING id")
				.query(Long.class).single();
		String code = "HIDDENCI" + System.nanoTime() % 1_000_000;
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, confirmed_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'CONFIRMED', now())
				""")
				.param("code", code).param("venue", venueId).param("set", setId)
				.param("cust", customer).param("date", today).update();

		suspendOwner();

		CheckInResult result = checkInBooking.checkIn(owner, new VenueId(venueId), code);
		assertInstanceOf(CheckInResult.CheckedIn.class, result,
				"staff check-in is not fenced for a sold booking");
	}
}
