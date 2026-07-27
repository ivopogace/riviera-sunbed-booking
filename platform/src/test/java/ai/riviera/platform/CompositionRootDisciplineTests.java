package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.lang.ArchRule;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Locks the root-package discipline #382 restores: the composition root orchestrates the platform
 * edge (auth, sessions, SSO, recovery flows — RV-BE-11) and composes modules, but it is not a home
 * for cross-module <em>domain</em> orchestration. After the mail machinery moved into the
 * {@code notification} module, the only module surfaces the root still touches are
 * {@code customer}/{@code operator} (the two principal types), {@code notification::api} (the send
 * port) and {@code shared} — never the booking spine. A root class importing
 * {@code booking}/{@code venue}/{@code payment}/{@code payout}/{@code availability} is the #371
 * cycle pattern reappearing (an edge listener assembling module facts); such a listener belongs in
 * a module — see {@code notification.adapter.in.BookingConfirmationMailListener}, which is exactly
 * that listener, moved.
 *
 * <p>Sibling to {@link PackageShapeArchitectureTests}: fast, context-free ArchUnit, production
 * classes only.
 */
class CompositionRootDisciplineTests {

	@Test
	void rootImportsNoSpineModuleSurfaces() {
		ArchRule rule = noClasses()
				.that().resideInAPackage(PRODUCTION_BASE)
				.should().dependOnClassesThat().resideInAnyPackage(
						PRODUCTION_BASE + ".booking..", PRODUCTION_BASE + ".venue..",
						PRODUCTION_BASE + ".payment..", PRODUCTION_BASE + ".payout..",
						PRODUCTION_BASE + ".availability..")
				.because("the composition root composes modules and runs the auth edge; cross-module "
						+ "domain orchestration (e.g. a mail listener reading booking/venue facts) belongs "
						+ "in a module — the notification module exists for exactly that (#382)");
		rule.check(ArchitectureTestSupport.PRODUCTION_CLASSES);
	}
}
