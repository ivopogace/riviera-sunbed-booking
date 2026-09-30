-- Every session principal carries a credential stamp that the edge checks on each request (#1306).
-- Sessions stored before that check hold an unstamped principal, which the check cannot judge, so they
-- end here once: their owners sign in again. Attributes go with their session (ON DELETE CASCADE).
DELETE FROM SPRING_SESSION;
