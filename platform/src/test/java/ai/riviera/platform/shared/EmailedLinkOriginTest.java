package ai.riviera.platform.shared;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EmailedLinkOriginTest {

	private static final String KEY = "riviera.example.link-base-url";

	private static final String VARIABLE = "RIVIERA_EXAMPLE_LINK_BASE_URL";

	@ParameterizedTest
	@ValueSource(strings = { "https://app.example", "http://localhost:4200", "HTTPS://App.Example",
			"http://riviera_backend:8080", "http://[::1]:8080", "http://10.0.0.7", "https://app.example/riviera" })
	void acceptsAnHttpOrHttpsOrigin(String value) {
		assertEquals(value, EmailedLinkOrigin.require(KEY, VARIABLE, value));
	}

	@Test
	void stripsSurroundingWhitespaceAndTrailingSlashes() {
		assertEquals("https://app.example", EmailedLinkOrigin.require(KEY, VARIABLE, " https://app.example/ "));
		assertEquals("https://app.example", EmailedLinkOrigin.require(KEY, VARIABLE, "https://app.example//"));
		assertEquals("https://app.example/riviera",
				EmailedLinkOrigin.require(KEY, VARIABLE, "https://app.example/riviera/"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "   " })
	void aBlankValueNamesTheKeyAndTheVariable(String blank) {
		IllegalArgumentException rejected = reject(blank);

		assertTrue(rejected.getMessage().contains("must be set"), rejected.getMessage());
	}

	@Test
	void aNullValueNamesTheKeyAndTheVariable() {
		reject(null);
	}

	@Test
	void anUnresolvedPlaceholderIsNotEchoed() {
		IllegalArgumentException rejected = reject("${RIVIERA_EXAMPLE_LINK_BASE_URL_TYPO}");

		assertTrue(rejected.getMessage().contains("is unresolved"), rejected.getMessage());
		assertFalse(rejected.getMessage().contains("TYPO"), rejected.getMessage());
	}

	@ParameterizedTest
	@ValueSource(strings = { "/app", "example.com", "https:///app", "http://bad host", "ftp://app.example",
			"file:///etc/passwd", "mailto:ops@app.example", "javascript://app.example", "https://app.example?a=b",
			"https://app.example/?a=b", "https://app.example#top", "https://app.example/#/", "http://bad,host",
			"http://riviera_backend:80a", "https://", "https://:8080" })
	void rejectsAnythingButAnHttpOrHttpsOriginWithAHost(String value) {
		IllegalArgumentException rejected = reject(value);

		assertTrue(rejected.getMessage().contains("absolute http or https URL"), rejected.getMessage());
	}

	@ParameterizedTest
	@ValueSource(strings = { "https://admin:hunter2@app.example", "http://admin:hunter2@riviera_backend:8080",
			"https://hunter2@app.example" })
	void rejectsUserInfoWithoutEchoingIt(String value) {
		IllegalArgumentException rejected = reject(value);

		assertFalse(rejected.getMessage().contains("hunter2"), rejected.getMessage());
		assertFalse(rejected.getMessage().contains("admin"), rejected.getMessage());
	}

	@Test
	void noRejectionEchoesTheRawValue() {
		for (String value : new String[] { "https://app.example?secret=s3cr3t", "ftp://s3cr3t.example",
				"http://s3cr3t host", "${s3cr3t}" }) {
			assertFalse(reject(value).getMessage().contains("s3cr3t"), value);
		}
	}

	private static IllegalArgumentException reject(String value) {
		IllegalArgumentException rejected = assertThrows(IllegalArgumentException.class,
				() -> EmailedLinkOrigin.require(KEY, VARIABLE, value));
		assertTrue(rejected.getMessage().startsWith(KEY + " "), rejected.getMessage());
		assertTrue(rejected.getMessage().contains("set " + VARIABLE), rejected.getMessage());
		return rejected;
	}
}
