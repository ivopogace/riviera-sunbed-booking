package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Keeps the {@code VenueCatalog} role split honest (improvement-plan C2, issue #94) — the
 * machine-checkable half of {@code riviera-review-overlay} <strong>RV-BE-3c</strong> for this port.
 * A fast, context-free ArchUnit test (sibling to {@link PackageShapeArchitectureTests}).
 *
 * <p>Since the split (B1), {@code venue.api.VenueCatalog} is the <strong>tourist-read</strong> port
 * and its only consumer is the {@code venue} module's own REST adapter. Sibling modules use the
 * role-named surfaces instead: {@code SetBookingFacts} (booking, availability) and
 * {@code VenueRates} (payout, booking-cancel). This rule is deliberately a
 * <strong>dependency-direction</strong> assertion, not a method-list freeze: adding a
 * sibling-facing method back onto {@code VenueCatalog} forces the sibling to import it, which
 * fails here — while legitimate evolution of the tourist reads stays free.
 */
class VenueApiRoleSplitTests {

	private static final JavaClasses PRODUCTION_CLASSES = new ClassFileImporter()
			.withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
			.importPackages("ai.riviera.platform");

	@Test
	void venueCatalogIsConsumedOnlyInsideTheVenueModule() {
		noClasses()
				.that().resideOutsideOfPackage("ai.riviera.platform.venue..")
				.should().dependOnClassesThat()
				.haveFullyQualifiedName("ai.riviera.platform.venue.api.VenueCatalog")
				.because("VenueCatalog is the tourist-read port; siblings use the role-named "
						+ "surfaces (SetBookingFacts, VenueRates) — do not regrow the god-port (#94)")
				.check(PRODUCTION_CLASSES);
	}
}
