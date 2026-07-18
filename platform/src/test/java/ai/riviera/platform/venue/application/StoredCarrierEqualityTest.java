package ai.riviera.platform.venue.application;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the content-aware {@code equals}/{@code hashCode}/{@code toString} of the two
 * {@code byte[]}-carrying records (java:S6218, the plan's OQ-3): equality is by array CONTENT —
 * the record default would be reference identity — and {@code toString} renders the byte count,
 * never the payload bytes.
 */
class StoredCarrierEqualityTest {

	private static StoredBytes bytes(byte... payload) {
		return new StoredBytes(new ContentHash("aa01"), "image/jpeg", payload);
	}

	private static StoredVariant variant(String hash, byte... payload) {
		return new StoredVariant(PhotoSurface.CARD, new ContentHash(hash), "image/jpeg", 640, 384, payload);
	}

	@Test
	void storedBytesEqualityIsByArrayContent() {
		StoredBytes a = bytes((byte) 1, (byte) 2);
		StoredBytes sameContent = bytes((byte) 1, (byte) 2); // a DIFFERENT array instance
		StoredBytes otherContent = bytes((byte) 9);

		assertEquals(a, sameContent);
		assertEquals(a.hashCode(), sameContent.hashCode());
		assertNotEquals(a, otherContent);
		assertNotEquals(a, new StoredBytes(new ContentHash("bb02"), "image/jpeg", new byte[] {1, 2}));
		assertNotEquals(a, new StoredBytes(new ContentHash("aa01"), "image/png", new byte[] {1, 2}));
		assertFalse(a.equals(null));
		assertFalse(a.equals("not a StoredBytes"));
	}

	@Test
	void storedBytesToStringRendersTheCountNeverThePayload() {
		String rendered = bytes((byte) 7, (byte) 8, (byte) 9).toString();

		assertTrue(rendered.contains("3B"), "byte count is rendered: " + rendered);
		assertFalse(rendered.contains("[7"), "raw payload must not leak into logs: " + rendered);
	}

	@Test
	void storedVariantEqualityIsByArrayContent() {
		StoredVariant a = variant("aa01", (byte) 1, (byte) 2);
		StoredVariant sameContent = variant("aa01", (byte) 1, (byte) 2);

		assertEquals(a, sameContent);
		assertEquals(a.hashCode(), sameContent.hashCode());
		assertNotEquals(a, variant("aa01", (byte) 9));
		assertNotEquals(a, variant("bb02", (byte) 1, (byte) 2));
		assertNotEquals(a, new StoredVariant(PhotoSurface.BANNER, new ContentHash("aa01"),
				"image/jpeg", 640, 384, new byte[] {1, 2}));
		assertNotEquals(a, new StoredVariant(PhotoSurface.CARD, new ContentHash("aa01"),
				"image/jpeg", 999, 384, new byte[] {1, 2}));
		assertNotEquals(a, new StoredVariant(PhotoSurface.CARD, new ContentHash("aa01"),
				"image/jpeg", 640, 999, new byte[] {1, 2}));
		assertNotEquals(a, new StoredVariant(PhotoSurface.CARD, new ContentHash("aa01"),
				"image/png", 640, 384, new byte[] {1, 2}));
		assertFalse(a.equals(null));
	}

	@Test
	void storedVariantToStringRendersTheCountNeverThePayload() {
		String rendered = variant("aa01", (byte) 5).toString();

		assertTrue(rendered.contains("1B"), "byte count is rendered: " + rendered);
		assertTrue(rendered.contains("CARD"), "surface is rendered: " + rendered);
		assertFalse(rendered.contains("[5"), "raw payload must not leak into logs: " + rendered);
	}
}
