package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import ai.riviera.platform.booking.application.request.RequestWindows;

/**
 * Wires Request-to-Book: binds {@link RequestProperties} and exposes it to the application layer
 * as the plain {@link RequestWindows} value. <em>Not</em> profile-gated, unlike
 * {@code BookingSchedulingConfig}: a pending request must expire in every payment profile (no
 * Stripe is involved before accept), whereas the abandoned-payment sweep only has work under
 * {@code stripe}. {@code @EnableScheduling} here thus covers the request-expiry sweep in every
 * profile (idempotent with the stripe-gated declaration).
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
