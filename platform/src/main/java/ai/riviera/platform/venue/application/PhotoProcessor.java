package ai.riviera.platform.venue.application;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.List;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import ai.riviera.platform.venue.application.PhotoProcessingResult.Reason;
import ai.riviera.platform.venue.vocabulary.ContentHash;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

import net.coobird.thumbnailator.Thumbnails;

/**
 * Turns a raw operator upload into the capped, EXIF-stripped JPEG variants a slot needs — the pure
 * image pipeline (no I/O, no DB, deterministic): validate (size → magic bytes → a <em>header-only</em>
 * dimension guard against decompression bombs) → decode with EXIF orientation applied → downscale
 * per surface (fit-within; the frontend's {@code object-fit: cover} does the visible crop) → re-encode
 * as quality JPEG, which drops all source metadata incl. GPS EXIF (ADR-0008 / privacy). A deep module
 * behind one method; the only thing that varies across a seam is where the bytes then live
 * ({@link PhotoStorage}), not this. Package-private; the service depends on it directly (one impl —
 * a hypothetical seam, riviera-java-conventions §4).
 */
@Component
class PhotoProcessor {

	/** Per-surface max bounds (fit-within; CSS {@code object-fit: cover} crops on display). */
	private static final int CARD_W = 640;
	private static final int CARD_H = 384;
	private static final int BANNER_W = 1280;
	private static final int BANNER_H = 480;
	private static final int PREVIEW_W = 480;
	private static final int PREVIEW_H = 360;
	private static final String JPEG_TYPE = "image/jpeg";
	private static final double JPEG_QUALITY = 0.82;

	private final long maxUploadBytes;
	private final long maxMegapixels;
	private final int maxDimension;

	PhotoProcessor(
			@Value("${venue.photo.max-upload-bytes:26214400}") long maxUploadBytes,
			@Value("${venue.photo.max-megapixels:50000000}") long maxMegapixels,
			@Value("${venue.photo.max-dimension:12000}") int maxDimension) {
		this.maxUploadBytes = maxUploadBytes;
		this.maxMegapixels = maxMegapixels;
		this.maxDimension = maxDimension;
	}

	PhotoProcessingResult process(byte[] upload, PhotoSlot slot) {
		if (upload.length > maxUploadBytes) {
			return rejected(Reason.TOO_LARGE);
		}
		if (!isSupportedImage(upload)) {
			return rejected(Reason.UNSUPPORTED_FORMAT);
		}
		int[] dimensions = readHeaderDimensions(upload);
		if (dimensions == null) {
			return rejected(Reason.UNREADABLE);
		}
		int width = dimensions[0];
		int height = dimensions[1];
		if (width > maxDimension || height > maxDimension || (long) width * height > maxMegapixels) {
			return rejected(Reason.DIMENSIONS_EXCEEDED);
		}
		List<StoredVariant> variants = new ArrayList<>();
		try {
			for (PhotoSurface surface : surfacesFor(slot)) {
				variants.add(render(upload, surface));
			}
		} catch (IOException e) {
			// The up-front check is header-only, so a raster the decoder can't handle (e.g. a CMYK
			// JPEG) first fails HERE — an expected upload flaw, not a server error.
			return rejected(Reason.UNREADABLE);
		}
		return new PhotoProcessingResult.Processed(new ProcessedPhoto(List.copyOf(variants)));
	}

	private static PhotoProcessingResult rejected(Reason reason) {
		return new PhotoProcessingResult.Rejected(reason);
	}

	/**
	 * The surfaces a slot needs: the cover feeds the tourist card + beach-map banner + operator
	 * preview; the secondary slots are operator-preview only (their tourist gallery is a deferred
	 * follow-up — see the plan's Non-goals).
	 */
	private static List<PhotoSurface> surfacesFor(PhotoSlot slot) {
		return slot == PhotoSlot.COVER
				? List.of(PhotoSurface.CARD, PhotoSurface.BANNER, PhotoSurface.PREVIEW)
				: List.of(PhotoSurface.PREVIEW);
	}

	/** Renders one surface's JPEG; an {@link IOException} means the raster is undecodable (→ UNREADABLE). */
	private StoredVariant render(byte[] upload, PhotoSurface surface) throws IOException {
		int[] bound = boundsFor(surface);
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		// Re-decodes from the raw bytes per surface so EXIF orientation is read + applied (and then
		// dropped) each time; a rare operator action, so the repeated decode is acceptable.
		Thumbnails.of(new ByteArrayInputStream(upload))
				.useExifOrientation(true)
				.size(bound[0], bound[1])
				.outputFormat("jpg")
				.outputQuality(JPEG_QUALITY)
				.toOutputStream(out);
		byte[] bytes = out.toByteArray();
		// Header-only read of our own freshly encoded JPEG — no second full-raster decode just for
		// two ints. It cannot fail on bytes this class just wrote.
		int[] actual = readHeaderDimensions(bytes);
		if (actual == null) {
			throw new IllegalStateException("the freshly rendered " + surface + " JPEG has no readable header");
		}
		return new StoredVariant(surface, hash(bytes), JPEG_TYPE, actual[0], actual[1], bytes);
	}

	private static int[] boundsFor(PhotoSurface surface) {
		return switch (surface) {
			case CARD -> new int[] {CARD_W, CARD_H};
			case BANNER -> new int[] {BANNER_W, BANNER_H};
			case PREVIEW -> new int[] {PREVIEW_W, PREVIEW_H};
		};
	}

	/** Magic-byte sniff — trust the actual bytes, never the client {@code Content-Type}. */
	private static boolean isSupportedImage(byte[] b) {
		return isJpeg(b) || isPng(b) || isWebp(b);
	}

	private static boolean isJpeg(byte[] b) {
		return b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
	}

	private static boolean isPng(byte[] b) {
		return b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
				&& (b[4] & 0xFF) == 0x0D && (b[5] & 0xFF) == 0x0A && (b[6] & 0xFF) == 0x1A && (b[7] & 0xFF) == 0x0A;
	}

	private static boolean isWebp(byte[] b) {
		return b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
				&& b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
	}

	/**
	 * Header-only width/height (no full-raster decode) so a decompression bomb is rejected <em>before</em>
	 * its pixels are allocated. Returns {@code null} if no reader can parse the header.
	 */
	private static int[] readHeaderDimensions(byte[] upload) {
		try (ImageInputStream iis = ImageIO.createImageInputStream(new ByteArrayInputStream(upload))) {
			if (iis == null) {
				return null;
			}
			Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
			if (!readers.hasNext()) {
				return null;
			}
			ImageReader reader = readers.next();
			try {
				reader.setInput(iis);
				return new int[] {reader.getWidth(0), reader.getHeight(0)};
			} finally {
				reader.dispose();
			}
		} catch (IOException e) {
			return null;
		}
	}

	private static ContentHash hash(byte[] bytes) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
			return new ContentHash(HexFormat.of().formatHex(digest));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 is required but unavailable", e); // every JVM ships it
		}
	}
}
