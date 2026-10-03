package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.WebSliceStubs;
import ai.riviera.platform.challenge.api.ProofOfWorkChallenges;
import ai.riviera.platform.challenge.vocabulary.ChallengeVerdict;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.StringJoiner;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Named;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import jakarta.servlet.ServletContext;
import jakarta.servlet.ServletInputStream;

import static ai.riviera.platform.WebSliceStubs.fromIp;
import static ai.riviera.platform.web.adapter.in.RequestBodyCapFilter.MAX_BODY_BYTES;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The {@code /api/**} body cap through the real API chain (#1414): 64 KiB, the Stripe webhook 1 MiB,
 * multipart exempt, refused {@code 413} ahead of CSRF and the proof-of-work claim. Each request comes
 * from its own client IP, so the shared per-IP budgets never answer instead of the cap.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class RequestBodyCapFilterTest {

	private static final int CAP = 64 * 1024;
	private static final int WEBHOOK_CAP = 1024 * 1024;

	private static final String CREATE_PATH = "/api/bookings";
	private static final String RESET_PASSWORD_PATH = "/api/auth/customer/reset-password";
	private static final String REVIEW_PATH = "/api/bookings/SOMECODE/review";
	private static final String LAYOUT_PATH = "/api/venues/1/beach-map";
	private static final int LAYOUT_CAP = 256 * 1024;
	private static final int MAX_ROWS = 26;
	private static final int MAX_POSITIONS = 40;
	private static final int MAX_ROW_LABEL_LENGTH = 40;
	private static final String WEBHOOK_PATH = "/api/payments/stripe/webhook";
	private static final String CHALLENGE_HEADER = "X-Altcha-Payload";

	private static final String CREATE_BODY_HEAD = """
			{"setId":1,"bookingDate":"2030-01-01",\
			"contact":{"email":"cap@example.com","fullName":"Cap Guest","phone":"+355699"},"pad":\"""";
	private static final String RESET_BODY_HEAD = """
			{"token":"not-a-real-token","newPassword":"passphrase-123","pad":\"""";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	ProofOfWorkChallenges challenges;

	@BeforeEach
	void fenceOnAndEverySolutionVerifies() {
		when(challenges.enabled()).thenReturn(true);
		when(challenges.verify(any())).thenReturn(ChallengeVerdict.VERIFIED);
	}

	@Test
	void anOversizedCreateIsRefused413BeforeItsChallengeIsClaimed() throws Exception {
		expectBodyTooLarge(mvc.perform(jsonPost(CREATE_PATH, padded(CREATE_BODY_HEAD, CAP + 1024))
				.header(CHALLENGE_HEADER, "solved")));
		verify(challenges, never()).verify(any());
	}

	@Test
	void anOversizedCreateWithoutAChallengeIs413NotChallengeRequired() throws Exception {
		expectBodyTooLarge(mvc.perform(jsonPost(CREATE_PATH, padded(CREATE_BODY_HEAD, CAP + 1024))));
	}

	@Test
	void anOversizedCsrfGuardedPostWithoutATokenIs413NotForbidden() throws Exception {
		expectBodyTooLarge(mvc.perform(jsonPost(RESET_PASSWORD_PATH, padded(RESET_BODY_HEAD, CAP + 1))));
	}

	@Test
	void aCreateUnderTheCapReachesTheController() throws Exception {
		mvc.perform(jsonPost(CREATE_PATH, padded(CREATE_BODY_HEAD, CAP - 1024)).header(CHALLENGE_HEADER, "solved"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
	}

	@Test
	void aBodyExactlyAtTheCapIsBoundAndOneByteOverIsRefused() throws Exception {
		mvc.perform(jsonPost(RESET_PASSWORD_PATH, padded(RESET_BODY_HEAD, CAP)).with(csrf()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));
		expectBodyTooLarge(mvc.perform(jsonPost(RESET_PASSWORD_PATH, padded(RESET_BODY_HEAD, CAP + 1)).with(csrf())));
	}

	@Test
	void aChunkedBodyPastTheCapIsRefused() throws Exception {
		expectBodyTooLarge(mvc.perform(chunkedJsonPost(RESET_PASSWORD_PATH, padded(RESET_BODY_HEAD, CAP + 1))));
	}

	@Test
	void aChunkedBodyWithinTheCapIsReplayedToTheController() throws Exception {
		mvc.perform(chunkedJsonPost(RESET_PASSWORD_PATH, padded(RESET_BODY_HEAD, CAP)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_OR_EXPIRED_TOKEN"));
	}

	@ParameterizedTest
	@ValueSource(strings = {"PUT", "PATCH"})
	void putAndPatchBodiesAreCappedToo(String method) throws Exception {
		MockHttpServletRequestBuilder request = "PUT".equals(method) ? put(REVIEW_PATH) : patch(REVIEW_PATH);
		expectBodyTooLarge(mvc.perform(request.with(fromIp(SessionLoginSupport.uniqueClientIp()))
				.contentType(MediaType.APPLICATION_JSON).content(padded("{\"pad\":\"", CAP + 1))));
	}

	@Test
	void aMultipartPhotoUploadIsLeftToTheMultipartLimits() throws Exception {
		String boundary = "cap-boundary";
		byte[] body = ("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"p.jpg\"\r\n"
				+ "Content-Type: image/jpeg\r\n\r\n" + "x".repeat(2 * 1024 * 1024) + "\r\n--" + boundary + "--\r\n")
				.getBytes(StandardCharsets.US_ASCII);
		int status = mvc.perform(post("/api/venues/1/photos/hero").with(csrf()).with(user("cap-operator").roles("OPERATOR"))
						.with(fromIp(SessionLoginSupport.uniqueClientIp()))
						.contentType("multipart/form-data; boundary=" + boundary).content(body))
				.andReturn().getResponse().getStatus();
		assertNotEquals(413, status);
	}

	@Test
	void aMultipartBodyOnAnyOtherRouteIsCapped() throws Exception {
		expectBodyTooLarge(mvc.perform(post(CREATE_PATH).with(fromIp(SessionLoginSupport.uniqueClientIp()))
				.contentType("multipart/form-data; boundary=cap-boundary").content(new byte[CAP + 1])));
	}

	@Test
	void aWebhookBodyPastTheGeneralCapReachesTheController() throws Exception {
		mvc.perform(jsonPost(WEBHOOK_PATH, padded("{\"pad\":\"", CAP * 2)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_SIGNATURE"));
	}

	@Test
	void aWebhookBodyPastItsOwnCapIsRefused() throws Exception {
		expectBodyTooLarge(mvc.perform(jsonPost(WEBHOOK_PATH, padded("{\"pad\":\"", WEBHOOK_CAP + 1))));
		expectBodyTooLarge(mvc.perform(chunkedJsonPost(WEBHOOK_PATH, padded("{\"pad\":\"", WEBHOOK_CAP + 1))));
	}

	@Test
	void aLoginBodyIsCappedByTheRateLimiterAlone() throws Exception {
		mvc.perform(new ChunkedRequestBuilder("/api/auth/operator/login").with(csrf())
						.with(fromIp(SessionLoginSupport.uniqueClientIp()))
						.contentType(MediaType.APPLICATION_JSON).content(padded("{\"username\":\"", 9 * 1024)))
				.andExpect(status().is(413))
				.andExpect(header().string("Connection", "close"));
	}

	@Test
	void aBodyCappedUpstreamIsNeverReadAgain() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/operator/login") {
			@Override
			public long getContentLengthLong() {
				return -1;
			}

			@Override
			public ServletInputStream getInputStream() {
				throw new AssertionError("an upstream-capped body was read again");
			}
		};
		MockFilterChain chain = new MockFilterChain();
		new RequestBodyCapFilter(ignored -> true).doFilter(request, new MockHttpServletResponse(), chain);
		assertSame(request, chain.getRequest());
	}

	@Test
	void aBodyOutsideTheApiIsLeftAlone() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/actuator/anything");
		request.setContent(new byte[MAX_BODY_BYTES + 1]);
		MockFilterChain chain = new MockFilterChain();
		new RequestBodyCapFilter(ignored -> false).doFilter(request, new MockHttpServletResponse(), chain);
		assertSame(request, chain.getRequest());
	}

	static List<Named<MockHttpServletRequestBuilder>> layoutWrites() {
		return List.of(Named.of("layout save", put(LAYOUT_PATH)),
				Named.of("remodel preview", post(LAYOUT_PATH + "/preview")),
				Named.of("remodel commit", post(LAYOUT_PATH + "/commit")));
	}

	@ParameterizedTest
	@MethodSource("layoutWrites")
	void aFullSizeLayoutWithTheLongestRowLabelsIsNotRefused(MockHttpServletRequestBuilder layoutWrite)
			throws Exception {
		byte[] body = largestLayout().getBytes(StandardCharsets.UTF_8);
		assertTrue(body.length > CAP * 3, "a full layout must be well past the general cap");
		int status = mvc.perform(asOperator(layoutWrite).content(body)).andReturn().getResponse().getStatus();
		assertNotEquals(413, status);
	}

	@ParameterizedTest
	@MethodSource("layoutWrites")
	void aLayoutBodyPastItsOwnCapIsRefused(MockHttpServletRequestBuilder layoutWrite) throws Exception {
		expectBodyTooLarge(mvc.perform(asOperator(layoutWrite).content(padded("{\"pad\":\"", LAYOUT_CAP + 1))));
	}

	@Test
	void anotherMethodOnTheLayoutPathKeepsTheGeneralCap() throws Exception {
		expectBodyTooLarge(mvc.perform(asOperator(patch(LAYOUT_PATH)).content(padded("{\"pad\":\"", CAP + 1))));
	}

	private static MockHttpServletRequestBuilder asOperator(MockHttpServletRequestBuilder request) {
		return request.with(csrf()).with(user("cap-operator").roles("OPERATOR"))
				.with(fromIp(SessionLoginSupport.uniqueClientIp())).contentType(MediaType.APPLICATION_JSON);
	}

	/** {@code LayoutCommand.MAX_SETS} cells on 40-character, two-byte (Albanian) row labels: the largest real layout. */
	private static String largestLayout() {
		StringJoiner cells = new StringJoiner(",", "{\"expectedVersion\":1,\"previewToken\":\"" + "t".repeat(64)
				+ "\",\"refundCount\":0,\"sets\":[", "]}");
		for (int row = 0; row < MAX_ROWS; row++) {
			String label = "\u00c7".repeat(MAX_ROW_LABEL_LENGTH - 1) + (char) ('A' + row);
			for (int position = 1; position <= MAX_POSITIONS; position++) {
				cells.add(("{\"rowLabel\":\"%s\",\"positionNo\":%d,\"tier\":\"STANDARD\",\"pool\":\"WALK_IN\","
						+ "\"price\":{\"minorUnits\":250000,\"currency\":\"EUR\"},\"gridX\":%d,\"gridY\":%d}")
						.formatted(label, position, position, row));
			}
		}
		return cells.toString();
	}

	private static MockHttpServletRequestBuilder jsonPost(String path, String body) {
		return post(path).with(fromIp(SessionLoginSupport.uniqueClientIp()))
				.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static ChunkedRequestBuilder chunkedJsonPost(String path, String body) {
		return new ChunkedRequestBuilder(path).with(csrf()).with(fromIp(SessionLoginSupport.uniqueClientIp()))
				.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	/** {@code head} + padding + {@code "}}, exactly {@code size} bytes of ASCII JSON. */
	static String padded(String head, int size) {
		return head + "x".repeat(size - head.length() - 2) + "\"}";
	}

	static void expectBodyTooLarge(ResultActions refused) throws Exception {
		refused.andExpect(status().is(413))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"))
				.andExpect(jsonPath("$.status").value(413))
				.andExpect(jsonPath("$.instance").doesNotExist())
				.andExpect(header().doesNotExist("Connection"));
	}

	/** A POST whose request reports no Content-Length, as a chunked body does. */
	static final class ChunkedRequestBuilder extends AbstractMockHttpServletRequestBuilder<ChunkedRequestBuilder> {

		ChunkedRequestBuilder(String path) {
			super(HttpMethod.POST);
			uri(path);
		}

		@Override
		protected MockHttpServletRequest createServletRequest(ServletContext servletContext) {
			return new MockHttpServletRequest(servletContext) {
				@Override
				public int getContentLength() {
					return -1;
				}

				@Override
				public long getContentLengthLong() {
					return -1;
				}
			};
		}
	}
}
