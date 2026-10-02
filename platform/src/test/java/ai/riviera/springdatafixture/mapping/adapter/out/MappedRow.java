package ai.riviera.springdatafixture.mapping.adapter.out;

import org.springframework.data.annotation.Id;
import org.springframework.data.relational.core.mapping.Table;

/** Names Spring Data: an aggregate mapped for the starter's repositories instead of a hand-mapped row. */
@Table("fixture_mapped_row")
public record MappedRow(@Id Long id, String name) {
}
