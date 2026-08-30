-- BR-182 down — drop client service cases only.

BEGIN;

DROP TABLE IF EXISTS atlas_client_service_cases;

COMMIT;
