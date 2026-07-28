package ai.riviera.platform.notification.adapter.out;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.notification.application.EmailSuppressions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * The security gate on #390's flag: <strong>the suppression question is answered only where
 * confirmation proves payment.</strong>
 *
 * <p>#390's non-enumeration argument is "after payment the requester has already demonstrated
 * control of the booking flow for that address", and the gate implementing it is
 * {@code status == CONFIRMED}. That equivalence holds only under the {@code stripe} profile —
 * without it the in-process stub gateway returns {@code Succeeded} synchronously, so
 * {@code POST /api/bookings} yields {@code 201 CONFIRMED} with nothing collected and the flag would
 * be a free suppression oracle for any address (D-8).
 *
 * <p>So this pins both halves and their complementarity: exactly one bean, always, and the answering
 * one only where a real gateway stands in front of it. Sibling of {@link MailerProfileWiringTest} —
 * {@link ApplicationContextRunner}, no Spring Boot context, no web layer, no Docker.
 */
class ConfirmationMailDeliveryProfileWiringTest {

	private final ApplicationContextRunner runner = new ApplicationContextRunner()
			.withBean(CustomerLookup.class, () -> mock(CustomerLookup.class))
			.withBean(EmailSuppressions.class, () -> mock(EmailSuppressions.class))
			.withUserConfiguration(SuppressedConfirmationMailDelivery.class,
					NonDisclosingConfirmationMailDelivery.class);

	@Test
	void withoutTheStripeProfileTheQuestionIsNotAnswered() {
		runner.run(context -> {
			assertThat(context).hasSingleBean(ConfirmationMailDelivery.class);
			assertThat(context.getBean(ConfirmationMailDelivery.class))
					.isInstanceOf(NonDisclosingConfirmationMailDelivery.class);
		});
	}

	@Test
	void theStripeProfileAnswersFromTheSuppressionList() {
		runner.withPropertyValues("spring.profiles.active=stripe").run(context -> {
			assertThat(context).hasSingleBean(ConfirmationMailDelivery.class);
			assertThat(context.getBean(ConfirmationMailDelivery.class))
					.isInstanceOf(SuppressedConfirmationMailDelivery.class);
		});
	}

	@Test
	void theNonDisclosingDeliveryNeverReportsAWithheldMail() {
		// The whole point: no lookup, no oracle — regardless of what the suppression list holds.
		assertThat(new NonDisclosingConfirmationMailDelivery()
				.isWithheld(new ai.riviera.platform.customer.vocabulary.CustomerId(7))).isFalse();
	}
}
