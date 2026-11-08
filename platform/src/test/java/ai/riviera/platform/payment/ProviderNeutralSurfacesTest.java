package ai.riviera.platform.payment;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.ArchitectureTestSupport;
import ai.riviera.platform.payment.domain.PaymentProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Providers are interchangeable adapters behind provider-neutral ports (ADR-0029 decision 11), so no
 * production type in {@code payment.application} is named after one, and nothing {@code payment} publishes
 * names one or carries one's field. An adapter may. The forbidden names come from {@link PaymentProvider},
 * so a provider added there is covered here.
 */
class ProviderNeutralSurfacesTest {

	private static final String APPLICATION_LAYER = "ai.riviera.platform.payment.application";

	private static final List<String> PUBLISHED_SURFACES = List.of("ai.riviera.platform.payment.api",
			"ai.riviera.platform.payment.vocabulary");

	/** Stripe's names for what every provider has its own word for. */
	private static final List<String> STRIPE_MEMBER_NAMES = List.of("clientsecret", "paymentintent");

	@Test
	void applicationLayerNamesNoProvider() {
		List<String> named = ArchitectureTestSupport.productionClasses().stream()
				.filter(type -> type.getPackageName().startsWith(APPLICATION_LAYER))
				.map(JavaClass::getSimpleName)
				.filter(ProviderNeutralSurfacesTest::namesAProvider)
				.toList();

		assertEquals(List.of(), named, "payment.application must stay provider-neutral (ADR-0029 decision 11)");
	}

	@Test
	void publishedSurfaceCarriesNoProviderShape() {
		List<JavaClass> published = ArchitectureTestSupport.productionClasses().stream()
				.filter(type -> PUBLISHED_SURFACES.contains(type.getPackageName()))
				.toList();
		List<String> namedTypes = published.stream().map(JavaClass::getSimpleName)
				.filter(ProviderNeutralSurfacesTest::namesAProvider).toList();
		List<String> shapedMembers = published.stream()
				.flatMap(type -> memberNames(type).filter(ProviderNeutralSurfacesTest::isProviderShaped)
						.map(member -> type.getSimpleName() + "." + member))
				.toList();

		assertEquals(List.of(), namedTypes, "no published payment type names a provider (ADR-0029 decision 11)");
		assertEquals(List.of(), shapedMembers, "no published payment member carries a provider's field (ADR-0029 decision 11)");
	}

	@Test
	void recognisesAProviderShapedMember() {
		assertTrue(isProviderShaped("clientSecret"));
		assertTrue(isProviderShaped("paymentIntentId"));
		assertTrue(isProviderShaped("stripeReference"));
		assertFalse(isProviderShaped("clientToken"));
	}

	private static Stream<String> memberNames(JavaClass type) {
		return Stream.concat(type.getFields().stream().map(JavaField::getName),
				type.getMethods().stream().map(JavaMethod::getName)).distinct();
	}

	private static boolean isProviderShaped(String member) {
		String lower = member.toLowerCase(Locale.ROOT);
		return STRIPE_MEMBER_NAMES.stream().anyMatch(lower::contains) || Arrays.stream(PaymentProvider.values())
				.anyMatch(provider -> lower.contains(provider.name().toLowerCase(Locale.ROOT)));
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
