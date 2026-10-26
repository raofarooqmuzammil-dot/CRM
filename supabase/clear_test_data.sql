-- OPTIONAL. Deletes all persons, organizations, calls, follow-ups, deals, and import history.
-- Users, labels, lists, settings, pipelines, and custom columns are kept.
-- Run it once, before your first real import, if you only have test data.
truncate table call_logs, activities, deals, persons, organizations, import_batches cascade;
