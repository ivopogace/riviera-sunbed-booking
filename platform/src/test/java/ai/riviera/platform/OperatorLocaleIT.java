package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;
import ai.riviera.platform.shared.SiteLocale;
import jakarta.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The operator's language (#1785) against Testcontainers Postgres: the register stores the build locale it
 * names, the console's language row rewrites it, and the approval notice follows the stored one; a row with
 * none reads as English. Every {@link SiteLocale} is stored, so a code {@code operator_locale_check} does not
 * list fails here.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class OperatorLocaleIT {

	private static final String ADMIN = "operator";
	private static final String ADMIN_PW = "test-operator-pw";
	private static final String PENDING_PW = "pending-op-pw-123";
	private static final String LOCALE_PATH = "/api/auth/operator/locale";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;
	@Autowired
	MockMailer mailer;

	@BeforeEach
	void clean() {
		jdbc.sql("DELETE FROM operator_venue WHERE operator_id IN "
				+ "(SELECT id FROM operator WHERE username LIKE 'op-locale-%')").update();
		jdbc.sql("DELETE FROM operator WHERE username LIKE 'op-locale-%'").update();
		mailer.clear();
	}

	@ParameterizedTest
	@EnumSource(SiteLocale.class)
	void theRegisterStoresTheLocaleItNames(SiteLocale locale) throws Exception {
		String username = "op-locale-reg-" + locale.code();

		register(username, ",\"locale\":\"%s\"".formatted(locale.code()));

		assertEquals(locale.code(), storedLocale(username));
	}

	@Test
	void aRegisterNamingNoServedLocaleStoresEnglish() throws Exception {
		register("op-locale-none", "");
		register("op-locale-bogus", ",\"locale\":\"../de\"");

		assertEquals("en", storedLocale("op-locale-none"));
		assertEquals("en", storedLocale("op-locale-bogus"));
	}

	@Test
	void theNoticeFollowsTheRegistrationLocale() throws Exception {
		long id = register("op-locale-approved", ",\"locale\":\"sq\"");

		approve(id).andExpect(status().isNoContent());

		SentEmail mail = theOnlyMailTo("op-locale-approved");
		assertEquals(SiteLocale.SQ, mail.locale());
		assertEquals("/sq/account/sign-in", mail.link().getPath());
	}

	@Test
	void aRowWithoutALocaleReadsAsEnglish() throws Exception {
		long id = register("op-locale-legacy", ",\"locale\":\"sq\"");
		jdbc.sql("UPDATE operator SET locale = NULL WHERE id = :id").param("id", id).update();

		approve(id).andExpect(status().isNoContent());

		SentEmail mail = theOnlyMailTo("op-locale-legacy");
		assertEquals(SiteLocale.EN, mail.locale());
		assertEquals("/account/sign-in", mail.link().getPath());
	}

	@Test
	void theConsoleChoiceIsStoredAndTheNoticeFollowsIt() throws Exception {
		long id = register("op-locale-switch", ",\"locale\":\"sq\"");
		Cookie session = SessionLoginSupport.operatorSession(mvc, "op-locale-switch", PENDING_PW);

		mvc.perform(put(LOCALE_PATH).cookie(session).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"locale\":\"it\"}"))
				.andExpect(status().isNoContent());
		assertEquals("it", storedLocale("op-locale-switch"));

		approve(id).andExpect(status().isNoContent());

		SentEmail mail = theOnlyMailTo("op-locale-switch");
		assertEquals(SiteLocale.IT, mail.locale());
		assertEquals("/it/account/sign-in", mail.link().getPath());
	}

	@Test
	void anUnservedCodeIsRefusedAndWritesNothing() throws Exception {
		register("op-locale-refused", ",\"locale\":\"sq\"");
		Cookie session = SessionLoginSupport.operatorSession(mvc, "op-locale-refused", PENDING_PW);

		mvc.perform(put(LOCALE_PATH).cookie(session).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"locale\":\"de\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

		assertEquals("sq", storedLocale("op-locale-refused"));
	}

	@Test
	void theCheckRefusesACodeNoSiteLocaleNames() {
		long id = jdbc.sql("""
				INSERT INTO operator (username, status, is_admin, password_hash)
				VALUES ('op-locale-check', 'ACTIVE', FALSE, 'x') RETURNING id
				""").query(Long.class).single();
		assertNull(storedLocale("op-locale-check"));

		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("UPDATE operator SET locale = 'xx' WHERE id = :id").param("id", id).update());
	}

	private long register(String username, String localeMember) throws Exception {
		mvc.perform(post("/api/auth/operator/register").with(csrf())
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp())
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"username":"%s","password":"%s","contactEmail":"%s"%s}"""
						.formatted(username, PENDING_PW, emailOf(username), localeMember)))
				.andExpect(status().isAccepted());
		return jdbc.sql("SELECT id FROM operator WHERE username = :u").param("u", username).query(Long.class).single();
	}

	private ResultActions approve(long operatorId) throws Exception {
		return mvc.perform(post("/api/admin/operators/{id}/approve", operatorId)
				.cookie(SessionLoginSupport.operatorSession(mvc, ADMIN, ADMIN_PW)).with(csrf()));
	}

	private String storedLocale(String username) {
		return jdbc.sql("SELECT locale FROM operator WHERE username = :u").param("u", username)
				.query((rs, rowNum) -> rs.getString(1)).list().getFirst();
	}

	private static String emailOf(String username) {
		return username + "@venue.example";
	}

	private SentEmail theOnlyMailTo(String username) {
		List<SentEmail> mails = mailer.sent().stream().filter(e -> e.toEmail().equals(emailOf(username))).toList();
		assertEquals(1, mails.size(), "exactly one mail for this address");
		return mails.getFirst();
	}
}
