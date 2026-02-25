-- conversions: job id, status (pending | completed | failed), result or error, created_at
-- Backend inserts with status=pending and updates on pipeline completion.
create table if not exists public.conversions (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('pending', 'completed', 'failed')) default 'pending',
  markdown text,
  error text,
  created_at timestamptz not null default now()
);

-- Optional: allow client/backend to list by created_at
create index if not exists conversions_created_at_desc on public.conversions (created_at desc);

-- RLS: allow service role full access; anon/authenticated can read (for client listing)
alter table public.conversions enable row level security;

create policy "Allow read for anon and authenticated"
  on public.conversions for select
  to anon, authenticated
  using (true);

create policy "Allow all for service role"
  on public.conversions for all
  to service_role
  using (true)
  with check (true);
