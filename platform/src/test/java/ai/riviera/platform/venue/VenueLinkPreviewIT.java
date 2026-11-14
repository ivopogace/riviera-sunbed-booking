package ai.riviera.platform.venue;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.VenueCatalog;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.vocabulary.Beach;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueLinkPreview;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link VenueCatalog#findLinkPreview} at the port (Testcontainers Postgres): a visible venue answers its
 * name, beach, description and the cover's baseline banner URL; a hidden or unknown venue is empty, the
 * same fence as the map read.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class VenueLinkPreviewIT {

	@Autowired
	VenueCatalog catalog;
	@Autowired
	PhotoStorage storage;
	@Autowired
	JdbcClient jdbc;

	private VenueId venue(String name, String description) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, description, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'DHERMI', :description, 'INSTANT', 1500, 'EUR') RETURNING id
				""").param("name", name).param("description", description).query(Long.class).single();
		return new VenueId(id);
	}

	private static StoredVariant variant(PhotoSurface surface, int scale, String hash) {
		return new StoredVariant(surface, scale, new ContentHash(hash), "image/jpeg", 640 * scale, 240 * scale,
				new byte[] {1});
	}

	@Test
	void visibleVenueAnswersItsPreviewWithTheBaselineBanner() {
		VenueId id = venue("LP visible venue", "Sand and pines.\nSecond line.");
		OwnershipFixtures.grantToBootstrap(jdbc, id.value());
		storage.replace(id, PhotoSlot.COVER, new ProcessedPhoto(List.of(
				variant(PhotoSurface.CARD, 1, "1a60"),
				variant(PhotoSurface.BANNER, 1, "1b60"),
				variant(PhotoSurface.BANNER, 2, "1c60"),
				variant(PhotoSurface.PREVIEW, 1, "1d60"))));

		VenueLinkPreview preview = catalog.findLinkPreview(id).orElseThrow();

		assertEquals(new VenueLinkPreview("LP visible venue", Beach.DHERMI, "Sand and pines.\nSecond line.",
				"/api/venues/" + id.value() + "/photos/1b60"), preview);
	}

	@Test
	void venueWithoutCoverOrDescriptionAnswersNulls() {
		VenueId id = venue("LP bare venue", null);
		OwnershipFixtures.grantToBootstrap(jdbc, id.value());

		VenueLinkPreview preview = catalog.findLinkPreview(id).orElseThrow();

		assertNull(preview.description());
		assertNull(preview.coverUrl());
	}

	@Test
	void hiddenAndUnknownVenuesAreEmpty() {
		VenueId ownerless = venue("LP hidden venue", "Hidden.");

		Optional<VenueLinkPreview> hidden = catalog.findLinkPreview(ownerless);

		assertTrue(hidden.isEmpty());
		assertTrue(catalog.findLinkPreview(new VenueId(Long.MAX_VALUE)).isEmpty());
	}
}
