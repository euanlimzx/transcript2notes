-- Add logs column to store job-level pipeline log lines for observability (e.g. on failure).
-- Existing rows keep logs = NULL.
alter table public.conversions
  add column if not exists logs text[];
