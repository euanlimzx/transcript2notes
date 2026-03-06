-- Add optional name for each conversion job
alter table public.conversions
  add column if not exists name text;

