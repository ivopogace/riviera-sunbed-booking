package ai.riviera.platform;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Shared support for the architecture (fitness-function) tests — extracted per the #94/#95
 * review-gate notes on epic #93 once a fifth arch-test class arrived (issue #96): one
 * production classpath scan instead of one per test class, and one copy each of the
 * module/surface package arithmetic, the constant-pool bytecode reader, and the
 * violation-report assertion, instead of a copy per class.
 *
 * <p>{@link #PRODUCTION_CLASSES} is the single production-code import every rule checks
 * against (tests excluded); {@link #fixtureClasses(String)} imports a deliberately
 * mis-shaped fixture tree (test scope included) so negative cases are proven without
 * breaking production code — the {@code ai.riviera.placementfixture} mechanism from
 * issue #95. The package arithmetic follows the ADR-0007 layout,
 * {@code <base>.<module>.<surface>...}, and takes the base package as a parameter so the
 * same arithmetic runs against production and fixture trees.
 *
 * <p>Public (not package-private) only because {@code payment}'s
 * {@code NoStripeConnectArchitectureTest} shares {@link #bytecode(Path)} from its own
 * package; this is a test-scope utility, not a published surface.
 */
public final class ArchitectureTestSupport {

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

	/**
	 * A compiled class file read as ISO-8859-1 — raw bytes 1:1, so constant-pool UTF-8 symbols
	 * (SQL strings, type/method names) match as plain substrings. The shared primitive behind
	 * the bytecode-scanning rules ({@code ResponsibilitiesArchitectureTests}' sole-writer scan,
	 * {@code NoStripeConnectArchitectureTest}).
	 */
	public static String bytecode(Path classFile) {
		try {
			return new String(Files.readAllBytes(classFile), StandardCharsets.ISO_8859_1);
		}
		catch (IOException e) {
			throw new IllegalStateException("could not read " + classFile, e);
		}
	}

	/** The one violation-report shape all architecture rules fail with. */
	static void assertNoViolations(String header, List<String> violations) {
		assertTrue(violations.isEmpty(), header + ":\n  " + String.join("\n  ", violations));
	}
}
