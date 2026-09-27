package ai.riviera.platform.itinerary.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.BookingMode;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MoveBudgetTest {

	@Test
	void anInstantVenueGetsTheConfiguredBudget() {
		assertEquals(3, new MoveBudget(3).forVenue(BookingMode.INSTANT));
	}

	@Test
	void aRequestToBookVenueHasNoMoveBudget() {
		assertEquals(0, new MoveBudget(3).forVenue(BookingMode.REQUEST));
	}
}
