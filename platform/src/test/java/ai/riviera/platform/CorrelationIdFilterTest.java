package ai.riviera.platform;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Issue #100 (D4), AC-1: the correlation-id filter puts a traceable id in the MDC for the duration of
 * the request, echoes it in the response header, clears it afterwards, and never reflects an unsafe
 * inbound value verbatim (log-injection guard, {@code riviera-java-conventions} §10). A plain unit
 * test — no Spring context, no Docker.
 */
class CorrelationIdFilterTest {

	private final CorrelationIdFilter filter = new CorrelationIdFilter();

	@AfterEach
	void clearMdc() {
		MDC.clear();
	}

	/** Captures the MDC value seen DURING the chain — the id is only meaningful while the request runs. */
	private static AtomicReference<String> runThroughFilter(CorrelationIdFilter filter, MockHttpServletRequest request,
			MockHttpServletResponse response) throws Exception {
		AtomicReference<String> seenDuringChain = new AtomicReference<>();
		FilterChain chain = (req, res) -> seenDuringChain.set(MDC.get(CorrelationIdFilter.MDC_KEY));
		filter.doFilter(request, response, chain);
		return seenDuringChain;
	}

	@Test
	void stampsMdcAndResponseHeaderThenClears() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest();
		MockHttpServletResponse response = new MockHttpServletResponse();

		String duringChain = runThroughFilter(filter, request, response).get();

		assertNotNull(duringChain, "correlation id must be in the MDC while the chain runs");
		assertEquals(duringChain, response.getHeader(CorrelationIdFilter.HEADER), "echoed in the response header");
		assertNull(MDC.get(CorrelationIdFilter.MDC_KEY), "MDC must be cleared after the request");
	}

	@Test
	void reusesAValidInboundHeader() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader(CorrelationIdFilter.HEADER, "abc-123_DEF");
		MockHttpServletResponse response = new MockHttpServletResponse();

		assertEquals("abc-123_DEF", runThroughFilter(filter, request, response).get());
		assertEquals("abc-123_DEF", response.getHeader(CorrelationIdFilter.HEADER));
	}

	@Test
	void regeneratesWhenInboundHeaderCarriesCrlf() throws Exception {
		String forged = "good\r\nX-Injected: evil";
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader(CorrelationIdFilter.HEADER, forged);
		MockHttpServletResponse response = new MockHttpServletResponse();

		String used = runThroughFilter(filter, request, response).get();

		assertNotEquals(forged, used, "a forged CRLF value must never be reflected verbatim");
		assertFalse(used.contains("\n") || used.contains("\r"), "the id must not contain newlines");
		assertDoesNotThrow(() -> java.util.UUID.fromString(used), "a rejected inbound value yields a fresh UUID");
	}

	@Test
	void regeneratesWhenInboundHeaderIsTooLong() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.addHeader(CorrelationIdFilter.HEADER, "x".repeat(65));
		MockHttpServletResponse response = new MockHttpServletResponse();

		assertDoesNotThrow(() -> java.util.UUID.fromString(runThroughFilter(filter, request, response).get()));
	}
}
