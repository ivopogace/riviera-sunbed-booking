package ai.riviera.platform.venue;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.application.PhotoMetadata;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredBytes;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code venue} photo-storage adapter against real Postgres (Testcontainers): variants
 * round-trip, {@code listMetadata} is blob-free, {@code loadBytes} finds by hash, a re-upload
 * replaces the slot (at most one photo per {@code (venue, slot)}), and delete erases metadata + bytes
 * in one shot. JDBC-only (invariant #1); skipped where Docker is absent (CI runs it).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcPhotoStorageIT {

	@Autowired
	PhotoStorage storage;

	@Autowired
	JdbcClient jdbc;

	private VenueId newVenue() {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('Photo Test Venue', 'Test Beach', 'Test Region', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").query(Long.class).single();
		return new VenueId(id);
	}

	private static StoredVariant variant(PhotoSurface surface, String hashHex, byte[] bytes) {
		return new StoredVariant(surface, new ContentHash(hashHex), "image/jpeg", 640, 360, bytes);
	}

	@Test
	void replaceStoresVariantsAndListMetadataIsBlobFree() {
		VenueId v = newVenue();

		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "aa01", new byte[] {1, 2, 3}),
				variant(PhotoSurface.BANNER, "bb02", new byte[] {4, 5, 6, 7}))));

		List<PhotoMetadata> meta = storage.listMetadata(v);
		assertEquals(1, meta.size(), "one occupied slot");
		assertEquals(PhotoSlot.COVER, meta.get(0).slot());
		assertEquals(2, meta.get(0).variants().size(), "both surfaces present, blob-free");
	}

	@Test
	void loadBytesReturnsTheStoredBytesByHash() {
		VenueId v = newVenue();
		byte[] payload = {10, 20, 30, 40};
		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "cc03", payload))));

		Optional<StoredBytes> loaded = storage.loadBytes(v, new ContentHash("cc03"));

		assertTrue(loaded.isPresent(), "the serving path finds the variant by content hash");
		assertArrayEquals(payload, loaded.get().bytes());
		assertEquals("image/jpeg", loaded.get().contentType());
		assertTrue(storage.loadBytes(v, new ContentHash("dead")).isEmpty(), "unknown hash -> empty (404)");
	}

	@Test
	void replaceOverwritesTheSlotAtMostOnePerSlot() {
		VenueId v = newVenue();
		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "0a1a", new byte[] {1}))));

		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "0b2b", new byte[] {2}))));

		int photoRows = jdbc.sql("SELECT COUNT(*) FROM venue_photo WHERE venue_id = :v AND slot = 'COVER'")
				.param("v", v.value()).query(Integer.class).single();
		assertEquals(1, photoRows, "exactly one photo per (venue, slot)");
		assertTrue(storage.loadBytes(v, new ContentHash("0b2b")).isPresent(), "the new variant remains");
		assertTrue(storage.loadBytes(v, new ContentHash("0a1a")).isEmpty(), "the replaced variant is gone");
	}

	@Test
	void deleteRemovesMetadataAndBytesInOneShot() {
		VenueId v = newVenue();
		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "0c3c", new byte[] {9}))));

		assertTrue(storage.delete(v, PhotoSlot.COVER), "delete reports the photo was present");

		assertTrue(storage.listMetadata(v).isEmpty(), "metadata gone");
		assertEquals(0, jdbc.sql("SELECT COUNT(*) FROM venue_photo_variant WHERE venue_id = :v")
				.param("v", v.value()).query(Integer.class).single(), "variant bytes gone (cascade)");
		assertFalse(storage.delete(v, PhotoSlot.COVER), "second delete: nothing to remove");
	}
}
