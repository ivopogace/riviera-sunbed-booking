package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;

import com.stripe.StripeClient;
import com.stripe.model.PaymentIntent;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.refund.ExpireAbandonedBookings;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * End-to-end proof of the abandoned-payment TTL sweep (issue #51) under the {@code stripe} profile.
 * The sweep cancels the lingering PaymentIntent and frees the held {@code (set, date)} for bookings
 * that have outlived the TTL, idempotently with the {@code payment_intent.canceled} webhook path
 * (which reuses the same shared {@link ReleaseAbandonedBooking}). The {@link StripeClient} is mocked
 * (no live Stripe call); the sweep is driven directly through {@link ExpireAbandonedBookings} for
 * determinism, with the background scheduler pushed past the test via a long {@code initial-delay}.
 * Testcontainers Postgres; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@ActiveProfiles("stripe")
@TestPropertySource(properties = {
		"stripe.api-key=sk_test_dummy",
		"stripe.webhook-secret=whsec_test",
		// Keep the real @Scheduled sweep from firing during the test — we drive it explicitly.
		"booking.awaiting-payment.initial-delay=PT1H"
})
class AbandonedBookingSweepIT {

	private static final Duration PAY_WINDOW = Duration.ofHours(12);

	/** #373 handed the sweep the whole record, so its cutoff and the mailed deadline share one source. */
	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), PAY_WINDOW);
	private static final Duration TTL = Duration.ofMinutes(15);
	private static final int STALE_AGE_MINUTES = 60;
	private static final int FRESH_AGE_MINUTES = 1;

	/**
	 * A service day long since ended. Fixed rather than derived from "now" so the row this class
	 * deletes between methods is the row it wrote; every other date here is far in the future, so the
	 * day-end arm is inert for them and each arm is exercised in isolation.
	 */
	private static final LocalDate ENDED_SERVICE_DAY = LocalDate.of(2020, 8, 1);

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ExpireAbandonedBookings sweep;

	@Autowired
	ReleaseAbandonedBooking releaseAbandonedBooking;

	@Autowired
	AvailabilityClaim availability;

	@MockitoBean
	StripeClient stripeClient;

	private PaymentIntentService intents;
	private PaymentIntent cancelableIntent;

	@BeforeEach
	void isolate() {
		// The sweep scans the whole table, so wipe THIS class's own rows before each test (the shared
		// Testcontainers DB persists across methods, and some methods deliberately leave a stale
		// AWAITING_PAYMENT row behind). Scoped to this test's codes / intent ids / date range so it
		// never touches another test class's data. Delete booking before customer (FK).
		jdbc.sql("DELETE FROM payment WHERE payment_intent_id LIKE 'pi_sweep%' "
				+ "OR payment_intent_id = 'pi_succeeded'").update();
		jdbc.sql("DELETE FROM set_availability WHERE booking_date BETWEEN '2027-08-01' AND '2027-08-31'")
				.update();
		// The day-end arm needs an already-ended date, which no future-dated range would cover.
		jdbc.sql("DELETE FROM set_availability WHERE booking_date = :ended")
				.param("ended", ENDED_SERVICE_DAY).update();
		// Today-dated methods leave held claims behind; release exactly this class's own (join by code).
		jdbc.sql("""
				DELETE FROM set_availability sa USING booking b
				WHERE b.code LIKE 'SWEEPAC%' AND sa.set_id = b.set_id AND sa.booking_date = b.booking_date
				""").update();
		jdbc.sql("DELETE FROM booking WHERE code LIKE 'SWEEPAC%'").update();
		jdbc.sql("DELETE FROM customer WHERE email LIKE 'SWEEPAC%@example.com'").update();
	}

	@BeforeEach
	void stubStripe() throws Exception {
		V1Services v1 = mock(V1Services.class);
		intents = mock(PaymentIntentService.class);
		when(stripeClient.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		// Default: every PaymentIntent is in a cancelable state. AC-5 overrides one to "succeeded".
		cancelableIntent = mock(PaymentIntent.class);
		when(cancelableIntent.getStatus()).thenReturn("requires_payment_method");
		when(intents.retrieve(anyString())).thenReturn(cancelableIntent);
	}

	// --- helpers -------------------------------------------------------------------------------

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long insertBooking(String code, SetRef set, LocalDate date, String status, int ageMinutes) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status, created_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', :status,
				        NOW() - (:age * INTERVAL '1 minute'))
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customer).param("date", date).param("status", status)
				.param("age", ageMinutes).query(Long.class).single();
	}

	/** An {@code AWAITING_PAYMENT} booking on the accept clock — the Request-to-Book arm's shape. */
	private long insertAcceptedRequest(String code, SetRef set, LocalDate date, int ageMinutes) {
		long booking = insertBooking(code, set, date, "AWAITING_PAYMENT", ageMinutes);
		jdbc.sql("UPDATE booking SET accepted_at = NOW() - (:age * INTERVAL '1 minute') WHERE id = :id")
				.param("age", ageMinutes).param("id", booking).update();
		return booking;
	}

	private void insertPayment(long bookingId, String paymentIntentId) {
		jdbc.sql("INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status) "
						+ "VALUES (:ref, :pi, 4500, 'EUR', 'REQUIRES_PAYMENT')")
				.param("ref", bookingId).param("pi", paymentIntentId).update();
	}

	private void claim(SetRef set, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
						+ "VALUES (:set, :date, 'BOOKED_ONLINE')")
				.param("set", set.setId()).param("date", date).update();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	/** A today-dated survival pin cannot straddle Tirane midnight — the day-end arm flips there. */
	private static void assumeClearOfTiraneMidnight() {
		org.junit.jupiter.api.Assumptions.assumeTrue(
				java.time.LocalTime.now(TIRANE).isBefore(java.time.LocalTime.of(23, 58)),
				"skipped in the day's final minutes — today would end mid-test");
	}

	private long availabilityRows(SetRef set, LocalDate date) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :date")
				.param("set", set.setId()).param("date", date).query(Long.class).single();
	}

	private String paymentStatusOf(String paymentIntentId) {
		return jdbc.sql("SELECT status FROM payment WHERE payment_intent_id = :pi")
				.param("pi", paymentIntentId).query(String.class).single();
	}

	// --- tests ---------------------------------------------------------------------------------

	@Test
	void expiresStaleBookingAndFreesTheSet() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 8, 1);
		long booking = insertBooking("SWEEPAC0001", set, date, "AWAITING_PAYMENT", STALE_AGE_MINUTES);
		insertPayment(booking, "pi_sweep_1");
		claim(set, date);
		assertEquals(1L, availabilityRows(set, date), "precondition: the set is claimed");

		int expired = sweep.sweep(TTL, WINDOWS);

		assertEquals(1, expired, "the one stale AWAITING_PAYMENT booking is expired");
		assertEquals("CANCELLED", statusOf(booking), "the abandoned booking is cancelled");
		assertEquals(0L, availabilityRows(set, date), "and its (set, date) claim is released (invariant #2)");
		assertEquals("CANCELED", paymentStatusOf("pi_sweep_1"), "the payment record is marked CANCELED");
		verify(cancelableIntent).cancel();

		// The freed set is genuinely re-claimable by another online booking.
		assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(set.setId()), date),
				"the released set can be claimed again");
	}

	@Test
	void isIdempotentWithTheCanceledWebhook() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 8, 3);
		long booking = insertBooking("SWEEPAC0002", set, date, "AWAITING_PAYMENT", STALE_AGE_MINUTES);
		insertPayment(booking, "pi_sweep_2");
		claim(set, date);

		// The sweep cancels the PaymentIntent + releases the set...
		assertEquals(1, sweep.sweep(TTL, WINDOWS));
		assertEquals("CANCELLED", statusOf(booking));
		assertEquals(0L, availabilityRows(set, date));

		// ...then Stripe delivers payment_intent.canceled (because we cancelled the PI). The webhook
		// listener drives the SAME shared release — a 0-row no-op now, no error, no double release.
		boolean releasedAgain = releaseAbandonedBooking.release(new BookingId(booking));
		assertFalse(releasedAgain, "the webhook's release after the sweep is a benign no-op");
		assertEquals("CANCELLED", statusOf(booking), "state is unchanged by the second driver");
		assertEquals(0L, availabilityRows(set, date), "and the set is not touched a second time");

		// Re-running the sweep also no-ops: the booking is no longer AWAITING_PAYMENT, so it is not even
		// selected, and the PaymentIntent is cancelled exactly once across both drivers.
		assertEquals(0, sweep.sweep(TTL, WINDOWS));
		verify(cancelableIntent, times(1)).cancel();
	}

	@Test
	void leavesConfirmedAndWithinTtlBookingsAlone() throws Exception {
		SetRef set = onlineSet();
		LocalDate confirmedDate = LocalDate.of(2027, 8, 5);
		LocalDate freshDate = LocalDate.of(2027, 8, 6);

		long confirmed = insertBooking("SWEEPAC0003", set, confirmedDate, "CONFIRMED", STALE_AGE_MINUTES);
		long fresh = insertBooking("SWEEPAC0004", set, freshDate, "AWAITING_PAYMENT", FRESH_AGE_MINUTES);
		insertPayment(fresh, "pi_sweep_fresh");
		claim(set, freshDate);

		int expired = sweep.sweep(TTL, WINDOWS);

		assertEquals(0, expired, "neither a confirmed nor a within-TTL booking is swept");
		assertEquals("CONFIRMED", statusOf(confirmed), "a CONFIRMED booking is never touched");
		assertEquals("AWAITING_PAYMENT", statusOf(fresh), "a within-TTL booking keeps awaiting payment");
		assertEquals(1L, availabilityRows(set, freshDate), "and its set stays legitimately held");
		assertEquals("REQUIRES_PAYMENT", paymentStatusOf("pi_sweep_fresh"), "its PaymentIntent is not cancelled");
		verify(cancelableIntent, never()).cancel();
	}

	@Test
	void doesNotCancelABookingWhosePaymentSucceeded() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 8, 8);
		long booking = insertBooking("SWEEPAC0005", set, date, "AWAITING_PAYMENT", STALE_AGE_MINUTES);
		insertPayment(booking, "pi_succeeded");
		claim(set, date);

		// Race: the PaymentIntent already succeeded at Stripe but the confirm webhook hasn't arrived,
		// so the booking is still AWAITING_PAYMENT and past the TTL.
		PaymentIntent succeeded = mock(PaymentIntent.class);
		when(succeeded.getStatus()).thenReturn("succeeded");
		when(intents.retrieve("pi_succeeded")).thenReturn(succeeded);

		int expired = sweep.sweep(TTL, WINDOWS);

		assertEquals(0, expired, "a booking whose payment succeeded is not expired by the sweep");
		assertEquals("AWAITING_PAYMENT", statusOf(booking), "it is left for the confirm webhook (invariant #8)");
		assertEquals(1L, availabilityRows(set, date), "and its set is not freed");
		assertEquals("REQUIRES_PAYMENT", paymentStatusOf("pi_succeeded"), "the payment record is untouched");
		verify(succeeded, never()).cancel();
	}

	@Test
	void expiresAnAwaitingPaymentBookingOnceItsServiceDayHasEnded() throws Exception {
		// The day-end arm (#792): a booking whose whole service day is over can never be paid again.
		SetRef set = onlineSet();
		LocalDate future = LocalDate.of(2027, 8, 12);
		long booking = insertAcceptedRequest("SWEEPAC0007", set, future, FRESH_AGE_MINUTES);
		insertPayment(booking, "pi_sweep_serviceday");
		claim(set, future);
		new ServiceDayBackdate(jdbc).moveToPast("SWEEPAC0007", ENDED_SERVICE_DAY);

		// Accepted a minute ago against a 24h TTL: only the day-end arm can reach it.
		int expired = sweep.sweep(Duration.ofHours(24), WINDOWS);

		assertEquals(1, expired, "a booking whose service day has ended can no longer be paid");
		assertEquals("CANCELLED", statusOf(booking), "so it is cancelled rather than left payable");
		assertEquals(0L, availabilityRows(set, ENDED_SERVICE_DAY),
				"and its (set, date) claim is released (invariant #2)");
		verify(cancelableIntent).cancel();

		assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(set.setId()), ENDED_SERVICE_DAY),
				"the set is back in the pool instead of held unsellable past its own service day");
	}

	@Test
	void sparesAnAcceptedAdvanceBookingInsideItsOpenServiceDay() throws Exception {
		assumeClearOfTiraneMidnight();
		// #792: born before D, accepted moments ago, D underway but not over — payable until the deadline.
		SetRef set = onlineSet();
		LocalDate today = LocalDate.now(TIRANE);
		long booking = insertAcceptedRequest("SWEEPAC0009", set, today, FRESH_AGE_MINUTES);
		insertPayment(booking, "pi_sweep_advopen");
		claim(set, today);
		jdbc.sql("UPDATE booking SET created_at = :c WHERE id = :id")
				.param("c", java.sql.Timestamp.from(
						today.atStartOfDay(TIRANE).toInstant().minus(Duration.ofHours(6))))
				.param("id", booking).update();

		int expired = sweep.sweep(Duration.ofHours(24), WINDOWS);

		assertEquals(0, expired, "an accepted advance booking is payable into its own service day");
		assertEquals("AWAITING_PAYMENT", statusOf(booking), "the old day-open arm must not reap it");
		assertEquals(1L, availabilityRows(set, today));
		verify(cancelableIntent, never()).cancel();
	}

	@Test
	void sameDayAcceptedBookingSurvivesTheSweep() throws Exception {
		assumeClearOfTiraneMidnight();
		// AC-3 (#792): accepted moments ago for TODAY — its pay deadline has not passed.
		SetRef set = onlineSet();
		LocalDate today = LocalDate.now(TIRANE);
		long booking = insertAcceptedRequest("SWEEPAC0010", set, today, FRESH_AGE_MINUTES);
		insertPayment(booking, "pi_sweep_samedayacc");
		claim(set, today);

		int expired = sweep.sweep(TTL, WINDOWS);

		assertEquals(0, expired, "a same-day accepted booking inside its pay window is not swept");
		assertEquals("AWAITING_PAYMENT", statusOf(booking));
		assertEquals(1L, availabilityRows(set, today));
		verify(cancelableIntent, never()).cancel();
	}

	@Test
	void spareSameDayBornBookingWithinTtl() throws Exception {
		assumeClearOfTiraneMidnight();
		// #792: its service day has not ended and its TTL has not run — neither arm may reach it.
		SetRef set = onlineSet();
		LocalDate today = LocalDate.now(TIRANE);
		long booking = insertBooking("SWEEPAC0008", set, today, "AWAITING_PAYMENT", FRESH_AGE_MINUTES);
		insertPayment(booking, "pi_sweep_sameday");
		claim(set, today);

		int expired = sweep.sweep(TTL, WINDOWS);

		assertEquals(0, expired, "a same-day-born booking within its TTL is not swept by the date arm");
		assertEquals("AWAITING_PAYMENT", statusOf(booking), "its claim is kept, not expired mid-checkout");
		assertEquals(1L, availabilityRows(set, today));
		verify(cancelableIntent, never()).cancel();
	}

	@Test
	void expiresAStaleBookingWithNoPaymentRecord() {
		// #125: a pay() that threw after the reserve commit can leave a stale AWAITING_PAYMENT booking
		// with NO payment row — previously skipped by the sweep forever (no collection on record),
		// stranding the set until manual DB surgery. It is now released. No Stripe stubbing needed: the
		// gateway reports NoCollection before any Stripe call (nothing on record to retrieve).
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 8, 10);
		long booking = insertBooking("SWEEPAC0006", set, date, "AWAITING_PAYMENT", STALE_AGE_MINUTES);
		claim(set, date);
		assertEquals(1L, availabilityRows(set, date), "precondition: the set is claimed");

		int expired = sweep.sweep(TTL, WINDOWS);

		assertEquals(1, expired, "the stale no-collection booking is expired");
		assertEquals("CANCELLED", statusOf(booking), "the stranded booking is cancelled");
		assertEquals(0L, availabilityRows(set, date), "and its (set, date) claim is released (invariant #2)");

		// The freed set is genuinely re-claimable by another online booking.
		assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(set.setId()), date),
				"the released set can be claimed again");
	}
}
