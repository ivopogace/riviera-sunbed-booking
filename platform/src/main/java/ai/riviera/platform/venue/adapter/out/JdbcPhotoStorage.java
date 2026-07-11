package ai.riviera.platform.venue.adapter.out;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.venue.application.PhotoMetadata;
import ai.riviera.platform.venue.application.PhotoStorage;
import ai.riviera.platform.venue.application.ProcessedPhoto;
import ai.riviera.platform.venue.application.StoredBytes;
import ai.riviera.platform.venue.application.StoredVariant;
import ai.riviera.platform.venue.application.VariantMeta;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The Postgres {@code bytea} adapter behind {@link PhotoStorage} (ADR-0008) — explicit text-block SQL
 * via {@link JdbcClient}, no JPA (invariant #1); package-private, so callers depend on the port
 * (invariant #11). The blob is isolated in {@code venue_photo_variant} and read only on the serving
 * path ({@link #loadBytes}) — never by {@link #listMetadata}.
 */
@Repository
class JdbcPhotoStorage implements PhotoStorage {

	private static final String P_VENUE = "venue";
	private static final String P_SLOT = "slot";

	private final JdbcClient jdbc;

	JdbcPhotoStorage(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	@Transactional
	public void replace(VenueId venueId, PhotoSlot slot, ProcessedPhoto photo) {
		// Atomic race-safe replace (review finding #142 F-3): the upsert claims OR locks the slot's
		// row — a concurrent replace of the same (venue, slot) blocks on the row lock instead of
		// dying on venue_photo_slot_uniq the way delete-then-insert did (last writer wins, per the
		// plan's concurrency section). created_at is bumped on conflict: the row then describes the
		// CURRENT photo, whose creation is this upload. Variants are swapped under the same lock —
		// one transaction, no orphaned blob.
		long photoId = jdbc.sql("""
				INSERT INTO venue_photo (venue_id, slot)
				VALUES (:venue, :slot)
				ON CONFLICT (venue_id, slot) DO UPDATE SET created_at = NOW()
				RETURNING id
				""")
				.param(P_VENUE, venueId.value())
				.param(P_SLOT, slot.name())
				.query(Long.class)
				.single();
		jdbc.sql("DELETE FROM venue_photo_variant WHERE photo_id = :photoId")
				.param("photoId", photoId)
				.update();
		for (StoredVariant v : photo.variants()) {
			jdbc.sql("""
					INSERT INTO venue_photo_variant (photo_id, venue_id, surface, content_hash,
					                                 content_type, width, height, byte_size, bytes)
					VALUES (:photoId, :venue, :surface, :hash, :type, :width, :height, :size, :bytes)
					""")
					.param("photoId", photoId)
					.param(P_VENUE, venueId.value())
					.param("surface", v.surface().name())
					.param("hash", v.hash().value())
					.param("type", v.contentType())
					.param("width", v.width())
					.param("height", v.height())
					.param("size", v.bytes().length)
					.param("bytes", v.bytes())
					.update();
		}
	}

	@Override
	public boolean delete(VenueId venueId, PhotoSlot slot) {
		int rows = jdbc.sql("DELETE FROM venue_photo WHERE venue_id = :venue AND slot = :slot")
				.param(P_VENUE, venueId.value())
				.param(P_SLOT, slot.name())
				.update();
		return rows > 0;
	}

	@Override
	public Optional<StoredBytes> loadBytes(VenueId venueId, ContentHash hash) {
		// LIMIT 1: the same image in two slots stores two rows with this (venue, hash) — they are
		// content-identical by construction (hash = SHA-256 of the bytes), so any one serves.
		return jdbc.sql("""
				SELECT content_type, content_hash, bytes
				FROM venue_photo_variant
				WHERE venue_id = :venue AND content_hash = :hash
				LIMIT 1
				""")
				.param(P_VENUE, venueId.value())
				.param("hash", hash.value())
				.query((rs, rowNum) -> new StoredBytes(
						new ContentHash(rs.getString("content_hash")),
						rs.getString("content_type"),
						rs.getBytes("bytes")))
				.optional();
	}

	@Override
	public List<PhotoMetadata> listMetadata(VenueId venueId) {
		// One blob-free join read (the bytea column is deliberately NOT selected — ADR-0008), grouped
		// into a PhotoMetadata per occupied slot in a stable (slot, surface) order.
		List<SlotVariantRow> rows = jdbc.sql("""
				SELECT p.slot, v.surface, v.content_hash, v.content_type, v.width, v.height
				FROM venue_photo p
				JOIN venue_photo_variant v ON v.photo_id = p.id
				WHERE p.venue_id = :venue
				ORDER BY p.slot, v.surface
				""")
				.param(P_VENUE, venueId.value())
				.query((rs, rowNum) -> new SlotVariantRow(
						PhotoSlot.valueOf(rs.getString("slot")),
						new VariantMeta(
								PhotoSurface.valueOf(rs.getString("surface")),
								new ContentHash(rs.getString("content_hash")),
								rs.getString("content_type"),
								rs.getInt("width"),
								rs.getInt("height"))))
				.list();
		Map<PhotoSlot, List<VariantMeta>> bySlot = new LinkedHashMap<>();
		for (SlotVariantRow row : rows) {
			bySlot.computeIfAbsent(row.slot(), s -> new ArrayList<>()).add(row.variant());
		}
		List<PhotoMetadata> out = new ArrayList<>();
		bySlot.forEach((slot, variants) -> out.add(new PhotoMetadata(slot, List.copyOf(variants))));
		return out;
	}

	/** One {@code (slot, variant-meta)} row from the blob-free metadata read, before grouping by slot. */
	private record SlotVariantRow(PhotoSlot slot, VariantMeta variant) {
	}
}
