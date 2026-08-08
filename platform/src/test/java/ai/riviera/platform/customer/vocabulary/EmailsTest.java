package ai.riviera.platform.customer.vocabulary;

import java.util.Locale;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The contract of the platform's one canonical email normalization. Before this
 * existed the rule lived in six private copies, and {@code notification}'s suppression list keys a
 * peppered HMAC on the result — so a one-character divergence in any copy would silently produce a
 * key that never matches at send time, on the module's defining invariant.
 *
 * <p>The whitespace cases below are deliberately the same set {@code V34}'s {@code domain} CHECK
 * rejects: this test and that constraint are two halves of one agreement, and the padded-input rows
 * document exactly which values normalization can and cannot produce.
 */
class EmailsTest {

	@Test
	void trimsSurroundingWhitespaceAndLowerCases() {
		assertThat(Emails.normalize("  Case-Mixed@Example.COM ")).isEqualTo("case-mixed@example.com");
	}

	@Test
	void isIdempotent() {
		String once = Emails.normalize("  User@Example.com ");
		assertThat(Emails.normalize(once)).isEqualTo(once);
	}

	@Test
	void trimsEveryWhitespaceKindJavaTrimStrips() {
		// String#trim strips every code point <= U+0020 — tab, newline, CR included.
		assertThat(Emails.normalize("\tuser@example.com\n")).isEqualTo("user@example.com");
		assertThat(Emails.normalize("\r\nuser@example.com\r\n")).isEqualTo("user@example.com");
		assertThat(Emails.normalize("user@example.com\f")).isEqualTo("user@example.com");
	}

	@Test
	void doesNotStripNonBreakingSpaceOrInteriorWhitespace() {
		// The honest limit of trim(): NBSP (U+00A0) is > U+0020, and interior space is never touched.
		// V34's CHECK therefore has to reject such values outright — normalization cannot repair them.
		assertThat(Emails.normalize(" user@example.com")).isEqualTo(" user@example.com");
		assertThat(Emails.normalize("us er@example.com")).isEqualTo("us er@example.com");
	}

	@Test
	void lowerCasesInTheRootLocaleSoAturkishDefaultCannotChangeTheKey() {
		// Locale.ROOT, not the JVM default: under tr-TR, "I".toLowerCase() is a dotless "ı", which
		// would hash to a different suppression key on a Turkish-defaulted host than on CI.
		Locale previous = Locale.getDefault();
		try {
			Locale.setDefault(Locale.forLanguageTag("tr-TR"));
			assertThat(Emails.normalize("INFO@EXAMPLE.COM")).isEqualTo("info@example.com");
		}
		finally {
			Locale.setDefault(previous);
		}
	}

	@Test
	void rejectsNull() {
		assertThatThrownBy(() -> Emails.normalize(null)).isInstanceOf(NullPointerException.class);
	}
}
