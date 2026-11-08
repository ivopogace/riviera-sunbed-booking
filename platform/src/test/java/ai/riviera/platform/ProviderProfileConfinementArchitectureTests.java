package ai.riviera.platform;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_BASE;
import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;

import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;

/**
 * Only {@code payment}'s outbound adapters may name a provider profile: everything else binds to
 * what the gateway does ({@code collecting-gateway}, {@code CollectionGuarantee}), so adding a
 * provider edits no job. Keyed on package and {@code @Profile} (class or member); a profile string
 * passed to {@code Environment} at run time is out of its sight. Each provider that joins the switch
 * is covered without an edit here.
 */
class ProviderProfileConfinementArchitectureTests {

	private static final String FIXTURE_BASE = "ai.riviera.profilefixture";
	private static final String GATEWAY_ADAPTERS = ".payment.adapter.out";

	/** ADR-0029's providers, named before their adapters exist so none can land outside the fence. */
	private static final Set<String> NAMED_PROVIDERS = Set.of("stripe", "pok", "paysera");

	@Test
	void noProviderProfileIsNamedOutsidePaymentsOutboundAdapters() {
		assertNoViolations("A provider profile is named outside payment.adapter.out; bind to the "
				+ "collecting-gateway profile or ask CollectionGuarantee",
				violations(PRODUCTION_CLASSES, PRODUCTION_BASE));
	}

	@Test
	void everySpellingOfAProviderProfileIsCaughtAndNothingElse() {
		assertEquals(Set.of("ai.riviera.profilefixture.booking.adapter.in.NamesProviderOnBeanMethod",
				"ai.riviera.profilefixture.booking.adapter.in.NamesProviderOnClass",
				"ai.riviera.profilefixture.booking.adapter.in.NegatesProviderInAnExpression",
				"ai.riviera.profilefixture.payment.adapter.in.InboundAdapterNamesProvider"),
				new TreeSet<>(violations(ArchitectureTestSupport.fixtureClasses(FIXTURE_BASE), FIXTURE_BASE)));
	}

	private static List<String> violations(JavaClasses classes, String base) {
		Set<String> providers = new TreeSet<>(NAMED_PROVIDERS);
		providers.addAll(ArchitectureTestSupport.profilesJoining(ArchitectureTestSupport.COLLECTING_GATEWAY_PROFILE));
		List<String> violations = new ArrayList<>();
		for (JavaClass type : classes) {
			if (!isGatewayAdapter(type, base) && namedProfiles(type).anyMatch(providers::contains)) {
				violations.add(type.getName());
			}
		}
		return violations;
	}

	private static boolean isGatewayAdapter(JavaClass type, String base) {
		String adapters = base + GATEWAY_ADAPTERS;
		return type.getPackageName().equals(adapters) || type.getPackageName().startsWith(adapters + ".");
	}

	private static Stream<String> namedProfiles(JavaClass type) {
		return Stream.concat(type.getAnnotations().stream(),
						type.getMembers().stream().flatMap(member -> member.getAnnotations().stream()))
				.filter(annotation -> annotation.getRawType().isEquivalentTo(Profile.class))
				.flatMap(ProviderProfileConfinementArchitectureTests::profileNames);
	}

	/** The profile names of an expression, operators stripped: {@code "!a & (b | c)"} names a, b and c. */
	private static Stream<String> profileNames(JavaAnnotation<?> profile) {
		return Arrays.stream(profile.as(Profile.class).value())
				.flatMap(expression -> Arrays.stream(expression.split("[!&|()\\s]+")))
				.filter(name -> !name.isEmpty());
	}
}
