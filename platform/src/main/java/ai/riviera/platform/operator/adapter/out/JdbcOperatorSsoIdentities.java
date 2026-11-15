package ai.riviera.platform.operator.adapter.out;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.operator.application.OperatorSsoIdentities;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.OperatorSsoLink;
import ai.riviera.platform.operator.vocabulary.OperatorStatus;

/**
 * JDBC adapter for {@link OperatorSsoIdentities} (invariant #1). {@link #insert} is one
 * {@code ON CONFLICT DO NOTHING} over both unique keys, so a concurrent second link of either key writes nothing.
 */
@Repository
class JdbcOperatorSsoIdentities implements OperatorSsoIdentities {

	private static final String ID_PARAM = "id";
	private static final String ISSUER_PARAM = "issuer";
	private static final String SUBJECT_PARAM = "subject";

	private final JdbcClient jdbc;

	JdbcOperatorSsoIdentities(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public Optional<OperatorCredential> credentialFor(String issuer, String subject) {
		return jdbc.sql("""
				SELECT o.username, o.password_hash, o.status, o.is_admin
				FROM operator_sso_identity s JOIN operator o ON o.id = s.operator_id
				WHERE s.issuer = :issuer AND s.subject = :subject
				""")
				.param(ISSUER_PARAM, issuer)
				.param(SUBJECT_PARAM, subject)
				.query((rs, rowNum) -> new OperatorCredential(rs.getString("username"), rs.getString("password_hash"),
						OperatorStatus.valueOf(rs.getString("status")), rs.getBoolean("is_admin")))
				.optional();
	}

	@Override
	public Optional<OperableOperator> lockOperable(OperatorId operatorId) {
		return jdbc.sql("""
				SELECT username, password_hash IS NOT NULL AS has_password FROM operator
				WHERE id = :id AND status IN (:active, :pending) FOR NO KEY UPDATE
				""")
				.param(ID_PARAM, operatorId.value())
				.param("active", OperatorStatus.ACTIVE.name())
				.param("pending", OperatorStatus.PENDING.name())
				.query((rs, rowNum) -> new OperableOperator(rs.getString("username"), rs.getBoolean("has_password")))
				.optional();
	}

	@Override
	public boolean insert(OperatorId operatorId, String issuer, String subject) {
		return jdbc.sql("""
				INSERT INTO operator_sso_identity (operator_id, issuer, subject) VALUES (:id, :issuer, :subject)
				ON CONFLICT DO NOTHING
				""")
				.param(ID_PARAM, operatorId.value())
				.param(ISSUER_PARAM, issuer)
				.param(SUBJECT_PARAM, subject)
				.update() == 1;
	}

	@Override
	public Optional<OperatorId> linkedOperator(String issuer, String subject) {
		return jdbc.sql("SELECT operator_id FROM operator_sso_identity WHERE issuer = :issuer AND subject = :subject")
				.param(ISSUER_PARAM, issuer)
				.param(SUBJECT_PARAM, subject)
				.query(Long.class)
				.optional()
				.map(OperatorId::new);
	}

	@Override
	public boolean hasLink(OperatorId operatorId, String issuer) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM operator_sso_identity WHERE operator_id = :id AND issuer = :issuer)
				""")
				.param(ID_PARAM, operatorId.value())
				.param(ISSUER_PARAM, issuer)
				.query(Boolean.class)
				.single();
	}

	@Override
	public int count(OperatorId operatorId) {
		return jdbc.sql("SELECT count(*) FROM operator_sso_identity WHERE operator_id = :id")
				.param(ID_PARAM, operatorId.value())
				.query(Integer.class)
				.single();
	}

	@Override
	public void delete(OperatorId operatorId, String issuer) {
		jdbc.sql("DELETE FROM operator_sso_identity WHERE operator_id = :id AND issuer = :issuer")
				.param(ID_PARAM, operatorId.value())
				.param(ISSUER_PARAM, issuer)
				.update();
	}

	@Override
	public void deleteAll(OperatorId operatorId) {
		jdbc.sql("DELETE FROM operator_sso_identity WHERE operator_id = :id")
				.param(ID_PARAM, operatorId.value())
				.update();
	}

	@Override
	public List<OperatorSsoLink> links(OperatorId operatorId) {
		return jdbc.sql("SELECT issuer, created_at FROM operator_sso_identity WHERE operator_id = :id ORDER BY id")
				.param(ID_PARAM, operatorId.value())
				.query((rs, rowNum) -> new OperatorSsoLink(rs.getString(ISSUER_PARAM),
						rs.getObject("created_at", OffsetDateTime.class).toInstant()))
				.list();
	}
}
