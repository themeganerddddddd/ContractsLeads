-- Exact expression used by contract free-text search. The broader V1 index is
-- retained because it also supports identifier lookup use cases.
CREATE INDEX IF NOT EXISTS awards_title_description_search_idx ON awards USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
);
