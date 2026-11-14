-- Cloud saves for Mars Colony Command.
-- Run once in the Supabase dashboard → SQL Editor.
-- Also enable: Authentication → Sign In / Providers → "Allow anonymous sign-ins".
-- And turn OFF: Authentication → Sign In / Providers → Email → "Confirm email"
-- (players sign up with email + password and start playing right away, no verification).

create table if not exists public.game_saves (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  slot       text        not null default 'slot-1',
  version    integer     not null,
  sol        integer     not null default 1,
  data       jsonb       not null,
  saved_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.game_saves enable row level security;

-- Each player (including anonymous players) can only see and change their own saves.
drop policy if exists "own saves: select" on public.game_saves;
drop policy if exists "own saves: insert" on public.game_saves;
drop policy if exists "own saves: update" on public.game_saves;
drop policy if exists "own saves: delete" on public.game_saves;

create policy "own saves: select" on public.game_saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own saves: insert" on public.game_saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own saves: update" on public.game_saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own saves: delete" on public.game_saves
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.game_saves to authenticated;
