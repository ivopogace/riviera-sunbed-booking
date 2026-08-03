package ai.riviera.platform.venue.application;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.operator.api.VenueOwnership;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.VenueRef;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Orchestrates the venue-photo use cases: for the two {@link VenuePhotos} writes it asserts per-venue
 * ownership <strong>first</strong> (invariant #13, so no driving adapter can bypass it), then runs the
 * pure {@link PhotoProcessor} and persists via the {@link PhotoStorage} port; the public
 * {@link #serve} read skips ownership. Package-private {@code @Service}; callers depend on the ports
 * (invariant #11). No JPA — persistence is entirely behind {@code PhotoStorage} (invariant #1).
 *
 * <p>It also implements the second, deliberately ownership-free port {@link VenuePhotoModeration}
 * (#504), so the platform-admin removal reuses this class's one call into {@code PhotoStorage#delete}
 * instead of duplicating the deletion. Why that is a separate port rather than more
 * {@code VenuePhotos} methods — and what authorizes it instead of ownership — is on the port itself.
 */
@Service
class VenuePhotoService implements VenuePhotos, VenuePhotoModeration {

	private final VenueOwnership ownership;
	private final PhotoProcessor processor;
	private final PhotoStorage storage;

	VenuePhotoService(VenueOwnership ownership, PhotoProcessor processor, PhotoStorage storage) {
		this.ownership = ownership;
		this.processor = processor;
		this.storage = storage;
	}

	@Override
	public PhotoUploadResult upload(OperatorId operator, VenueId venueId, PhotoSlot slot, byte[] image) {
		// Deliberately NOT @Transactional (review finding #142 F-4): the CPU-heavy image pipeline
		// must run OUTSIDE any DB transaction — a service-level tx would pin a pool connection
		// through a multi-second decode/resize of a 25MB upload and starve unrelated requests.
		// Atomicity lives where it's needed: the adapter's replace() is itself @Transactional.
		ownership.assertOwns(operator, new VenueRef(venueId.value())); // invariant #13 — FIRST, before any work
		return switch (processor.process(image, slot)) {
			case PhotoProcessingResult.Processed(var photo) -> {
				storage.replace(venueId, slot, photo);
				yield new PhotoUploadResult.Stored(metadataOf(slot, photo));
			}
			case PhotoProcessingResult.Rejected(var reason) -> new PhotoUploadResult.Rejected(reason);
		};
	}

	@Override
	public boolean delete(OperatorId operator, VenueId venueId, PhotoSlot slot) {
		ownership.assertOwns(operator, new VenueRef(venueId.value())); // invariant #13 — FIRST
		// No tx needed here: the adapter's delete is one cascading DELETE statement (atomic on its own).
		return storage.delete(venueId, slot);
	}

	@Override
	public List<PhotoSlotView> slotsOf(VenueId venueId) {
		// No ownership check by design (#511): the ADMIN role gate is this path's whole authorization.
		Map<PhotoSlot, String> previewBySlot = new EnumMap<>(PhotoSlot.class);
		for (PhotoMetadata photo : storage.listMetadata(venueId)) {
			photo.variants().stream()
					.filter(variant -> variant.surface() == PhotoSurface.PREVIEW)
					.findFirst()
					.ifPresent(variant -> previewBySlot.put(photo.slot(),
							PhotoServingUrls.servingUrl(venueId.value(), variant.hash())));
		}
		// Every slot, occupied or not, so the console renders a stable grid (#142 F-11: null IS empty).
		return Arrays.stream(PhotoSlot.values())
				.map(slot -> new PhotoSlotView(slot, previewBySlot.get(slot)))
				.toList();
	}

	@Override
	public boolean takedown(VenueId venueId, PhotoSlot slot) {
		// No ownership check by design (#504): the ADMIN role gate is this path's whole authorization.
		return storage.delete(venueId, slot);
	}

	@Override
	public Optional<StoredBytes> serve(VenueId venueId, ContentHash hash) {
		// Public tourist read — deliberately NO ownership check (the serving endpoint is permitAll).
		return storage.loadBytes(venueId, hash);
	}

	/** The stored photo's blob-free metadata (for the operator's immediate preview after upload). */
	private static PhotoMetadata metadataOf(PhotoSlot slot, ProcessedPhoto photo) {
		return new PhotoMetadata(slot, photo.variants().stream()
				.map(v -> new VariantMeta(v.surface(), v.hash(), v.contentType(), v.width(), v.height()))
				.toList());
	}
}
