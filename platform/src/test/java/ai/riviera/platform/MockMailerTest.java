package ai.riviera.platform;

import java.net.URI;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

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

	private final MockMailer mailer = new MockMailer();

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
	void neverLogsTheBookingCode(CapturedOutput output) {
		mailer.sendBookingConfirmation("tourist@example.com", CONFIRMATION);

		// The mock deliberately logs recovery LINKS as a dev affordance, but the arrival code is a
		// bearer credential (invariant #7) with no such need — the tourist has it in the app.
		assertThat(output).doesNotContain(BOOKING_CODE);
		assertThat(output).contains("BOOKING_CONFIRMATION");
	}
}
