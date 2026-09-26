package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.notification.application.BookingLinks;

/**
 * Binds the origin every booking mail's link is built on and hands it to the application layer as
 * the plain {@link BookingLinks} value (the {@code RequestProperties → RequestWindows} pattern).
 * Deployed from {@code RIVIERA_RECOVERY_LINK_BASE_URL} under this module's own key, never the
 * edge's {@code riviera.recovery.*}. <strong>Unconditional</strong>, not {@code mailer}-gated: its
 * listener runs under every profile ({@link MailTransportConfig}'s reason). Rationale:
 * RESPONSIBILITIES.md §notification.
 */
@Configuration
@EnableConfigurationProperties(BookingLinkConfig.BookingLinkProperties.class)
class BookingLinkConfig {

	@Bean
	BookingLinks bookingLinks(BookingLinkProperties properties) {
		return new BookingLinks(properties.baseUrl());
	}

	/**
	 * @param baseUrl absolute origin the booking links point at (the SPA's, which is the
	 *        backend's own); validated by {@link BookingLinks}, so a blank or relative value aborts at
	 *        boot rather than mailing an unusable link from an async send whose caller is long gone
	 */
	@ConfigurationProperties("riviera.notification.booking-link")
	record BookingLinkProperties(@DefaultValue("http://localhost:4200") String baseUrl) {
	}
}
