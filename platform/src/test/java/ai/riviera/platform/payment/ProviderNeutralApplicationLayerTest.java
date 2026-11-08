package ai.riviera.platform.payment;

import java.util.Arrays;
import java.util.List;

import com.tngtech.archunit.core.domain.JavaClass;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.ArchitectureTestSupport;
import ai.riviera.platform.payment.domain.PaymentProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Providers are interchangeable adapters behind provider-neutral ports (ADR-0029 decision 11), so no
 * production type in {@code payment.application} is named after one. An adapter may be. The forbidden
 * names come from {@link PaymentProvider}, so a provider added there is covered here.
 */
class ProviderNeutralApplicationLayerTest {

	private static final String APPLICATION_LAYER = "ai.riviera.platform.payment.application";

	@Test
	void applicationLayerNamesNoProvider() {
		List<String> named = ArchitectureTestSupport.productionClasses().stream()
				.filter(type -> type.getPackageName().startsWith(APPLICATION_LAYER))
				.map(JavaClass::getSimpleName)
				.filter(ProviderNeutralApplicationLayerTest::namesAProvider)
				.toList();

		assertEquals(List.of(), named, "payment.application must stay provider-neutral (ADR-0029 decision 11)");
	}

	@Test
	void recognisesEachProviderInATypeName() {
		assertTrue(namesAProvider("StripeWebhookEvents"));
		assertTrue(namesAProvider("PokOrderReader"));
		assertTrue(namesAProvider("RefundViaPaysera"));
		assertFalse(namesAProvider("WebhookEvents"));
	}

	private static boolean namesAProvider(String simpleName) {
		return Arrays.stream(PaymentProvider.values())
				.map(provider -> provider.name().charAt(0) + provider.name().substring(1).toLowerCase())
				.anyMatch(simpleName::contains);
	}
}
