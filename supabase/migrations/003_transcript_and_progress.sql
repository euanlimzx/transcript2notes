-- Add transcript storage for re-run and hash-based deduplication
-- Add progress column for granular status (parsing, extracting_topics, etc.)
alter table public.conversions
  add column if not exists transcript text,
  add column if not exists transcript_hash text,
  add column if not exists progress text;

-- Index for hash-based deduplication (matches any user when status=completed)
create index if not exists conversions_transcript_hash_completed
  on public.conversions (transcript_hash)
  where status = 'completed';
