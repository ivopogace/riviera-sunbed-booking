package ai.riviera.platform.notification.adapter.out;

import java.nio.charset.StandardCharsets;
import java.security.NoSuchAlgorithmException;
import java.security.InvalidKeyException;
import java.time.Instant;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

import static org.assertj.core.api.Assertions.assertThat;

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

		String expected = expectedKey(pepper(), "hashed-row@example.com");
		var row = jdbc.sql("SELECT email_key, domain FROM email_suppression WHERE email_key = :key")
				.param("key", expected)
				.query((rs, n) -> new String[] { rs.getString("email_key"), rs.getString("domain") })
				.single();
		assertThat(row[0]).isEqualTo(expected);
		assertThat(row[1]).isEqualTo("example.com");

		Long cleartextHits = jdbc.sql("SELECT count(*) FROM email_suppression "
						+ "WHERE email_key LIKE '%hashed-row%' OR domain LIKE '%hashed-row%'")
				.query(Long.class)
				.single();
		assertThat(cleartextHits).isZero();
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
