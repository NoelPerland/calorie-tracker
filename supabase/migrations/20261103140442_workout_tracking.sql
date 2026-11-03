create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  notes text not null default '' check (char_length(notes) <= 2000),
  exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 60 and octet_length(exercises::text) <= 100000),
  started_at timestamptz not null default now(),
  completed_at timestamptz check (completed_at is null or completed_at >= started_at),
  spotify_track_id text check (spotify_track_id is null or spotify_track_id ~ '^[A-Za-z0-9]{22}$'),
  spotify_track_name text check (spotify_track_name is null or char_length(spotify_track_name) <= 300),
  spotify_artist text check (spotify_artist is null or char_length(spotify_artist) <= 300),
  spotify_url text check (spotify_url is null or spotify_url ~ '^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$'),
  created_at timestamptz not null default now()
);
create index workout_sessions_user_started_idx on public.workout_sessions(user_id, started_at desc);
alter table public.workout_sessions enable row level security;
revoke all on public.workout_sessions from anon;
grant select, insert, update, delete on public.workout_sessions to authenticated;
create policy "Read own workouts" on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own workouts" on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own workouts" on public.workout_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own workouts" on public.workout_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  weight_kg numeric not null check (weight_kg between 20 and 500),
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index weight_entries_user_recorded_idx on public.weight_entries(user_id, recorded_at desc);
alter table public.weight_entries enable row level security;
revoke all on public.weight_entries from anon;
grant select, insert, update, delete on public.weight_entries to authenticated;
create policy "Read own weight" on public.weight_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own weight" on public.weight_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own weight" on public.weight_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own weight" on public.weight_entries for delete to authenticated using ((select auth.uid()) = user_id);
