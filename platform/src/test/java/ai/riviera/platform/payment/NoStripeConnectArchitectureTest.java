package ai.riviera.platform.payment;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.ArchitectureTestSupport;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Enforces the collect-only payment model (ADR-0002): the {@code payment} module never uses
 * <strong>Stripe Connect</strong>, which cannot pay Albanian venues; the platform collects and pays
 * venues by BKT. Scans compiled bytecode (so a javadoc's "Connect" cannot trip it) for the
 * constant-pool symbols each Connect API leaves behind. Only {@code payment} is scanned: the SDK is
 * confined there by {@code ResponsibilitiesArchitectureTests}. The negative case is proven against
 * {@code ai.riviera.connectfixture}, never by breaking production code.
 */
class NoStripeConnectArchitectureTest {

	private static final Path PAYMENT_CLASSES =
			Path.of("build/classes/java/main/ai/riviera/platform/payment");

	private static final Path FIXTURE_CLASSES =
			Path.of("build/classes/java/test/ai/riviera/connectfixture");

	private static final List<String> FORBIDDEN_CONNECT_SYMBOLS = List.of(
			"com/stripe/model/Account",      // connected account
			"com/stripe/model/Transfer",     // Connect transfer
			"com/stripe/model/Payout",       // payout from the Stripe balance
			"ApplicationFee",                // the model, its params, setApplicationFeeAmount
			"setOnBehalfOf",                 // settlement merchant = connected account
			"setTransferData",               // destination charge
			"setTransferGroup",
			"setStripeAccount");             // RequestOptions' connected-account header

	@Test
	void paymentModuleUsesNoStripeConnect() throws IOException {
		assertEquals(List.of(), connectReferences(PAYMENT_CLASSES),
				"payment references a Stripe Connect symbol. This project is collect-only — "
						+ "no Connect (ADR-0002).");
	}

	@Test
	void flagsEachConnectSymbol() throws IOException {
		assertEquals(List.of(
						"BalancePayout references com/stripe/model/Payout",
						"CommissionInIntent references ApplicationFee",
						"ConnectedAccountHeader references setStripeAccount",
						"ConnectedAccountLookup references com/stripe/model/Account",
						"DestinationChargeIntent references setTransferData",
						"GroupedChargeIntent references setTransferGroup",
						"MarketplaceFeeLookup references ApplicationFee",
						"SettlementMerchantIntent references setOnBehalfOf",
						"VenueTransferLookup references com/stripe/model/Transfer"),
				connectReferences(FIXTURE_CLASSES));
	}

	/**
	 * Sanity check the scan is not vacuous: the collection path the project DID choose leaves the
	 * {@code PaymentIntentCreateParams} symbol in the gateway's bytecode.
	 */
	@Test
	void theCollectionPathIsPresent() {
		Path gateway = PAYMENT_CLASSES.resolve("adapter/out/StripePaymentGateway.class");
		assertTrue(Files.exists(gateway), "StripePaymentGateway should be compiled");
		String bytecode = ArchitectureTestSupport.bytecode(gateway);
		assertTrue(bytecode.contains("com/stripe/param/PaymentIntentCreateParams"),
				"the gateway collects via PaymentIntents — the non-Connect collection path");
	}

	private static List<String> connectReferences(Path root) throws IOException {
		assertTrue(Files.isDirectory(root), "compiled classes not found at " + root.toAbsolutePath()
				+ " — run the test task so the compile tasks run first");
		try (Stream<Path> classes = Files.walk(root)) {
			return classes.filter(p -> p.toString().endsWith(".class"))
					.flatMap(NoStripeConnectArchitectureTest::connectReferencesIn)
					.sorted()
					.toList();
		}
	}

	private static Stream<String> connectReferencesIn(Path classFile) {
		String bytecode = ArchitectureTestSupport.bytecode(classFile);
		String className = classFile.getFileName().toString().replace(".class", "");
		return FORBIDDEN_CONNECT_SYMBOLS.stream()
				.filter(bytecode::contains)
				.map(symbol -> className + " references " + symbol);
	}
}
