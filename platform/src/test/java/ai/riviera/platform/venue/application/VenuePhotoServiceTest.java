package ai.riviera.platform.venue.application;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.NotVenueOwnerException;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.application.PhotoProcessingResult.Reason;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The photo orchestration in isolation: ownership is asserted <strong>before</strong> any processing
 * or storage (invariant #13, BOLA), rejections surface as typed values, and the serving read is
 * public. Uses the in-memory storage fake + the real {@link PhotoProcessor} (pure) + a fake ownership
 * port — no Spring, no DB.
 */
class VenuePhotoServiceTest {

	private static final long OPERATOR = 7L;
	private static final long VENUE = 42L;

	private final InMemoryPhotoStorage storage = new InMemoryPhotoStorage();
	private final VenuePhotoService service = new VenuePhotoService(
			new FakeVenueOwnership(OPERATOR, VENUE),
			new PhotoProcessor(26_214_400L, 50_000_000L, 12_000),
			storage);

	@Test
	void ownerUploadStoresTheVariants() throws IOException {
		PhotoUploadResult result = service.upload(new OperatorId(OPERATOR), new VenueId(VENUE),
				PhotoSlot.COVER, jpeg(1600, 1200));

		PhotoUploadResult.Stored stored = assertInstanceOf(PhotoUploadResult.Stored.class, result);
		assertEquals(3, stored.metadata().variants().size(), "cover → card + banner + preview");
		assertEquals(1, storage.listMetadata(new VenueId(VENUE)).size(), "the slot is now occupied");
	}

	@Test
	void invalidImageIsRejectedAndNothingIsStored() {
		PhotoUploadResult result = service.upload(new OperatorId(OPERATOR), new VenueId(VENUE),
				PhotoSlot.COVER, "not an image".getBytes(StandardCharsets.UTF_8));

		PhotoUploadResult.Rejected rejected = assertInstanceOf(PhotoUploadResult.Rejected.class, result);
		assertEquals(Reason.UNSUPPORTED_FORMAT, rejected.reason());
		assertTrue(storage.listMetadata(new VenueId(VENUE)).isEmpty(), "a rejected upload stores nothing");
	}

	@Test
	void nonOwnerUploadThrowsBeforeAnythingIsStored() throws IOException {
		// A VALID image by a NON-owner: assertOwns runs first (invariant #13), so it throws before the
		// processor or storage is ever touched — the storage stays empty.
		byte[] validImage = jpeg(1600, 1200);

		assertThrows(NotVenueOwnerException.class, () -> service.upload(
				new OperatorId(999L), new VenueId(VENUE), PhotoSlot.COVER, validImage));

		assertTrue(storage.listMetadata(new VenueId(VENUE)).isEmpty(),
				"BOLA: a non-owner's upload must not write anything");
	}

	@Test
	void ownerDeleteRemovesThePhoto() throws IOException {
		service.upload(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER, jpeg(1600, 1200));

		assertTrue(service.delete(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER));
		assertTrue(storage.listMetadata(new VenueId(VENUE)).isEmpty());
		assertFalse(service.delete(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER),
				"second delete: nothing to remove");
	}

	@Test
	void nonOwnerDeleteThrowsAndLeavesThePhoto() throws IOException {
		service.upload(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER, jpeg(1600, 1200));

		assertThrows(NotVenueOwnerException.class, () -> service.delete(
				new OperatorId(999L), new VenueId(VENUE), PhotoSlot.COVER));

		assertEquals(1, storage.listMetadata(new VenueId(VENUE)).size(), "the owner's photo is untouched");
	}

	@Test
	void takedownRemovesAPhotoWithoutConsultingOwnership() throws IOException {
		service.upload(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER, jpeg(1600, 1200));

		assertTrue(service.takedown(new VenueId(VENUE), PhotoSlot.COVER), "a photo was there");
		assertTrue(storage.listMetadata(new VenueId(VENUE)).isEmpty(), "metadata + variants are gone");
	}

	/**
	 * The platform-admin case. The fake ownership port throws for every venue but {@code VENUE},
	 * so a takedown of another venue <em>succeeding</em> is itself the proof that no ownership check
	 * runs — the invariant-#13 exemption that {@code /api/admin/**} carries. The operator-scoped delete
	 * over the very same slot still throws, which is what keeps the two ports' contracts distinguishable.
	 */
	@Test
	void takedownReachesAVenueTheCallerCouldNeverOwn() {
		VenueId other = new VenueId(VENUE + 1);
		storage.replace(other, PhotoSlot.BAR, oneVariant("f00d01"));

		assertTrue(service.takedown(other, PhotoSlot.BAR));
		assertTrue(storage.listMetadata(other).isEmpty());
		assertThrows(NotVenueOwnerException.class,
				() -> service.delete(new OperatorId(OPERATOR), other, PhotoSlot.BAR));
	}

	@Test
	void takedownOfAnEmptySlotIsFalse() {
		assertFalse(service.takedown(new VenueId(VENUE), PhotoSlot.SUNBEDS), "nothing to remove");
	}

	/**
	 * The moderation read — the takedown's companion, and the reason an admin can now see what
	 * it is authorized to remove. Every slot comes back in declaration order so the console renders a
	 * stable grid; emptiness IS the null URL, and an occupied slot carries the
	 * PREVIEW variant's URL — the surface sized for exactly this job.
	 */
	@Test
	void moderationReadListsEverySlotWithoutOwnershipCheck() throws IOException {
		service.upload(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER, jpeg(1600, 1200));

		List<PhotoSlotView> slots = service.slotsOf(new VenueId(VENUE));

		assertEquals(List.of(PhotoSlot.COVER, PhotoSlot.SUNBEDS, PhotoSlot.BAR),
				slots.stream().map(PhotoSlotView::slot).toList(), "every slot, declaration order");
		assertNotNull(slots.get(0).previewUrl(), "the occupied slot carries its PREVIEW url");
		assertTrue(slots.get(0).previewUrl().startsWith("/api/venues/" + VENUE + "/photos/"),
				"built through PhotoServingUrls, so the route cannot drift");
		assertNull(slots.get(1).previewUrl(), "emptiness IS the null url");
		assertNull(slots.get(2).previewUrl());
	}

	/**
	 * The platform-admin case, mirroring {@link #takedownReachesAVenueTheCallerCouldNeverOwn}: the fake
	 * ownership port refuses every venue but {@code VENUE}, so reading another venue's slots at all is
	 * itself the proof that no ownership check runs. This is precisely the case the venue-scoped
	 * profile read answers {@code 403 NOT_VENUE_OWNER} — the gap that made the takedown unusable.
	 */
	@Test
	void moderationReadReachesAVenueTheCallerCouldNeverOwn() {
		VenueId other = new VenueId(VENUE + 1);
		storage.replace(other, PhotoSlot.BAR, previewOnly("f00d02"));

		List<PhotoSlotView> slots = service.slotsOf(other);

		assertEquals("/api/venues/" + other.value() + "/photos/f00d02", slots.get(2).previewUrl(),
				"BAR is the third slot");
		assertNull(slots.get(0).previewUrl(), "COVER is empty on this venue");
		assertThrows(NotVenueOwnerException.class,
				() -> service.delete(new OperatorId(OPERATOR), other, PhotoSlot.BAR),
				"the venue-scoped twin still refuses — the two ports stay distinguishable");
	}

	@Test
	void moderationReadOfAVenueWithNoPhotosIsThreeEmptySlots() {
		// An unknown venue is deliberately indistinguishable from one with no photos (like takedown).
		List<PhotoSlotView> slots = service.slotsOf(new VenueId(4242L));

		assertEquals(3, slots.size());
		assertTrue(slots.stream().allMatch(slot -> slot.previewUrl() == null));
	}

	@Test
	void serveIsPublicAndReturnsBytesByHash() throws IOException {
		PhotoUploadResult.Stored stored = assertInstanceOf(PhotoUploadResult.Stored.class,
				service.upload(new OperatorId(OPERATOR), new VenueId(VENUE), PhotoSlot.COVER, jpeg(1600, 1200)));
		ContentHash hash = stored.metadata().variants().get(0).hash();

		// No operator, no ownership check — the tourist read is public.
		Optional<StoredBytes> served = service.serve(new VenueId(VENUE), hash);

		assertTrue(served.isPresent());
		assertEquals("image/jpeg", served.get().contentType());
		assertTrue(service.serve(new VenueId(VENUE), new ContentHash("deadbeef")).isEmpty(), "unknown hash → empty");
	}

	/** A stored photo carrying only the PREVIEW variant — the surface the moderation read serves. */
	private static ProcessedPhoto previewOnly(String hashHex) {
		return new ProcessedPhoto(List.of(new StoredVariant(PhotoSurface.PREVIEW, new ContentHash(hashHex),
				"image/jpeg", 480, 320, new byte[] {1, 2, 3})));
	}

	/** A one-variant stored photo, for seeding a venue the fake ownership port refuses. */
	private static ProcessedPhoto oneVariant(String hashHex) {
		return new ProcessedPhoto(List.of(new StoredVariant(PhotoSurface.CARD, new ContentHash(hashHex),
				"image/jpeg", 640, 384, new byte[] {1, 2, 3})));
	}

	private static byte[] jpeg(int w, int h) throws IOException {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new Color(240, 170, 46));
		g.fillRect(0, 0, w, h);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "jpg", out);
		return out.toByteArray();
	}

	/** Owns exactly one (operator, venue) pair; anyone else fails the assertion like the real port. */
	private static final class FakeVenueOwnership implements VenueOwnership {

		private final long operatorId;
		private final long venueId;

		FakeVenueOwnership(long operatorId, long venueId) {
			this.operatorId = operatorId;
			this.venueId = venueId;
		}

		@Override
		public void assertOwns(OperatorId operator, VenueRef venue) {
			if (operator.value() != operatorId || venue.value() != venueId) {
				throw new NotVenueOwnerException(operator, venue);
			}
		}

		@Override
		public Set<VenueRef> ownedVenues(OperatorId operator) {
			return operator.value() == operatorId ? Set.of(new VenueRef(venueId)) : Set.of();
		}

		@Override
		public void assignOwner(OperatorId operator, VenueRef venue) {
			// not exercised by the photo service
		}
	}
}
