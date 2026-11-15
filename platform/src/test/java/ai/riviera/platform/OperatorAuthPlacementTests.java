package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.api.OperatorSsoLinks;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

	/** The SSO link store sits inside the scanned module, so the rule above holds it to RV-BE-11 too (#276). */
	@Test
	void theSsoLinkPortIsInsideTheScannedModule() {
		assertTrue(PRODUCTION_CLASSES.contain(OperatorSsoLinks.class));
		assertTrue(OperatorSsoLinks.class.getPackageName().startsWith(PRODUCTION_BASE + "." + MODULE + "."));
	}

	@Test
	void everyBannedPackageIsRejected() {
		AuthPlacementRule.assertRejectsEveryBannedPackage(MODULE);
	}
}
