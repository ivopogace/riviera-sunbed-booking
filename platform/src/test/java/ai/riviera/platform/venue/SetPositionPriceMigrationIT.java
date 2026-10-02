package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins the database twin of {@code SetPrice}: V77's {@code set_position_price_check} (at least 50 EUR minor
 * units) and V76's {@code set_position_price_currency_check}, refused on insert and on update, while the V3 seed
 * still loads under both. An accepted write rolls back, so the shared seed is left as it was.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SetPositionPriceMigrationIT {

	private static final long MIRAMAR = 1L;

	@Autowired
	JdbcTemplate jdbc;

	private void insertSet(int positionNo, long priceMinor, String priceCurrency) {
		jdbc.update("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
				                          price_minor, price_currency, grid_x, grid_y)
				VALUES (?, 'Price check', ?, 'STANDARD', 'ONLINE', ?, ?, 40, ?)
				""", MIRAMAR, positionNo, priceMinor, priceCurrency, 40 + positionNo);
	}

	private void updateSeededSet(String assignment, Object value) {
		jdbc.update("UPDATE set_position SET " + assignment + " = ? WHERE id = (SELECT min(id) FROM set_position)",
				value);
	}

	@Test
	void theSeedStillLoadsUnderBothChecks() {
		Integer offRule = jdbc.queryForObject(
				"SELECT count(*) FROM set_position WHERE price_minor < 50 OR price_currency <> 'EUR'", Integer.class);
		assertThat(offRule).isZero();
	}

	@Test
	void refusesAPriceBelowFiftyOnInsert() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(1, 49, "EUR"));
		assertThat(rejected.getMessage()).contains("set_position_price_check");
	}

	@Test
	void refusesANonEurCurrencyOnInsert() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> insertSet(2, 4500, "ALL"));
		assertThat(rejected.getMessage()).contains("set_position_price_currency_check");
	}

	@Test
	void refusesAPriceBelowFiftyOnUpdate() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> updateSeededSet("price_minor", 49L));
		assertThat(rejected.getMessage()).contains("set_position_price_check");
	}

	@Test
	void refusesANonEurCurrencyOnUpdate() {
		DataIntegrityViolationException rejected = assertThrows(DataIntegrityViolationException.class,
				() -> updateSeededSet("price_currency", "ALL"));
		assertThat(rejected.getMessage()).contains("set_position_price_currency_check");
	}

	@Test
	@Transactional
	void acceptsFiftyOnInsertAndUpdate() {
		insertSet(3, 50, "EUR");
		updateSeededSet("price_minor", 50L);

		assertThat(jdbc.queryForObject("""
				SELECT count(*) FROM set_position
				WHERE price_minor = 50 AND (row_label = 'Price check' OR id = (SELECT min(id) FROM set_position))
				""", Integer.class)).isEqualTo(2);
	}
}
