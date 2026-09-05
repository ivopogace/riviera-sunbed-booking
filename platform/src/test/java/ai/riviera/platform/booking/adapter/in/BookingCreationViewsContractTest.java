package ai.riviera.platform.booking.adapter.in;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import ai.riviera.platform.booking.application.reserve.BookingConfirmation;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Freezes the three creation bodies' wire shape before the dedup: the exact top-level key
 * sets, the nested {@code amount} keys, and the deliberate asymmetries — the requested body has
 * <strong>no</strong> {@code clientSecret}/{@code paymentIntentId} (no payment exists until the
 * venue accepts), the awaiting-payment body no {@code requestExpiresAt}, and only the confirmed
 * body carries {@code emailWithheld} (D-8). Value formats stay pinned by the MockMvc ITs
 * ({@code CreateBookingStripeProfileIT}, {@code RequestToBookFlowIT}); this test guards the key
 * sets a refactor could silently nest.
 */
class BookingCreationViewsContractTest {

	private static final ObjectMapper MAPPER = JsonMapper.builder().build();

	private static final Set<String> SHARED_KEYS = Set.of("code", "status", "venueId", "venueName",
			"setId", "rowLabel", "positionNo", "bookingDate", "amount");

	@Test
	void confirmationBodyKeysAreFrozen() {
		BookingConfirmationView view =
				BookingConfirmationView.of(confirmation(BookingStatus.CONFIRMED));

		JsonNode json = MAPPER.valueToTree(view);

		assertEquals(withShared("emailWithheld"), fieldNames(json));
		assertEquals(Set.of("minorUnits", "currency"), fieldNames(json.get("amount")));
		assertEquals("CONFIRMED", json.get("status").asText());
	}

	@Test
	void requestedBodyKeysAreFrozen() {
		RequestedView view = RequestedView.of(confirmation(BookingStatus.PENDING_REQUEST),
				Instant.parse("2026-08-01T20:00:00Z"));

		JsonNode json = MAPPER.valueToTree(view);

		assertEquals(withShared("requestExpiresAt"), fieldNames(json));
		assertEquals(Set.of("minorUnits", "currency"), fieldNames(json.get("amount")));
		assertEquals("PENDING_REQUEST", json.get("status").asText());
	}

	@Test
	void awaitingPaymentBodyKeysAreFrozen() {
		AwaitingPaymentView view = AwaitingPaymentView.of(
				confirmation(BookingStatus.AWAITING_PAYMENT), "cs_test_secret", "pi_test");

		JsonNode json = MAPPER.valueToTree(view);

		assertEquals(withShared("clientSecret", "paymentIntentId"), fieldNames(json));
		assertEquals(Set.of("minorUnits", "currency"), fieldNames(json.get("amount")));
		assertEquals("AWAITING_PAYMENT", json.get("status").asText());
	}

	private static Set<String> withShared(String... extras) {
		Set<String> keys = new HashSet<>(SHARED_KEYS);
		keys.addAll(Set.of(extras));
		return keys;
	}

	private static Set<String> fieldNames(JsonNode json) {
		return Set.copyOf(json.propertyNames());
	}

	private static BookingConfirmation confirmation(BookingStatus status) {
		return new BookingConfirmation("CODE234567", status,
				new SetBookingInfo(new SetId(11), new VenueId(7), "Vala Beach", "A", 4, Pool.ONLINE,
						new MoneyView(4500, "EUR"), LocalTime.of(18, 0), LocalTime.of(16, 0),
						BookingMode.REQUEST),
				LocalDate.of(2026, 8, 10), false);
	}
}
