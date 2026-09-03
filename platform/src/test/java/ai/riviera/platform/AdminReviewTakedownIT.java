package ai.riviera.platform;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.operator.api.OperatorProvisioning;
import ai.riviera.platform.review.api.VenueRatingSummary;
import ai.riviera.platform.review.vocabulary.RatingSummary;
import ai.riviera.platform.review.vocabulary.VenueRef;
import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The platform-admin review takedown end to end: the admin lists a venue's reviews with hidden ones
 * marked, hides one and un-hides it, and the aggregate follows; the three routes admit only the
 * {@code ADMIN} role ({@code 401} anonymous, {@code 403} a plain operator — the
 * {@code AdminPhotoTakedownIT} cast, for the same reason: the bootstrap admin carries both roles);
 * an unknown review is {@code 404 NO_SUCH_REVIEW}; and both mutating actions leave a row in
 * {@code admin_audit_record} through the edge's audit filter, with the review id legible in the path.
 * Testcontainers Postgres; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=review-admin-pw")
@AutoConfigureMockMvc
class AdminReviewTakedownIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "review-admin-pw";
	private static final String PLAIN_OPERATOR = "review-takedown-plain-op";
	private static final String PLAIN_OPERATOR_PW = "plain-op-pw-123";
	private static final String LIST_PATH = "/api/admin/venues/{v}/reviews";
	private static final String HIDE_PATH = "/api/admin/reviews/{id}/hide";
	private static final String UNHIDE_PATH = "/api/admin/reviews/{id}/unhide";
	private static final Instant CHECKED_IN = Instant.parse("2026-07-01T16:00:00Z");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	OperatorProvisioning provisioning;
	@Autowired
	PasswordEncoder encoder;
	@Autowired
	VenueRatingSummary summary;

	private ReviewFixtures fixtures;

	@BeforeEach
	void setUp() {
		fixtures = new ReviewFixtures(jdbc);
		jdbc.sql("DELETE FROM admin_audit_record WHERE path LIKE '/api/admin/reviews/%'").update();
		jdbc.sql("DELETE FROM operator WHERE username = :u").param("u", PLAIN_OPERATOR).update();
		provisioning.provision(PLAIN_OPERATOR, encoder.encode(PLAIN_OPERATOR_PW));
	}

	@Test
	void adminHidesAndUnhides() throws Exception {
		long venueId = fixtures.venue("Takedown Flow");
		long kept = review(venueId, 5, "Lovely");
		long spam = review(venueId, 1, "Spam");
		Cookie admin = adminSession();

		mvc.perform(get(LIST_PATH, venueId).cookie(admin))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reviews[0].id").value(spam))
				.andExpect(jsonPath("$.reviews[0].hiddenAt").value(nullValue()))
				.andExpect(jsonPath("$.reviews[0].comment").value("Spam"))
				.andExpect(jsonPath("$.reviews[0].stayedIn").value("2026-07"))
				.andExpect(jsonPath("$.reviews[0].createdAt").value(notNullValue()))
				.andExpect(jsonPath("$.reviews[1].id").value(kept))
				.andExpect(jsonPath("$.nextCursor").value(nullValue()));

		mvc.perform(post(HIDE_PATH, spam).cookie(admin).with(csrf())).andExpect(status().isNoContent());
		mvc.perform(post(HIDE_PATH, spam).cookie(admin).with(csrf())).andExpect(status().isNoContent());

		mvc.perform(get(LIST_PATH, venueId).cookie(admin))
				.andExpect(jsonPath("$.reviews[0].hiddenAt").value(notNullValue()))
				.andExpect(jsonPath("$.reviews[1].hiddenAt").value(nullValue()));
		assertThat(summary.summaryFor(new VenueRef(venueId))).isEqualTo(new RatingSummary(50, 1));

		mvc.perform(post(UNHIDE_PATH, spam).cookie(admin).with(csrf())).andExpect(status().isNoContent());

		mvc.perform(get(LIST_PATH, venueId).cookie(admin))
				.andExpect(jsonPath("$.reviews[0].hiddenAt").value(nullValue()));
		assertThat(summary.summaryFor(new VenueRef(venueId))).isEqualTo(new RatingSummary(30, 2));
	}

	@Test
	void takedownIsAdminOnly() throws Exception {
		long venueId = fixtures.venue("Takedown Roles");
		long id = review(venueId, 2, "Meh");
		Cookie operator = plainOperatorSession();

		mvc.perform(get(LIST_PATH, venueId)).andExpect(status().isUnauthorized());
		mvc.perform(post(HIDE_PATH, id).with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(post(UNHIDE_PATH, id).with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(get(LIST_PATH, venueId).cookie(operator)).andExpect(status().isForbidden());
		mvc.perform(post(HIDE_PATH, id).cookie(operator).with(csrf())).andExpect(status().isForbidden());
		mvc.perform(post(UNHIDE_PATH, id).cookie(operator).with(csrf())).andExpect(status().isForbidden());

		assertThat(summary.summaryFor(new VenueRef(venueId))).isEqualTo(new RatingSummary(20, 1));
	}

	@Test
	void unknownReviewIs404() throws Exception {
		Cookie admin = adminSession();

		mvc.perform(post(HIDE_PATH, Long.MAX_VALUE).cookie(admin).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_REVIEW"));
		mvc.perform(post(UNHIDE_PATH, Long.MAX_VALUE).cookie(admin).with(csrf()))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_REVIEW"));
	}

	@Test
	void rejectsANonPositiveCursor() throws Exception {
		mvc.perform(get(LIST_PATH, 1).param("cursor", "0").cookie(adminSession()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
	}

	@Test
	void hideAndUnhideAreAudited() throws Exception {
		long venueId = fixtures.venue("Takedown Audit");
		long id = review(venueId, 1, "Abuse");
		Cookie admin = adminSession();

		mvc.perform(post(HIDE_PATH, id).cookie(admin).with(csrf())
				.header("X-Audit-Reason", "reported by the venue — abusive"))
				.andExpect(status().isNoContent());
		mvc.perform(post(UNHIDE_PATH, id).cookie(admin).with(csrf())).andExpect(status().isNoContent());

		List<Map<String, Object>> rows = jdbc.sql("""
				SELECT actor, method, path, status, reason FROM admin_audit_record
				WHERE path LIKE :prefix ORDER BY id
				""")
				.param("prefix", "/api/admin/reviews/" + id + "/%")
				.query().listOfRows();
		assertThat(rows).hasSize(2);
		assertThat(rows.get(0)).containsEntry("actor", ADMIN).containsEntry("method", "POST")
				.containsEntry("path", "/api/admin/reviews/" + id + "/hide").containsEntry("status", 204)
				.containsEntry("reason", "reported by the venue — abusive");
		assertThat(rows.get(1)).containsEntry("path", "/api/admin/reviews/" + id + "/unhide")
				.containsEntry("status", 204).containsEntry("reason", null);
	}

	private long review(long venueId, int stars, String comment) {
		return fixtures.review(fixtures.completedBooking(venueId, CHECKED_IN), stars, comment, "Guest");
	}

	private Cookie adminSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW);
	}

	private Cookie plainOperatorSession() throws Exception {
		return SessionLoginSupport.operatorSession(mvc, PLAIN_OPERATOR, PLAIN_OPERATOR_PW);
	}
}
