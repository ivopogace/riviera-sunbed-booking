package ai.riviera.platform.notification.adapter.in;

import java.util.regex.Pattern;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.notification.application.SupportContact;

/**
 * Binds the support channels ({@code RIVIERA_SUPPORT_EMAIL}, {@code RIVIERA_SUPPORT_WHATSAPP}) and hands
 * them to the application layer as the one {@link SupportContact}. Unconditional, like
 * {@link BookingLinkConfig}: the SPA reads it under every profile. Rationale: RESPONSIBILITIES.md
 * §notification.
 */
@Configuration
@EnableConfigurationProperties(SupportContactConfig.SupportContactProperties.class)
class SupportContactConfig {

	@Bean
	SupportContact supportContact(SupportContactProperties properties) {
		return new SupportContact(properties.email(), properties.whatsapp());
	}

	/**
	 * Blank binds to absent, so an unset variable ships no placeholder; a malformed value aborts at boot
	 * with the key named and the value never echoed.
	 *
	 * @param email the support mailbox, or {@code null}
	 * @param whatsapp the WhatsApp number, normalized to E.164 digits without the {@code +}, or {@code null}
	 */
	@ConfigurationProperties(SupportContactProperties.PREFIX)
	record SupportContactProperties(String email, String whatsapp) {

		static final String PREFIX = "riviera.notification.support";

		/**
		 * One {@code @}, no whitespace, a domain of two or more non-empty dot-separated labels: a shape check, not
		 * deliverability. Each label excludes the dot, so possessive quantifiers lose no match and keep the
		 * engine from backtracking or recursing per repetition.
		 */
		private static final Pattern MAILBOX_SHAPE = Pattern.compile("[^@\\s]++@[^@\\s.]++(?:\\.[^@\\s.]++)++");

		/** E.164: a country code never starts with 0, and the whole number is at most 15 digits. */
		private static final Pattern E164_DIGITS = Pattern.compile("[1-9]\\d{7,14}");

		/** Spaces, dashes and dots a human types inside a number, and its leading {@code +}. */
		private static final Pattern NUMBER_PUNCTUATION = Pattern.compile("[\\s.\\-]|^\\+");

		SupportContactProperties {
			email = blankToNull(email);
			if (email != null && !MAILBOX_SHAPE.matcher(email).matches()) {
				throw new IllegalArgumentException(
						PREFIX + ".email (RIVIERA_SUPPORT_EMAIL) is not an email address; leave it unset to show no mailbox");
			}
			whatsapp = blankToNull(whatsapp);
			if (whatsapp != null) {
				whatsapp = NUMBER_PUNCTUATION.matcher(whatsapp).replaceAll("");
				if (!E164_DIGITS.matcher(whatsapp).matches()) {
					throw new IllegalArgumentException(PREFIX + ".whatsapp (RIVIERA_SUPPORT_WHATSAPP) is not an "
							+ "international number with its country code (e.g. +355…); leave it unset to show no WhatsApp");
				}
			}
		}

		private static String blankToNull(String value) {
			return value == null || value.isBlank() ? null : value.strip();
		}
	}
}
