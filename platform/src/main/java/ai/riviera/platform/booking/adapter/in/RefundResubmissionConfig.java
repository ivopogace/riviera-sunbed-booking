package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import ai.riviera.platform.booking.application.refund.RefundResubmissionWindow;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Binds {@link RefundResubmissionProperties} and maps it to the application-layer
 * {@link RefundResubmissionWindow} (#454) — the same edge-binding / framework-light-hexagon split as
 * {@code MailResubmissionConfig}.
 *
 * <p>Unconditional, profile-free, for the same reason: the sweep throttle is not a property of the
 * real gateway. Under the in-process stub a resubmission still re-invokes the listener and must still
 * be bounded, and the ITs that prove the scope run in exactly that profile.
 */
@Configuration
@EnableConfigurationProperties(RefundResubmissionProperties.class)
class RefundResubmissionConfig {

	@Bean
	RefundResubmissionWindow refundResubmissionWindow(RefundResubmissionProperties properties) {
		return new RefundResubmissionWindow(Duration.ofMillis(properties.cooldownMs()));
	}
}
