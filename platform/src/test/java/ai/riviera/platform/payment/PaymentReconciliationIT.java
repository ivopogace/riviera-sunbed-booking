package ai.riviera.platform.payment;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import com.stripe.StripeClient;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeSearchResult;
import com.stripe.param.PaymentIntentSearchParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;

import org.awaitility.Awaitility;
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
import ai.riviera.platform.MovableClock;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.TiraneDaytimeClock;
import ai.riviera.platform.booking.application.refund.ExpireAbandonedBookings;
import ai.riviera.platform.booking.application.request.RequestWindows;
import ai.riviera.platform.payment.application.PaymentReconciliation;
import ai.riviera.platform.payment.application.ReconciliationReport;
import ai.riviera.platform.payment.application.ReconciliationReport.Divergence;
import ai.riviera.platform.payment.application.ReconciliationReport.Kind;
import ai.riviera.platform.payment.application.ReconciliationReport.Unchecked;
import ai.riviera.platform.payment.application.RepairOutcome;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The runbook, exercised against a simulated divergence: a webhook lost, so the row still waits while Stripe holds the
 * answer. Real SQL, the guarded transition and the booking effect, under the {@code stripe} profile with Stripe mocked.
 * Rows of other classes share the table, so each assertion is about this class's own {@code pi_recon} rows.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, TiraneDaytimeClock.class })
@SpringBootTest
@ActiveProfiles("stripe")
@TestPropertySource(properties = { "stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test" })
class PaymentReconciliationIT {

	private static final Duration TTL = Duration.ofMinutes(15);
	private static final RequestWindows WINDOWS = new RequestWindows(Duration.ofHours(24), Duration.ofHours(12));
	private static final int PAST_THE_GRACE_MINUTES = 60;
	private static final int WITHIN_THE_GRACE_MINUTES = 5;
	private static final Duration SETTLE = Duration.ofSeconds(20);

	@Autowired
	JdbcClient jdbc;

	@Autowired
	PaymentReconciliation reconciliation;

	@Autowired
	ExpireAbandonedBookings abandonedSweep;

	@Autowired
	MovableClock clock;

	@MockitoBean
	StripeClient stripeClient;

	private PaymentIntentService intents;

	private StripeSearchResult<PaymentIntent> listing;

	private record SetRef(long setId, long venueId) {
	}

	@BeforeEach
	void isolate() {
		jdbc.sql("DELETE FROM payment_booking WHERE payment_id IN (SELECT id FROM payment WHERE payment_intent_id LIKE 'pi_recon%')").update();
		jdbc.sql("DELETE FROM payment WHERE payment_intent_id LIKE 'pi_recon%'").update();
		jdbc.sql("DELETE FROM payout_ledger_entry WHERE booking_id IN (SELECT id FROM booking WHERE code LIKE 'RECON%')").update();
		jdbc.sql("DELETE FROM booking_confirmation_mail_attempt WHERE booking_id IN (SELECT id FROM booking WHERE code LIKE 'RECON%')").update();
		jdbc.sql("DELETE FROM set_availability WHERE booking_date BETWEEN '2027-09-01' AND '2027-09-30'").update();
		jdbc.sql("DELETE FROM booking WHERE code LIKE 'RECON%'").update();
		jdbc.sql("DELETE FROM customer WHERE email LIKE 'RECON%@example.com'").update();
	}

	@BeforeEach
	@SuppressWarnings("unchecked")
	void stubStripe() throws Exception {
		V1Services v1 = mock(V1Services.class);
		intents = mock(PaymentIntentService.class);
		when(stripeClient.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		PaymentIntent waiting = intentIn("requires_payment_method");
		when(intents.retrieve(anyString())).thenReturn(waiting);
		listing = mock(StripeSearchResult.class);
		when(listing.getData()).thenReturn(List.of());
		when(listing.getHasMore()).thenReturn(false);
		when(intents.search(any(PaymentIntentSearchParams.class))).thenReturn(listing);
	}

	private static PaymentIntent intentIn(String status) {
		PaymentIntent intent = mock(PaymentIntent.class);
		when(intent.getStatus()).thenReturn(status);
		return intent;
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long awaitingBooking(String code, SetRef set, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:set, :date, 'BOOKED_ONLINE')")
				.param("set", set.setId()).param("date", date).update();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency,
				                     status, created_at)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'AWAITING_PAYMENT', :createdAt)
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customer).param("date", date)
				.param("createdAt", minutesAgo(PAST_THE_GRACE_MINUTES)).query(Long.class).single();
	}

	private long payment(String reference, Long payee, int ageMinutes, long... bookings) {
		long id = jdbc.sql("""
				INSERT INTO payment (payment_intent_id, amount_minor, currency, status, payee_venue_id, created_at)
				VALUES (:pi, 4500, 'EUR', 'REQUIRES_PAYMENT', :payee, :createdAt)
				RETURNING id
				""")
				.param("pi", reference).param("payee", payee)
				.param("createdAt", minutesAgo(ageMinutes)).query(Long.class).single();
		for (long booking : bookings) {
			jdbc.sql("INSERT INTO payment_booking (payment_id, booking_ref, amount_minor) VALUES (:p, :b, 4500)")
					.param("p", id).param("b", booking).update();
		}
		return id;
	}

	private Timestamp minutesAgo(int minutes) {
		return Timestamp.from(clock.instant().minus(Duration.ofMinutes(minutes)));
	}

	private String bookingStatus(long booking) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", booking).query(String.class).single();
	}

	private String paymentStatus(long payment) {
		return jdbc.sql("SELECT status FROM payment WHERE id = :id").param("id", payment).query(String.class).single();
	}

	private long claims(SetRef set, LocalDate date) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :s AND booking_date = :d")
				.param("s", set.setId()).param("d", date).query(Long.class).single();
	}

	private long accruals(long booking) {
		return jdbc.sql("SELECT COUNT(*) FROM payout_ledger_entry WHERE booking_id = :b AND entry_type = 'ACCRUAL'")
				.param("b", booking).query(Long.class).single();
	}

	private List<Divergence> mine(ReconciliationReport report) {
		return report.divergences().stream().filter(row -> row.reference().startsWith("pi_recon")).toList();
	}

	@Test
	void aPaidWaitingBookingOutlivesTheExpiryAndIsReported() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 9, 1);
		long booking = awaitingBooking("RECON0001", set, date);
		long payment = payment("pi_recon_paid", set.venueId(), PAST_THE_GRACE_MINUTES, booking);
		PaymentIntent paid = intentIn("succeeded");
		when(intents.retrieve("pi_recon_paid")).thenReturn(paid);

		abandonedSweep.sweep(TTL, WINDOWS);
		ReconciliationReport report = reconciliation.report();

		assertEquals("AWAITING_PAYMENT", bookingStatus(booking), "the expiry asked the provider first");
		assertEquals(1L, claims(set, date), "the guest's set is not sold to someone else");
		assertEquals("REQUIRES_PAYMENT", paymentStatus(payment), "detection writes nothing");
		verify(paid, never()).cancel();
		assertEquals(List.of(new Divergence(Kind.PAID_LOCALLY_WAITING, payment, "pi_recon_paid",
				new PayeeRef(set.venueId()), List.of(new BookingRef(booking)))), mine(report));
		assertEquals(mine(report), mine(reconciliation.report()), "a repeat run reports the same");
	}

	@Test
	void repairingConfirmsOnceFromTheProviderAnswer() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 9, 2);
		long booking = awaitingBooking("RECON0002", set, date);
		long payment = payment("pi_recon_repair", set.venueId(), PAST_THE_GRACE_MINUTES, booking);
		PaymentIntent paid = intentIn("succeeded");
		when(intents.retrieve("pi_recon_repair")).thenReturn(paid);

		assertEquals(RepairOutcome.CONFIRMED, reconciliation.repair(payment));
		Awaitility.await().atMost(SETTLE).until(() -> "CONFIRMED".equals(bookingStatus(booking)) && accruals(booking) == 1L);

		assertEquals("SUCCEEDED", paymentStatus(payment));
		assertEquals(RepairOutcome.ALREADY_SETTLED, reconciliation.repair(payment), "a second press converges");
		assertEquals(1L, accruals(booking), "the ledger accrues once (invariant #9)");
		assertThat(mine(reconciliation.report())).isEmpty();
	}

	@Test
	void repairingAProviderCanceledPaymentReleasesTheSet() throws Exception {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 9, 3);
		long booking = awaitingBooking("RECON0003", set, date);
		long payment = payment("pi_recon_gone", set.venueId(), PAST_THE_GRACE_MINUTES, booking);
		PaymentIntent canceled = intentIn("canceled");
		when(intents.retrieve("pi_recon_gone")).thenReturn(canceled);

		assertEquals(List.of(Kind.CANCELED_LOCALLY_WAITING),
				mine(reconciliation.report()).stream().map(Divergence::kind).toList());

		assertEquals(RepairOutcome.CANCELED, reconciliation.repair(payment));
		Awaitility.await().atMost(SETTLE).until(() -> "CANCELLED".equals(bookingStatus(booking)) && claims(set, date) == 0L);

		assertEquals(RepairOutcome.ALREADY_SETTLED, reconciliation.repair(payment));
	}

	@Test
	void aRowInsideTheGraceAndAnAgreeingRowAreNotReported() throws Exception {
		SetRef set = onlineSet();
		long young = awaitingBooking("RECON0004", set, LocalDate.of(2027, 9, 4));
		long agreeing = awaitingBooking("RECON0005", set, LocalDate.of(2027, 9, 5));
		payment("pi_recon_young", set.venueId(), WITHIN_THE_GRACE_MINUTES, young);
		payment("pi_recon_agrees", set.venueId(), PAST_THE_GRACE_MINUTES, agreeing);
		PaymentIntent paid = intentIn("succeeded");
		when(intents.retrieve("pi_recon_young")).thenReturn(paid);

		assertThat(mine(reconciliation.report())).isEmpty();
		verify(intents, never()).retrieve("pi_recon_young");
	}

	@Test
	void aPaymentWithSeveralBookingsNamesThemAll() throws Exception {
		SetRef set = onlineSet();
		long first = awaitingBooking("RECON0006", set, LocalDate.of(2027, 9, 6));
		long second = awaitingBooking("RECON0007", set, LocalDate.of(2027, 9, 7));
		long payment = payment("pi_recon_stay", set.venueId(), PAST_THE_GRACE_MINUTES, first, second);
		PaymentIntent paid = intentIn("succeeded");
		when(intents.retrieve("pi_recon_stay")).thenReturn(paid);

		assertEquals(List.of(new Divergence(Kind.PAID_LOCALLY_WAITING, payment, "pi_recon_stay", new PayeeRef(set.venueId()),
				List.of(new BookingRef(first), new BookingRef(second)))), mine(reconciliation.report()));
	}

	@Test
	void aRowPredatingThePayeeColumnIsReportedAndNeverAsked() throws Exception {
		SetRef set = onlineSet();
		long booking = awaitingBooking("RECON0008", set, LocalDate.of(2027, 9, 8));
		long payment = payment("pi_recon_old", null, PAST_THE_GRACE_MINUTES, booking);

		assertThat(reconciliation.report().unchecked()).contains(new Unchecked(payment, "pi_recon_old", "no_payee"));
		assertEquals(RepairOutcome.NO_PAYEE, reconciliation.repair(payment));
		verify(intents, never()).retrieve("pi_recon_old");
	}

	@Test
	void anUnpaidTransactionWithNoRowIsAnOrphanAndAKnownOneIsNot() throws Exception {
		SetRef set = onlineSet();
		long booking = awaitingBooking("RECON0009", set, LocalDate.of(2027, 9, 9));
		payment("pi_recon_known", set.venueId(), PAST_THE_GRACE_MINUTES, booking);
		PaymentIntent known = intentIn("requires_payment_method");
		when(known.getId()).thenReturn("pi_recon_known");
		PaymentIntent orphan = intentIn("requires_payment_method");
		when(orphan.getId()).thenReturn("pi_recon_orphan");
		when(listing.getData()).thenReturn(List.of(known, orphan));

		ReconciliationReport report = reconciliation.report();

		assertThat(report.orphans()).contains("pi_recon_orphan").doesNotContain("pi_recon_known");
		verify(orphan, never()).cancel();
	}
}
