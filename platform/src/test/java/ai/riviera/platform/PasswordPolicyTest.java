package ai.riviera.platform;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.shared.InvalidApiRequestException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The one password rule every password-accepting surface shares (design D-8): 12 characters to 72
 * bytes, leading and trailing spaces counted, and a blocklist of the account's own name and the
 * service name. Length violations keep the generic edge-validation exception; a blocklist hit is its
 * own, so the client can say which rule failed.
 */
class PasswordPolicyTest {

	private static final String ELEVEN = "elevenchars";
	private static final String TWELVE = "twelve-chars";

	@Test
	void elevenCharactersAreRejectedAndTwelveAccepted() {
		assertEquals(11, ELEVEN.length());
		assertThrows(InvalidApiRequestException.class, () -> PasswordPolicy.validate(ELEVEN));
		assertDoesNotThrow(() -> PasswordPolicy.validate(TWELVE));
	}

	@Test
	void leadingAndTrailingSpacesCountAsCharacters() {
		String spaced = "  ten-chs  ";
		assertEquals(11, spaced.length());
		assertThrows(InvalidApiRequestException.class, () -> PasswordPolicy.validate(spaced));
		assertDoesNotThrow(() -> PasswordPolicy.validate(" " + spaced));
	}

	@Test
	void seventyTwoBytesAreAcceptedAndSeventyThreeRejected() {
		String seventyTwoBytes = "ë".repeat(36);
		assertDoesNotThrow(() -> PasswordPolicy.validate(seventyTwoBytes));
		assertThrows(InvalidApiRequestException.class, () -> PasswordPolicy.validate(seventyTwoBytes + "a"));
	}

	@Test
	void theServiceNameIsBlockedInAnyCase() {
		assertThrows(BlockedPasswordException.class, () -> PasswordPolicy.validate("MyRIVIERAsummer2026"));
		assertThrows(BlockedPasswordException.class, () -> PasswordPolicy.validate("MyRIVIERAsummer2026", "ana"));
	}

	@Test
	void theAccountNameIsBlockedInAnyCase() {
		assertThrows(BlockedPasswordException.class, () -> PasswordPolicy.validate("Ana.Kola-2026!!", "ana.kola"));
		assertThrows(BlockedPasswordException.class, () -> PasswordPolicy.validate("xxANA.KOLAxx-2026", "Ana.Kola"));
		assertDoesNotThrow(() -> PasswordPolicy.validate("correct-horse-battery", "ana.kola"));
	}

	@Test
	void anAccountNameUnderTheTokenFloorIsNotApplied() {
		assertDoesNotThrow(() -> PasswordPolicy.validate("axle-and-wheel-1", "ax"));
		assertThrows(BlockedPasswordException.class, () -> PasswordPolicy.validate("axle-and-wheel-1", "axl"));
	}

	@Test
	void lengthIsCheckedBeforeTheBlocklist() {
		assertThrows(InvalidApiRequestException.class, () -> PasswordPolicy.validate("riviera", "riv"));
	}

	@Test
	void hasPermittedLengthAnswersTheBoundsWithoutThrowing() {
		assertFalse(PasswordPolicy.hasPermittedLength(ELEVEN));
		assertTrue(PasswordPolicy.hasPermittedLength(TWELVE));
		assertTrue(PasswordPolicy.hasPermittedLength("ë".repeat(36)));
		assertFalse(PasswordPolicy.hasPermittedLength("ë".repeat(36) + "a"));
	}

	@Test
	void theEmailLocalPartIsThePartBeforeTheAtSignLowerCased() {
		assertEquals("ana.kola", PasswordPolicy.emailLocalPart("Ana.Kola@Example.com"));
		assertEquals("no-at-sign", PasswordPolicy.emailLocalPart("no-at-sign"));
	}

	@Test
	void isSuppliedIsEmptyNeverBlank() {
		assertFalse(PasswordPolicy.isSupplied(null));
		assertFalse(PasswordPolicy.isSupplied(""));
		assertTrue(PasswordPolicy.isSupplied(" "));
	}
}
