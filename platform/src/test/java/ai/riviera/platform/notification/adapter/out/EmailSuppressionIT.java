package ai.riviera.platform.notification.adapter.out;

import java.nio.charset.StandardCharsets;
import java.security.NoSuchAlgorithmException;
import java.security.InvalidKeyException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The suppression list against real Postgres (#382, hashed-key shape #388/ADR-0012): the V33
 * {@code email_suppression} table plus the {@code JdbcEmailSuppressions} adapter behind the
 * {@link EmailSuppressions} port. Pins the pieces the unit tests cannot: the unique-key upsert
 * ({@code ON CONFLICT} refreshes reason + {@code last_event_at}, keeps {@code first_suppressed_at}),
 * the normalization contract — matching is on the trimmed, lower-cased address on <em>both</em> the
 * write and the read — and, since #388, the storage posture: the row holds a {@code v1:}-tagged
 * peppered HMAC-SHA-256 key plus the cleartext domain, never the address itself, and the pepper
 * demonstrably participates in the key. Unique addresses per test method against the shared
 * container; suppressions are deliberately never deleted (the table is a do-not-mail record), so
 * no cleanup.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class EmailSuppressionIT {

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Environment env;

	/**
	 * The edge padding {@link String#trim()} strips, spelled by <strong>code point</strong> rather than
	 * as {@code "\t"}-style escapes: this file is edited by tools that have silently turned an escape
	 * into a raw tab and a plain space into U+00A0, either of which would make the rejection test pass
	 * or fail for a reason nobody could see in a diff. Code points cannot be misread.
	 */
	private static final String SPACE = Character.toString(32);
	private static final String TAB = Character.toString(9);
	private static final String NEWLINE = Character.toString(10);
	private static final String CARRIAGE_RETURN = Character.toString(13);
	private static final String FORM_FEED = Character.toString(12);

	@Test
	void anUnknownAddressIsNotSuppressed() {
		assertThat(suppressions.isSuppressed("never-suppressed@example.com")).isFalse();
	}

	@Test
	void aSuppressedAddressIsFoundInAnyCasing() {
		suppressions.suppress("  Case-Mixed@Example.COM ", SuppressionReason.COMPLAINT,
				Instant.parse("2026-07-27T10:00:00Z"));

		assertThat(suppressions.isSuppressed("case-mixed@example.com")).isTrue();
		assertThat(suppressions.isSuppressed("CASE-MIXED@example.com  ")).isTrue();
	}

	@Test
	void reSuppressingUpsertsReasonAndLastEventKeepingFirstSuppressedAt() {
		String email = "resuppressed@example.com";
		Instant first = Instant.parse("2026-07-27T10:00:00Z");
		Instant later = Instant.parse("2026-07-28T09:30:00Z");

		suppressions.suppress(email, SuppressionReason.HARD_BOUNCE, first);
		suppressions.suppress(email, SuppressionReason.COMPLAINT, later);

		var row = jdbc.sql("SELECT reason, first_suppressed_at, last_event_at "
						+ "FROM email_suppression WHERE email_key = :key")
				.param("key", expectedKey(pepper(), email))
				.query((rs, n) -> new Object[] { rs.getString("reason"),
						rs.getTimestamp("first_suppressed_at").toInstant(),
						rs.getTimestamp("last_event_at").toInstant() })
				.single();
		assertThat(row[0]).isEqualTo("COMPLAINT");
		assertThat(row[1]).isEqualTo(first);
		assertThat(row[2]).isEqualTo(later);
	}

	@Test
	void storedRowIsHashedKeyPlusCleartextDomain() {
		suppressions.suppress("  Hashed-Row@Example.COM ", SuppressionReason.MANUAL,
				Instant.parse("2026-07-27T10:00:00Z"));

		String domain = jdbc.sql("SELECT domain FROM email_suppression WHERE email_key = :key")
				.param("key", expectedKey(pepper(), "hashed-row@example.com"))
				.query(String.class)
				.single();
		assertThat(domain).isEqualTo("example.com");

		Long cleartextHits = jdbc.sql("""
						SELECT count(*) FROM email_suppression
						WHERE email_key LIKE '%hashed-row%' OR domain LIKE '%hashed-row%'
						""")
				.query(Long.class)
				.single();
		assertThat(cleartextHits).isZero();
	}

	@Test
	void aNonAddressWriteIsRejected() {
		Instant at = Instant.parse("2026-07-27T10:00:00Z");

		assertThatThrownBy(() -> suppressions.suppress("   ", SuppressionReason.MANUAL, at))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> suppressions.suppress("no-at-sign.example.com", SuppressionReason.MANUAL, at))
				.isInstanceOf(IllegalArgumentException.class);
		assertThatThrownBy(() -> suppressions.suppress("@no-local-part.example.com", SuppressionReason.MANUAL, at))
				.isInstanceOf(IllegalArgumentException.class);
		// #386: lastIndexOf('@') >= 1 passed this one, then stored an EMPTY domain.
		assertThatThrownBy(() -> suppressions.suppress("no-domain-part@", SuppressionReason.MANUAL, at))
				.isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void theSchemaRejectsACleartextKey() {
		assertThatThrownBy(() -> jdbc.sql("""
				INSERT INTO email_suppression (email_key, domain, reason, first_suppressed_at, last_event_at)
				VALUES ('cleartext@example.com', 'example.com', 'MANUAL', now(), now())
				""").update())
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	/**
	 * The DB must reject every {@code domain} the Java writer could not have produced (V34, #386).
	 * V33 carried over V32's {@code domain = lower(btrim(domain))}, and one-arg {@code btrim} strips
	 * <em>spaces only</em> — so a tab- or newline-padded value satisfied it, and
	 * {@code suppress("user@")} stored an <em>empty</em> domain that satisfied it too. Neither is
	 * reachable through the adapter, which is exactly why the schema has to say so: rows are never
	 * deleted, so a hand-inserted or future-bounce-feed row would persist forever.
	 */
	@Test
	void theSchemaRejectsADenormalizedDomain() {
		for (String pad : List.of(SPACE, TAB, NEWLINE, CARRIAGE_RETURN, FORM_FEED)) {
			assertThatThrownBy(() -> insertDomain("example.com" + pad))
					.as("a trailing %s must be rejected — normalization would have trimmed it", named(pad))
					.isInstanceOf(DataIntegrityViolationException.class);
			assertThatThrownBy(() -> insertDomain(pad + "example.com"))
					.as("a leading %s must be rejected — normalization would have trimmed it", named(pad))
					.isInstanceOf(DataIntegrityViolationException.class);
		}
		assertThatThrownBy(() -> insertDomain(""))
				.as("suppress(\"user@\") used to store this — an address has a domain part")
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> insertDomain("Example.com"))
				.as("normalization lower-cases, so a mixed-case domain is unreachable")
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	/**
	 * The other half of "agree": the constraint must not reject what the writer <em>can</em> produce.
	 * {@code Emails.normalize} trims edges only, so an interior space survives it — a blanket
	 * whitespace ban would turn that junk-but-producible input into a constraint violation raised
	 * from a background thread instead of a stored row. V34 mirrors {@link String#trim()} exactly.
	 */
	@Test
	void aDomainTheWriterCanProduceIsStillAccepted() {
		assertThatCode(() -> insertDomain("accepted-domain.example.com")).doesNotThrowAnyException();
		assertThatCode(() -> insertDomain("interior space.example.com")).doesNotThrowAnyException();
	}

	/** The padding character, as U+XXXX — a raw one in an assertion message is invisible. */
	private static String named(String pad) {
		return "U+%04X".formatted((int) pad.charAt(0));
	}

	/** A direct insert with a well-formed key, so only the {@code domain} value is under test. */
	private void insertDomain(String domain) {
		jdbc.sql("""
				INSERT INTO email_suppression (email_key, domain, reason, first_suppressed_at, last_event_at)
				VALUES (:key, :domain, 'MANUAL', now(), now())
				""")
				.param("key", expectedKey(pepper(), "domain-check-" + domain.hashCode() + "@example.com"))
				.param("domain", domain)
				.update();
	}

	@Test
	void aDifferentPepperYieldsADifferentKey() {
		var otherPepper = new JdbcEmailSuppressions(jdbc, "a-completely-different-pepper");
		otherPepper.suppress("pepper-proof@example.com", SuppressionReason.HARD_BOUNCE,
				Instant.parse("2026-07-27T10:00:00Z"));

		assertThat(suppressions.isSuppressed("pepper-proof@example.com")).isFalse();
		assertThat(otherPepper.isSuppressed("pepper-proof@example.com")).isTrue();
	}

	private String pepper() {
		return env.getRequiredProperty("riviera.notification.suppression-pepper");
	}

	/** Independent recomputation of the adapter's key contract: {@code v1:} + lower-hex HMAC-SHA-256. */
	private static String expectedKey(String pepper, String normalizedEmail) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
			return "v1:" + HexFormat.of().formatHex(mac.doFinal(normalizedEmail.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException | InvalidKeyException e) {
			throw new IllegalStateException(e);
		}
	}
}
