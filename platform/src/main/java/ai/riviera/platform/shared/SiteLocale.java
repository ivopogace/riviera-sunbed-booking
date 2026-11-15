package ai.riviera.platform.shared;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * A locale the SPA is built and served in (ADR-0030): English at the root, each other one under its
 * code as a subpath. The one served-locale list: {@code web}'s shells, a booking's stored language and
 * the mails and their links all take it, so a client value only ever selects one of these, never
 * reaches a path raw. Placement: {@code RESPONSIBILITIES.md} §{@code shared}.
 */
public enum SiteLocale {
	EN("en", ""),
	SQ("sq", "sq"),
	IT("it", "it");

	private final String code;
	private final String subPath;
	private final Locale locale;

	SiteLocale(String code, String subPath) {
		this.code = code;
		this.subPath = subPath;
		this.locale = Locale.of(code);
	}

	/** The locale's code, as the build names it, the SPA sends it and {@code booking.locale} stores it. */
	public String code() {
		return code;
	}

	/** The URL segment the locale is served under; empty for the source locale at the root. */
	public String subPath() {
		return subPath;
	}

	public Locale locale() {
		return locale;
	}

	/** The served locale with exactly this code; English for any other value, absent included. */
	public static SiteLocale fromCode(String code) {
		return ofCode(code).orElse(EN);
	}

	/** The served locale with exactly this code, or empty: for a write that must refuse what it cannot serve. */
	public static Optional<SiteLocale> ofCode(String code) {
		return Arrays.stream(values()).filter(l -> l.code.equals(code)).findFirst();
	}
}
