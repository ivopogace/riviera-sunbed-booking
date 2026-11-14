package ai.riviera.platform.web.adapter.in;

import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;

import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code sitemap.xml} body (sitemaps.org 0.9): each tourist page in every served locale, each {@code url}
 * listing all its locale forms as {@code xhtml:link} alternates plus {@code x-default} (the source locale), as
 * Google's {@code hreflang} guidance asks. Only fixed pages and venue ids appear, never a booking path (#7).
 */
final class SitemapXml {

	static final String SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
	static final String XHTML_NS = "http://www.w3.org/1999/xhtml";

	/** The tourist pages besides each venue's, as SPA paths. */
	static final List<String> FIXED_PAGES = List.of("/", "/for-venues", "/help");

	private static final String X_DEFAULT = "x-default";

	private SitemapXml() {
	}

	/** The body for {@code origin} (no trailing slash) and the tourist-visible {@code venues}. */
	static String render(String origin, List<VenueId> venues) {
		List<String> pages = new ArrayList<>(FIXED_PAGES);
		venues.forEach(venue -> pages.add("/venues/" + venue.value()));
		StringWriter body = new StringWriter();
		try {
			XMLStreamWriter xml = XMLOutputFactory.newFactory().createXMLStreamWriter(body);
			xml.writeStartDocument("UTF-8", "1.0");
			xml.setDefaultNamespace(SITEMAP_NS);
			xml.setPrefix("xhtml", XHTML_NS);
			xml.writeStartElement(SITEMAP_NS, "urlset");
			xml.writeDefaultNamespace(SITEMAP_NS);
			xml.writeNamespace("xhtml", XHTML_NS);
			for (String page : pages) {
				for (SpaLocale locale : SpaLocale.values()) {
					writeUrl(xml, origin, page, locale);
				}
			}
			xml.writeEndElement();
			xml.writeEndDocument();
			xml.close();
		} catch (XMLStreamException e) {
			throw new IllegalStateException("could not write the sitemap", e);
		}
		return body.toString();
	}

	private static void writeUrl(XMLStreamWriter xml, String origin, String page, SpaLocale locale)
			throws XMLStreamException {
		xml.writeStartElement(SITEMAP_NS, "url");
		xml.writeStartElement(SITEMAP_NS, "loc");
		xml.writeCharacters(origin + locale.path(page));
		xml.writeEndElement();
		for (SpaLocale alternate : SpaLocale.values()) {
			writeAlternate(xml, alternate.code(), origin + alternate.path(page));
		}
		writeAlternate(xml, X_DEFAULT, origin + SpaLocale.EN.path(page));
		xml.writeEndElement();
	}

	private static void writeAlternate(XMLStreamWriter xml, String hreflang, String href) throws XMLStreamException {
		xml.writeEmptyElement(XHTML_NS, "link");
		xml.writeAttribute("rel", "alternate");
		xml.writeAttribute("hreflang", hreflang);
		xml.writeAttribute("href", href);
	}
}
