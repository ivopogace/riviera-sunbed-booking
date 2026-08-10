package ai.riviera.platform.payment.adapter.out;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

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

		List<String> unclassified = new ArrayList<>();
		for (JavaClass gateway : gateways) {
			if (!collects(gateway) || coveredByTheContract(gateway)) {
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
	private static boolean collects(JavaClass gateway) {
		String profile = profileOf(gateway).orElseGet(() -> fail(gateway.getSimpleName()
				+ " carries no @Profile, so no CollectionGuarantee can be matched to it"));
		JavaClass guarantee = productionImplementationsOf(CollectionGuarantee.class).stream()
				.filter(candidate -> profileOf(candidate).filter(profile::equals).isPresent())
				.findFirst()
				.orElseGet(() -> fail("no CollectionGuarantee is bound to @Profile(\"" + profile
						+ "\") — add this gateway's answer to ProfiledCollectionGuarantee"));
		return provenBeforeConfirmation(guarantee);
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

	private static Optional<String> profileOf(JavaClass type) {
		return type.tryGetAnnotationOfType(Profile.class)
				.flatMap(profile -> Arrays.stream(profile.value()).findFirst());
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
