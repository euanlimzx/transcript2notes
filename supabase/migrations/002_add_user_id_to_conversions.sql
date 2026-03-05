-- Add user_id to conversions to track which user created each conversion
-- user_id references auth.users (Supabase's built-in users table)
alter table public.conversions
  add column if not exists user_id uuid references auth.users(id);

-- Backfill: existing rows keep user_id NULL (legacy anonymous conversions)
-- New conversions will require user_id from the authenticated session

-- Drop the permissive read policy; replace with user-scoped policies
drop policy if exists "Allow read for anon and authenticated" on public.conversions;

-- Authenticated users can only read their own conversions
create policy "Users can read own conversions"
  on public.conversions for select
  to authenticated
  using (auth.uid() = user_id);

-- Allow authenticated users to delete their own conversions
create policy "Users can delete own conversions"
  on public.conversions for delete
  to authenticated
  using (auth.uid() = user_id);
