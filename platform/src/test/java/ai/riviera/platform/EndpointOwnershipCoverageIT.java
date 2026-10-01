package ai.riviera.platform;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.CurrentOperator;
import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;

/**
 * Invariant #13 over the whole surface: every mutating {@code /api/venues/{venueId}/**} endpoint
 * Spring maps answers a non-owning operator {@code 403 NOT_VENUE_OWNER}, unless {@link #DECLARED_EXEMPT}.
 * An endpoint whose body is parsed before the ownership check needs an entry in {@link #VALID_INPUTS},
 * or it answers {@code 400} and fails here as unverified. Sibling of {@link EndpointRoleGateCoverageTest};
 * per-endpoint ordering and the owner's side stay in {@link CrossVenueDenialIT}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"riviera.operator.password=test-operator-pw", "riviera.altcha.enabled=false"})
@AutoConfigureMockMvc
class EndpointOwnershipCoverageIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final String NON_OWNER = "op-ownership-probe";
	private static final String VENUE_SCOPED_PREFIX = "/api/venues/{venueId}";
	private static final String APPLICATION_PACKAGE = "ai.riviera.platform";
	private static final String NOT_VENUE_OWNER = "NOT_VENUE_OWNER";

	/** Mutating venue-scoped endpoints that are not ownership-gated, keyed to the reason why. */
	private static final Map<String, String> DECLARED_EXEMPT = Map.of();

	private static final String SET_BODY = """
			{"rowLabel":"A","positionNo":1,"tier":"STANDARD","pool":"ONLINE",
			 "price":{"minorUnits":3000,"currency":"EUR"},"gridX":1,"gridY":1}
			""";
	private static final String LAYOUT_BODY = """
			{"sets":[%s],"expectedVersion":0,"previewToken":"v1"}
			""".formatted(SET_BODY);
	private static final String PROFILE_BODY = """
			{"name":"Edited","beach":"KSAMIL","description":"x",
			 "bookingMode":"INSTANT","bookingCutoff":"18:00","salesClose":"16:00",
			 "amenities":["BEACH_BAR"],"distanceToWaterM":15,"expectedVersion":0}
			""";
	private static final String SAMPLE_DATE = "2035-07-01";

	/** Request inputs that pass parsing, so the probe reaches the ownership check (parse-then-authorize). */
	private static final Map<String, Function<MockHttpServletRequestBuilder, RequestBuilder>> VALID_INPUTS =
			Map.ofEntries(
					Map.entry("PATCH /api/venues/{venueId}", json(PROFILE_BODY)),
					Map.entry("POST /api/venues/{venueId}/sets", json(SET_BODY)),
					Map.entry("PATCH /api/venues/{venueId}/sets/{setId}", json(SET_BODY)),
					Map.entry("PATCH /api/venues/{venueId}/sets",
							json("{\"setIds\":[1],\"tier\":\"PREMIUM\",\"expectedVersion\":0}")),
					Map.entry("PUT /api/venues/{venueId}/beach-map", json(LAYOUT_BODY)),
					Map.entry("POST /api/venues/{venueId}/beach-map/preview", json(LAYOUT_BODY)),
					Map.entry("POST /api/venues/{venueId}/beach-map/commit", json(LAYOUT_BODY)),
					Map.entry("PUT /api/venues/{venueId}/rows/{rowLabel}/price",
							json("{\"price\":{\"minorUnits\":9999,\"currency\":\"EUR\"},\"expectedVersion\":0}")),
					Map.entry("PUT /api/venues/{venueId}/rows/{rowLabel}/name",
							json("{\"newLabel\":\"Back row\",\"expectedVersion\":0}")),
					Map.entry("POST /api/venues/{venueId}/sets/{setId}/availability",
							json("{\"date\":\"" + SAMPLE_DATE + "\"}")),
					Map.entry("DELETE /api/venues/{venueId}/sets/{setId}/availability", dateParam()),
					Map.entry("POST /api/venues/{venueId}/bookings/{code}/day-refund", dateParam()),
					Map.entry("POST /api/venues/{venueId}/weather-refund", dateParam()),
					// venueId 1 matches EndpointProbes' default sample; a multipart body needs its own builder.
					Map.entry("POST /api/venues/{venueId}/photos/{slot}", probe -> (RequestBuilder) multipart(
							"/api/venues/1/photos/cover")
							.file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", tinyJpeg()))
							.merge(probe)));

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	RequestMappingHandlerMapping handlerMapping;

	/** The identity seam only; the ownership check is the real DB-backed bean. */
	@MockitoBean
	CurrentOperator currentOperator;

	private RequestPostProcessor operatorSession;

	@BeforeEach
	void actAsAnOperatorOwningNoVenue() throws Exception {
		Cookie session = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		operatorSession = request -> {
			request.setCookies(session);
			return request;
		};
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", NON_OWNER).update();
		long id = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", NON_OWNER).query(Long.class).single();
		when(currentOperator.require(any())).thenReturn(new OperatorId(id));
	}

	@Test
	void everyMutatingVenueScopedEndpointDeniesANonOwner() throws Exception {
		List<String> violations = new ArrayList<>();
		Set<String> endpoints = mutatingVenueScopedEndpoints();

		assertThat(endpoints).as("declared exemptions must still be mapped").containsAll(DECLARED_EXEMPT.keySet());
		assertThat(endpoints).as("every VALID_INPUTS key must still be mapped").containsAll(VALID_INPUTS.keySet());

		for (String endpoint : endpoints) {
			if (DECLARED_EXEMPT.containsKey(endpoint)) {
				continue;
			}
			RequestBuilder probe = VALID_INPUTS.getOrDefault(endpoint, request -> request)
					.apply(EndpointProbes.probe(endpoint, operatorSession));
			MvcResult result = mvc.perform(probe).andReturn();
			int status = result.getResponse().getStatus();
			String body = result.getResponse().getContentAsString();
			if (status != HttpStatus.FORBIDDEN.value() || !NOT_VENUE_OWNER.equals(problemCode(body))) {
				violations.add(endpoint + " answered a non-owner " + status + " " + body
						+ " — assert ownership first in the service, or give it VALID_INPUTS if the request "
						+ "failed parsing, or add it to DECLARED_EXEMPT with the reason");
			}
		}

		assertThat(violations).as("every mutating venue-scoped endpoint must deny a non-owner").isEmpty();
	}

	private static Function<MockHttpServletRequestBuilder, RequestBuilder> json(String body) {
		return probe -> probe.content(body);
	}

	private static Function<MockHttpServletRequestBuilder, RequestBuilder> dateParam() {
		return probe -> probe.param("date", SAMPLE_DATE);
	}

	private static byte[] tinyJpeg() {
		var out = new ByteArrayOutputStream();
		try {
			ImageIO.write(new BufferedImage(80, 60, BufferedImage.TYPE_INT_RGB), "jpg", out);
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		return out.toByteArray();
	}

	private static String problemCode(String body) {
		return body.contains("\"code\"") ? JsonPath.read(body, "$.code") : null;
	}

	/** Every mapped non-GET {@code VERB pattern} under {@value #VENUE_SCOPED_PREFIX}, sorted. */
	private Set<String> mutatingVenueScopedEndpoints() {
		Set<String> endpoints = new TreeSet<>();
		handlerMapping.getHandlerMethods().forEach((info, handler) -> {
			if (!handler.getBeanType().getPackageName().startsWith(APPLICATION_PACKAGE)) {
				return;
			}
			info.getMethodsCondition().getMethods().stream()
					.filter(method -> method != RequestMethod.GET)
					.forEach(method -> info.getPatternValues().stream()
							.filter(pattern -> pattern.startsWith(VENUE_SCOPED_PREFIX))
							.forEach(pattern -> endpoints.add(method + " " + pattern)));
		});
		assertThat(endpoints).as("no venue-scoped write is mapped — the enumeration broke").isNotEmpty();
		return endpoints;
	}
}
