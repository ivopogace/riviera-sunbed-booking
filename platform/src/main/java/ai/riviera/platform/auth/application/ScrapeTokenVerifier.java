package ai.riviera.platform.auth.application;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import ai.riviera.platform.auth.api.ScrapeCredentials;
import ai.riviera.platform.auth.vocabulary.AuthRoles;

/**
 * Compares the presented token's SHA-256 with every configured hash in constant time: a fast hash suffices for a
 * 256-bit random token, which no dictionary holds (ADR-0032).
 */
@Component
public class ScrapeTokenVerifier implements ScrapeCredentials {

	/** The name the scraper's authentication carries; no account stands behind it. */
	static final String PRINCIPAL = "metrics-scraper";

	private static final List<GrantedAuthority> AUTHORITIES =
			List.of(new SimpleGrantedAuthority(AuthRoles.authority(AuthRoles.METRICS)));

	private final List<byte[]> acceptedHashes;

	public ScrapeTokenVerifier(ScrapeTokenProperties properties) {
		this.acceptedHashes = properties.acceptedHashes();
	}

	@Override
	public Optional<Authentication> authenticate(String presentedToken) {
		if (acceptedHashes.isEmpty() || presentedToken == null || presentedToken.isEmpty()) {
			return Optional.empty();
		}
		byte[] presented = sha256(presentedToken);
		boolean matched = false;
		for (byte[] accepted : acceptedHashes) {
			matched |= MessageDigest.isEqual(accepted, presented);
		}
		return matched
				? Optional.of(UsernamePasswordAuthenticationToken.authenticated(PRINCIPAL, null, AUTHORITIES))
				: Optional.empty();
	}

	private static byte[] sha256(String token) {
		try {
			return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
		}
		catch (NoSuchAlgorithmException everyJvmHasIt) {
			throw new IllegalStateException(everyJvmHasIt);
		}
	}
}
