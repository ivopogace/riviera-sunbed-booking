package ai.riviera.platform.notification.adapter.out;

import java.net.URI;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.PaymentDueMail;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for {@link MockMailer} (S8 #113, AC-10 mock side; extended for the booking-confirmation
 * kind in #371): it records each email instead of sending, and {@link MockMailer#lastTo} returns the
 * most recent one for an address — the hook a backend IT uses to pull the tokenized link out of a
 * verify/reset journey, or to assert what a confirmation carried.
 */
@ExtendWith(OutputCaptureExtension.class)
class MockMailerTest {

	private static final String BOOKING_CODE = "XK4T9PQ2";

	private static final BookingConfirmationMail CONFIRMATION = new BookingConfirmationMail(
			BOOKING_CODE, "Miramar Beach", LocalDate.of(2026, 8, 15), "A", 3, 2500, "EUR");

	private static final BookingCancellationMail CANCELLATION = new BookingCancellationMail(
			BOOKING_CODE, "Miramar Beach", LocalDate.of(2026, 8, 15), 2500, "EUR", RefundReason.POLICY);

	private final MockMailer mailer = new MockMailer();

	private static final PaymentDueMail PAYMENT_DUE = new PaymentDueMail("CODE1234", "Vala Beach",
			java.time.LocalDate.of(2026, 8, 1), java.time.Instant.parse("2026-07-31T18:00:00Z"),
			4500, "EUR", URI.create("https://riviera.example/booking/CODE1234"));

	@Test
	void recordsEachEmailAndReturnsTheLatestPerAddress() {
		mailer.sendEmailVerification("a@example.com", URI.create("https://x/account/verify?token=v1"));
		mailer.sendPasswordReset("a@example.com", URI.create("https://x/account/reset?token=r1"));

		assertThat(mailer.sent()).hasSize(2);
		assertThat(mailer.lastTo("a@example.com")).get()
				.extracting(SentEmail::kind).isEqualTo(SentEmail.Kind.PASSWORD_RESET);
		assertThat(mailer.lastTo("a@example.com")).get()
				.extracting(e -> e.link().toString()).isEqualTo("https://x/account/reset?token=r1");
		assertThat(mailer.lastTo("nobody@example.com")).isEmpty();
	}

	@Test
	void recordsBookingConfirmation() {
		mailer.sendBookingConfirmation("tourist@example.com", CONFIRMATION);

		SentEmail recorded = mailer.lastTo("tourist@example.com").orElseThrow();
		assertThat(recorded.kind()).isEqualTo(SentEmail.Kind.BOOKING_CONFIRMATION);
		assertThat(recorded.confirmation()).isEqualTo(CONFIRMATION);
		assertThat(recorded.link()).as("a confirmation carries no tokenized link").isNull();
	}

	@Test
	void recordsTheCancellation() {
		mailer.sendBookingCancellation("tourist@example.com", CANCELLATION);

		SentEmail recorded = mailer.lastTo("tourist@example.com").orElseThrow();
		assertThat(recorded.kind()).isEqualTo(SentEmail.Kind.BOOKING_CANCELLATION);
		assertThat(recorded.cancellation()).isEqualTo(CANCELLATION);
		assertThat(recorded.link()).as("a cancellation carries no tokenized link").isNull();
		assertThat(recorded.confirmation()).as("the booking kinds do not share a slot").isNull();
	}

	@Test
	void recordsThePaymentDue() {
		mailer.sendPaymentDue("tourist@example.com", PAYMENT_DUE);

		SentEmail recorded = mailer.lastTo("tourist@example.com").orElseThrow();
		assertThat(recorded.kind()).isEqualTo(SentEmail.Kind.PAYMENT_DUE);
		assertThat(recorded.paymentDue()).isEqualTo(PAYMENT_DUE);
		assertThat(recorded.link()).as("the pay link rides the payload, not the recovery slot").isNull();
		assertThat(recorded.confirmation()).as("the booking kinds do not share a slot").isNull();
		assertThat(recorded.cancellation()).isNull();
	}

	/**
	 * Invariant #7 twice: the arrival code, and the pay link that embeds it. The mock echoes recovery
	 * links by design, so this is the assertion that keeps that affordance from creeping onto a link
	 * that reaches an unpaid booking.
	 */
	@Test
	void neverLogsThePayLink(CapturedOutput output) {
		mailer.sendPaymentDue("tourist@example.com", PAYMENT_DUE);

		assertThat(output).doesNotContain(PAYMENT_DUE.payLink().toString());
		assertThat(output).doesNotContain(PAYMENT_DUE.bookingCode());
	}

	@Test
	void recordsOperatorApproved() {
		URI signInLink = URI.create("https://x/account/sign-in");
		mailer.sendOperatorApproved("owner@vala-beach.example", signInLink);

		SentEmail recorded = mailer.lastTo("owner@vala-beach.example").orElseThrow();
		assertThat(recorded.kind()).isEqualTo(SentEmail.Kind.OPERATOR_APPROVED);
		assertThat(recorded.link()).isEqualTo(signInLink);
		assertThat(recorded.confirmation()).as("this kind renders no booking details").isNull();
	}

	@Test
	void neverLogsTheBookingCode(CapturedOutput output) {
		mailer.sendBookingConfirmation("tourist@example.com", CONFIRMATION);
		mailer.sendBookingCancellation("tourist@example.com", CANCELLATION);

		// The mock deliberately logs recovery LINKS as a dev affordance, but the arrival code is a
		// bearer credential (invariant #7) with no such need — the tourist has it in the app.
		assertThat(output).doesNotContain(BOOKING_CODE);
		assertThat(output).contains("BOOKING_CONFIRMATION", "BOOKING_CANCELLATION");
	}
}
