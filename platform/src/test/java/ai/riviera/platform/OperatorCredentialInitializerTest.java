package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import ai.riviera.platform.operator.api.OperatorProvisioning;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Fast unit test for the boot-time credential provisioner (#74) — no Spring context, no DB. Pins the
 * three branches of {@link OperatorCredentialInitializer#run}: a set password provisions the
 * bootstrap operator with an <em>encoded</em> hash; a blank password provisions nothing (write API
 * left locked); and a set password targeting a missing operator row is a no-op WARN, not a failure.
 */
class OperatorCredentialInitializerTest {

	private final OperatorProvisioning provisioning = mock(OperatorProvisioning.class);
	private final PasswordEncoder encoder = mock(PasswordEncoder.class);

	private OperatorCredentialInitializer initializer(String username, String password) {
		return new OperatorCredentialInitializer(provisioning, encoder,
				new RivieraOperatorProperties(username, password));
	}

	@Test
	void aSetPasswordProvisionsTheBootstrapOperatorWithAnEncodedHash() {
		when(encoder.encode("secret")).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword("operator", "{bcrypt}encoded")).thenReturn(true);

		initializer("operator", "secret").run(null);

		// The raw password is never stored — only the edge-encoded hash reaches the module.
		verify(provisioning).setPassword("operator", "{bcrypt}encoded");
	}

	@Test
	void aBlankPasswordProvisionsNothing() {
		initializer("operator", "   ").run(null);

		verifyNoInteractions(provisioning);
		verifyNoInteractions(encoder);
	}

	@Test
	void aMissingOperatorRowIsANoOpNotAFailure() {
		when(encoder.encode(any())).thenReturn("{bcrypt}encoded");
		when(provisioning.setPassword(eq("operator"), any())).thenReturn(false);

		assertDoesNotThrow(() -> initializer("operator", "secret").run(null));
		verify(provisioning, never()).provision(any(), any());
	}
}
