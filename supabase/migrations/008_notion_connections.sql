-- Notion integration: per-user token + default target page
create table if not exists public.notion_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notion_token text not null,
  default_page_id text,
  default_page_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notion_connections enable row level security;

-- Users can read/write only their own row
create policy "notion_connections_select_own"
  on public.notion_connections for select
  using (auth.uid() = user_id);

create policy "notion_connections_insert_own"
  on public.notion_connections for insert
  with check (auth.uid() = user_id);

create policy "notion_connections_update_own"
  on public.notion_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notion_connections_delete_own"
  on public.notion_connections for delete
  using (auth.uid() = user_id);
