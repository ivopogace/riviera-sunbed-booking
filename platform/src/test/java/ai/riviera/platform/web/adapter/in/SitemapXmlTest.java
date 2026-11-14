package ai.riviera.platform.web.adapter.in;

import java.io.StringReader;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@link SitemapXml} against the sitemaps.org shape (a {@code urlset} of {@code url}s, each one absolute {@code https}
 * {@code loc}) and Google's {@code hreflang} rule: every {@code url} lists all its locale forms plus
 * {@code x-default}.
 */
class SitemapXmlTest {

	private static final String ORIGIN = "https://riviera.example";

	@Test
	void everyTouristPageAppearsInEveryLocaleOnTheOriginAsAbsoluteHttps() throws Exception {
		Document document = parse(SitemapXml.render(ORIGIN, List.of(new VenueId(3), new VenueId(11))));

		Element urlset = document.getDocumentElement();
		assertEquals(SitemapXml.SITEMAP_NS, urlset.getNamespaceURI());
		assertEquals("urlset", urlset.getLocalName());
		List<String> locs = locs(document);
		assertEquals(List.of(
				ORIGIN + "/", ORIGIN + "/sq/", ORIGIN + "/it/",
				ORIGIN + "/for-venues", ORIGIN + "/sq/for-venues", ORIGIN + "/it/for-venues",
				ORIGIN + "/help", ORIGIN + "/sq/help", ORIGIN + "/it/help",
				ORIGIN + "/venues/3", ORIGIN + "/sq/venues/3", ORIGIN + "/it/venues/3",
				ORIGIN + "/venues/11", ORIGIN + "/sq/venues/11", ORIGIN + "/it/venues/11"), locs);
		for (String loc : locs) {
			URI uri = URI.create(loc);
			assertEquals("https", uri.getScheme(), loc);
			assertEquals("riviera.example", uri.getHost(), loc);
		}
	}

	@Test
	void everyUrlListsAllItsLocaleFormsAndTheSourceAsDefault() throws Exception {
		Document document = parse(SitemapXml.render(ORIGIN, List.of(new VenueId(3))));

		NodeList urls = document.getElementsByTagNameNS(SitemapXml.SITEMAP_NS, "url");
		for (int i = 0; i < urls.getLength(); i++) {
			Element url = (Element) urls.item(i);
			String loc = url.getElementsByTagNameNS(SitemapXml.SITEMAP_NS, "loc").item(0).getTextContent();
			String page = loc.replaceFirst("^" + ORIGIN + "(/sq|/it)?", "");
			page = page.isEmpty() ? "/" : page;
			List<String> alternates = new ArrayList<>();
			NodeList links = url.getElementsByTagNameNS(SitemapXml.XHTML_NS, "link");
			for (int j = 0; j < links.getLength(); j++) {
				Element link = (Element) links.item(j);
				assertEquals("alternate", link.getAttribute("rel"));
				alternates.add(link.getAttribute("hreflang") + " " + link.getAttribute("href"));
			}
			String en = ORIGIN + page;
			assertEquals(List.of("en " + en, "sq " + ORIGIN + "/sq" + page, "it " + ORIGIN + "/it" + page,
					"x-default " + en), alternates, loc);
		}
		assertEquals(4 * 3, urls.getLength(), "four pages in three locales");
	}

	@Test
	void noVenuesStillListsTheFixedPages() throws Exception {
		assertEquals(9, locs(parse(SitemapXml.render(ORIGIN, List.of()))).size());
	}

	@Test
	void theDocumentDeclaresUtf8() {
		assertTrue(SitemapXml.render(ORIGIN, List.of()).startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
	}

	private static List<String> locs(Document document) {
		NodeList nodes = document.getElementsByTagNameNS(SitemapXml.SITEMAP_NS, "loc");
		List<String> locs = new ArrayList<>();
		for (int i = 0; i < nodes.getLength(); i++) {
			locs.add(nodes.item(i).getTextContent());
		}
		return locs;
	}

	private static Document parse(String xml) throws Exception {
		DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
		factory.setNamespaceAware(true);
		factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
		factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
		factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
		return factory.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
	}
}
