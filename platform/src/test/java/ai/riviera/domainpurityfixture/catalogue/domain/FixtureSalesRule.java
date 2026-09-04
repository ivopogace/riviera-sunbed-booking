package ai.riviera.domainpurityfixture.catalogue.domain;

/** Another fixture module's pure rule — the second thing a domain rule is allowed to name. */
public final class FixtureSalesRule {

	private FixtureSalesRule() {
	}

	public static boolean isOpen(int hour) {
		return hour < 16;
	}
}
