-- Online leaderboard, public commander profiles and base visits.
-- Run once in the Supabase dashboard → SQL Editor, after 0001_game_saves.sql.
-- Safe to run again (everything is "if not exists" / "or replace").
--
-- Privacy model: game_saves stays owner-only. Other players never read it directly; they
-- only get a few chosen fields (name, XP, counts, base layouts) through the three
-- security-definer functions below. Email, resources and the mission log are never exposed.

-- ---------------------------------------------------------------------------
-- Helpers (immutable, so they can feed generated columns)
-- ---------------------------------------------------------------------------

-- A JSON number as numeric; anything else (missing, string, tampered) counts as 0.
create or replace function public.jnum(j jsonb) returns numeric
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(j) = 'number' then least(greatest((j #>> '{}')::numeric, 0), 1000000000) else 0 end
$$;

create or replace function public.jarr(j jsonb) returns jsonb
language sql immutable parallel safe set search_path = '' as $$
  select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end
$$;

-- Crew across every base (the active base keeps its data at the top level of the save).
create or replace function public.save_colonists(d jsonb) returns integer
language sql immutable parallel safe set search_path = '' as $$
  select (public.jnum(d #> '{state,colony,colonists}')
    + coalesce((select sum(public.jnum(b #> '{colony,colonists}')) from jsonb_array_elements(public.jarr(d #> '{state,otherBases}')) b), 0))::integer
$$;

create or replace function public.save_buildings(d jsonb) returns integer
language sql immutable parallel safe set search_path = '' as $$
  select (jsonb_array_length(public.jarr(d #> '{state,buildings}'))
    + coalesce((select sum(jsonb_array_length(public.jarr(b -> 'buildings'))) from jsonb_array_elements(public.jarr(d #> '{state,otherBases}')) b), 0))::integer
$$;

create or replace function public.save_regions(d jsonb) returns integer
language sql immutable parallel safe set search_path = '' as $$
  select count(*)::integer from jsonb_each(case when jsonb_typeof(d #> '{state,discoveredRegions}') = 'object' then d #> '{state,discoveredRegions}' else '{}'::jsonb end) e
  where e.value = 'true'::jsonb
$$;

-- Same blocked-word list as src/data/usernameFilter.ts (keep the two in step).
create or replace function public.username_ok(name text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select not exists (
    select 1 from unnest(array[
      'fuck','fuk','shit','bitch','cunt','whore','slut','bastard','asshole','arsehole','nigger','nigga',
      'faggot','retard','penis','vagina','porn','sexy','boobs','nazi','hitler','rapist','pedo','wank','twat','dildo'
    ]) w
    where translate(regexp_replace(lower(name), '[\s_\-]', '', 'g'), '013457$@!', 'oieastsai') like '%' || w || '%'
  )
$$;

-- ---------------------------------------------------------------------------
-- Ranking columns on the save table (worked out by Postgres on every save)
-- ---------------------------------------------------------------------------

alter table public.game_saves
  add column if not exists xp             bigint  generated always as (floor(public.jnum(data #> '{state,progression,xp}'))::bigint) stored,
  add column if not exists colonists      integer generated always as (public.save_colonists(data)) stored,
  add column if not exists building_count integer generated always as (public.save_buildings(data)) stored,
  add column if not exists base_count     integer generated always as (1 + jsonb_array_length(public.jarr(data #> '{state,otherBases}'))) stored;

create index if not exists game_saves_xp_idx        on public.game_saves (xp desc)        where slot = 'slot-1';
create index if not exists game_saves_colonists_idx on public.game_saves (colonists desc) where slot = 'slot-1';

-- Keeps one save from growing without bound (checked on new writes only).
do $$ begin
  alter table public.game_saves add constraint game_saves_size check (pg_column_size(data) < 2000000) not valid;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Public commander profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id             uuid        primary key references auth.users (id) on delete cascade,
  username            text        not null,
  username_lower      text        generated always as (lower(btrim(username))) stored,
  show_on_leaderboard boolean     not null default true,
  -- Set by an admin (Table Editor) to take a player off the board, e.g. for a bad name.
  hidden              boolean     not null default false,
  updated_at          timestamptz not null default now(),
  constraint profiles_username_len  check (char_length(btrim(username)) between 3 and 20),
  constraint profiles_username_safe check (username !~ '[[:cntrl:]<>]' and public.username_ok(username))
);

create index if not exists profiles_username_lower_idx on public.profiles (username_lower);

alter table public.profiles enable row level security;

drop policy if exists "own profile: select" on public.profiles;
drop policy if exists "own profile: insert" on public.profiles;
drop policy if exists "own profile: update" on public.profiles;

create policy "own profile: select" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own profile: insert" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Players may never set "hidden" themselves: no grant on that column.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id, username, show_on_leaderboard, updated_at) on public.profiles to authenticated;
grant update (username, show_on_leaderboard, updated_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Read functions (the only way to see other players)
-- ---------------------------------------------------------------------------

-- Everyone listed on the board, with the value for the chosen sort order.
create or replace function public.leaderboard_rows(sort text)
returns table (user_id uuid, username text, username_lower text, xp bigint, sol integer, colonists integer,
               buildings integer, bases integer, saved_at timestamptz, score bigint)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.username, p.username_lower, s.xp, s.sol, s.colonists, s.building_count, s.base_count, s.updated_at,
         case sort when 'colonists' then s.colonists when 'buildings' then s.building_count when 'bases' then s.base_count else s.xp end::bigint
  from public.profiles p
  join public.game_saves s on s.user_id = p.user_id and s.slot = 'slot-1'
  where p.show_on_leaderboard and not p.hidden
$$;
revoke all on function public.leaderboard_rows(text) from public, anon, authenticated;

-- Top players (or the players whose name contains `search`), with their place on the whole board.
create or replace function public.get_leaderboard(sort text default 'xp', max_rows integer default 50, search text default null)
returns table (user_id uuid, username text, xp bigint, sol integer, colonists integer, buildings integer,
               bases integer, online boolean, score bigint, place bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select r.*, rank() over (order by r.score desc, r.xp desc) as place
    from public.leaderboard_rows(sort) r
  ), q as (
    select nullif(left(lower(btrim(coalesce(search, ''))), 20), '') as term
  )
  select r.user_id, r.username, r.xp, r.sol, r.colonists, r.buildings, r.bases,
         r.saved_at > now() - interval '3 minutes', r.score, r.place, r.user_id = auth.uid()
  from ranked r, q
  where q.term is null
     or r.username_lower like '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by r.place, r.username_lower
  limit least(greatest(coalesce(max_rows, 50), 1), 100)
$$;

-- The caller's own place: shown in the profile and pinned under the board.
create or replace function public.get_my_position(sort text default 'xp')
returns table (place bigint, score bigint, total bigint, listed boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select case sort when 'colonists' then s.colonists when 'buildings' then s.building_count when 'bases' then s.base_count else s.xp end::bigint as score,
           s.xp,
           exists (select 1 from public.profiles p where p.user_id = s.user_id and p.show_on_leaderboard and not p.hidden) as listed
    from public.game_saves s where s.user_id = auth.uid() and s.slot = 'slot-1'
  )
  select (select count(*) from public.leaderboard_rows(sort) r
          where r.user_id <> auth.uid() and (r.score > me.score or (r.score = me.score and r.xp > me.xp))) + 1,
         me.score,
         (select count(*) from public.leaderboard_rows(sort)),
         me.listed
  from me
$$;

-- One player's public profile and the layout of each of their bases (for visits).
create or replace function public.get_public_colony(target uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', p.user_id,
    'username', p.username,
    'xp', s.xp,
    'sol', s.sol,
    'colonists', s.colonists,
    'buildings', s.building_count,
    'bases', s.base_count,
    'regions', public.save_regions(s.data),
    'milestones', public.jarr(s.data #> '{state,progression,milestones}'),
    'online', s.updated_at > now() - interval '3 minutes',
    'savedAt', s.updated_at,
    'baseList', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', b.v -> 'id', 'name', b.v -> 'name', 'siteId', b.v -> 'siteId',
        'lat', b.v -> 'lat', 'lon', b.v -> 'lon', 'foundedSol', b.v -> 'foundedSol',
        'colonists', public.jnum(b.v #> '{colony,colonists}'),
        'roads', public.jarr(b.v -> 'roads'),
        'buildingList', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', x -> 'id', 'type', x -> 'type', 'gridX', x -> 'gridX', 'gridY', x -> 'gridY',
            'rotation', x -> 'rotation', 'constructionProgress', x -> 'constructionProgress', 'connected', x -> 'connected')), '[]'::jsonb)
          from jsonb_array_elements(public.jarr(b.v -> 'buildings')) x
        )
      ) order by b.ord), '[]'::jsonb)
      from (
        -- The base on screen keeps its buildings, roads and crew at the top level of the save.
        select 0::bigint as ord,
               coalesce(s.data #> '{state,base}', '{}'::jsonb)
                 || jsonb_build_object('buildings', s.data #> '{state,buildings}', 'roads', s.data #> '{state,roads}', 'colony', s.data #> '{state,colony}') as v
        union all
        select o.ord, o.v from jsonb_array_elements(public.jarr(s.data #> '{state,otherBases}')) with ordinality as o(v, ord)
      ) b
    )
  )
  from public.profiles p
  join public.game_saves s on s.user_id = p.user_id and s.slot = 'slot-1'
  where p.user_id = target and ((p.show_on_leaderboard and not p.hidden) or p.user_id = auth.uid())
$$;

revoke all on function public.get_leaderboard(text, integer, text) from public, anon;
revoke all on function public.get_my_position(text) from public, anon;
revoke all on function public.get_public_colony(uuid) from public, anon;
grant execute on function public.get_leaderboard(text, integer, text) to authenticated;
grant execute on function public.get_my_position(text) to authenticated;
grant execute on function public.get_public_colony(uuid) to authenticated;

-- Make the API see the new table and functions right away.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Quick check (optional): signed in as player B in the SQL editor's "Run as" role,
--   select * from public.game_saves;                 -- only B's own row
--   select * from public.get_leaderboard('xp', 10);  -- listed players only
--   select public.get_public_colony('<player A id>'); -- null if A turned the switch off
-- ---------------------------------------------------------------------------
