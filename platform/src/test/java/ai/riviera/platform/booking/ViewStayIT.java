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
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.booking.application.view.BookingDetail;
import ai.riviera.platform.booking.application.view.ViewBooking;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A stay's code resolves wherever a booking's does (design D6, invariant #7): the code-gated view
 * reads the group as one booking with its stretches, the confirmation mail's fact for a stretch is
 * the stay's code (never the row code), and the staff daily list names the stay's code. Stub gateway,
 * real Postgres via Testcontainers.
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
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
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
}
