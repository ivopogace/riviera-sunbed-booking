package ai.riviera.platform;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins why a suspended or rejected operator's login leaks nothing through timing: the account is built
 * disabled, and Spring's pre-check refuses it only after the password check has still run
 * ({@code alwaysPerformAdditionalChecksOnUser}, on by default), so it costs one bcrypt like any other
 * failure. The provider is built the way {@code AuthenticationConfiguration} builds the operator one.
 */
class OperatorUserDetailsServiceTest {

	private static final String PASSWORD = "correct-horse";

	private final CountingEncoder encoder = new CountingEncoder(new SecurityConfig().passwordEncoder());
	private final String hash = encoder.encode(PASSWORD);

	@Test
	void aSuspendedOperatorWithTheRightPasswordIsRefusedAfterTheHashCheck() {
		DaoAuthenticationProvider provider = providerFor(OperatorStatus.SUSPENDED);

		assertThrows(DisabledException.class, () -> login(provider, PASSWORD));
		assertEquals(1, encoder.matches.get());
	}

	@Test
	void aRejectedOperatorWithAWrongPasswordStillPaysForTheHashCheck() {
		DaoAuthenticationProvider provider = providerFor(OperatorStatus.REJECTED);

		assertThrows(DisabledException.class, () -> login(provider, "wrong-password"));
		assertEquals(1, encoder.matches.get());
	}

	@Test
	void anActiveOrPendingOperatorWithTheRightPasswordAuthenticates() {
		assertTrue(login(providerFor(OperatorStatus.ACTIVE), PASSWORD).isAuthenticated());
		assertTrue(login(providerFor(OperatorStatus.PENDING), PASSWORD).isAuthenticated());
	}

	@Test
	void anUnknownUsernamePaysForOneHashCheckToo() {
		DaoAuthenticationProvider provider = provider(username -> Optional.empty());

		assertThrows(BadCredentialsException.class, () -> login(provider, PASSWORD));
		assertEquals(1, encoder.matches.get());
	}

	private DaoAuthenticationProvider providerFor(OperatorStatus status) {
		return provider(username -> Optional.of(new OperatorCredential(username, hash, status, false)));
	}

	private DaoAuthenticationProvider provider(OperatorAccounts accounts) {
		DaoAuthenticationProvider provider = new DaoAuthenticationProvider(new OperatorUserDetailsService(accounts));
		provider.setPasswordEncoder(encoder);
		return provider;
	}

	private static Authentication login(DaoAuthenticationProvider provider, String password) {
		return provider.authenticate(UsernamePasswordAuthenticationToken.unauthenticated("op-c", password));
	}

	/** The app's encoder, counting {@code matches} so a test can see whether a hash was checked. */
	private static final class CountingEncoder implements PasswordEncoder {

		private final PasswordEncoder delegate;
		private final AtomicInteger matches = new AtomicInteger();

		private CountingEncoder(PasswordEncoder delegate) {
			this.delegate = delegate;
		}

		@Override
		public String encode(CharSequence rawPassword) {
			return delegate.encode(rawPassword);
		}

		@Override
		public boolean matches(CharSequence rawPassword, String encodedPassword) {
			matches.incrementAndGet();
			return delegate.matches(rawPassword, encodedPassword);
		}
	}
}
