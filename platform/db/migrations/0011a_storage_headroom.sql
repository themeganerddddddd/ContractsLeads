-- The production Neon Free project reached its 512 MB project limit before
-- the additive company-intelligence tables could be created. Preserve every
-- canonical and historical record while releasing two rebuildable GIN search
-- indexes. Search remains correct through PostgreSQL sequential scans; these
-- indexes can be recreated when the project has durable storage headroom.

DROP INDEX IF EXISTS procurement_processes_text_idx;
DROP INDEX IF EXISTS awards_search_idx;
