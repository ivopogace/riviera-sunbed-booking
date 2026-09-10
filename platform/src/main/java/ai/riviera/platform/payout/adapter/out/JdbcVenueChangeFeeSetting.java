package ai.riviera.platform.payout.adapter.out;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;
import ai.riviera.platform.payout.application.VenueChangeFeeSetting;

/**
 * JDBC adapter for {@link VenueChangeFeeSetting} — explicit SQL via {@link JdbcClient}, no JPA
 * (invariant #1). Package-private; only the port is referenced cross-layer.
 *
 * <p>The write is an upsert so a hand-deleted row is restored rather than silently lost, and the
 * read falls back to the seeded property amount so an emptied table still charges instead of
 * throwing on the money path. The fallback is logged at WARN: it means the seeded row is gone.
 */
@Repository
class JdbcVenueChangeFeeSetting implements VenueChangeFeeSetting {

	private static final String SETTING_KEY = "VENUE_CHANGE_FEE";
	private static final String COL_AMOUNT_MINOR = "amount_minor";
	private static final String COL_CURRENCY = "currency";

	private static final Logger log = LoggerFactory.getLogger(JdbcVenueChangeFeeSetting.class);

	private final JdbcClient jdbc;
	private final VenueChangeFeeAmount seed;

	JdbcVenueChangeFeeSetting(JdbcClient jdbc, VenueChangeFeeAmount seed) {
		this.jdbc = jdbc;
		this.seed = seed;
	}

	@Override
	public VenueChangeFeeAmount current() {
		return stored().orElseGet(this::seedAfterWarning);
	}

	@Override
	public VenueChangeFeeAmount change(long minorUnits) {
		VenueChangeFeeAmount amount = new VenueChangeFeeAmount(minorUnits, seed.currency());
		jdbc.sql("""
				INSERT INTO platform_setting (setting_key, amount_minor, currency)
				VALUES (:key, :amount, :currency)
				ON CONFLICT (setting_key) DO UPDATE SET amount_minor = EXCLUDED.amount_minor
				""")
				.param("key", SETTING_KEY)
				.param("amount", amount.minorUnits())
				.param(COL_CURRENCY, amount.currency())
				.update();
		return amount;
	}

	private Optional<VenueChangeFeeAmount> stored() {
		return jdbc.sql("""
				SELECT amount_minor, currency
				FROM platform_setting
				WHERE setting_key = :key
				""")
				.param("key", SETTING_KEY)
				.query((rs, rowNum) -> new VenueChangeFeeAmount(rs.getLong(COL_AMOUNT_MINOR),
						rs.getString(COL_CURRENCY)))
				.optional();
	}

	private VenueChangeFeeAmount seedAfterWarning() {
		log.warn("no {} row in platform_setting — charging the seeded default of {} {}", SETTING_KEY,
				seed.minorUnits(), seed.currency());
		return seed;
	}
}
