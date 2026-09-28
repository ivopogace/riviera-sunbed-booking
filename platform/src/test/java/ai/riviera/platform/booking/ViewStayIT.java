package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.CreateStayCommand;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.booking.application.view.BookingMove;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.GUEST;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A stay's code resolves wherever a booking's does (design D6, invariant #7): the code-gated view
 * reads the group as one booking with its stretches (a remodel-moved one with its move), the
 * confirmation mail's fact for a stretch is the stay's code (never the row code), and the staff daily
 * list names the stay's code. Stub gateway, real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@AutoConfigureMockMvc
class ViewStayIT {

	@Autowired
	CreateStay createStay;

	@Autowired
	ViewBooking viewBooking;

	@Autowired
	BookingNotificationFacts notificationFacts;

	@Autowired
	Bookings bookings;

	@Autowired
	RemodelClaims remodelClaims;

	@Autowired
	BookingCutoff cutoff;

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();
	private final List<Long> accounts = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
		accounts.forEach(account -> jdbc.sql("DELETE FROM customer_account WHERE id = :a").param("a", account).update());
	}

	@Test
	void theCodeGatedViewReadsTheStayWithItsStretches() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();
		String code = assertInstanceOf(StayOutcome.Confirmed.class, createStay.create(plan(a, 3, b, 4, first)))
				.confirmation().code();

		BookingDetail view = viewBooking.byCode(code).orElseThrow();

		assertEquals(code, view.code());
		assertEquals(BookingStatus.CONFIRMED, view.status());
		assertEquals(first, view.bookingDate());
		assertEquals(first.plusDays(6), view.lastDate());
		assertEquals(7 * PRICE, view.amount().minorUnits());
		assertEquals("A", view.rowLabel());
		assertEquals(1, view.positionNo(), "the first stretch's spot heads the view");
		assertTrue(view.cancellable(), "ten days out: cancellable, judged on the stay's first day");
		assertEquals(7 * PRICE, view.refundIfCancelledNow().minorUnits());
		assertEquals(List.of(a, b), view.stretches().stream().map(BookingDetail.StayStretch::setId).toList());
		assertEquals(2, view.stretches().get(1).positionNo());
		assertEquals(4 * PRICE, view.stretches().get(1).amount().minorUnits());

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.code").value(code))
				.andExpect(jsonPath("$.stretches.length()").value(2))
				.andExpect(jsonPath("$.stretches[1].setId").value(b.value()))
				.andExpect(jsonPath("$.stretches[1].status").value("CONFIRMED"))
				.andExpect(jsonPath("$.amount.minorUnits").value(7 * PRICE));
	}

	@Test
	void aStayRequestReadsItsStatus() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		java.time.Instant expires = java.time.Instant.now().plusSeconds(3600).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
		StayFixtures.SeededStay stay = StayFixtures.insertPendingStay(jdbc, venue, "VSR" + System.nanoTime() % 100_000_000L,
				first, venue.online().get(0), 2, venue.online().get(1), 2, expires);

		BookingDetail pending = viewBooking.byCode(stay.code()).orElseThrow();

		assertEquals(BookingStatus.PENDING_REQUEST, pending.status());
		assertTrue(pending.withdrawable(), "a pending stay is withdrawn whole by its code");
		assertEquals(expires, pending.requestExpiresAt());
		assertEquals(false, pending.cancellable());
		assertEquals(2, pending.stretches().size());
		mvc.perform(get("/api/bookings/{code}", stay.code()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"))
				.andExpect(jsonPath("$.withdrawable").value(true))
				.andExpect(jsonPath("$.stretches[1].status").value("PENDING_REQUEST"));

		jdbc.sql("UPDATE booking SET status = 'DECLINED', decline_reason = 'ANOTHER_GUEST' WHERE stay_id = :s")
				.param("s", stay.id()).update();

		BookingDetail declined = viewBooking.byCode(stay.code()).orElseThrow();
		assertEquals(BookingStatus.DECLINED, declined.status());
		assertEquals(false, declined.withdrawable());
		assertEquals(ai.riviera.platform.booking.vocabulary.DeclineReason.ANOTHER_GUEST, declined.declineReason());
	}

	@Test
	void aMovedStretchCarriesItsMoveNotice() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		SetId c = venue.online().get(2);
		LocalDate first = firstDay();
		String code = assertInstanceOf(StayOutcome.Confirmed.class, createStay.create(plan(a, 3, b, 4, first)))
				.confirmation().code();
		StayFixtures.take(jdbc, a, first.plusDays(3));
		VenueId venueId = new VenueId(venue.id());
		OperatorId operator = new OperatorId(jdbc.sql("SELECT operator_id FROM operator_venue WHERE venue_id = :v")
				.param("v", venue.id()).query(Long.class).single());
		List<RemodelClaim> claims = remodelClaims.classify(operator, venueId, List.of(b));
		assertInstanceOf(RemodelCommit.Applied.class,
				remodelClaims.commit(operator, venueId, List.of(b), PreviewToken.of(claims), RefundConfirmation.NONE));

		BookingDetail view = viewBooking.byCode(code).orElseThrow();

		assertNull(view.move(), "the stay's spot is its first stretch's, which never moved");
		assertNull(view.stretches().get(0).move());
		BookingDetail.StayStretch moved = view.stretches().get(1);
		assertEquals(c, moved.setId());
		assertEquals(3, moved.positionNo(), "the stretch shows the spot it holds now");
		BookingMove move = moved.move();
		assertEquals("A", move.fromRowLabel());
		assertEquals(2, move.fromPositionNo());
		assertEquals(0, move.rowsAway());
		assertEquals(1, move.positionsAway());
		assertEquals(cutoff.serviceDayOpensAt(first), move.freeExitUntil(),
				"the exit ends when the stay stops being cancellable, before the stretch's own noon");
		assertTrue(view.cancellable());
		assertEquals(7 * PRICE, view.refundIfCancelledNow().minorUnits());

		mvc.perform(get("/api/bookings/{code}", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.move").doesNotExist())
				.andExpect(jsonPath("$.stretches[0].move").doesNotExist())
				.andExpect(jsonPath("$.stretches[1].positionNo").value(3))
				.andExpect(jsonPath("$.stretches[1].move.fromRowLabel").value("A"))
				.andExpect(jsonPath("$.stretches[1].move.fromPositionNo").value(2))
				.andExpect(jsonPath("$.stretches[1].move.positionsAway").value(1))
				.andExpect(jsonPath("$.stretches[1].move.movedAt").isString())
				.andExpect(jsonPath("$.stretches[1].move.freeExitUntil").value(cutoff.serviceDayOpensAt(first).toString()));
	}

	@Test
	void aStretchsMailFactAndTheStaffListCarryTheStaysCode() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		String code = assertInstanceOf(StayOutcome.Confirmed.class,
				createStay.create(plan(venue.online().get(0), 3, venue.online().get(1), 4, first))).confirmation().code();
		List<Long> bookingIds = jdbc.sql("SELECT id FROM booking WHERE venue_id = :v ORDER BY booking_date")
				.param("v", venue.id()).query(Long.class).list();

		for (long bookingId : bookingIds) {
			assertEquals(code, notificationFacts.notificationInfo(new BookingId(bookingId)).orElseThrow().code());
			assertEquals(code, notificationFacts.confirmationFacts(new BookingId(bookingId)).orElseThrow().code());
		}
		assertEquals(List.of(code), bookings.findSettledForVenueOn(new VenueId(venue.id()), first.plusDays(5)).stream()
				.map(daily -> daily.code()).toList(), "staff see the stay's code on the stretch's day");
	}

	@Test
	void aSignedInGuestsListShowsTheStayAsOneRow() {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		LocalDate first = firstDay();
		long account = jdbc.sql("INSERT INTO customer_account (email, password_hash) VALUES (:e, '{bcrypt}$2a$stay') RETURNING id")
				.param("e", "stay-account-" + System.nanoTime() + "@example.com").query(Long.class).single();
		accounts.add(account);
		String code = assertInstanceOf(StayOutcome.Confirmed.class, createStay.create(new CreateStayCommand(
				plan(a, 3, venue.online().get(1), 4, first).stretches(), GUEST, new CustomerAccountId(account))))
				.confirmation().code();

		List<BookingRecord> rows = bookings.findByAccountId(new CustomerAccountId(account));

		assertEquals(1, rows.size(), "one row for the stay, not one per stretch");
		BookingRecord row = rows.getFirst();
		assertEquals(code, row.code());
		assertEquals(BookingStatus.CONFIRMED, row.status());
		assertEquals(first, row.bookingDate());
		assertEquals(first.plusDays(6), row.lastDate());
		assertEquals(7 * PRICE, row.amountMinor(), "the whole stay's money");
		assertEquals(a, row.setId(), "the first stretch's spot heads the row");
	}
}
