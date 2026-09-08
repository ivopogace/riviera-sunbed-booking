package ai.riviera.platform.venue.adapter.in;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import ai.riviera.platform.venue.application.SetBatchCommand;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The request body of the set batch apply ({@code PATCH /api/venues/{id}/sets}): the swept set ids
 * plus only the fields the operator touched — an absent field is left absent, never defaulted, so
 * each set keeps its own value for it. {@code expectedVersion} is the required {@code setVersion}
 * token, typed {@link Long} so an absent field is {@code null} and a {@code 400}
 * ({@link ExpectedVersion#require(Long)}), never a silent {@code 0}. {@link #toCommand()} parses the
 * pool token and delegates the rest to {@link SetBatchCommand}; bad input →
 * {@link IllegalArgumentException} → {@code 400}.
 */
record SetBatchRequest(List<Long> setIds, String tier, String pool, MoneyView price,
		Long expectedVersion) {

	SetBatchCommand toCommand() {
		if (setIds == null) {
			throw new IllegalArgumentException("setIds is required");
		}
		Set<SetId> ids = setIds.stream().map(SetId::new).collect(Collectors.toSet());
		return new SetBatchCommand(ids, tier, pool == null ? null : PoolToken.parse(pool),
				price == null ? null : price.minorUnits(), price == null ? null : price.currency());
	}
}
