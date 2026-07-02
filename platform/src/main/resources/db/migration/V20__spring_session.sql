-- Spring Session JDBC schema (issue #109, design D-1): server-side sessions persisted in
-- Postgres so a restart/redeploy keeps operators signed in and multiple instances share
-- sessions. This is the CANONICAL schema shipped with spring-session-jdbc
-- (org/springframework/session/jdbc/schema-postgresql.sql), vendored VERBATIM because
-- JdbcIndexedSessionRepository issues fixed SQL against exactly these tables/columns —
-- do not restyle it to project conventions (BIGINT epoch millis, CHAR(36) ids and the
-- uppercase names are the library's contract, like the Event Publication Registry in V8).
-- Owned by Flyway (invariant #12): spring.session.jdbc.initialize-schema=never.

CREATE TABLE SPRING_SESSION (
	PRIMARY_ID CHAR(36) NOT NULL,
	SESSION_ID CHAR(36) NOT NULL,
	CREATION_TIME BIGINT NOT NULL,
	LAST_ACCESS_TIME BIGINT NOT NULL,
	MAX_INACTIVE_INTERVAL INT NOT NULL,
	EXPIRY_TIME BIGINT NOT NULL,
	PRINCIPAL_NAME VARCHAR(100),
	CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
);

CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
	SESSION_PRIMARY_ID CHAR(36) NOT NULL,
	ATTRIBUTE_NAME VARCHAR(200) NOT NULL,
	ATTRIBUTE_BYTES BYTEA NOT NULL,
	CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
	CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID)
		REFERENCES SPRING_SESSION (PRIMARY_ID) ON DELETE CASCADE
);
