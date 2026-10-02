package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;

/**
 * Keeps login and session machinery and mail transport out of the {@code operator} domain module (RV-BE-11):
 * no Spring Security, Spring Session, Spring Mail, Jakarta Mail or Angus Mail type, per {@link AuthPlacementRule}.
 * Fast, context-free ArchUnit; the negative case runs against {@code ai.riviera.authplacementfixture.operator}.
 */
class OperatorAuthPlacementTests {

	private static final String MODULE = "operator";

	@Test
	void operatorModuleDependsOnNoLoginSessionOrMailType() {
		AuthPlacementRule.noLoginMachineryIn(PRODUCTION_BASE, MODULE).check(PRODUCTION_CLASSES);
	}

	@Test
	void everyBannedPackageIsRejected() {
		AuthPlacementRule.assertRejectsEveryBannedPackage(MODULE);
	}
}
