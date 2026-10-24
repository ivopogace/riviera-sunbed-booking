package ai.riviera.platform.notification.vocabulary;

import java.net.URI;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.web.util.UriComponentsBuilder;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Pins {@link EmailedLink} byte-for-byte against the formula every emailed link was built with before it
 * ({@code fromUriString(origin)…build().encode().toUri()}), over fixture codes and tokens only: the links are
 * bearer credentials (invariant #7), so nothing here logs one.
 */
class EmailedLinkTest {

	private static final List<String> ORIGINS = List.of("https://app.example", "http://localhost:4200",
			"HTTPS://App.Example", "http://riviera_backend:8080", "https://app.example:443", "http://[::1]:8080",
			"http://10.0.0.7", "https://app.example/riviera", "http://riviera_backend.internal:8080",
			"http://riviera_backend:8080/riviera", "http://riviera__backend", "http://riviera-backend_1:8080",
			"https://app.example/café", "https://app.example/a;b=c/d:e@f!$&'()*+,");

	private static final List<String> CODES = List.of("K7Q2M9XR", "a b", "a/b", "a%b", "a?b#c", "a;b=c",
			"café", "+&=:@!$'()*,");

	private static final List<String> TOKENS = List.of("Zm9vYmFy_-x", "a+b/c=", "a&b=c", "a b%20c", "a#b?c",
			"café", "%");

	static Stream<Arguments> originsAndCodes() {
		return ORIGINS.stream().flatMap(origin -> CODES.stream().map(code -> Arguments.of(origin, code)));
	}

	static Stream<Arguments> originsAndTokens() {
		return ORIGINS.stream().flatMap(origin -> TOKENS.stream().map(token -> Arguments.of(origin, token)));
	}

	@ParameterizedTest
	@MethodSource("originsAndCodes")
	void aCodeSegmentMatchesThePreviousFormula(String origin, String code) {
		URI previous = UriComponentsBuilder.fromUriString(origin).pathSegment("booking", code).build().encode()
				.toUri();

		assertEquals(previous.toString(), EmailedLink.on(origin).path("booking", code).toUri().toString());
	}

	@ParameterizedTest
	@MethodSource("originsAndTokens")
	void aTokenQueryMatchesThePreviousFormula(String origin, String token) {
		URI previous = UriComponentsBuilder.fromUriString(origin).path("/account/reset").queryParam("token", token)
				.build().encode().toUri();

		assertEquals(previous.toString(),
				EmailedLink.on(origin).path("account", "reset").query("token", token).toUri().toString());
	}

	@ParameterizedTest
	@MethodSource("originsAndTokens")
	void theRootWithAQueryMatchesThePreviousFormula(String origin, String value) {
		URI previous = UriComponentsBuilder.fromUriString(origin).path("/").queryParam("date", value).build()
				.encode().toUri();

		assertEquals(previous.toString(), EmailedLink.on(origin).path().query("date", value).toUri().toString());
	}

	@Test
	void keepsAPercentEscapedOriginPathAsEncoded() {
		String origin = EmailedLinkOrigin.require("riviera.example.link-base-url", "RIVIERA_EXAMPLE_LINK_BASE_URL",
				"https://app.example/my%20app/");

		assertEquals(URI.create("https://app.example/my%20app/booking/a%20b?date=2026-07-01"),
				EmailedLink.on(origin).path("booking", "a b").query("date", "2026-07-01").toUri());
	}

	@Test
	void buildsOnEveryOriginTheRuleAccepts() {
		for (String origin : ORIGINS) {
			String accepted = EmailedLinkOrigin.require("riviera.example.link-base-url",
					"RIVIERA_EXAMPLE_LINK_BASE_URL", origin);
			assertEquals(URI.create(URI.create(accepted + "/account/sign-in").toASCIIString()),
					EmailedLink.on(accepted).path("account", "sign-in").toUri(), origin);
		}
	}

	@Test
	void eachStepLeavesTheLinkItCameFromUnchanged() {
		EmailedLink account = EmailedLink.on("https://app.example").path("account");

		URI reset = account.path("reset").query("token", "t1").toUri();
		URI verify = account.path("verify").toUri();

		assertEquals(URI.create("https://app.example/account"), account.toUri());
		assertEquals(URI.create("https://app.example/account/reset?token=t1"), reset);
		assertEquals(URI.create("https://app.example/account/verify"), verify);
	}
}
