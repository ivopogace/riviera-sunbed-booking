package ai.riviera.platform;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

/**
 * Shared support for the architecture (fitness-function) tests — extracted per the #94/#95
 * review-gate notes on epic #93 once a fifth arch-test class arrived (issue #96): one
 * production classpath scan instead of one per test class, and one copy of the
 * module/surface package arithmetic instead of a copy per class.
 *
 * <p>Two things live here and nothing else:
 * <ul>
 *   <li><strong>The importers.</strong> {@link #PRODUCTION_CLASSES} is the single
 *       production-code import every rule checks against (tests excluded);
 *       {@link #fixtureClasses(String)} imports a deliberately mis-shaped fixture tree
 *       (test scope included) so negative cases are proven without breaking production
 *       code — the {@code ai.riviera.placementfixture} mechanism from issue #95.</li>
 *   <li><strong>The package arithmetic</strong> of the ADR-0007 layout,
 *       {@code <base>.<module>.<surface>...}: {@link #moduleOf(JavaClass, String)},
 *       {@link #surfaceOf(JavaClass, String)}, {@link #segmentsBelow(JavaClass, String)},
 *       {@link #moduleRelativeSegments(JavaClass, String)}. All take the base package as a
 *       parameter so the same arithmetic runs against production and fixture trees.</li>
 * </ul>
 */
final class ArchitectureTestSupport {

	/** The Modulith base package — every module is a direct sub-package of this. */
	static final String PRODUCTION_BASE = "ai.riviera.platform";

	/**
	 * The one production-code import shared by all architecture tests. ArchUnit's
	 * {@link JavaClasses} is immutable, so sharing the instance is safe; importing once per
	 * JVM instead of once per test class is the point of the extraction.
	 */
	static final JavaClasses PRODUCTION_CLASSES = new ClassFileImporter()
			.withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
			.importPackages(PRODUCTION_BASE);

	private ArchitectureTestSupport() {
	}

	/** Imports a negative-proof fixture tree. Fixtures are test classes, so tests are included. */
	static JavaClasses fixtureClasses(String basePackage) {
		return new ClassFileImporter().importPackages(basePackage);
	}

	/**
	 * The package segments of {@code type} below {@code base} ({@code [module, surface, ...]}),
	 * or {@code null} for a type at the base package itself or outside it (root-level platform
	 * config is not a module).
	 */
	static String[] segmentsBelow(JavaClass type, String base) {
		String pkg = type.getPackageName();
		if (!pkg.startsWith(base + ".")) {
			return null;
		}
		return pkg.substring(base.length() + 1).split("\\.");
	}

	/**
	 * The module-relative package segments — the part after {@code <base>.<module>}. Returns
	 * {@code null} like {@link #segmentsBelow(JavaClass, String)}; an empty array means the type
	 * sits in the module root package itself.
	 */
	static String[] moduleRelativeSegments(JavaClass type, String base) {
		String[] all = segmentsBelow(type, base);
		if (all == null) {
			return null;
		}
		String[] sub = new String[all.length - 1];
		System.arraycopy(all, 1, sub, 0, sub.length);
		return sub;
	}

	/** The module segment (first below {@code base}) of a type, or {@code null} if outside/at root. */
	static String moduleOf(JavaClass type, String base) {
		String[] segments = segmentsBelow(type, base);
		return segments == null || segments.length == 0 ? null : segments[0];
	}

	/**
	 * The surface segment (second below {@code base}) of a type, or {@code ""} for a type at the
	 * module root / outside {@code base} (empty, not null, so {@code Set.of(...).contains} is safe).
	 */
	static String surfaceOf(JavaClass type, String base) {
		String[] segments = segmentsBelow(type, base);
		return segments == null || segments.length < 2 ? "" : segments[1];
	}

	static boolean isPackageInfo(JavaClass type) {
		return "package-info".equals(type.getSimpleName());
	}
}
