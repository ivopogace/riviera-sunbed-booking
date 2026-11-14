package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Keeps the {@code VenueCatalog} role split honest — the
 * machine-checkable half of {@code riviera-review-overlay} <strong>RV-BE-3c</strong> for this port.
 * A fast, context-free ArchUnit test (sibling to {@link PackageShapeArchitectureTests}).
 *
 * <p>Since the split (B1), {@code venue.api.VenueCatalog} is the <strong>tourist-read</strong> port,
 * consumed by the {@code venue} module's own REST adapter, the {@code itinerary} read model that composes
 * the discovery list over it (improvement plan B4) and {@code web}'s link-preview shell. Sibling modules use the
 * role-named surfaces instead: {@code SetBookingFacts} (booking, availability) and
 * {@code VenueRates} (payout, booking-cancel). This rule is deliberately a
 * <strong>dependency-direction</strong> assertion, not a method-list freeze: adding a
 * sibling-facing method back onto {@code VenueCatalog} forces the sibling to import it, which
 * fails here — while legitimate evolution of the tourist reads stays free.
 */
class VenueApiRoleSplitTests {

	@Test
	void venueCatalogIsConsumedOnlyByTheTouristReadSurfaces() {
		noClasses()
				.that().resideOutsideOfPackages("ai.riviera.platform.venue..", "ai.riviera.platform.itinerary..",
						"ai.riviera.platform.web..")
				.should().dependOnClassesThat()
				.haveFullyQualifiedName("ai.riviera.platform.venue.api.VenueCatalog")
				.because("VenueCatalog is the tourist-read port, read by venue's own adapter, the itinerary "
						+ "read model and web's link-preview shell; siblings use the role-named surfaces "
						+ "(SetBookingFacts, VenueRates) — do not regrow the god-port")
				.check(PRODUCTION_CLASSES);
	}
}
