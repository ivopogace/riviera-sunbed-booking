package ai.riviera.platform.web.adapter.in;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** {@link ShellHead}: which tags each head emits, every value escaped, and the splice into the shell. */
class ShellHeadTest {

	private static final Path SOURCE_SHELL = Path.of("..", "frontend", "src", "index.html");
	private static final String SHELL = """
			<!doctype html>
			<html lang="en">
			  <head>
			    <meta charset="utf-8" />
			    <title>Riviera</title>
			    <base href="/" />
			  </head>
			  <body><app-root></app-root></body>
			</html>
			""";

	private static ShellHead page(String title, String canonical, String image) {
		return ShellHead.page(title, "A day on the sand.", canonical, image,
				List.of(new ShellHead.Alternate("en", "https://r.example/venues/1"),
						new ShellHead.Alternate("x-default", "https://r.example/venues/1")));
	}

	@Test
	void indexablePageCarriesEveryPreviewTag() {
		String head = page("Miramar, Ksamil — Riviera", "https://r.example/venues/1",
				"https://r.example/api/venues/1/photos/ab").render();

		assertTrue(head.contains("<title>Miramar, Ksamil — Riviera</title>"));
		assertTrue(head.contains("<meta name=\"description\" content=\"A day on the sand.\">"));
		assertTrue(head.contains("<link rel=\"canonical\" href=\"https://r.example/venues/1\">"));
		assertTrue(head.contains("<link rel=\"alternate\" hreflang=\"en\" href=\"https://r.example/venues/1\">"));
		assertTrue(head.contains("<link rel=\"alternate\" hreflang=\"x-default\" href=\"https://r.example/venues/1\">"));
		assertTrue(head.contains("<meta property=\"og:title\" content=\"Miramar, Ksamil — Riviera\">"));
		assertTrue(head.contains("<meta property=\"og:description\" content=\"A day on the sand.\">"));
		assertTrue(head.contains("<meta property=\"og:type\" content=\"website\">"));
		assertTrue(head.contains("<meta property=\"og:site_name\" content=\"Riviera\">"));
		assertTrue(head.contains("<meta property=\"og:url\" content=\"https://r.example/venues/1\">"));
		assertTrue(head.contains("<meta property=\"og:image\" content=\"https://r.example/api/venues/1/photos/ab\">"));
		assertTrue(head.contains("<meta name=\"twitter:card\" content=\"summary_large_image\">"));
		assertFalse(head.contains("robots"));
	}

	@Test
	void pageWithoutOriginOrImageOmitsTheUrlTags() {
		String head = ShellHead.page("Riviera", "Generic.", null, null, List.of()).render();

		assertFalse(head.contains("canonical"));
		assertFalse(head.contains("og:url"));
		assertFalse(head.contains("og:image"));
		assertFalse(head.contains("hreflang"));
		assertTrue(head.contains("<meta name=\"twitter:card\" content=\"summary\">"));
	}

	@Test
	void unlistedPageIsNoindexWithoutCanonicalOrAlternates() {
		String head = ShellHead.unlisted("Riviera — Sunbed Booking", "Generic.").render();

		assertTrue(head.contains("<meta name=\"robots\" content=\"noindex\">"));
		assertTrue(head.contains("<meta property=\"og:title\" content=\"Riviera — Sunbed Booking\">"));
		assertFalse(head.contains("canonical"));
		assertFalse(head.contains("hreflang"));
		assertFalse(head.contains("og:url"));
	}

	@Test
	void privatePageIsOnlyNoindex() {
		String shell = ShellHead.privatePage().applyTo(SHELL);

		assertTrue(shell.contains("<title>Riviera</title>"));
		assertTrue(shell.contains("<meta name=\"robots\" content=\"noindex\">"));
		assertFalse(shell.contains("og:"));
		assertFalse(shell.contains("canonical"));
		assertFalse(shell.contains("description"));
	}

	@Test
	void escapesEveryValue() {
		String hostile = "<script>alert(\"x\")</script> & 'Co' $1 \\0";
		String head = page(hostile, "https://r.example/venues/1?a=\"b\"&c=<d>", "https://r.example/i'mg").render();

		assertFalse(head.contains("<script>"));
		assertFalse(head.contains("\"x\""));
		assertTrue(head.contains("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Co&#39; $1 \\0"));
		assertTrue(head.contains("href=\"https://r.example/venues/1?a=&quot;b&quot;&amp;c=&lt;d&gt;\""));
		assertTrue(head.contains("content=\"https://r.example/i&#39;mg\""));
	}

	@Test
	void spliceReplacesTheShellTitleInPlaceAndKeepsReplacementCharactersLiteral() {
		String shell = page("Bar $1 \\ Riviera", null, null).applyTo(SHELL);

		assertFalse(shell.contains("<title>Riviera</title>"));
		assertEquals(1, shell.split("<title>", -1).length - 1);
		assertTrue(shell.contains("<title>Bar $1 \\ Riviera</title>"));
		assertTrue(shell.indexOf("<title>") < shell.indexOf("<base href"), "the head stays where the title was");
	}

	@Test
	void spliceIntoAShellWithoutATitleGoesBeforeTheHeadsEnd() {
		String shell = page("Riviera", null, null).applyTo("<html><head><meta charset=\"utf-8\"></head><body></body></html>");

		assertTrue(shell.startsWith("<html><head><meta charset=\"utf-8\"><title>Riviera</title>"));
		assertTrue(shell.endsWith("content=\"summary\"></head><body></body></html>"));
	}

	@Test
	void shellWithoutAHeadIsServedUnchanged() {
		assertEquals("<p>no head</p>", page("Riviera", null, null).applyTo("<p>no head</p>"));
	}

	@Test
	void theSourceShellHasTheOneTitleTheSpliceReplaces() throws IOException {
		String source = Files.readString(SOURCE_SHELL, StandardCharsets.UTF_8);

		assertEquals(1, source.split("<title>", -1).length - 1, "frontend/src/index.html must keep one <title>");
		assertTrue(source.contains("</title>") && source.contains("</head>"));
	}
}
