package ai.riviera.platform.venue.application;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.application.PhotoProcessingResult.Processed;
import ai.riviera.platform.venue.application.PhotoProcessingResult.Reason;
import ai.riviera.platform.venue.application.PhotoProcessingResult.Rejected;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;
import ai.riviera.platform.venue.vocabulary.PhotoSurface;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The pure image pipeline (no Spring, no DB): validation guard, per-slot variant set, EXIF strip.
 * Fixtures are generated in-test so the suite carries no binary blobs.
 */
class PhotoProcessorTest {

	/** The 6-byte EXIF APP1 signature ("Exif" + two NUL bytes) — present in the fixture, gone from output. */
	private static final byte[] EXIF_ID = {'E', 'x', 'i', 'f', 0x00, 0x00};

	/** Production-default limits (25 MB / 50 MP / 12 000 px). */
	private final PhotoProcessor processor = new PhotoProcessor(26_214_400L, 50_000_000L, 12_000);

	@Test
	void coverProducesCardBannerAndPreviewJpegVariants() throws IOException {
		Processed result = assertProcessed(processor.process(solidJpeg(1600, 1200), PhotoSlot.COVER));

		List<StoredVariant> variants = result.photo().variants();
		assertEquals(3, variants.size(), "cover feeds card + banner + preview");
		Set<PhotoSurface> surfaces = variants.stream().map(StoredVariant::surface).collect(Collectors.toSet());
		assertEquals(Set.of(PhotoSurface.CARD, PhotoSurface.BANNER, PhotoSurface.PREVIEW), surfaces);
		for (StoredVariant v : variants) {
			assertEquals("image/jpeg", v.contentType(), "re-encoded to JPEG");
			assertTrue(isJpeg(v.bytes()), "output is a real JPEG");
			assertTrue(v.width() > 0 && v.height() > 0, "positive dimensions");
			assertTrue(v.width() <= boundW(v.surface()) && v.height() <= boundH(v.surface()),
					() -> v.surface() + " fits within its bound");
			assertTrue(v.hash().value().matches("[0-9a-f]{64}"), "SHA-256 lower-case-hex content hash");
			assertTrue(v.bytes().length <= 200_000, "capped variant size");
		}
	}

	@Test
	void secondarySlotProducesPreviewOnly() throws IOException {
		Processed result = assertProcessed(processor.process(solidPng(1600, 1200), PhotoSlot.BAR));

		assertEquals(List.of(PhotoSurface.PREVIEW),
				result.photo().variants().stream().map(StoredVariant::surface).toList(),
				"secondary slots are operator-preview only");
	}

	@Test
	void rejectsAnUploadOverTheSizeCap() {
		PhotoProcessor tiny = new PhotoProcessor(10L, 50_000_000L, 12_000);
		assertEquals(Reason.TOO_LARGE, assertRejected(tiny.process(new byte[20], PhotoSlot.COVER)).reason());
	}

	@Test
	void rejectsNonImageBytesByMagicNotContentType() {
		byte[] notAnImage = "this is definitely not an image".getBytes(StandardCharsets.UTF_8);
		assertEquals(Reason.UNSUPPORTED_FORMAT,
				assertRejected(processor.process(notAnImage, PhotoSlot.COVER)).reason());
	}

	@Test
	void rejectsImagesOverTheMegapixelGuard() throws IOException {
		// 100x100 = 10_000 px exceeds a 100-px megapixel cap; both sides stay under the per-side cap.
		PhotoProcessor lowMegapixels = new PhotoProcessor(26_214_400L, 100L, 100_000);
		assertEquals(Reason.DIMENSIONS_EXCEEDED,
				assertRejected(lowMegapixels.process(solidPng(100, 100), PhotoSlot.COVER)).reason());
	}

	@Test
	void rejectsImagesOverThePerSideGuard() throws IOException {
		// 100 px wide exceeds a 50-px per-side cap even though total pixels are tiny.
		PhotoProcessor lowDimension = new PhotoProcessor(26_214_400L, 50_000_000L, 50);
		assertEquals(Reason.DIMENSIONS_EXCEEDED,
				assertRejected(lowDimension.process(solidPng(100, 10), PhotoSlot.COVER)).reason());
	}

	@Test
	void rejectsCorruptImageWithValidMagic() {
		// JPEG magic (FF D8 FF) but no decodable image behind it.
		byte[] corrupt = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
		assertEquals(Reason.UNREADABLE, assertRejected(processor.process(corrupt, PhotoSlot.COVER)).reason());
	}

	@Test
	void rejectsAJpegWhoseHeaderParsesButWhoseRasterDoesNot() throws IOException {
		// The up-front guard is header-only, so a file can pass the magic + SOF
		// checks yet still fail the FULL raster decode (real-world case: a CMYK/Adobe JPEG). Model
		// it with a JPEG cut just before its SOS marker: the SOF header (dimensions) is intact, but
		// there is no scan data to decode. This must be the typed UNREADABLE rejection — an upload
		// flaw — not an escaping 500.
		byte[] whole = solidJpeg(1600, 1200);
		byte[] headerOnly = new byte[startOfScanIndex(whole)];
		System.arraycopy(whole, 0, headerOnly, 0, headerOnly.length);

		assertEquals(Reason.UNREADABLE,
				assertRejected(processor.process(headerOnly, PhotoSlot.COVER)).reason());
	}

	/** The offset of the JPEG SOS marker (FF DA) — everything before it is header segments only. */
	private static int startOfScanIndex(byte[] jpeg) {
		for (int i = 0; i < jpeg.length - 1; i++) {
			if ((jpeg[i] & 0xFF) == 0xFF && (jpeg[i + 1] & 0xFF) == 0xDA) {
				return i;
			}
		}
		throw new IllegalStateException("fixture JPEG has no SOS marker");
	}

	@Test
	void stripsExifMetadataFromEveryVariant() throws IOException {
		byte[] withExif = jpegWithExif(1600, 1200);
		// sanity: the input really carries an EXIF APP1 marker
		assertTrue(containsSequence(withExif, EXIF_ID), "fixture carries EXIF");

		Processed result = assertProcessed(processor.process(withExif, PhotoSlot.COVER));

		for (StoredVariant v : result.photo().variants()) {
			assertFalse(containsSequence(v.bytes(), EXIF_ID),
					() -> "no EXIF APP1 survives in the " + v.surface() + " variant (GPS lives in this segment)");
		}
	}

	// --- fixtures (generated in-test; no binary resources) -------------------------------------

	private static byte[] solidJpeg(int w, int h) throws IOException {
		return encode(image(w, h), "jpg");
	}

	private static byte[] solidPng(int w, int h) throws IOException {
		return encode(image(w, h), "png");
	}

	private static BufferedImage image(int w, int h) {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
		Graphics2D g = img.createGraphics();
		g.setColor(new Color(240, 170, 46));
		g.fillRect(0, 0, w, h);
		g.setColor(Color.WHITE);
		g.fillRect(w / 4, h / 4, Math.max(1, w / 2), Math.max(1, h / 2));
		g.dispose();
		return img;
	}

	private static byte[] encode(BufferedImage img, String format) throws IOException {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, format, out);
		return out.toByteArray();
	}

	/** A valid JPEG with a well-formed minimal EXIF APP1 (Orientation=1) spliced in after the SOI. */
	private static byte[] jpegWithExif(int w, int h) throws IOException {
		byte[] base = solidJpeg(w, h); // starts FF D8 (SOI)
		byte[] exif = minimalExifApp1();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		out.write(0xFF);
		out.write(0xD8); // SOI
		out.writeBytes(exif); // our EXIF APP1
		out.write(base, 2, base.length - 2); // the rest of the base JPEG after its own SOI
		return out.toByteArray();
	}

	private static byte[] minimalExifApp1() {
		// "Exif\0\0" + a little-endian TIFF with one IFD entry: Orientation (0x0112) = 1.
		byte[] exifId = {'E', 'x', 'i', 'f', 0x00, 0x00};
		byte[] tiff = {
			'I', 'I', 0x2A, 0x00, // little-endian, magic 42
			0x08, 0x00, 0x00, 0x00, // IFD0 offset = 8
			0x01, 0x00, // 1 directory entry
			0x12, 0x01, 0x03, 0x00, // tag 0x0112 (Orientation), type 3 (SHORT)
			0x01, 0x00, 0x00, 0x00, // count 1
			0x01, 0x00, 0x00, 0x00, // value 1 (normal)
			0x00, 0x00, 0x00, 0x00 // next-IFD offset = 0
		};
		int length = 2 + exifId.length + tiff.length; // the length field counts itself
		ByteArrayOutputStream seg = new ByteArrayOutputStream();
		seg.write(0xFF);
		seg.write(0xE1); // APP1
		seg.write((length >> 8) & 0xFF);
		seg.write(length & 0xFF);
		seg.writeBytes(exifId);
		seg.writeBytes(tiff);
		return seg.toByteArray();
	}

	private static boolean isJpeg(byte[] b) {
		return b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
	}

	/** True if {@code needle} appears as a contiguous byte run in {@code haystack}. */
	private static boolean containsSequence(byte[] haystack, byte[] needle) {
		for (int i = 0; i <= haystack.length - needle.length; i++) {
			boolean match = true;
			for (int j = 0; j < needle.length; j++) {
				if (haystack[i + j] != needle[j]) {
					match = false;
					break;
				}
			}
			if (match) {
				return true;
			}
		}
		return false;
	}

	private static int boundW(PhotoSurface s) {
		return switch (s) {
			case CARD -> 640;
			case BANNER -> 1280;
			case PREVIEW -> 480;
		};
	}

	private static int boundH(PhotoSurface s) {
		return switch (s) {
			case CARD -> 384;
			case BANNER -> 480;
			case PREVIEW -> 360;
		};
	}

	private static Processed assertProcessed(PhotoProcessingResult result) {
		assertInstanceOf(Processed.class, result, () -> "expected Processed but got " + result);
		return (Processed) result;
	}

	private static Rejected assertRejected(PhotoProcessingResult result) {
		assertInstanceOf(Rejected.class, result, () -> "expected Rejected but got " + result);
		return (Rejected) result;
	}
}
