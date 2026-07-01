package ai.riviera.platform.payment;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.ArchitectureTestSupport;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Enforces the collect-only payment model (ADR-0002 / invariant #8, AC-7): the {@code payment}
 * module must never use <strong>Stripe Connect</strong>. Connect cannot pay out to Albanian
 * venues — the platform collects everything and pays venues manually via BKT — so any
 * connected-account / destination-charge / application-fee usage is a structural error this
 * test fails the build on.
 *
 * <p>It scans the module's <em>compiled bytecode</em> (not source — so the rule can't be tripped
 * by the word "Connect" in a javadoc) for the constant-pool symbols each Connect API would leave
 * behind: connected-account types ({@code com/stripe/model/Account}, {@code .../Transfer}) and the
 * PaymentIntent Connect parameters ({@code setApplicationFeeAmount}, {@code setOnBehalfOf},
 * {@code setTransferData}, {@code setTransferGroup}). A context-free guard, sibling to
 * {@code JdbcOnlyArchitectureTests} / {@code ModularityTests}.
 */
class NoStripeConnectArchitectureTest {

	private static final Path PAYMENT_CLASSES =
			Path.of("build/classes/java/main/ai/riviera/platform/payment");

	private static final List<String> FORBIDDEN_CONNECT_SYMBOLS = List.of(
			"com/stripe/model/Account",      // connected account
			"com/stripe/model/Transfer",     // Connect transfer / payout
			"setApplicationFeeAmount",       // marketplace application fee
			"ApplicationFeeAmount",
			"setOnBehalfOf",                 // settlement merchant = connected account
			"setTransferData",               // destination charge
			"setTransferGroup");

	@Test
	void paymentModuleUsesNoStripeConnect() throws IOException {
		assertTrue(Files.isDirectory(PAYMENT_CLASSES),
				"compiled payment classes not found at " + PAYMENT_CLASSES.toAbsolutePath()
						+ " — run the test task so compileJava runs first");
		try (Stream<Path> classes = Files.walk(PAYMENT_CLASSES)) {
			classes.filter(p -> p.toString().endsWith(".class")).forEach(NoStripeConnectArchitectureTest::assertNoConnect);
		}
	}

	private static void assertNoConnect(Path classFile) {
		String bytecode = ArchitectureTestSupport.bytecode(classFile);
		for (String symbol : FORBIDDEN_CONNECT_SYMBOLS) {
			assertFalse(bytecode.contains(symbol),
					() -> classFile.getFileName() + " references the Stripe Connect symbol '" + symbol
							+ "'. This project is collect-only — no Connect (ADR-0002 / invariant #8).");
		}
	}

	/**
	 * Sanity check the scan is not vacuous: the collection path the project DID choose leaves the
	 * {@code PaymentIntentCreateParams} symbol in the gateway's bytecode. Proves the probe reads
	 * real bytecode and distinguishes a present symbol from an absent one.
	 */
	@Test
	void theCollectionPathIsPresent() {
		Path gateway = PAYMENT_CLASSES.resolve("adapter/out/StripePaymentGateway.class");
		assertTrue(Files.exists(gateway), "StripePaymentGateway should be compiled");
		String bytecode = ArchitectureTestSupport.bytecode(gateway);
		assertTrue(bytecode.contains("com/stripe/param/PaymentIntentCreateParams"),
				"the gateway collects via PaymentIntents — the non-Connect collection path");
	}
}
