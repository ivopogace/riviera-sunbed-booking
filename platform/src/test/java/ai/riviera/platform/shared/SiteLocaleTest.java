package ai.riviera.platform.shared;

import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SiteLocaleTest {

	@Test
	void aServedCodeReadsAsItsLocale() {
		assertEquals(SiteLocale.EN, SiteLocale.fromCode("en"));
		assertEquals(SiteLocale.SQ, SiteLocale.fromCode("sq"));
		assertEquals(SiteLocale.IT, SiteLocale.fromCode("it"));
		assertEquals(SiteLocale.DE, SiteLocale.fromCode("de"));
	}

	@ParameterizedTest
	@NullSource
	@ValueSource(strings = { "", " ", "fr", "DE", "SQ", "sq-AL", "../sq", "sq/", "//evil.example", "it?x=1" })
	void anyOtherValueReadsAsTheSourceLocale(String code) {
		assertEquals(SiteLocale.EN, SiteLocale.fromCode(code));
	}

	@Test
	void theSourceLocaleSitsAtTheRootAndTheOthersUnderTheirCode() {
		assertEquals("", SiteLocale.EN.subPath());
		assertEquals("sq", SiteLocale.SQ.subPath());
		assertEquals("it", SiteLocale.IT.subPath());
		assertEquals("de", SiteLocale.DE.subPath());
	}

	@Test
	void eachLocaleNamesItsJavaLocale() {
		assertEquals(Locale.ENGLISH, SiteLocale.EN.locale());
		assertEquals(Locale.of("sq"), SiteLocale.SQ.locale());
		assertEquals(Locale.ITALIAN, SiteLocale.IT.locale());
		assertEquals(Locale.GERMAN, SiteLocale.DE.locale());
	}
}
