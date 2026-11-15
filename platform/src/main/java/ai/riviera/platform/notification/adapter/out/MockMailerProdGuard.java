package ai.riviera.platform.notification.adapter.out;

import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.BootPostureGuard;

/**
 * Fences the log-only {@link MockMailer} (design D-6, ADR-0031): present only where it would be live with no
 * {@code demo} marker, so the boot is refused. A deployment runs {@code mailer}; a demo opts into the mock and its
 * outbox with {@code demo}. Package-private (invariant #11).
 */
@Component
@Profile("!demo & !mailer")
class MockMailerProdGuard implements BootPostureGuard {

	private static final String GAP = "Mail: the log-only mock mailer would be live. Activate 'mailer' with the "
			+ "RIVIERA_SMTP_* settings, or 'demo' to run the mock on purpose.";

	@Override
	public Optional<String> gap(Environment environment) {
		return Optional.of(GAP);
	}
}
