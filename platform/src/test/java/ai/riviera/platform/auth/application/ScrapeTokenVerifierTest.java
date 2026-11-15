package ai.riviera.platform.auth.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;

import ai.riviera.platform.auth.vocabulary.AuthRoles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The scrape token check (ADR-0032): SHA-256 of the presented token against the configured hashes, fail closed. */
class ScrapeTokenVerifierTest {

	private static final String CURRENT = "8f2c6d0b3a914e7f5c1d2b6a9e0f4c3b7d5a1e8f2c6b0d4a9e3f7c1b5d2a6e0f";
	private static final String NEXT = "1b5d2a6e0f8f2c6d0b3a914e7f5c1d2b6a9e0f4c3b7d5a1e8f2c6b0d4a9e3f7c";

	@Test
	void theCurrentTokenGrantsTheMetricsRoleAlone() {
		Optional<Authentication> granted = verifier(sha256(CURRENT), null).authenticate(CURRENT);

		assertTrue(granted.isPresent());
		assertTrue(granted.get().isAuthenticated());
		assertEquals(List.of(AuthRoles.authority(AuthRoles.METRICS)),
				granted.get().getAuthorities().stream().map(GrantedAuthority::getAuthority).toList());
		assertNull(granted.get().getCredentials());
	}

	@Test
	void bothTokensAreAcceptedDuringOverlapRotation() {
		ScrapeTokenVerifier verifier = verifier(sha256(CURRENT), sha256(NEXT));

		assertTrue(verifier.authenticate(CURRENT).isPresent());
		assertTrue(verifier.authenticate(NEXT).isPresent());
	}

	@Test
	void theNextSlotAloneIsEnough() {
		assertTrue(verifier(null, sha256(NEXT)).authenticate(NEXT).isPresent());
	}

	@Test
	void aWrongTokenIsRefused() {
		ScrapeTokenVerifier verifier = verifier(sha256(CURRENT), sha256(NEXT));

		assertTrue(verifier.authenticate(CURRENT + "0").isEmpty());
		assertTrue(verifier.authenticate(CURRENT.toUpperCase()).isEmpty());
		assertTrue(verifier.authenticate("").isEmpty());
	}

	@Test
	void theHashItselfIsNotTheToken() {
		String hash = sha256(CURRENT);

		assertTrue(verifier(hash, null).authenticate(hash).isEmpty());
	}

	@Test
	void noHashConfiguredRefusesEveryToken() {
		ScrapeTokenVerifier verifier = verifier(null, null);

		assertTrue(verifier.authenticate(CURRENT).isEmpty());
		assertTrue(verifier.authenticate("").isEmpty());
	}

	private static ScrapeTokenVerifier verifier(String current, String next) {
		return new ScrapeTokenVerifier(new ScrapeTokenProperties(current, next));
	}

	private static String sha256(String token) {
		try {
			return HexFormat.of().formatHex(
					MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException impossible) {
			throw new IllegalStateException(impossible);
		}
	}
}
