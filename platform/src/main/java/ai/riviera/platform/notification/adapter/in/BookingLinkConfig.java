package ai.riviera.platform.notification.adapter.in;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.notification.application.BookingLinks;

/**
 * Binds the origin every booking mail's link is built on and hands it to the application layer as the
 * plain {@link BookingLinks} value (#373) — the {@code RequestProperties → RequestWindows} pattern,
 * keeping the configuration type at the adapter edge.
 *
 * <p><strong>The deployed value comes from {@code RIVIERA_RECOVERY_LINK_BASE_URL}</strong>
 * ({@code application.properties}), which is #375's precedent: the operator-approval notice reused
 * that variable rather than introducing a second origin knob. There is exactly one deployed origin —
 * the backend serves the SPA same-origin since #110 — so a second environment variable could only
 * ever be set to the same value or, eventually, to a wrong one. The <em>property key</em> is this
 * module's own, because {@code riviera.recovery.*} belongs to the edge's recovery flows and a module
 * reaching into another context's namespace is the coupling this pattern exists to avoid.
 *
 * <p>Deliberately <strong>unconditional</strong> and not gated on the {@code mailer} profile, for
 * {@link MailTransportConfig}'s reason: the listener that needs it runs under every profile, the mock
 * transport included, so a profile-gated bean would leave it unconstructible everywhere except
 * production.
 */
@Configuration
@EnableConfigurationProperties(BookingLinkConfig.BookingLinkProperties.class)
class BookingLinkConfig {

	@Bean
	BookingLinks bookingLinks(BookingLinkProperties properties) {
		return new BookingLinks(properties.baseUrl());
	}

	/**
	 * @param baseUrl absolute origin the booking links point at (the SPA's, which since #110 is the
	 *        backend's own); validated by {@link BookingLinks}, so a blank or relative value aborts at
	 *        boot rather than mailing an unusable link from an async send whose caller is long gone
	 */
	@ConfigurationProperties("riviera.notification.booking-link")
	record BookingLinkProperties(@DefaultValue("http://localhost:4200") String baseUrl) {
	}
}
