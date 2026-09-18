package ai.riviera.platform.venue.adapter.in;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.Beach;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The wire beach code → catalogue parse the create and profile-edit bodies share (AC-1). */
class BeachCodeTest {

	@Test
	void parsesACatalogueCode() {
		assertEquals(Beach.KSAMIL, BeachCode.parse("KSAMIL"));
	}

	@Test
	void rejectsAnOffCatalogueCodeNamingTheVocabularyNotTheEnum() {
		IllegalArgumentException rejected = assertThrows(IllegalArgumentException.class,
				() -> BeachCode.parse("Ksamil"));
		assertEquals("Unknown beach: Ksamil", rejected.getMessage());
	}

	@Test
	void rejectsAMissingCode() {
		assertTrue(assertThrows(IllegalArgumentException.class, () -> BeachCode.parse(null))
				.getMessage().contains("required"));
		assertTrue(assertThrows(IllegalArgumentException.class, () -> BeachCode.parse("  "))
				.getMessage().contains("required"));
	}
}
