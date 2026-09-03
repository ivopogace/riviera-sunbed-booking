package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Fast unit test for the boot-time credential provisioner — no Spring context, no DB. Pins the
 * branches of {@link OperatorCredentialInitializer#run}: a set password provisions the
 * bootstrap operator with an <em>encoded</em> hash; a blank password provisions nothing (write API
 * left locked); a password outside the length rule is refused exactly like a blank one, with a WARN
 * that never carries the value; and a set password targeting a missing operator row is a no-op
 * WARN, not a failure.
 */
class OperatorCredentialInitializerTest {

	private final OperatorProvisioning provisioning = mock(OperatorProvisioning.class);
	private final OperatorAccounts accounts = mock(OperatorAccounts.class);
	private final PasswordEncoder encoder = mock(PasswordEncoder.class);
	private final PrincipalSessionRevoker sessionRevoker = mock(PrincipalSessionRevoker.class);

	private OperatorCredentialInitializer initializer(String username, String password) {
		return new OperatorCredentialInitializer(provisioning, accounts, encoder, sessionRevoker,
				new RivieraOperatorProperties(username, password));
	}

	/** Give the bootstrap operator a stored hash that {@code matches} the given raw password, or none. */
	private void storedCredential(String rawPasswordItMatches) {
		when(accounts.findByUsername("operator"))
				.thenReturn(Optional.of(new OperatorCredential("operator", "{bcrypt}stored", OperatorStatus.ACTIVE, true)));
		when(encoder.matches(any(), eq("{bcrypt}stored")))
				.thenAnswer(call -> rawPasswordItMatches.equals(call.getArgument(0)));
	}

	@Test
	void aSetPasswordProvisionsTheBootstrapOperatorWithAnEncodedHash() {
		when(encoder.encode("boot-secret-1")).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword("operator", "{bcrypt}encoded")).thenReturn(true);

		initializer("operator", "boot-secret-1").run(null);

		// The raw password is never stored — only the edge-encoded hash reaches the module.
		verify(provisioning).setPassword("operator", "{bcrypt}encoded");
	}

	@Test
	void aBlankPasswordProvisionsNothing() {
		initializer("operator", "   ").run(null);

		verifyNoInteractions(provisioning);
		verifyNoInteractions(encoder);
	}

	/** The bootstrap credential is held to the same floor as every chosen password (D-8). */
	@Test
	void aPasswordUnderTheFloorProvisionsNothingAndWarnsWithoutTheValue() {
		List<ILoggingEvent> warnings = warningsWhile(() -> initializer("operator", "elevenchars").run(null));

		verifyNoInteractions(provisioning);
		verifyNoInteractions(encoder);
		verifyNoInteractions(sessionRevoker);
		assertEquals(1, warnings.size(), "exactly one WARN for a refused value");
		assertFalse(warnings.getFirst().getFormattedMessage().contains("elevenchars"),
				"the refused value must never be logged");
	}

	@Test
	void aPasswordOverTheByteCapProvisionsNothing() {
		initializer("operator", "a".repeat(73)).run(null);

		verifyNoInteractions(provisioning);
		verifyNoInteractions(encoder);
	}

	private static List<ILoggingEvent> warningsWhile(Runnable action) {
		Logger logger = (Logger) LoggerFactory.getLogger(OperatorCredentialInitializer.class);
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		logger.addAppender(appender);
		try {
			action.run();
			return appender.list.stream().filter(event -> event.getLevel() == Level.WARN).toList();
		}
		finally {
			logger.detachAppender(appender);
		}
	}

	@Test
	void aMissingOperatorRowIsANoOpNotAFailure() {
		when(encoder.encode(any())).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword(eq("operator"), any())).thenReturn(false);

		assertDoesNotThrow(() -> initializer("operator", "boot-secret-1").run(null));
		verify(provisioning, never()).provision(any(), any());
	}

	/**
	 * AC-6: the initializer re-stamps the configured password on EVERY boot (bcrypt re-salts, so
	 * the stored hash differs each time) — so "the hash changed" proves nothing and revoking on it
	 * would sign the admin out on every deploy. A genuine rotation is the raw configured password no
	 * longer matching the stored hash.
	 */
	@Test
	void revokesSessionsOnlyWhenThePasswordActuallyChanged() {
		when(encoder.encode(any())).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword(eq("operator"), any())).thenReturn(true);

		storedCredential("old-secret-12");
		initializer("operator", "new-secret-12").run(null);
		verify(sessionRevoker).revokeAll("operator");

		storedCredential("same-secret-1");
		initializer("operator", "same-secret-1").run(null);
		// Still exactly the one call from the genuine rotation above — the ordinary redeploy revoked nothing.
		verify(sessionRevoker, times(1)).revokeAll(any());
	}

	@Test
	void aFirstEverProvisioningRevokesNothing() {
		when(encoder.encode(any())).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword(eq("operator"), any())).thenReturn(true);
		when(accounts.findByUsername("operator")).thenReturn(Optional.empty());

		initializer("operator", "boot-secret-1").run(null);

		// No prior credential means no prior session to invalidate.
		verify(sessionRevoker, never()).revokeAll(any());
	}

	@Test
	void anAccountWithNoStoredHashYetRevokesNothing() {
		when(encoder.encode(any())).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword(eq("operator"), any())).thenReturn(true);
		when(accounts.findByUsername("operator"))
				.thenReturn(Optional.of(new OperatorCredential("operator", null, OperatorStatus.ACTIVE, true)));

		initializer("operator", "boot-secret-1").run(null);

		verify(sessionRevoker, never()).revokeAll(any());
		verifyNoInteractions(sessionRevoker);
	}
}
