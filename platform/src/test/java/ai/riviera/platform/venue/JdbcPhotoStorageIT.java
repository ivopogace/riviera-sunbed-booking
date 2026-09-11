package ai.riviera.platform.venue;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code venue} photo-storage adapter against real Postgres (Testcontainers): variants
 * round-trip, {@code listMetadata} is blob-free, {@code loadBytes} finds by hash, {@code exists}
 * answers the same question blob-free, a re-upload replaces the slot (at most one photo per
 * {@code (venue, slot)}), and delete erases metadata + bytes in one shot. JDBC-only (invariant #1);
 * skipped where Docker is absent (CI runs it).
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
		return variant(surface, 1, hashHex, bytes);
	}

	private static StoredVariant variant(PhotoSurface surface, int scale, String hashHex, byte[] bytes) {
		return new StoredVariant(surface, scale, new ContentHash(hashHex), "image/jpeg",
				640 * scale, 360 * scale, bytes);
	}

	@Test
	void rejectsADuplicateSurfaceAndScaleForOnePhoto() {
		VenueId v = newVenue();
		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, 1, "ca01", new byte[] {1}),
				variant(PhotoSurface.CARD, 2, "ca02", new byte[] {1, 2}))));

		assertEquals(2, storage.listMetadata(v).get(0).variants().size(),
				"the two densities of one surface coexist");

		long photoId = jdbc.sql("SELECT id FROM venue_photo WHERE venue_id = :v AND slot = 'COVER'")
				.param("v", v.value()).query(Long.class).single();
		assertThrows(DuplicateKeyException.class, () -> jdbc.sql("""
				INSERT INTO venue_photo_variant (photo_id, venue_id, surface, scale, content_hash,
				                                 content_type, width, height, byte_size, bytes)
				VALUES (:photoId, :venue, 'CARD', 2, 'ca03', 'image/jpeg', 1280, 720, 1, :bytes)
				""")
				.param("photoId", photoId)
				.param("venue", v.value())
				.param("bytes", new byte[] {9})
				.update(), "UNIQUE (photo_id, surface, scale) rejects a second CARD at scale 2");
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
	void theSameImageCanOccupyTwoSlotsOfOneVenue() {
		// The pipeline is deterministic, so the same source image uploaded to two
		// slots yields byte-identical PREVIEW variants with the same SHA-256. Both must store (the
		// old UNIQUE(venue_id, content_hash) made the second upload die), and the content-addressed
		// serving read stays well-defined — identical hash = identical bytes, any row serves.
		VenueId v = newVenue();
		byte[] sameBytes = {42, 42, 42};
		storage.replace(v, PhotoSlot.SUNBEDS, new ProcessedPhoto(List.of(
				variant(PhotoSurface.PREVIEW, "5e01", sameBytes))));

		storage.replace(v, PhotoSlot.BAR, new ProcessedPhoto(List.of(
				variant(PhotoSurface.PREVIEW, "5e01", sameBytes))));

		assertEquals(2, storage.listMetadata(v).size(), "both slots occupied by the same image");
		Optional<StoredBytes> served = storage.loadBytes(v, new ContentHash("5e01"));
		assertTrue(served.isPresent(), "the shared hash still serves");
		assertArrayEquals(sameBytes, served.get().bytes());
	}

	@Test
	void concurrentReplacesOfTheSameSlotSerializeToOnePhoto() throws Exception {
		// Two concurrent replaces of one (venue, slot) — a double-submit from two
		// tabs — must serialize on the slot row's upsert lock (last writer wins), never die on
		// venue_photo_slot_uniq the way delete-then-insert did. Both calls succeed; one photo remains.
		VenueId v = newVenue();
		try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
			var barrier = new java.util.concurrent.CyclicBarrier(2);
			java.util.concurrent.Callable<Void> replaceOnce = () -> {
				barrier.await();
				storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
						variant(PhotoSurface.CARD, "6f0" + Thread.currentThread().threadId() % 10,
								new byte[] {(byte) Thread.currentThread().threadId()}))));
				return null;
			};
			for (var future : executor.invokeAll(List.of(replaceOnce, replaceOnce))) {
				future.get(); // propagate any constraint violation — both must have succeeded
			}
		}
		int photoRows = jdbc.sql("SELECT COUNT(*) FROM venue_photo WHERE venue_id = :v AND slot = 'COVER'")
				.param("v", v.value()).query(Integer.class).single();
		assertEquals(1, photoRows, "concurrent replaces serialized to exactly one photo row");
	}

	@Test
	void existsTracksTheVariantRowWithoutReadingBytes() {
		// The conditional-GET path asks this, so a revalidation is an index probe, not a blob read.
		VenueId v = newVenue();
		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "7a7a", new byte[] {8, 8}))));

		assertTrue(storage.exists(v, new ContentHash("7a7a")), "the stored variant is servable");
		assertFalse(storage.exists(v, new ContentHash("dead")), "unknown hash -> not servable (404)");
		assertFalse(storage.exists(new VenueId(v.value() + 999), new ContentHash("7a7a")),
				"venue-scoped, like the serving read");

		storage.delete(v, PhotoSlot.COVER);

		assertFalse(storage.exists(v, new ContentHash("7a7a")), "removal is visible to a revalidation");
	}

	@Test
	void admitsLightboxAndStillRejectsAnUnknownSurface() {
		VenueId v = newVenue();
		storage.replace(v, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, "1a1a", new byte[] {1}),
				variant(PhotoSurface.LIGHTBOX, "1b1b", new byte[] {2}))));

		assertEquals(2, storage.listMetadata(v).get(0).variants().size(),
				"venue_photo_variant_surface_check admits the lightbox token");

		long photoId = jdbc.sql("SELECT id FROM venue_photo WHERE venue_id = :v")
				.param("v", v.value()).query(Long.class).single();
		assertThrows(DataIntegrityViolationException.class, () -> jdbc.sql("""
				INSERT INTO venue_photo_variant
				    (photo_id, venue_id, surface, content_hash, content_type, width, height, byte_size, bytes)
				VALUES (:photo, :venue, 'POSTER', '1c1c', 'image/jpeg', 10, 10, 1, :bytes)
				""")
				.param("photo", photoId).param("venue", v.value()).param("bytes", new byte[] {3})
				.update(), "the widened CHECK still names a closed set");
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
