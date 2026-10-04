package ai.riviera.springdatafixture.repository.adapter.out;

import org.springframework.data.repository.CrudRepository;

/** Names Spring Data: a repository interface where a hand-written adapter belongs. */
public interface RowRepository extends CrudRepository<String, Long> {
}
