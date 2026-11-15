-- Every player is on the leaderboard automatically.
-- Run once in the Supabase dashboard → SQL Editor, after 0002_leaderboard.sql.
-- Safe to run again.
--
-- Before: a player appeared only after picking a username (the game created their
-- public profile then) and after their first cloud save.
-- Now:
--   * every new account gets a public profile the moment it is created (a database
--     trigger), named "Commander 4821" until the player picks their own name;
--   * every existing account gets one too (backfill below);
--   * players show on the board straight away, with 0 XP until their first save.
-- Players can still switch "Show me on the leaderboard" off in their profile.

-- A friendly placeholder name, the same every time for the same account.
create or replace function public.default_commander_name(id uuid) returns text
language sql immutable parallel safe set search_path = '' as $$
  select 'Commander ' || (1000 + abs(hashtext(id::text)) % 9000)::text
$$;

-- The username saved at sign-up if it passes the same checks as the profiles table,
-- otherwise the placeholder (a bad name must never block a sign-up).
create or replace function public.commander_name_for(id uuid, meta jsonb) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when char_length(btrim(coalesce(meta ->> 'username', ''))) between 3 and 20
     and (meta ->> 'username') !~ '[[:cntrl:]<>]'
     and public.username_ok(meta ->> 'username')
    then btrim(meta ->> 'username')
    else public.default_commander_name(id)
  end
$$;

-- New account → public profile. Never fails the sign-up itself.
create or replace function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Old versions of the game used anonymous sessions; those never go on the board.
  if coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, false) then
    return new;
  end if;
  insert into public.profiles (user_id, username)
  values (new.id, public.commander_name_for(new.id, new.raw_user_meta_data))
  on conflict (user_id) do nothing;
  return new;
exception when others then
  raise warning 'create_profile_for_new_user(%): %', new.id, sqlerrm;
  return new;
end
$$;
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Accounts that already exist.
insert into public.profiles (user_id, username)
select u.id, public.commander_name_for(u.id, u.raw_user_meta_data)
from auth.users u
where not coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Players without a cloud save yet are listed too (0 XP, Sol 1).
-- Same signatures as in 0002, so the functions built on these keep working.
-- ---------------------------------------------------------------------------

create or replace function public.leaderboard_rows(sort text)
returns table (user_id uuid, username text, username_lower text, xp bigint, sol integer, colonists integer,
               buildings integer, bases integer, saved_at timestamptz, score bigint)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.username, p.username_lower,
         coalesce(s.xp, 0), coalesce(s.sol, 1), coalesce(s.colonists, 0), coalesce(s.building_count, 0), coalesce(s.base_count, 1),
         -- No save yet: never counts as "playing now".
         coalesce(s.updated_at, '-infinity'::timestamptz),
         coalesce(case sort when 'colonists' then s.colonists when 'buildings' then s.building_count when 'bases' then s.base_count else s.xp end, 0)::bigint
  from public.profiles p
  left join public.game_saves s on s.user_id = p.user_id and s.slot = 'slot-1'
  where p.show_on_leaderboard and not p.hidden
$$;
revoke all on function public.leaderboard_rows(text) from public, anon, authenticated;

create or replace function public.get_my_position(sort text default 'xp')
returns table (place bigint, score bigint, total bigint, listed boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select coalesce(case sort when 'colonists' then s.colonists when 'buildings' then s.building_count when 'bases' then s.base_count else s.xp end, 0)::bigint as score,
           coalesce(s.xp, 0) as xp,
           (p.show_on_leaderboard and not p.hidden) as listed
    from public.profiles p
    left join public.game_saves s on s.user_id = p.user_id and s.slot = 'slot-1'
    where p.user_id = auth.uid()
  )
  select (select count(*) from public.leaderboard_rows(sort) r
          where r.user_id <> auth.uid() and (r.score > me.score or (r.score = me.score and r.xp > me.xp))) + 1,
         me.score,
         (select count(*) from public.leaderboard_rows(sort)),
         me.listed
  from me
$$;

create or replace function public.get_public_colony(target uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'userId', p.user_id,
    'username', p.username,
    'xp', coalesce(s.xp, 0),
    'sol', coalesce(s.sol, 1),
    'colonists', coalesce(s.colonists, 0),
    'buildings', coalesce(s.building_count, 0),
    'bases', coalesce(s.base_count, 0),
    'regions', coalesce(public.save_regions(s.data), 0),
    'milestones', public.jarr(s.data #> '{state,progression,milestones}'),
    'online', coalesce(s.updated_at > now() - interval '3 minutes', false),
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
        where s.data is not null
        union all
        select o.ord, o.v from jsonb_array_elements(public.jarr(s.data #> '{state,otherBases}')) with ordinality as o(v, ord)
      ) b
    )
  )
  from public.profiles p
  left join public.game_saves s on s.user_id = p.user_id and s.slot = 'slot-1'
  where p.user_id = target and ((p.show_on_leaderboard and not p.hidden) or p.user_id = auth.uid())
$$;

revoke all on function public.get_my_position(text) from public, anon;
revoke all on function public.get_public_colony(uuid) from public, anon;
grant execute on function public.get_my_position(text) to authenticated;
grant execute on function public.get_public_colony(uuid) to authenticated;

notify pgrst, 'reload schema';
