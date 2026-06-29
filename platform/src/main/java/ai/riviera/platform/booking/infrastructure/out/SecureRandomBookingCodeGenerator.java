package ai.riviera.platform.booking.infrastructure.out;

import java.security.SecureRandom;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.out.BookingCodeGenerator;

/**
 * {@link BookingCodeGenerator} backed by {@link SecureRandom} (invariant #7). Codes are
 * {@value #LENGTH} characters drawn from a 32-symbol unambiguous base32 alphabet (Crockford-
 * style: no {@code I}, {@code L}, {@code O}, {@code U} — avoids look-alikes and an accidental
 * profane word), giving 50 bits of entropy. Cryptographically random, never sequential.
 * Package-private; wired only as the {@link BookingCodeGenerator} bean.
 */
@Component
class SecureRandomBookingCodeGenerator implements BookingCodeGenerator {

	private static final char[] ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ0123456789".toCharArray();
	private static final int LENGTH = 10;

	private final SecureRandom random = new SecureRandom();

	@Override
	public String next() {
		StringBuilder code = new StringBuilder(LENGTH);
		for (int i = 0; i < LENGTH; i++) {
			code.append(ALPHABET[random.nextInt(ALPHABET.length)]);
		}
		return code.toString();
	}
}
