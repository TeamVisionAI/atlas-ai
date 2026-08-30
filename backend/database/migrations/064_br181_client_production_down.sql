-- BR-181 down — drop client production table only.

BEGIN;

DROP TABLE IF EXISTS atlas_client_production;

COMMIT;
