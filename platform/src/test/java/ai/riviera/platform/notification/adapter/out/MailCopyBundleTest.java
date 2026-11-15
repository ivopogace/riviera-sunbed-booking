package ai.riviera.platform.notification.adapter.out;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import ai.riviera.platform.shared.SiteLocale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * The mail bundles stay one set of messages: every {@link SiteLocale} has its file with exactly the source
 * file's keys (a missing translation would mail English inside a translated mail), and no value holds a lone
 * ASCII apostrophe, which {@code MessageFormat} would read as a quote and silently swallow text after it.
 */
class MailCopyBundleTest {

	private static final Pattern LONE_APOSTROPHE = Pattern.compile("(?<!')'(?!')");

	@ParameterizedTest
	@EnumSource(SiteLocale.class)
	void eachLocaleHasExactlyTheSourceKeys(SiteLocale locale) throws IOException {
		assertEquals(new TreeSet<>(keys(bundle(SiteLocale.EN))), new TreeSet<>(keys(bundle(locale))), locale.code());
	}

	@ParameterizedTest
	@EnumSource(SiteLocale.class)
	void noValueHoldsALoneApostrophe(SiteLocale locale) throws IOException {
		Properties messages = bundle(locale);
		for (String key : keys(messages)) {
			assertFalse(LONE_APOSTROPHE.matcher(messages.getProperty(key)).find(),
					locale.code() + " " + key + " holds a lone ' (write '' or the typographic ’)");
		}
	}

	@ParameterizedTest
	@EnumSource(SiteLocale.class)
	void everyMessageRendersWithoutAnUnfilledPlaceholder(SiteLocale locale) throws IOException {
		MailCopy copy = MailCopy.in(locale);
		Object[] args = { 2, 3, "C", "D", "E" };
		for (String key : keys(bundle(locale))) {
			String rendered = copy.text(key, args);
			assertFalse(rendered.contains("{"), locale.code() + " " + key + " → " + rendered);
			assertFalse(rendered.isBlank(), locale.code() + " " + key);
		}
	}

	private static Properties bundle(SiteLocale locale) throws IOException {
		String name = MailCopy.BUNDLE + (locale == SiteLocale.EN ? "" : "_" + locale.code()) + ".properties";
		try (InputStream in = MailCopyBundleTest.class.getClassLoader().getResourceAsStream(name)) {
			assertNotNull(in, name);
			Properties messages = new Properties();
			messages.load(new InputStreamReader(in, StandardCharsets.UTF_8));
			return messages;
		}
	}

	private static Set<String> keys(Properties messages) {
		return messages.stringPropertyNames();
	}
}
