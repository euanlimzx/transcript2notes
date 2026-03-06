-- Priority queue: priority_users table and is_priority on conversions
-- Used for queue ordering: priority users first, then FIFO by created_at

create table if not exists public.priority_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.conversions
  add column if not exists is_priority boolean not null default false;

-- Index for efficient queue selection (pick next pending job)
create index if not exists conversions_pending_queue_order
  on public.conversions (is_priority desc, created_at asc)
  where status = 'pending';
