create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  calories integer not null check (calories between 0 and 100000),
  protein numeric not null check (protein between 0 and 100000),
  carbs numeric not null check (carbs between 0 and 100000),
  fat numeric not null check (fat between 0 and 100000),
  notes text check (char_length(notes) <= 2000),
  eaten_at timestamptz not null check (isfinite(eaten_at)),
  source text not null default 'manual' check (source in ('manual', 'chat')),
  created_at timestamptz not null default now()
);
create index food_entries_user_eaten_idx on public.food_entries(user_id,eaten_at);
alter table public.food_entries enable row level security;
revoke all on public.food_entries from anon;
grant select, insert, update, delete on public.food_entries to authenticated;
create policy "Read own entries" on public.food_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own entries" on public.food_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own entries" on public.food_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own entries" on public.food_entries for delete to authenticated using ((select auth.uid()) = user_id);
alter publication supabase_realtime add table public.food_entries;
