package ai.riviera.platform;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.StackTraceElementProxy;
import ch.qos.logback.core.read.ListAppender;

import jakarta.servlet.http.Cookie;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Invariant #7 over the code-authorized paths: driving view, cancel, withdraw, review and staff
 * check-in, on both the happy and the unknown-code arm, never writes a booking code into any log
 * event — message, arguments, MDC or throwable — with the application's loggers at {@code DEBUG}.
 * The create path is pinned by {@code CreateBookingServiceTest}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = { "riviera.operator.password=test-operator-pw", "riviera.altcha.enabled=false",
		"booking.no-show.enabled=false", "logging.level.ai.riviera.platform=DEBUG" })
@AutoConfigureMockMvc
class BookingCodeLogGuardIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcClient jdbc;

	private final Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
	private final ListAppender<ILoggingEvent> captured = new ListAppender<>();
	private final List<String> codes = new ArrayList<>();
	private Cookie operatorSession;
	private long venue;

	@BeforeEach
	void captureEveryLogEvent() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
		venue = newOwnedVenue();
		captured.start();
		root.addAppender(captured);
	}

	@AfterEach
	void stopCapturing() {
		root.detachAppender(captured);
		captured.stop();
	}

	@Test
	void viewNeverLogsTheCode() throws Exception {
		String code = booking("CONFIRMED", today().plusDays(3), null);
		mvc.perform(get("/api/bookings/{code}", code)).andExpect(status().isOk());
		mvc.perform(get("/api/bookings/{code}", unknownCode())).andExpect(status().isNotFound());

		assertNoCodeLogged();
	}

	@Test
	void cancelNeverLogsTheCode() throws Exception {
		String code = booking("CONFIRMED", today().plusDays(3), null);
		mvc.perform(post("/api/bookings/{code}/cancel", code).with(csrf())).andExpect(status().isOk());
		mvc.perform(post("/api/bookings/{code}/cancel", code).with(csrf())).andExpect(status().isConflict());
		mvc.perform(post("/api/bookings/{code}/cancel", unknownCode()).with(csrf()))
				.andExpect(status().isNotFound());

		assertNoCodeLogged();
	}

	@Test
	void withdrawNeverLogsTheCode() throws Exception {
		String code = booking("PENDING_REQUEST", today().plusDays(3), null);
		mvc.perform(post("/api/bookings/{code}/withdraw", code).with(csrf())).andExpect(status().isOk());
		mvc.perform(post("/api/bookings/{code}/withdraw", code).with(csrf())).andExpect(status().isConflict());
		mvc.perform(post("/api/bookings/{code}/withdraw", unknownCode()).with(csrf()))
				.andExpect(status().isNotFound());

		assertNoCodeLogged();
	}

	@Test
	void reviewNeverLogsTheCode() throws Exception {
		String code = booking("COMPLETED", today().minusDays(1), Instant.now().minus(1, ChronoUnit.DAYS));
		String review = "{\"stars\":5,\"comment\":\"Lovely\",\"displayName\":\"Ana\"}";
		mvc.perform(post("/api/bookings/{code}/review", code).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(review)).andExpect(status().isCreated());
		mvc.perform(post("/api/bookings/{code}/review", code).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(review)).andExpect(status().isConflict());
		mvc.perform(post("/api/bookings/{code}/review", unknownCode()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content(review)).andExpect(status().isNotFound());

		assertNoCodeLogged();
	}

	@Test
	void staffCheckInNeverLogsTheCode() throws Exception {
		String code = booking("CONFIRMED", today(), null);
		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
				.cookie(operatorSession).with(csrf())).andExpect(status().isOk());
		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, code)
				.cookie(operatorSession).with(csrf())).andExpect(status().isConflict());
		mvc.perform(post("/api/venues/{v}/bookings/{code}/check-in", venue, unknownCode())
				.cookie(operatorSession).with(csrf())).andExpect(status().isNotFound());

		assertNoCodeLogged();
	}

	@Test
	void theGuardCatchesACodeLoggedAtDebug() {
		LoggerFactory.getLogger(BookingCodeLogGuardIT.class).debug("canary {}", newCode());

		assertThat(leaks()).as("the capture or the scan is broken, so a green run proves nothing").hasSize(1);
	}

	private void assertNoCodeLogged() {
		assertThat(leaks()).as("a booking code reached the logs (invariant #7)").isEmpty();
	}

	private List<String> leaks() {
		List<String> leaks = new ArrayList<>();
		List<ILoggingEvent> events;
		synchronized (captured) { // AppenderBase.doAppend holds this lock; async listeners append mid-scan
			events = List.copyOf(captured.list);
		}
		for (ILoggingEvent event : events) {
			String rendered = render(event);
			codes.stream().filter(rendered::contains)
					.forEach(code -> leaks.add(event.getLoggerName() + " " + event.getLevel() + ": " + rendered));
		}
		return leaks;
	}

	/** Every part of an event an appender may write: message, raw arguments, MDC, throwable chain. */
	private static String render(ILoggingEvent event) {
		StringBuilder text = new StringBuilder(event.getFormattedMessage());
		if (event.getArgumentArray() != null) {
			for (Object argument : event.getArgumentArray()) {
				text.append(' ').append(argument);
			}
		}
		text.append(' ').append(event.getMDCPropertyMap());
		for (IThrowableProxy cause = event.getThrowableProxy(); cause != null; cause = cause.getCause()) {
			text.append(' ').append(cause.getClassName()).append(": ").append(cause.getMessage());
			for (StackTraceElementProxy frame : cause.getStackTraceElementProxyArray()) {
				text.append(' ').append(frame.getSTEAsString());
			}
		}
		return text.toString();
	}

	private long newOwnedVenue() {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES ('Log Guard Club', 'KSAMIL', 'INSTANT', 1500, 'EUR') RETURNING id
				""").query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) SELECT :v, id FROM operator WHERE username = :u")
				.param("v", id).param("u", OPERATOR).update();
		return id;
	}

	private String booking(String status, LocalDate date, Instant completedAt) {
		String code = newCode();
		long set = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1) RETURNING id
				""").param("v", venue).query(Long.class).single();
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code.toLowerCase() + "@example.test").query(Long.class).single();
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor,
				                     amount_currency, status, confirmed_at, completed_at, request_expires_at)
				VALUES (:code, :v, :s, :c, :date, 4500, 'EUR', :status,
				        CASE WHEN :status = 'PENDING_REQUEST' THEN NULL ELSE now() END, :completed,
				        CASE WHEN :status = 'PENDING_REQUEST' THEN now() + interval '1 hour' END)
				""")
				.param("code", code).param("v", venue).param("s", set).param("c", customer)
				.param("date", date).param("status", status)
				.param("completed", completedAt == null ? null : Timestamp.from(completedAt))
				.update();
		return code;
	}

	/** A well-formed code that matches no booking — the not-found arm must not log it either. */
	private String unknownCode() {
		return newCode();
	}

	private String newCode() {
		StringBuilder code = new StringBuilder("LG");
		for (int i = 0; i < 8; i++) {
			code.append(CODE_ALPHABET.charAt(ThreadLocalRandom.current().nextInt(CODE_ALPHABET.length())));
		}
		codes.add(code.toString());
		return code.toString();
	}

	private static LocalDate today() {
		return LocalDate.now(TIRANE);
	}
}
