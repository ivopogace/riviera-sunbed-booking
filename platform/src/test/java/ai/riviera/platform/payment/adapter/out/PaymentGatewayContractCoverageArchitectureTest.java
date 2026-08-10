package ai.riviera.platform.payment.adapter.out;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;

import ai.riviera.platform.ArchitectureTestSupport;
import ai.riviera.platform.payment.api.CollectionGuarantee;
import ai.riviera.platform.payment.application.PaymentGateway;
import ai.riviera.platform.payment.application.PaymentGatewayRefundContract;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Makes {@link PaymentGatewayRefundContract} unskippable: every production {@link PaymentGateway} is
 * either <strong>covered</strong> by a subclass of that contract, or <strong>exempt</strong> because
 * this deployment's {@link CollectionGuarantee} says it collects nothing and so has no money to
 * refund twice.
 *
 * <p>Neither half is a list someone maintains. Coverage is read from the contract subclasses'
 * dependencies, and the exemption from the {@code @Profile} that already binds a gateway to its
 * guarantee — so a new adapter arrives unclassified and fails here, which is the whole point: the
 * at-most-once promise was one adapter's habit and a javadoc, and a javadoc does not fail a build.
 *
 * <p>Its limit, so nobody reads more into a pass than is there: coverage is a <em>dependency</em>
 * edge, so it proves a contract subclass names the adapter, not that the subclass wired
 * {@code gateway()} to it. Statically, that is as far as this can go — what it buys is that a new
 * adapter cannot arrive with no contract at all, which is the failure mode it exists for.
 *
 * <p>In the adapter package so the package-private gateways and guarantees are nameable.
 */
class PaymentGatewayContractCoverageArchitectureTest {

	/** Imported with tests included — the contract subclasses that prove coverage are test classes. */
	private static final JavaClasses PAYMENT_CLASSES =
			new ClassFileImporter().importPackages("ai.riviera.platform.payment");

	@Test
	void everyGatewayIsContractCoveredOrNonCollecting() {
		List<JavaClass> gateways = productionImplementationsOf(PaymentGateway.class);
		assertTrue(gateways.size() >= 2,
				"expected at least the stub and the collecting adapter — did the import shape change?");
		Map<Set<String>, Boolean> collectionByProfile = collectionAnswersByProfile();

		List<String> unclassified = new ArrayList<>();
		for (JavaClass gateway : gateways) {
			if (!collects(gateway, collectionByProfile) || coveredByTheContract(gateway)) {
				continue;
			}
			unclassified.add(gateway.getSimpleName());
		}
		if (!unclassified.isEmpty()) {
			fail(unclassified + " collect money but honour no refund contract. Subclass "
					+ PaymentGatewayRefundContract.class.getSimpleName()
					+ " for each, or — if it truly collects nothing — say so in "
					+ "ProfiledCollectionGuarantee, which is what exempts the stub.");
		}
	}

	/**
	 * Whether some concrete {@link PaymentGatewayRefundContract} subclass exercises this gateway.
	 *
	 * <p>Matched on the fully-qualified name: the gateway and the contract subclasses come from two
	 * separate ArchUnit imports (production-only, and one including tests), whose {@link JavaClass}
	 * handles for the same type are never equal to each other.
	 */
	private static boolean coveredByTheContract(JavaClass gateway) {
		return PAYMENT_CLASSES.stream()
				.filter(candidate -> candidate.isAssignableTo(PaymentGatewayRefundContract.class))
				.filter(candidate -> !isAbstract(candidate))
				.anyMatch(candidate -> candidate.getDirectDependenciesFromSelf().stream()
						.anyMatch(dependency ->
								dependency.getTargetClass().getName().equals(gateway.getName())));
	}

	/**
	 * Whether reaching a confirmed booking through this gateway means money really moved — asked of the
	 * {@link CollectionGuarantee} sharing its {@code @Profile}, never inferred from the gateway's name.
	 */
	private static boolean collects(JavaClass gateway, Map<Set<String>, Boolean> collectionByProfile) {
		Set<String> profile = profileOf(gateway);
		if (profile.isEmpty()) {
			return fail(gateway.getSimpleName()
					+ " carries no @Profile, so no CollectionGuarantee can be matched to it");
		}
		Boolean collects = collectionByProfile.get(profile);
		if (collects == null) {
			return fail("no CollectionGuarantee is bound to @Profile" + profile
					+ " — add this gateway's answer to ProfiledCollectionGuarantee under the same profile expression");
		}
		return collects;
	}

	/** Each guarantee's answer, keyed by its profile expression as a set so annotation order cannot matter. */
	private static Map<Set<String>, Boolean> collectionAnswersByProfile() {
		Map<Set<String>, Boolean> answers = new HashMap<>();
		for (JavaClass guarantee : productionImplementationsOf(CollectionGuarantee.class)) {
			Set<String> profile = profileOf(guarantee);
			Boolean collects = provenBeforeConfirmation(guarantee);
			Boolean clash = answers.putIfAbsent(profile, collects);
			if (clash != null && !clash.equals(collects)) {
				fail("two CollectionGuarantees bound to @Profile" + profile + " disagree — whichever the "
						+ "classpath yields second would silently decide whether the gateway is exempt");
			}
		}
		return answers;
	}

	private static boolean provenBeforeConfirmation(JavaClass guarantee) {
		try {
			Constructor<?> constructor = guarantee.reflect().getDeclaredConstructor();
			constructor.setAccessible(true);
			return ((CollectionGuarantee) constructor.newInstance()).provenBeforeConfirmation();
		}
		catch (ReflectiveOperationException e) {
			return fail("could not read " + guarantee.getSimpleName() + "'s collection answer", e);
		}
	}

	/**
	 * A type's profile expression as a set, so {@code @Profile({"a","b"})} matches {@code {"b","a"}} —
	 * order carries no meaning in Spring and must carry none here. A gateway and its guarantee are
	 * expected to name the <em>same</em> expression, which is the convention {@code
	 * ProfiledCollectionGuarantee} documents; the failure message says so when they don't.
	 */
	private static Set<String> profileOf(JavaClass type) {
		return type.tryGetAnnotationOfType(Profile.class)
				.map(profile -> Arrays.stream(profile.value()).collect(Collectors.toUnmodifiableSet()))
				.orElseGet(Set::of);
	}

	private static boolean isAbstract(JavaClass type) {
		return type.getModifiers().contains(JavaModifier.ABSTRACT);
	}

	private static List<JavaClass> productionImplementationsOf(Class<?> port) {
		return ArchitectureTestSupport.productionClasses().stream()
				.filter(type -> type.isAssignableTo(port))
				.filter(type -> !type.isInterface() && !isAbstract(type))
				.toList();
	}
}
