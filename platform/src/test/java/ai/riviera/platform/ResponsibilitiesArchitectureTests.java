package ai.riviera.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.Source;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static ai.riviera.platform.ArchitectureTestSupport.bytecode;
import static ai.riviera.platform.ArchitectureTestSupport.classFileOf;
import static ai.riviera.platform.ArchitectureTestSupport.moduleOf;
import static ai.riviera.platform.ArchitectureTestSupport.surfaceOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Encodes the <strong>machine-checkable half of {@code RESPONSIBILITIES.md}</strong> as fitness
 * functions (improvement-plan C4) — the structural subset of the Job / Not-My-Job
 * boundaries that an illegal import or a stray SQL string would betray:
 * <ol>
 *   <li><strong>Sole-writer:</strong> no class outside the {@code availability} module touches
 *       the {@code set_availability} table — the mechanical form of "availability is the only
 *       writer of that table" (invariant #2). Detected by scanning each class's compiled
 *       bytecode (via its ArchUnit source URI) for the whole-word table name — the
 *       {@code NoStripeConnectArchitectureTest} mechanism, because a class-location convention
 *       cannot see SQL. Deliberately stronger than "writer": ANY reference (read or write)
 *       outside the module fails — cross-module reads go through availability's published
 *       ports too (invariant #11), never straight at its table.</li>
 *   <li><strong>No forbidden reach:</strong> the Stripe SDK ({@code com.stripe..}) is importable
 *       only inside {@code payment}. {@code ApplicationModules.verify()} polices module-internal
 *       package reach; this adds the third-party-SDK boundary it cannot see. (Which Stripe APIs
 *       payment itself may use — no Connect — stays {@code NoStripeConnectArchitectureTest}'s job.)</li>
 *   <li><strong>Id-based events:</strong> every record in an {@code events} named interface
 *       carries only id/value payloads — every raw type involved in a component's declared type
 *       (generics and arrays unwrapped) is a primitive, a {@code java.*} type, or a published
 *       {@code vocabulary} type; never an aggregate from any {@code domain} package (the
 *       Need-To-Know half of invariant #11).</li>
 *   <li><strong>Sole-writer, review table:</strong> no class outside the {@code review}
 *       module carries SQL against the {@code review} table. The bare table name is useless as a
 *       token — every legitimate consumer of review's published surfaces has the module's package
 *       name in its constant pool — so this rule keys on <em>SQL-shaped</em> references instead:
 *       an SQL keyword ({@code FROM}/{@code INTO}/{@code UPDATE}/{@code JOIN}/{@code TABLE})
 *       followed by the whole-word table name.</li>
 *   <li><strong>Sole-writer, venue rating columns:</strong> {@code rating_tenths} /
 *       {@code reviews_count} are referenced only inside {@code venue} — the mechanical form of
 *       §venue's "I store the rating aggregate; {@code review} computes it": {@code review}
 *       announces via {@code ReviewsChanged} and answers via its aggregate port; only {@code venue}
 *       names its columns. Same whole-word constant-pool scan as rule 1.</li>
 *   <li><strong>Sole-writer, challenge registry:</strong> no class outside the {@code challenge}
 *       module touches {@code challenge_registry} — the mechanical form of §{@code challenge}'s
 *       "only writer of {@code challenge_registry}". A claim written anywhere else is a second
 *       opinion on whether a solved challenge has been spent, which is the one thing the table
 *       exists to settle. Same whole-word constant-pool scan as rule 1; the bare token is safe
 *       here because the module's package name is {@code challenge}, not {@code challenge_registry}.</li>
 *   <li><strong>Sole-writer, admin audit trail:</strong> no class outside the {@code audit} module
 *       touches {@code admin_audit_record} — the mechanical form of §{@code audit}'s "only writer
 *       of {@code admin_audit_record}". A row appended anywhere else is an unattributable claim
 *       about what an admin did, which is the one thing the table exists to settle; the edge's
 *       fence records through {@code audit::api}, never at the table. Same whole-word constant-pool
 *       scan as rule 1, and the bare token is safe for the same reason as rule 6 — the module's
 *       package name is {@code audit}.</li>
 *   <li><strong>Sole-writer, platform settings:</strong> no class outside the {@code payout} module
 *       touches {@code platform_setting} — the mechanical form of §{@code payout}'s "I am its sole
 *       writer". The value that table holds is what the ledger deducts from a venue, so a second
 *       writer is a second opinion on what a venue is charged. Same whole-word constant-pool scan
 *       as rule 1.</li>
 *   <li><strong>Sole-writer, per-day attendance:</strong> no class outside the {@code booking}
 *       module touches {@code booking_day} — the mechanical form of §{@code booking}'s "I am
 *       the sole writer of {@code booking_day}". A day stamped anywhere else is a second opinion
 *       on whether a guest turned up, which is the one thing the table exists to settle; the
 *       stay outcome on {@code booking.status} is derived from it. Same whole-word constant-pool
 *       scan as rule 1, and the bare token is safe because the module's package name is
 *       {@code booking}, not {@code booking_day}.</li>
 *   <li><strong>Sole-writer, stays:</strong> no class outside the {@code booking} module runs SQL
 *       against {@code stay} (ADR-0024). SQL-shaped, like rule 4, because the bare word is in prose
 *       and in {@code max_stay_days}.</li>
 *   <li><strong>Sole-writer, every owned table:</strong> {@link #SOLE_WRITERS} maps each table in
 *       {@code CLAUDE.md}'s "Sole writer of" column (plus {@code challenge_registry} and
 *       {@code admin_audit_record}) to its owning module, and no class outside that module carries a
 *       write against it. A write is SQL-shaped and judged per {@code CONSTANT_String}:
 *       {@code INSERT INTO}, {@code UPDATE … SET}, {@code DELETE FROM}, {@code MERGE INTO} or
 *       {@code TRUNCATE} followed by the whole-word table name, so a bare name ({@code booking},
 *       {@code payment}, {@code venue}, {@code operator}) never matches a package string, prose, a
 *       read or a longer table name. An {@code ON CONFLICT} clause belongs to its {@code INSERT INTO},
 *       which already names the target. The map is held to the Flyway schema both ways: every table
 *       the latest migration leaves is owned or a named framework table, and every owner writes it.
 *       Rules 1, 4 and 6–10 stay as the stronger "touch" form (reads too) for their tables; they and
 *       rule 5 take their module from this map, so no two rules disagree on who owns a table.</li>
 * </ol>
 *
 * <p><strong>Necessary, not sufficient.</strong> These rules encode only the <em>structural</em>
 * half of {@code RESPONSIBILITIES.md}. The <em>semantic</em> half — a refund <em>policy</em>
 * reimplemented inside {@code payment}, commission <em>math</em> inside {@code venue} — needs no
 * illegal import or stray table name and <em>cannot</em> be machine-checked; it remains the job
 * of the plan-time Module-ownership table and review item RV-BE-11. A green run here must never
 * be read as "boundaries fully enforced." (Known scan limits, same trade-off as
 * {@code NoStripeConnectArchitectureTest}: rule 1 keys on the contiguous whole-word table name in
 * the constant pool — SQL assembled by concatenation that splits the name would evade it (the
 * project's text-block-SQL idiom keeps names contiguous), and a match at the very start of a pool
 * string can hide behind an alphanumeric length byte. The word-boundary check means a
 * <em>different</em> identifier merely containing the name ({@code reset_availability}) does not
 * false-positive; a class that inlines availability's table-name constant still matches — that
 * coupling is exactly what the rule exists to surface. Rule 11 judges whole {@code CONSTANT_String}
 * entries, so it has no length-byte blind spot, but it misses a write whose table name is
 * concatenated or taken from a constant, and one qualified by a schema other than {@code public}.)
 *
 * <p>The violation collectors are parameterized by {@code (JavaClasses, base)} so the negative
 * cases are proven against the deliberately-violating fixtures under
 * {@code ai.riviera.responsibilityfixture} — never by breaking production code. Fast and
 * context-free like its siblings ({@link PackageShapeArchitectureTests},
 * {@link PublishedSurfacePlacementArchitectureTests}): no Spring, no DB.
 */
class ResponsibilitiesArchitectureTests {

	/**
	 * Table → its one writing module: {@code CLAUDE.md}'s "Sole writer of" column, the closed
	 * non-context modules' tables included. The framework tables ({@link #FRAMEWORK_TABLES}) are
	 * written by no module and are not here.
	 */
	private static final Map<String, String> SOLE_WRITERS = soleWriters(
			"venue", List.of("venue", "set_position", "venue_amenity", "venue_photo", "venue_photo_variant",
					"venue_commission_rate"),
			"availability", List.of("set_availability"),
			"booking", List.of("booking", "stay", "booking_day", "remodel_receipt", "remodel_receipt_move",
					"remodel_receipt_outcome", "remodel_receipt_kept"),
			"payment", List.of("payment", "payment_booking", "payment_refund", "stripe_webhook_event"),
			"payout", List.of("payout_ledger_entry", "payout_batch", "platform_setting"),
			"customer", List.of("customer", "customer_account", "customer_sso_identity", "customer_account_token"),
			"operator", List.of("operator", "operator_venue"),
			"review", List.of("review"),
			"notification", List.of("email_suppression", "booking_confirmation_mail_attempt"),
			"challenge", List.of("challenge_registry"),
			"audit", List.of("admin_audit_record"));

	/** Tables Flyway creates for a framework, written by no module (Spring Session, Modulith's registry). */
	private static final Set<String> FRAMEWORK_TABLES = Set.of(
			"spring_session", "spring_session_attributes", "event_publication", "event_publication_archive");

	/** One SQL-shaped write pattern per owned table (rule 11). */
	private static final Map<String, Pattern> WRITE_SQL = writePatterns();

	private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration");

	private static final Pattern VERSIONED_MIGRATION = Pattern.compile("V(.+?)__.+\\.sql");

	/** A quoted identifier, string literal or comment, matched left to right so none opens inside another. */
	private static final Pattern SQL_QUOTED_OR_COMMENT =
			Pattern.compile("\"(?:[^\"]|\"\")*\"|'(?:[^']|'')*'|--[^\\n]*|/\\*.*?\\*/", Pattern.DOTALL);

	/** An unquoted identifier as PostgreSQL's lexer reads it ({@code scan.l}): every non-ASCII character is a letter. */
	private static final String UNQUOTED = "[A-Za-z_\\x{80}-\\x{10FFFF}][A-Za-z0-9_$\\x{80}-\\x{10FFFF}]*";

	/** A Unicode-escaped, bare or quoted identifier; a quoted one may hold any character, {@code ""} escaping a quote. */
	private static final String IDENTIFIER = "(?:[uU]&\"(?:[^\"]|\"\")*\"|" + UNQUOTED + "|\"(?:[^\"]|\"\")*\")";

	private static final String TABLE_NAME = "(?:" + IDENTIFIER + "\\s*\\.\\s*)?" + IDENTIFIER;

	private static final Pattern IDENTIFIER_PART = Pattern.compile(IDENTIFIER);

	private static final Pattern QUALIFIED_NAME = Pattern.compile(TABLE_NAME);

	/** Table DDL in statement order; a rename needs {@code RENAME TO} straight after the name, so
	 * {@code RENAME [COLUMN] a TO b} and {@code RENAME CONSTRAINT} never match. */
	private static final Pattern TABLE_DDL = Pattern.compile("(?i)\\b(?:"
			+ "CREATE\\s+(?<unmodelled>(?:(?:GLOBAL|LOCAL)\\s+)?(?:TEMP|TEMPORARY)|UNLOGGED)\\s+TABLE\\b"
			+ "|CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?<created>" + TABLE_NAME + ")"
			+ "|DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?<dropped>" + TABLE_NAME
			+ "(?:\\s*,\\s*" + TABLE_NAME + ")*)"
			+ "|ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?(?<renamedFrom>" + TABLE_NAME + ")"
			+ "\\s+RENAME\\s+TO\\s+(?<renamedTo>" + TABLE_NAME + ")"
			+ "|ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?" + TABLE_NAME + "\\s+(?<setSchema>SET\\s+SCHEMA)\\b)");

	private static final String PUBLIC_SCHEMA = "public";

	/** An unquoted name the walk folds as PostgreSQL does: past ASCII, folding depends on encoding and locale. */
	private static final Pattern PLAIN_UNQUOTED = Pattern.compile("[A-Za-z_][A-Za-z0-9_$]*");

	/** A name PostgreSQL stores as written whether quoted or not: lower case, no special character. */
	private static final Pattern FOLDED_NAME = Pattern.compile("[a-z_][a-z0-9_$]*");

	/** The per-(set, date) source-of-truth table owned by {@code availability} (invariant #2). */
	private static final String AVAILABILITY_TABLE = "set_availability";

	/** The one module that may reference {@link #AVAILABILITY_TABLE} (invariant #2). */
	private static final String AVAILABILITY_MODULE = SOLE_WRITERS.get(AVAILABILITY_TABLE);

	/** The one module that may touch the Stripe SDK (RESPONSIBILITIES.md / ADR-0002). */
	private static final String PAYMENT_MODULE = "payment";

	/** The Stripe SDK's root package — matched with a package boundary, so {@code com.stripefoo} is not it. */
	private static final String STRIPE_SDK_ROOT = "com.stripe";

	/** The one module that may run SQL against the {@code review} table (#811, ADR-0015). */
	private static final String REVIEW_MODULE = SOLE_WRITERS.get("review");

	/** SQL-shaped reference to the {@code review} table: keyword + whole-word table name.
	 * The bare name would false-positive on the module's own package string in every consumer. */
	private static final Pattern REVIEW_TABLE_SQL =
			Pattern.compile("(?i)\\b(?:from|into|update|join|table)\\s+review(?![_\\p{Alnum}])");

	/** The one module that may name its rating columns (§venue: it stores, {@code review} computes). */
	private static final String VENUE_MODULE = SOLE_WRITERS.get("venue");

	/** The venue-owned aggregate columns no other module may reference (#811). */
	private static final List<String> RATING_COLUMNS = List.of("rating_tenths", "reviews_count");

	/** The single-use registry table owned by {@code challenge} (ADR-0016, ADR-0017). */
	private static final String CHALLENGE_REGISTRY_TABLE = "challenge_registry";

	/** The one module that may reference {@link #CHALLENGE_REGISTRY_TABLE}. */
	private static final String CHALLENGE_MODULE = SOLE_WRITERS.get(CHALLENGE_REGISTRY_TABLE);

	/** The append-only admin audit trail owned by {@code audit} (ADR-0013, ADR-0017). */
	private static final String ADMIN_AUDIT_TABLE = "admin_audit_record";

	/** The one module that may reference {@link #ADMIN_AUDIT_TABLE}. */
	private static final String AUDIT_MODULE = SOLE_WRITERS.get(ADMIN_AUDIT_TABLE);

	/** The platform's own settings, owned by {@code payout} (ADR-0021). */
	private static final String PLATFORM_SETTING_TABLE = "platform_setting";

	/** The per-day attendance record owned by {@code booking} (multi-day stays, D2). */
	private static final String BOOKING_DAY_TABLE = "booking_day";

	/** The one module that may reference {@link #BOOKING_DAY_TABLE}. */
	private static final String BOOKING_MODULE = SOLE_WRITERS.get(BOOKING_DAY_TABLE);

	/** SQL-shaped reference to the {@code stay} table (design D6): keyword + whole-word table name,
	 * because the bare word appears in prose and in {@code max_stay_days}. */
	private static final Pattern STAY_TABLE_SQL =
			Pattern.compile("(?i)\\b(?:from|into|update|join|table)\\s+stay(?![_\\p{Alnum}])");

	/** The one module that may reference {@link #PLATFORM_SETTING_TABLE}. */
	private static final String PAYOUT_MODULE = SOLE_WRITERS.get(PLATFORM_SETTING_TABLE);

	private static final String EVENTS_SURFACE = "events";
	private static final String VOCABULARY_SURFACE = "vocabulary";
	private static final String JDK_PACKAGE_PREFIX = "java.";

	private static final String FIXTURE_BASE = "ai.riviera.responsibilityfixture";

	private static final JavaClasses PRODUCTION_CLASSES = ArchitectureTestSupport.PRODUCTION_CLASSES;

	private static final JavaClasses FIXTURE_CLASSES =
			ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE);

	// ---- rule 1: availability is the sole writer (sole toucher) of set_availability ---------

	@Test
	void availabilityTableIsTouchedOnlyInsideTheAvailabilityModule() {
		List<String> violations = availabilityTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (availability sole-writer, invariant #2)",
				violations);
	}

	/** Guards against a vacuously-green scan: availability's own classes DO carry the table name. */
	@Test
	void theAvailabilityModuleItselfWritesTheTable() {
		boolean availabilityReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (AVAILABILITY_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& referencesAvailabilityTable(type)) {
				availabilityReferencesTable = true;
				break;
			}
		}
		assertTrue(availabilityReferencesTable,
				"expected at least one availability class to reference '" + AVAILABILITY_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside class carrying the table's SQL is rejected. */
	@Test
	void outsideWriterFixtureIsRejected() {
		List<String> violations = availabilityTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueAvailabilityWriter")),
				"Expected the sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
	}

	// ---- rule 2: the Stripe SDK is reachable only inside the payment module ----------------

	@Test
	void stripeSdkIsReachableOnlyInsideThePaymentModule() {
		List<String> violations = stripeReachViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (Stripe SDK only inside payment)",
				violations);
	}

	/** Guards against a vacuously-green rule: payment's own adapters DO depend on Stripe. */
	@Test
	void thePaymentModuleItselfUsesStripe() {
		boolean paymentUsesStripe = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (PAYMENT_MODULE.equals(moduleOf(type, PRODUCTION_BASE)) && dependsOnStripe(type)) {
				paymentUsesStripe = true;
				break;
			}
		}
		assertTrue(paymentUsesStripe, "expected the payment module to depend on com.stripe.. "
				+ "(the collection gateway) — otherwise the Stripe-reach rule proves nothing");
	}

	/** The negative proof (red run): a Stripe import outside payment is rejected — and the
	 * fixture payment module's own Stripe use is NOT (the exclusion path works). */
	@Test
	void stripeOutsidePaymentFixtureIsRejected() {
		List<String> violations = stripeReachViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueStripeCaller")),
				"Expected the Stripe-reach rule to reject the fixture caller outside payment, "
						+ "but got: " + violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureStripeGateway")),
				"The fixture payment module's own Stripe use must not be flagged, but got: "
						+ violations);
	}

	// ---- rule 3: event records carry only ids and values (Need-To-Know, invariant #11) -----

	@Test
	void eventRecordsCarryOnlyIdsAndValues() {
		List<String> violations = eventPayloadViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (id-based event payloads, invariant #11)",
				violations);
	}

	/** Guards against a vacuously-green rule: the import must see event records, and at least
	 * one id/value payload the classifier recognizes as vocabulary. (Deliberately no stronger:
	 * requiring e.g. a primitive component would couple this guard to the incidental payload
	 * mix of today's events.) */
	@Test
	void eventSurfacesWereInspected() {
		boolean sawEventRecord = false, sawVocabulary = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (!EVENTS_SURFACE.equals(surfaceOf(type, PRODUCTION_BASE)) || !type.isRecord()) {
				continue;
			}
			sawEventRecord = true;
			for (JavaField field : payloadFields(type)) {
				for (JavaClass involved : field.getType().getAllInvolvedRawTypes()) {
					sawVocabulary |= VOCABULARY_SURFACE.equals(surfaceOf(involved, PRODUCTION_BASE));
				}
			}
		}
		assertTrue(sawEventRecord && sawVocabulary,
				"Expected the production import to contain event records carrying at least one "
						+ "vocabulary-typed component — otherwise the id-based-events rule is "
						+ "vacuously green.");
	}

	/** The negative proof (red run): an event record carrying a domain aggregate — bare or
	 * wrapped in a generic container — is rejected, and its legitimate id/primitive components
	 * are NOT (the allow path works). */
	@Test
	void aggregateCarryingEventFixtureIsRejected() {
		List<String> violations = eventPayloadViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains(".aggregate ") && v.contains("FakeAggregate")),
				"Expected the id-based-events rule to reject the bare aggregate component, but got: "
						+ violations);
		assertTrue(violations.stream()
						.anyMatch(v -> v.contains(".aggregates ") && v.contains("FakeAggregate")),
				"Expected the id-based-events rule to reject the aggregate hidden in List<...> "
						+ "(generics unwrapped), but got: " + violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureId")),
				"The fixture event's legitimate vocabulary-typed id must not be flagged, but got: "
						+ violations);
	}

	// ---- rule 4: review is the sole toucher of the review table (#811) ---------------------

	@Test
	void reviewTableIsTouchedOnlyInsideTheReviewModule() {
		List<String> violations = reviewTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (review sole-writer, #811)",
				violations);
	}

	/** Guards against a vacuously-green scan: review's own adapter DOES carry the table's SQL. */
	@Test
	void theReviewModuleItselfTouchesItsTable() {
		boolean reviewReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (REVIEW_MODULE.equals(moduleOf(type, PRODUCTION_BASE)) && referencesReviewTableSql(type)) {
				reviewReferencesTable = true;
				break;
			}
		}
		assertTrue(reviewReferencesTable,
				"expected at least one review class to carry SQL against the review table — "
						+ "otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): outside SQL against the table is rejected — and the
	 * fixture review module's own SQL is NOT (the exclusion path works). */
	@Test
	void outsideReviewTableFixtureIsRejected() {
		List<String> violations = reviewTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueReviewTableReader")),
				"Expected the review sole-writer scan to reject the fixture outside reader, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcReviews")),
				"The fixture review module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 5: venue is the sole toucher of its rating columns (#811) ---------------------

	@Test
	void ratingColumnsAreTouchedOnlyInsideTheVenueModule() {
		List<String> violations = ratingColumnViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (venue rating-columns sole-writer, #811)",
				violations);
	}

	/** Guards against a vacuously-green scan: venue's own adapters DO name the columns. */
	@Test
	void theVenueModuleItselfWritesTheRatingColumns() {
		boolean venueReferencesColumns = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (VENUE_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& !ratingColumnsIn(type).isEmpty()) {
				venueReferencesColumns = true;
				break;
			}
		}
		assertTrue(venueReferencesColumns,
				"expected at least one venue class to reference the rating columns — "
						+ "otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer of the columns is rejected — and the
	 * fixture venue module's own write is NOT (the exclusion path works). */
	@Test
	void outsideRatingColumnFixtureIsRejected() {
		List<String> violations = ratingColumnViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueRatingColumnWriter")),
				"Expected the rating-columns scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureVenueRatingWriter")),
				"The fixture venue module's own column write must not be flagged, but got: "
						+ violations);
	}

	// ---- rule 6: challenge is the sole toucher of its single-use registry -------------------

	@Test
	void challengeRegistryTableIsTouchedOnlyInsideTheChallengeModule() {
		List<String> violations = challengeRegistryViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (challenge sole-writer, ADR-0017)",
				violations);
	}

	/** Guards against a vacuously-green scan: the module's own adapter DOES carry the table's SQL. */
	@Test
	void theChallengeModuleItselfWritesTheTable() {
		boolean challengeReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (CHALLENGE_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& referencesChallengeRegistryTable(type)) {
				challengeReferencesTable = true;
				break;
			}
		}
		assertTrue(challengeReferencesTable,
				"expected at least one challenge class to reference '" + CHALLENGE_REGISTRY_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer is rejected — and the fixture module's
	 * own writer is NOT (the exclusion path works). */
	@Test
	void outsideChallengeRegistryWriterFixtureIsRejected() {
		List<String> violations = challengeRegistryViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueChallengeRegistryWriter")),
				"Expected the challenge sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcChallengeRegistry")),
				"The fixture challenge module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 7: audit is the sole toucher of the admin audit trail ------------------------

	@Test
	void adminAuditTableIsTouchedOnlyInsideTheAuditModule() {
		List<String> violations = adminAuditTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (audit sole-writer, ADR-0017)",
				violations);
	}

	/** Guards against a vacuously-green scan: the module's own adapter DOES carry the table's SQL. */
	@Test
	void theAuditModuleItselfWritesTheTable() {
		boolean auditReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (AUDIT_MODULE.equals(moduleOf(type, PRODUCTION_BASE)) && referencesAdminAuditTable(type)) {
				auditReferencesTable = true;
				break;
			}
		}
		assertTrue(auditReferencesTable,
				"expected at least one audit class to reference '" + ADMIN_AUDIT_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer is rejected — and the fixture module's
	 * own writer is NOT (the exclusion path works). */
	@Test
	void adminAuditTableTouchedOutsideTheAuditModuleIsRejected() {
		List<String> violations = adminAuditTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueAdminAuditWriter")),
				"Expected the audit sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcAdminAuditLog")),
				"The fixture audit module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 8: payout is the sole toucher of the platform settings table -----------------

	@Test
	void platformSettingTableIsTouchedOnlyInsideThePayoutModule() {
		List<String> violations = platformSettingTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (payout sole-writer, ADR-0021)",
				violations);
	}

	/** Guards against a vacuously-green scan: the module's own adapter DOES carry the table's SQL. */
	@Test
	void thePayoutModuleItselfWritesTheTable() {
		boolean payoutReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (PAYOUT_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& referencesPlatformSettingTable(type)) {
				payoutReferencesTable = true;
				break;
			}
		}
		assertTrue(payoutReferencesTable,
				"expected at least one payout class to reference '" + PLATFORM_SETTING_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer is rejected — and the fixture module's
	 * own writer is NOT (the exclusion path works). */
	@Test
	void platformSettingTableTouchedOutsideThePayoutModuleIsRejected() {
		List<String> violations = platformSettingTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RoguePlatformSettingWriter")),
				"Expected the payout sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcVenueChangeFeeSetting")),
				"The fixture payout module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 9: booking is the sole toucher of the per-day attendance table -------------

	@Test
	void bookingDayTableIsTouchedOnlyInsideTheBookingModule() {
		List<String> violations = bookingDayTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations(
				"RESPONSIBILITIES.md fitness-function violations (booking sole-writer of booking_day)",
				violations);
	}

	/** Guards against a vacuously-green scan: the module's own adapter DOES carry the table's SQL. */
	@Test
	void theBookingModuleItselfWritesTheDayTable() {
		boolean bookingReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (BOOKING_MODULE.equals(moduleOf(type, PRODUCTION_BASE))
					&& referencesBookingDayTable(type)) {
				bookingReferencesTable = true;
				break;
			}
		}
		assertTrue(bookingReferencesTable,
				"expected at least one booking class to reference '" + BOOKING_DAY_TABLE
						+ "' — otherwise the sole-writer scan proves nothing");
	}

	/** The negative proof (red run): an outside writer is rejected — and the fixture module's
	 * own writer is NOT (the exclusion path works). */
	@Test
	void bookingDayTableTouchedOutsideTheBookingModuleIsRejected() {
		List<String> violations = bookingDayTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueBookingDayWriter")),
				"Expected the booking sole-writer scan to reject the fixture outside writer, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcBookingDays")),
				"The fixture booking module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 10: booking is the sole toucher of the stay table (design D6) --------------

	@Test
	void stayTableIsTouchedOnlyInsideTheBookingModule() {
		List<String> violations = stayTableViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations("RESPONSIBILITIES.md fitness-function violations (booking sole-writer of stay)",
				violations);
	}

	@Test
	void theBookingModuleItselfWritesTheStayTable() {
		boolean bookingReferencesTable = false;
		for (JavaClass type : PRODUCTION_CLASSES) {
			if (BOOKING_MODULE.equals(moduleOf(type, PRODUCTION_BASE)) && referencesStayTableSql(type)) {
				bookingReferencesTable = true;
				break;
			}
		}
		assertTrue(bookingReferencesTable,
				"expected at least one booking class to run SQL against 'stay' — otherwise the scan proves nothing");
	}

	@Test
	void stayTableTouchedOutsideTheBookingModuleIsRejected() {
		List<String> violations = stayTableViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		assertTrue(violations.stream().anyMatch(v -> v.contains("RogueStayWriter")),
				"Expected the booking sole-writer scan to reject the fixture outside writer, but got: " + violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcStays")),
				"The fixture booking module's own SQL must not be flagged, but got: " + violations);
	}

	// ---- rule 11: every owned table is written only by its owner (CLAUDE.md "Sole writer of") ----

	@Test
	void everyOwnedTableIsWrittenOnlyByItsOwner() {
		List<String> violations = foreignWriteViolations(PRODUCTION_CLASSES, PRODUCTION_BASE);
		assertNoViolations("RESPONSIBILITIES.md fitness-function violations (sole writer per table, "
				+ "CLAUDE.md \"Sole writer of\")", violations);
	}

	/** Guards against a vacuously-green scan and a wrong owner in the map: each owner's own
	 * classes DO carry a write against each of its tables. */
	@Test
	void everyOwnerWritesEachOfItsTables() {
		Set<String> unwritten = new TreeSet<>(SOLE_WRITERS.keySet());
		for (JavaClass type : PRODUCTION_CLASSES) {
			String module = moduleOf(type, PRODUCTION_BASE);
			unwritten.removeIf(table -> SOLE_WRITERS.get(table).equals(module) && !writesIn(type, table).isEmpty());
		}
		assertTrue(unwritten.isEmpty(), "expected each owner to carry a write against its tables, but none "
				+ "was found for " + unwritten + " — a wrong owner in SOLE_WRITERS, or a write shape the "
				+ "pattern misses");
	}

	/** The map tracks the schema: every table the latest migration leaves is owned or a named
	 * framework table, and the map names no table the schema lacks. */
	@Test
	void theOwnershipMapCoversEveryTableTheSchemaCreates() throws IOException {
		Set<String> created = tablesAfter(migrations());
		Set<String> unowned = new TreeSet<>(created);
		unowned.removeAll(SOLE_WRITERS.keySet());
		unowned.removeAll(FRAMEWORK_TABLES);
		Set<String> stale = new TreeSet<>(SOLE_WRITERS.keySet());
		stale.removeAll(created);
		assertEquals(Set.of(), unowned, "tables the migrations leave with no owner in SOLE_WRITERS "
				+ "(add them, mirroring CLAUDE.md's \"Sole writer of\" column)");
		assertEquals(Set.of(), stale, "SOLE_WRITERS names tables the migrations do not leave (never created, dropped or renamed)");
	}

	/** A dropped table is gone unless re-created, a renamed one answers to its new name only, a
	 * column rename, a comment or a string literal changes nothing, an unquoted {@code $} name is read
	 * whole and folded, and V9 applies before V10. */
	@Test
	void theSchemaWalkAppliesCreateDropAndRenameInVersionOrder() {
		Set<String> tables = tablesAfter(List.of(
				new Migration(MigrationVersion.fromVersion("10"), """
						DROP TABLE gone;
						DROP TABLE IF EXISTS public.recreated, "versioned";
						CREATE TABLE recreated (id BIGINT);
						ALTER TABLE IF EXISTS ONLY old_name RENAME TO new_name;
						ALTER TABLE new_name RENAME COLUMN id TO renamed_column;
						ALTER TABLE new_name RENAME label TO bare_renamed_column;
						COMMENT ON TABLE kept IS 'it''s fine to drop table kept; see /api/admin/**';
						CREATE TABLE "public"."after_literal" (id BIGINT);
						CREATE TABLE Kept$2(id BIGINT);
						-- DROP TABLE kept; see /api/admin/** for the
						/* CREATE TABLE commented_out (id BIGINT); */
						"""),
				new Migration(MigrationVersion.fromVersion("2"), """
						CREATE TABLE gone (id BIGINT);
						CREATE TABLE IF NOT EXISTS recreated (id BIGINT);
						CREATE TABLE "old_name" (id BIGINT, label TEXT);
						CREATE TABLE kept (id BIGINT);
						"""),
				new Migration(MigrationVersion.fromVersion("9"), """
						CREATE TABLE versioned (id BIGINT);
						""")));
		assertEquals(Set.of("after_literal", "kept", "kept$2", "new_name", "recreated"), tables);
	}

	/** TEMP and UNLOGGED tables are refused, not read as {@code CREATE TABLE} or skipped. */
	@Test
	void theSchemaWalkRefusesTempAndUnloggedTables() {
		assertRefused("CREATE UNLOGGED TABLE scratch (id BIGINT)", "UNLOGGED tables are not modelled");
		assertRefused("CREATE TEMP TABLE scratch (id BIGINT)", "TEMP tables are not modelled");
		assertRefused("CREATE GLOBAL  TEMPORARY TABLE scratch (id BIGINT)", "GLOBAL TEMPORARY tables are not modelled");
	}

	/** A schema other than {@code public}, bare or quoted, is refused wherever a table name sits. */
	@Test
	void theSchemaWalkRefusesANonPublicSchema() {
		assertRefused("CREATE TABLE audit.trail (id BIGINT)", "schema 'audit' is not public");
		assertRefused("DROP TABLE IF EXISTS kept, other . gone", "schema 'other' is not public");
		assertRefused("ALTER TABLE kept RENAME TO \"PUBLIC\".renamed", "schema 'PUBLIC' is not public");
	}

	/** A quoted name PostgreSQL keeps case-sensitive is refused, not folded onto its lower-case twin. */
	@Test
	void theSchemaWalkRefusesACaseSensitiveQuotedName() {
		assertRefused("CREATE TABLE \"Old_Name\" (id BIGINT)", "quoted name 'Old_Name' is case-sensitive");
		assertRefused("ALTER TABLE kept RENAME TO public.\"Kept\"", "quoted name 'Kept' is case-sensitive");
		assertRefused("CREATE TABLE \"a--b\" (id BIGINT)", "quoted name 'a--b' is case-sensitive");
		assertRefused("CREATE TABLE \"it's\" (id BIGINT)", "quoted name 'it's' is case-sensitive");
	}

	/** An unquoted name past plain ASCII is refused in every DDL position, never truncated or folded:
	 * PostgreSQL's folding past {@code A-Z} depends on encoding and locale (#1447). */
	@Test
	void theSchemaWalkRefusesAnUnquotedNameThatIsNotPlainAscii() {
		assertRefused("CREATE TABLE café (id BIGINT)", "unquoted name 'café' is not a plain ASCII identifier");
		assertRefused("CREATE TABLE IF NOT EXISTS public.ΣΤΟΙΧΕΙΑ(id BIGINT)",
				"unquoted name 'ΣΤΟΙΧΕΙΑ' is not a plain ASCII identifier");
		assertRefused("DROP TABLE IF EXISTS kept, plaža", "unquoted name 'plaža' is not a plain ASCII identifier");
		assertRefused("ALTER TABLE \u212Aept RENAME TO renamed",
				"unquoted name '\u212Aept' is not a plain ASCII identifier");
	}

	/** A Unicode-escaped {@code U&"…"} name is refused, not read as the table {@code u}. */
	@Test
	void theSchemaWalkRefusesAUnicodeEscapedName() {
		assertRefused("CREATE TABLE U&\"d\\0061t\\+000061\" (id BIGINT)",
				"Unicode-escaped name U&\"d\\0061t\\+000061\" is not modelled");
		assertRefused("DROP TABLE kept, u&\"gone\"", "Unicode-escaped name u&\"gone\" is not modelled");
	}

	/** {@code SET SCHEMA} moves a table out of the walk's schema, so it is refused rather than ignored. */
	@Test
	void theSchemaWalkRefusesSetSchema() {
		assertRefused("ALTER TABLE IF EXISTS kept SET SCHEMA archive", "SET SCHEMA is not modelled");
	}

	private static void assertRefused(String statement, String why) {
		List<Migration> migrations = List.of(
				new Migration(MigrationVersion.fromVersion("1"), "CREATE TABLE kept (id BIGINT);"),
				new Migration(MigrationVersion.fromVersion("7"), "CREATE TABLE before (id BIGINT);\n"
						+ statement + ";\nCREATE TABLE after (id BIGINT);"));
		IllegalStateException refusal = assertThrows(IllegalStateException.class, () -> tablesAfter(migrations));
		assertTrue(refusal.getMessage().contains("V7's \"" + statement.replaceAll("\\s+", " ") + "\"")
						&& refusal.getMessage().contains(why),
				"expected a refusal naming V7, the statement and \"" + why + "\", but got: " + refusal.getMessage());
	}

	/** A non-owner write of each shape is rejected; a longer table name, a package string, a read
	 * and prose are not; the owner's own write is not. */
	@Test
	void foreignWriteFixtureIsRejectedAndMentionsAreNot() {
		List<String> violations = foreignWriteViolations(FIXTURE_CLASSES, FIXTURE_BASE);
		for (String shape : List.of("UPDATE booking b SET", "INSERT INTO booking", "DELETE FROM public.booking",
				"MERGE INTO \"booking\"", "TRUNCATE TABLE booking")) {
			assertTrue(violations.stream().anyMatch(v -> v.contains("RogueBookingWriter")
							&& v.contains("'booking' table (\"" + shape + "\")")),
					"Expected the table-ownership rule to reject the fixture's foreign " + shape + ", but got: "
							+ violations);
		}
		assertFalse(violations.stream().anyMatch(v -> v.contains("BookingNameMentions")),
				"A longer table name, a package string, a read or prose must not count as a write, but got: "
						+ violations);
		assertFalse(violations.stream().anyMatch(v -> v.contains("FixtureJdbcBookings")),
				"The fixture booking module's own write must not be flagged, but got: " + violations);
	}

	// ---- violation collectors (parameterized so fixtures prove the red case) ---------------

	private static List<String> foreignWriteViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			String module = moduleOf(type, base);
			SOLE_WRITERS.forEach((table, owner) -> {
				if (owner.equals(module)) {
					return;
				}
				for (String write : writesIn(type, table)) {
					violations.add(type.getName() + " writes the '" + table + "' table (\"" + write
							+ "\") — " + owner + " is its sole writer (CLAUDE.md \"Sole writer of\" / "
							+ "RESPONSIBILITIES.md §" + owner + "); other modules change it through " + owner
							+ "'s published ports or events, never at the table");
				}
			});
		}
		return violations;
	}

	/** The SQL-shaped writes against {@code table} among the class's string constants. */
	private static List<String> writesIn(JavaClass type, String table) {
		Pattern write = WRITE_SQL.get(table);
		return classFileOf(type).map(ArchitectureTestSupport::stringConstants).orElse(List.of()).stream()
				.map(write::matcher)
				.filter(Matcher::find)
				.map(Matcher::group)
				.toList();
	}

	private static Map<String, String> soleWriters(Object... moduleThenTables) {
		Map<String, String> owners = new LinkedHashMap<>();
		for (int i = 0; i < moduleThenTables.length; i += 2) {
			String module = (String) moduleThenTables[i];
			for (Object table : (List<?>) moduleThenTables[i + 1]) {
				if (owners.put((String) table, module) != null) {
					throw new IllegalStateException("table '" + table + "' has two owners in SOLE_WRITERS");
				}
			}
		}
		return Collections.unmodifiableMap(owners);
	}

	/** Keyword, optional {@code public.} schema and quotes, then the whole-word table name; an
	 * {@code UPDATE} must reach its {@code SET} (past an optional alias) so prose like "update
	 * booking state" is not a write. */
	private static Map<String, Pattern> writePatterns() {
		Map<String, Pattern> patterns = new LinkedHashMap<>();
		for (String table : SOLE_WRITERS.keySet()) {
			String name = "(?:public\\.)?\"?" + Pattern.quote(table) + "\"?(?![\\w])";
			patterns.put(table, Pattern.compile("(?i)(?<![\\w])(?:"
					+ "(?:INSERT\\s+INTO|DELETE\\s+FROM|MERGE\\s+INTO)\\s+(?:ONLY\\s+)?" + name
					+ "|TRUNCATE\\s+(?:TABLE\\s+)?(?:ONLY\\s+)?" + name
					+ "|UPDATE\\s+(?:ONLY\\s+)?" + name + "(?:\\s+(?:AS\\s+)?(?!SET\\b)\\w+)?\\s+SET\\b)"));
		}
		return Collections.unmodifiableMap(patterns);
	}

	/** A versioned migration's SQL, ordered by Flyway's own version comparison (V9 before V10). */
	record Migration(MigrationVersion version, String sql) {
	}

	private static List<Migration> migrations() throws IOException {
		List<Migration> migrations = new ArrayList<>();
		try (Stream<Path> files = Files.list(MIGRATIONS)) {
			for (Path file : files.filter(p -> p.toString().endsWith(".sql")).toList()) {
				Matcher name = VERSIONED_MIGRATION.matcher(file.getFileName().toString());
				if (!name.matches()) {
					throw new IllegalStateException("not a V<version>__<description>.sql migration, so the "
							+ "schema walk cannot order it: " + file);
				}
				migrations.add(new Migration(MigrationVersion.fromVersion(name.group(1)), Files.readString(file)));
			}
		}
		return migrations;
	}

	/** The tables that exist after the last migration: create, drop and rename applied in version
	 * order, then statement order; DDL in a {@code DO $$} body counts as if it ran. A form the walk
	 * does not model (TEMP/UNLOGGED, a non-public schema, a case-sensitive quoted name, an unquoted
	 * name past plain ASCII, a Unicode-escaped name, {@code SET SCHEMA}) is refused. Two limits are
	 * documented, not modelled: {@code SELECT … INTO new_table} and a {@code $$} closer glued to a table
	 * name, which the walk reads into the name (RESPONSIBILITIES.md § Known scan limits). */
	static Set<String> tablesAfter(List<Migration> migrations) {
		Set<String> tables = new TreeSet<>();
		for (Migration migration : migrations.stream().sorted(Comparator.comparing(Migration::version)).toList()) {
			String sql = SQL_QUOTED_OR_COMMENT.matcher(migration.sql())
					.replaceAll(m -> m.group().startsWith("\"") ? Matcher.quoteReplacement(m.group()) : " ");
			Matcher ddl = TABLE_DDL.matcher(sql);
			while (ddl.find()) {
				SchemaStatement statement = new SchemaStatement(migration, sql, ddl.start());
				if (ddl.group("unmodelled") != null) {
					throw statement.refused(ddl.group("unmodelled").toUpperCase(Locale.ROOT).replaceAll("\\s+", " ")
							+ " tables are not modelled");
				} else if (ddl.group("setSchema") != null) {
					throw statement.refused("SET SCHEMA is not modelled");
				} else if (ddl.group("created") != null) {
					tables.add(statement.bareName(ddl.group("created")));
				} else if (ddl.group("dropped") != null) {
					splitNames(ddl.group("dropped")).stream().map(statement::bareName).forEach(tables::remove);
				} else {
					tables.remove(statement.bareName(ddl.group("renamedFrom")));
					tables.add(statement.bareName(ddl.group("renamedTo")));
				}
			}
		}
		return tables;
	}

	/** The comma-separated names of a {@code DROP TABLE}, a comma inside quotes kept in its name. */
	private static List<String> splitNames(String names) {
		List<String> split = new ArrayList<>();
		Matcher name = QUALIFIED_NAME.matcher(names);
		while (name.find()) {
			split.add(name.group());
		}
		return split;
	}

	/** The statement around one table DDL match, named in a refusal. */
	private record SchemaStatement(Migration migration, String sql, int at) {

		/** The table name as the walk keys it, refusing a non-public schema or a name it cannot fold exactly. */
		String bareName(String qualified) {
			List<String> parts = identifiers(qualified);
			if (parts.size() == 2 && !PUBLIC_SCHEMA.equals(parts.getFirst())) {
				throw refused("schema '" + parts.getFirst() + "' is not public");
			}
			String name = parts.getLast();
			if (!FOLDED_NAME.matcher(name).matches()) {
				throw refused("quoted name '" + name + "' is case-sensitive or not a plain identifier");
			}
			return name;
		}

		IllegalStateException refused(String why) {
			int start = sql.lastIndexOf(';', at) + 1;
			int end = sql.indexOf(';', at);
			String text = sql.substring(start, end < 0 ? sql.length() : end).strip().replaceAll("\\s+", " ");
			return new IllegalStateException("the schema walk refuses V" + migration.version() + "'s \""
					+ text + "\": " + why + " (RESPONSIBILITIES.md § Known scan limits)");
		}

		/** Each part folded as PostgreSQL does: an unquoted one lower-cased, a quoted one kept as written;
		 * a Unicode-escaped name or an unquoted one past ASCII is refused. */
		private List<String> identifiers(String qualified) {
			List<String> parts = new ArrayList<>();
			Matcher part = IDENTIFIER_PART.matcher(qualified);
			while (part.find()) {
				String identifier = part.group();
				if (identifier.startsWith("\"")) {
					parts.add(identifier.substring(1, identifier.length() - 1).replace("\"\"", "\""));
				} else if (identifier.endsWith("\"")) {
					throw refused("Unicode-escaped name " + identifier + " is not modelled");
				} else if (!PLAIN_UNQUOTED.matcher(identifier).matches()) {
					throw refused("unquoted name '" + identifier + "' is not a plain ASCII identifier");
				} else {
					parts.add(identifier.toLowerCase(Locale.ROOT));
				}
			}
			return parts;
		}
	}

	private static List<String> stayTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (BOOKING_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesStayTableSql(type)) {
				violations.add(type.getName() + " runs SQL against the 'stay' table — the booking module is its "
						+ "only writer AND reader (RESPONSIBILITIES.md §booking); a stay is asked of booking's "
						+ "ports, never read off the table");
			}
		}
		return violations;
	}

	private static boolean referencesStayTableSql(JavaClass type) {
		return compiledBytecodeOf(type).map(bytecode -> STAY_TABLE_SQL.matcher(bytecode).find()).orElse(false);
	}

	private static List<String> availabilityTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (AVAILABILITY_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesAvailabilityTable(type)) {
				violations.add(type.getName() + " references the '" + AVAILABILITY_TABLE
						+ "' table — the availability module is its only writer AND reader "
						+ "(invariant #2 / RESPONSIBILITIES.md); other modules go through "
						+ "availability's published ports (api/spi), never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesAvailabilityTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, AVAILABILITY_TABLE))
				.orElse(false);
	}

	private static List<String> challengeRegistryViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (CHALLENGE_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesChallengeRegistryTable(type)) {
				violations.add(type.getName() + " references the '" + CHALLENGE_REGISTRY_TABLE
						+ "' table — the challenge module is its only writer AND reader "
						+ "(ADR-0017 / RESPONSIBILITIES.md §challenge); the platform edge asks the "
						+ "module through challenge::api, never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesChallengeRegistryTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, CHALLENGE_REGISTRY_TABLE))
				.orElse(false);
	}

	private static List<String> bookingDayTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (BOOKING_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesBookingDayTable(type)) {
				violations.add(type.getName() + " references the '" + BOOKING_DAY_TABLE
						+ "' table — the booking module is its only writer AND reader "
						+ "(RESPONSIBILITIES.md §booking); attendance is asked of booking's ports, "
						+ "never read off the table");
			}
		}
		return violations;
	}

	private static boolean referencesBookingDayTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, BOOKING_DAY_TABLE))
				.orElse(false);
	}

	private static List<String> adminAuditTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (AUDIT_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesAdminAuditTable(type)) {
				violations.add(type.getName() + " references the '" + ADMIN_AUDIT_TABLE
						+ "' table — the audit module is its only writer AND reader "
						+ "(ADR-0017 / RESPONSIBILITIES.md §audit); the platform edge's fence records "
						+ "through audit::api, never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesAdminAuditTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, ADMIN_AUDIT_TABLE))
				.orElse(false);
	}

	private static List<String> platformSettingTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (PAYOUT_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesPlatformSettingTable(type)) {
				violations.add(type.getName() + " references the '" + PLATFORM_SETTING_TABLE
						+ "' table — the payout module is its only writer AND reader "
						+ "(ADR-0021 / RESPONSIBILITIES.md §payout); what that table holds is what the "
						+ "ledger deducts, so a second writer is a second opinion on what a venue is charged");
			}
		}
		return violations;
	}

	private static boolean referencesPlatformSettingTable(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> containsWholeWord(bytecode, PLATFORM_SETTING_TABLE))
				.orElse(false);
	}

	private static List<String> reviewTableViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (REVIEW_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			if (referencesReviewTableSql(type)) {
				violations.add(type.getName() + " carries SQL against the 'review' table — the "
						+ "review module is its only writer AND reader (#811 / RESPONSIBILITIES.md); "
						+ "other modules go through review's published ports (api/spi) or its "
						+ "ReviewsChanged event, never at the table");
			}
		}
		return violations;
	}

	private static boolean referencesReviewTableSql(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> REVIEW_TABLE_SQL.matcher(bytecode).find())
				.orElse(false);
	}

	private static List<String> ratingColumnViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (VENUE_MODULE.equals(moduleOf(type, base))) {
				continue;
			}
			for (String column : ratingColumnsIn(type)) {
				violations.add(type.getName() + " references the venue column '" + column
						+ "' — venue stores the rating aggregate and stays its columns' only "
						+ "writer; review computes the values and announces them via "
						+ "ReviewsChanged (#811 / RESPONSIBILITIES.md §venue)");
			}
		}
		return violations;
	}

	private static List<String> ratingColumnsIn(JavaClass type) {
		return compiledBytecodeOf(type)
				.map(bytecode -> RATING_COLUMNS.stream()
						.filter(column -> containsWholeWord(bytecode, column))
						.toList())
				.orElse(List.of());
	}

	/** The class's compiled bytes via its ArchUnit source URI — no hardcoded build paths; the
	 * same class set the other rules iterate. Empty for a class without a file source. */
	private static Optional<String> compiledBytecodeOf(JavaClass type) {
		return type.getSource()
				.map(Source::getUri)
				.filter(uri -> "file".equals(uri.getScheme()))
				.map(uri -> bytecode(Path.of(uri)));
	}

	/** Whole-word match: the token bounded by non-identifier characters, so a different
	 * identifier merely containing it (reset_availability, set_availability_audit) is not hit. */
	private static boolean containsWholeWord(String bytecode, String token) {
		int index = bytecode.indexOf(token);
		while (index >= 0) {
			char before = index == 0 ? '\0' : bytecode.charAt(index - 1);
			int end = index + token.length();
			char after = end >= bytecode.length() ? '\0' : bytecode.charAt(end);
			if (!isIdentifierChar(before) && !isIdentifierChar(after)) {
				return true;
			}
			index = bytecode.indexOf(token, index + 1);
		}
		return false;
	}

	private static boolean isIdentifierChar(char c) {
		return c == '_' || Character.isLetterOrDigit(c);
	}

	private static List<String> stripeReachViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (PAYMENT_MODULE.equals(moduleOf(type, base))) {
				continue; // payment's own Stripe use is the point; NoStripeConnect fences its shape
			}
			if (dependsOnStripe(type)) {
				violations.add(type.getName() + " depends on the Stripe SDK — com.stripe.. is "
						+ "importable only inside the payment module (RESPONSIBILITIES.md); other "
						+ "modules ask payment via its published ports/events, never Stripe directly");
			}
		}
		return violations;
	}

	private static boolean dependsOnStripe(JavaClass type) {
		for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
			String pkg = dependency.getTargetClass().getPackageName();
			if (pkg.equals(STRIPE_SDK_ROOT) || pkg.startsWith(STRIPE_SDK_ROOT + ".")) {
				return true;
			}
		}
		return false;
	}

	private static List<String> eventPayloadViolations(JavaClasses classes, String base) {
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!EVENTS_SURFACE.equals(surfaceOf(type, base)) || !type.isRecord()) {
				continue; // non-records in events/ are PublishedSurfacePlacement's concern
			}
			for (JavaField field : payloadFields(type)) {
				for (JavaClass involved : field.getType().getAllInvolvedRawTypes()) {
					if (!isIdOrValuePayload(involved, base)) {
						violations.add(type.getName() + "." + field.getName() + " involves "
								+ involved.getName() + " — an event payload carries only technical "
								+ "ids and values (primitives, java.* types, published vocabulary "
								+ "types — generics and arrays are unwrapped), never an aggregate or "
								+ "other internal type from domain/application/adapter (Need-To-Know, "
								+ "invariant #11 / RESPONSIBILITIES.md)");
					}
				}
			}
		}
		return violations;
	}

	/** A record's non-static fields are exactly its components; constants are not payload. */
	private static List<JavaField> payloadFields(JavaClass record) {
		return record.getFields().stream()
				.filter(field -> !field.getModifiers().contains(JavaModifier.STATIC))
				.toList();
	}

	private static boolean isIdOrValuePayload(JavaClass involved, String base) {
		if (involved.isPrimitive() || involved.getPackageName().startsWith(JDK_PACKAGE_PREFIX)) {
			return true;
		}
		return VOCABULARY_SURFACE.equals(surfaceOf(involved, base));
	}
}
