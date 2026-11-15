package ai.riviera.platform.auth.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.shared.SiteLocale;

class SsoAuthorizationTest {

	@Test
	void anEnglishRoundTripLandsOnTheUnprefixedPath() {
		assertEquals(URI.create("/operator"), signIn(SiteLocale.EN).landing("/operator"));
		assertEquals(URI.create("/"), signIn(SiteLocale.EN).landing("/"));
	}

	@Test
	void aTranslatedRoundTripLandsUnderItsSubpath() {
		assertEquals(URI.create("/sq/operator"), signIn(SiteLocale.SQ).landing("/operator"));
		assertEquals(URI.create("/it/"), signIn(SiteLocale.IT).landing("/"));
		assertEquals(URI.create("/de/account/sign-in?audience=operator&sso=failed"),
				signIn(SiteLocale.DE).landing("/account/sign-in?audience=operator&sso=failed"));
	}

	@Test
	void aLandingIsAnAbsolutePathOnThisOrigin() {
		SsoAuthorization authorization = signIn(SiteLocale.SQ);

		assertThrows(IllegalArgumentException.class, () -> authorization.landing("operator"));
		assertThrows(IllegalArgumentException.class, () -> authorization.landing("//evil.example/"));
	}

	@Test
	void theLocaleIsRequired() {
		assertThrows(IllegalArgumentException.class, () -> signIn(null));
	}

	private static SsoAuthorization signIn(SiteLocale locale) {
		return new SsoAuthorization(SsoProvider.GOOGLE, SsoAuthorization.Audience.OPERATOR,
				SsoAuthorization.Intent.SIGN_IN, "state", "verifier", "nonce", null, locale);
	}
}
