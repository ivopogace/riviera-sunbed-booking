package ai.riviera.platform.operator.api;

import ai.riviera.platform.shared.SiteLocale;

/**
 * Published write port for an operator's own language, the one its account mail is written in: the
 * console's language row stores the signed-in operator's pick here ({@code PUT /api/auth/operator/locale}).
 * Keyed on the session's username; only an operator principal's name may reach it (the edge's role gate).
 */
public interface OperatorLanguage {

	/** Store {@code locale} as this operator's language; {@code false} if no operator has this username. */
	boolean setLocale(String username, SiteLocale locale);
}
