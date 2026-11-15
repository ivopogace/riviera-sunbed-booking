package ai.riviera.platform.payment.adapter.out;

import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import ai.riviera.platform.shared.BootPostureGuard;

/**
 * Fences the {@link StubPaymentGateway}, which confirms every booking without collecting (ADR-0031): present only
 * where no collecting gateway is active and there is no {@code demo} marker, so the boot is refused. A deployment
 * activates its provider's profile, which joins {@code collecting-gateway}. Package-private (invariant #11).
 */
@Component
@Profile("!demo & !collecting-gateway")
class StubPaymentGatewayProdGuard implements BootPostureGuard {

	private static final String GAP = "Payment: the stub gateway would confirm bookings without collecting. "
			+ "Activate a payment provider's profile with its keys, or 'demo' to run the stub on purpose.";

	@Override
	public Optional<String> gap(Environment environment) {
		return Optional.of(GAP);
	}
}
