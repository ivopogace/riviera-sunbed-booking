package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import ai.riviera.platform.booking.application.request.RequestWindows;

/**
 * Wires the Request-to-Book machinery (issue #98): binds {@link RequestProperties} and exposes it
 * to the application layer as the plain {@link RequestWindows} value. Deliberately <em>not</em>
 * profile-gated, unlike {@code BookingSchedulingConfig}: a pending request lingers (and must
 * expire) regardless of the payment profile — no Stripe is involved before accept — whereas the
 * abandoned-payment sweep only has work under the {@code stripe} profile.
 * {@code @EnableScheduling} here also covers the request-expiry sweep in every profile
 * (idempotent with the stripe-gated declaration). Package-private config inside the module
 * (invariant #11).
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(RequestProperties.class)
class BookingRequestConfig {

	@Bean
	RequestWindows requestWindows(RequestProperties properties) {
		return new RequestWindows(properties.expiryWindow(), properties.payWindow());
	}
}
