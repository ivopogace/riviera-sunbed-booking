package ai.riviera.platform;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.jayway.jsonpath.JsonPath;

import ai.riviera.platform.booking.application.remodel.ReceiptMove;
import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.ReceiptId;
import ai.riviera.platform.booking.vocabulary.SpotRef;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The owner's remodel receipts at the HTTP seam: the list newest first with its move counts, one
 * receipt with every move's both spots and distance, {@code 404 NO_SUCH_RECEIPT} for an unknown id
 * and for another venue's, no booking code on the wire (invariant #7).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class RemodelReceiptIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	RemodelReceipts receipts;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, "operator", "test-operator-pw");
	}

	@Test
	void theOwnerReadsTheListAndOneReceiptAndAForeignOrUnknownIdIs404() throws Exception {
		long venue = createVenue("Receipts Club");
		long other = createVenue("Other Receipts Club");
		long a1 = insertSet(venue, 1);
		long a2 = insertSet(venue, 2);
		long booking = seedBooking(venue, a2, "RCP-" + System.nanoTime());
		OperatorId operator = new OperatorId(jdbc.sql("SELECT id FROM operator WHERE username = 'operator'")
				.query(Long.class).single());
		LocalDate day = LocalDate.of(2027, 7, 12);
		ReceiptId older = receipts.record(new VenueId(venue), operator, Instant.parse("2026-09-09T10:00:00Z"), List.of());
		ReceiptId newer = receipts.record(new VenueId(venue), operator, Instant.parse("2026-09-09T11:00:00Z"), List.of(
				new ReceiptMove(new BookingId(booking), day, new SpotRef(new SetId(a1), "A", 1),
						new SpotRef(new SetId(a2), "A", 2), 0, 1)));

		mvc.perform(get("/api/venues/{v}/remodels", venue).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].receiptId").value(newer.value()))
				.andExpect(jsonPath("$[0].moveCount").value(1))
				.andExpect(jsonPath("$[1].receiptId").value(older.value()))
				.andExpect(jsonPath("$[1].moveCount").value(0));

		mvc.perform(get("/api/venues/{v}/remodels/{r}", venue, newer.value()).cookie(operatorSession))
				.andExpect(status().isOk())
				.andExpect(content().string(not(containsString("\"code\""))))
				.andExpect(jsonPath("$.receiptId").value(newer.value()))
				.andExpect(jsonPath("$.committedAt").value("2026-09-09T11:00:00Z"))
				.andExpect(jsonPath("$.moves[0].bookingId").value(booking))
				.andExpect(jsonPath("$.moves[0].bookingDate").value("2027-07-12"))
				.andExpect(jsonPath("$.moves[0].from.rowLabel").value("A"))
				.andExpect(jsonPath("$.moves[0].from.positionNo").value(1))
				.andExpect(jsonPath("$.moves[0].to.setId").value(a2))
				.andExpect(jsonPath("$.moves[0].positionsAway").value(1));

		mvc.perform(get("/api/venues/{v}/remodels/{r}", other, newer.value()).cookie(operatorSession))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_RECEIPT"));
		mvc.perform(get("/api/venues/{v}/remodels/{r}", venue, newer.value() + 100_000).cookie(operatorSession))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_RECEIPT"));
	}

	private long createVenue(String name) throws Exception {
		String body = """
				{"name":"%s","beach":"Ksamil","region":"Riviera","description":"x",
				 "bookingMode":"INSTANT","payoutCurrency":"EUR","bookingCutoff":"18:00"}
				""".formatted(name + " " + System.nanoTime());
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andReturn();
		return Long.parseLong(JsonPath.read(result.getResponse().getContentAsString(), "$.id").toString());
	}

	private long insertSet(long venue, int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor, price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', 'ONLINE', 2000, 'EUR', :pos, 1) RETURNING id
				""").param("v", venue).param("pos", position).query(Long.class).single();
	}

	private long seedBooking(long venue, long set, String code) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355000') RETURNING id")
				.param("e", "rcp-" + System.nanoTime() + "@example.test").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor, amount_currency, status)
				VALUES (:code, :v, :s, :c, '2027-07-12', 2000, 'EUR', 'CONFIRMED') RETURNING id
				""").param("code", code).param("v", venue).param("s", set).param("c", customer).query(Long.class).single();
	}
}
