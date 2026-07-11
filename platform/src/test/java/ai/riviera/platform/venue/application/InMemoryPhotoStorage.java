package ai.riviera.platform.venue.application;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * In-memory {@link PhotoStorage} fake for application-service unit tests — no DB, no Docker. Same
 * observable semantics as {@code JdbcPhotoStorage}: at most one photo per {@code (venue, slot)}
 * (replace overwrites), blob-free {@code listMetadata}, hash-scoped {@code loadBytes}. Lets
 * {@code VenuePhotoServiceTest} exercise the service (incl. the {@code assertOwns} BOLA path) without
 * Testcontainers (the real round-trip is pinned by {@code JdbcPhotoStorageIT}).
 */
class InMemoryPhotoStorage implements PhotoStorage {

	private final Map<Key, ProcessedPhoto> store = new LinkedHashMap<>();

	private record Key(long venueId, PhotoSlot slot) {
	}

	@Override
	public void replace(VenueId venueId, PhotoSlot slot, ProcessedPhoto photo) {
		store.put(new Key(venueId.value(), slot), photo);
	}

	@Override
	public boolean delete(VenueId venueId, PhotoSlot slot) {
		return store.remove(new Key(venueId.value(), slot)) != null;
	}

	@Override
	public Optional<StoredBytes> loadBytes(VenueId venueId, ContentHash hash) {
		return store.entrySet().stream()
				.filter(e -> e.getKey().venueId() == venueId.value())
				.flatMap(e -> e.getValue().variants().stream())
				.filter(v -> v.hash().equals(hash))
				.findFirst()
				.map(v -> new StoredBytes(v.hash(), v.contentType(), v.bytes()));
	}

	@Override
	public List<PhotoMetadata> listMetadata(VenueId venueId) {
		List<PhotoMetadata> out = new ArrayList<>();
		store.forEach((key, photo) -> {
			if (key.venueId() == venueId.value()) {
				List<VariantMeta> metas = photo.variants().stream()
						.map(v -> new VariantMeta(v.surface(), v.hash(), v.contentType(), v.width(), v.height()))
						.toList();
				out.add(new PhotoMetadata(key.slot(), metas));
			}
		});
		return out;
	}
}
