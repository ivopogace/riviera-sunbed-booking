package ai.riviera.platform.venue.vocabulary;

import java.util.regex.Pattern;

/**
 * A venue's own phone number, shown to a guest only after booking: ITU-T E.164, {@code +} then a country
 * code not starting with 0 and at most 15 digits in all. Mirrors {@code venue_phone_check} (V86), the
 * race-safe backstop. Absence is a null {@code VenuePhone}. Rationale: RESPONSIBILITIES.md §venue.
 */
public record VenuePhone(String e164) {

	private static final Pattern E164 = Pattern.compile("\\+[1-9]\\d{7,14}");

	/** Spaces, dots, dashes and parentheses a human types inside a number. */
	private static final Pattern NUMBER_PUNCTUATION = Pattern.compile("[\\s.()\\-]");

	private static final String INTERNATIONAL_PREFIX = "00";

	public VenuePhone {
		if (e164 == null || !E164.matcher(e164).matches()) {
			throw new IllegalArgumentException(
					"phone must be an international number: + and the country code, e.g. +355 69 123 4567");
		}
	}

	/** The number as typed, in international form ({@code +} or {@code 00} first), normalised to E.164. */
	public static VenuePhone parse(String typed) {
		String compact = typed == null ? "" : NUMBER_PUNCTUATION.matcher(typed).replaceAll("");
		if (compact.startsWith(INTERNATIONAL_PREFIX)) {
			compact = "+" + compact.substring(INTERNATIONAL_PREFIX.length());
		}
		return new VenuePhone(compact);
	}
}
