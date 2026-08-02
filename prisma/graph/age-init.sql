-- ================================================================
-- Seraph graph bootstrap
-- Runs once on first initialization of the Postgres volume
-- (docker-entrypoint-initdb.d). Creates the AGE extension and the
-- `seraph` graph. Re-run manually with psql on existing volumes:
--   psql -U seraph -d seraph -f prisma/graph/age-init.sql
-- ================================================================

CREATE EXTENSION IF NOT EXISTS age;

LOAD 'age';

SET search_path = ag_catalog, "$user", public;

SELECT create_graph('seraph');
