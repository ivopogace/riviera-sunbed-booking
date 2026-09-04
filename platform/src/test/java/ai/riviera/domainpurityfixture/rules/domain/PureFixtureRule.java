package ai.riviera.domainpurityfixture.rules.domain;

import java.time.Duration;

import ai.riviera.domainpurityfixture.catalogue.domain.FixtureSalesRule;
import ai.riviera.domainpurityfixture.catalogue.vocabulary.FixtureSetId;

/**
 * The positive fixture: the JDK plus another module's {@code vocabulary/} and {@code domain/}, which
 * the rule must permit — every production domain file looks like this today.
 */
public final class PureFixtureRule {

	private PureFixtureRule() {
	}

	public static boolean bookable(FixtureSetId setId, int hour, Duration window) {
		return setId.value() > 0 && FixtureSalesRule.isOpen(hour) && !window.isNegative();
	}
}
