# Plan: online leaderboard, player profiles and base visits

Version 2, 2026-11-15. Status: **built** (approved 2026-11-15 with the recommended defaults below).

**Added on approval: search.** A search bar sits on top of the best player in both boards: the short
top-5 board at the bottom of *My profile*, and the full *Leaderboard* tab. It matches any part of a
name (case-insensitive) and shows each match with its real place on the whole board.

**Goal.**
- Signed-in players can open an **online leaderboard** from the Commander profile (the rank badge in the top bar).
- Clicking a player opens their **profile**: name, rank, XP, colony stats and a list of their bases.
- From that profile the player can **visit (spectate) any of their bases**. The base is drawn in 3D on Mars in
  read-only mode, then the player goes back home.

**Not in scope.**
- No chat, messages, friend requests or trading. For a kids' game, profiles can only be viewed.
- No real-time co-op. Visits show the other player's colony as of their last autosave (at most about 60 s old).

---

## What already exists (and what we reuse)

| Piece | Where | Reuse |
|---|---|---|
| Email + password accounts, username in user metadata | `src/persistence/Auth.ts` | Leaderboard is for signed-in accounts only |
| Cloud save per account, `public.game_saves` (RLS: owner only) | `supabase/migrations/0001_game_saves.sql`, `CloudSaves.ts` | Source of all leaderboard numbers. No second copy is written |
| Autosave every 60 s | `Game.ts` (`AUTOSAVE_SECONDS`) | Sets how fresh other players' data is |
| Profile dialog with stats + rank ladder | `src/ui/ProfileDialog.ts` | Gets a **Leaderboard** tab. The stats layout is reused for other players |
| Static drawing of a base that isn't on screen | `SettlementManager.showSnapshot()` | Draws a visited base without running its simulation |
| Globe holes / flat pads under bases | `Mars.setHoles()`, `Terrain.addPad()` | Swapped while visiting, then restored |

---

## Decisions (recommended defaults, to confirm)

1. **Who appears on the board:** signed-in players **with a username**. Each player has a
   "Show me on the leaderboard" switch in their profile, **on by default**. Guests can't appear on the board
   or see it; they see a "Log in to see the leaderboard" prompt instead.
2. **What others can see:** username, rank, XP, sol, crew, building count, regions, goals and the layout of
   each base (building types and positions, roads). **Never** email, resources or the mission log.
3. **Sort orders:** XP (default), Crew, Buildings, Bases. Top 50, plus your own row pinned at the bottom if
   you are outside the top 50.
4. **Visits are snapshots** that refresh every 60 s while you watch. While you visit, your own colony is
   **paused**, so nothing happens at your base while you're away.
5. **"Online" dot:** a player counts as online if their save is less than 3 minutes old.

---

## Phase 1 · Database (Supabase migration `0002_leaderboard.sql`)

The save table stays private. Other players read only a few chosen fields, through two
`security definer` functions.

- **`public.profiles`**: `user_id` (pk, refs `auth.users`), `username`, `show_on_leaderboard bool default true`,
  `hidden bool default false` (only an admin can set it, to remove a bad name), `updated_at`.
  - RLS: owners can insert and update their own row, except the `hidden` column, which is guarded by a
    column grant. No direct select for anyone else.
  - `username` check: 3–20 characters, same pattern as `validateUsername`.
- **Generated columns on `game_saves`**, so sorting doesn't parse JSON on every request:
  `xp`, `colonists`, `building_count`, `base_count`, all `generated always as (...) stored`, plus indexes
  on `xp` and `colonists`.
- **`get_leaderboard(sort text, max int)`** returns `user_id, username, rank_level, xp, sol, colonists,
  buildings, bases, online, position`. It covers `slot-1` only, rows with `show_on_leaderboard and not
  hidden and username is not null`.
- **`get_my_position(sort text)`** returns the caller's own row and position, for pinning.
- **`get_public_colony(target uuid)`** returns the profile stats above plus, for each base,
  `{id, name, siteId, lat, lon, foundedSol, buildings[], roads[]}`. Each building is cut down to the
  fields the renderer needs (`id, type, gridX, gridY, rotation, constructionProgress, connected`). It
  returns null unless the target is listed and not hidden.
- Both functions are granted to `authenticated` only (not `anon`). Results are capped (`max <= 100`).
- **Abuse limits (DB checks):** XP and counts ≥ 0, size of the save JSON capped (e.g. 2 MB). Cheating
  (editing your own XP in the browser) **can't be fully prevented**: the simulation runs on the client.
  We accept this for a kids' game, and an admin can hide a row.

**Username safety.** Add a short blocked-words list to `validateUsername` (client side) and the same list as
a DB check. `hidden` handles anything that gets through.

## Phase 2 · Client data layer

- **`src/persistence/Leaderboard.ts`**: `list(sort)`, `myPosition(sort)`, `colony(userId)`, all thin
  `supabase.rpc` wrappers. A 30 s in-memory cache per sort order. Each call fails gracefully: offline
  returns an empty list with a message, as `CloudSaves` does.
- **Profiles sync:** `Auth.setUsername` also upserts `profiles`. After login or sign-up, make sure a
  profile row exists, copying the username from metadata (this covers existing accounts).
  `setLeaderboardVisible(bool)` updates the switch.
- Types `LeaderboardRow`, `PublicColony`, `PublicBase` in the same file.

## Phase 3 · Profile dialog: Leaderboard tab + player profiles

All inside `ProfileDialog.ts` (split into `LeaderboardView.ts` and `PlayerProfileView.ts` if it gets long).

- Tabs at the top of the card: **My profile** | **Leaderboard** (keyboard: arrows switch tabs, `role="tablist"`).
- **Leaderboard tab:**
  - Sort chips: XP · Crew · Buildings · Bases.
  - Rows: position (🥇🥈🥉 for the top 3), rank badge (`rankBadgeSvg`), username, rank title, the sorted
    stat, a green "online" dot. Your own row is highlighted and pinned at the bottom if it's off-screen.
  - States: loading skeleton, empty ("No commanders yet — be the first!"), offline / error with Retry,
    guest ("Log in to join the leaderboard").
- **Player profile view** (click a row): same header, XP bar and stats grid as your own profile, plus a
  **Bases** list (name, site, founded sol, building count), each with a **Visit** button. A back arrow
  returns to the board.
- **My profile tab** gets the "Show me on the leaderboard" switch and your current position ("#12 by XP").

## Phase 4 · Visiting a base (spectate mode)

New **`src/core/Spectator.ts`**, owned by `Game`.

- **Enter** `visit(colony: PublicColony, baseId)`:
  1. Remember `paused` and pause the simulation.
  2. Set a transient store field `visiting: { userId, name, baseId } | null`. It isn't in `SavedKeys`, so
     it's never saved.
  3. Hide your own settlement groups, rover fleet and logistics view.
  4. For each of their bases, create a `SettlementManager` (inactive) and call `showSnapshot(buildings,
     roads)`. Swap `mars.setHoles` and `camera.setBases` to their sites.
  5. Fly the camera to the chosen base.
- **While visiting:**
  - A banner at the top reads "Visiting **Nova**'s colony · Sol 214". It has a base picker (their bases)
    and a **Return home** button. Esc also returns home.
  - Toolbar, side panel, construction, road and pipeline tools, `BaseSwitcher`, resource HUD and
    `GarageArrow` are hidden or disabled while `visiting` is set. `InputController` click handling only
    allows camera moves and building hover / info.
  - Clicking a building shows a small read-only card (name, icon, "under construction %"). No actions.
  - Refreshes the snapshot every 60 s via `get_public_colony`. `showSnapshot` already skips work when
    nothing changed.
- **Exit:** dispose the visitor managers and remove their groups. Remove any terrain pads added for
  their sites (needs a new `Terrain.removePad`, since `addPad` is permanent today). Run `syncBases()` to
  restore your holes and bases, show your groups, restore `paused`, fly home.
- **Safety:**
  - Autosave keeps working: the store still holds only your own colony.
  - Logging out or a save load while visiting forces an exit first.
  - A visit that fails to load shows an alert and never leaves the game half-switched.

## Phase 5 · Tests and checks

- **Unit (vitest):**
  - `Leaderboard.ts` mapping and sorting with a mocked `supabase.rpc`.
  - Spectator enter/exit restores `paused`, holes and settlement visibility (with stubs).
  - `validateUsername` blocks the word list.
- **SQL:** a short script in the migration comments that checks a second user can't read `game_saves`
  directly and can read only listed rows through the functions.
- `npm run typecheck`, then one quick look in the browser: open the board, open a profile, visit, return.

---

## Files touched

- New: `supabase/migrations/0002_leaderboard.sql`, `src/persistence/Leaderboard.ts`, `src/core/Spectator.ts`,
  `src/ui/LeaderboardView.ts`, `src/ui/PlayerProfileView.ts`, `src/ui/VisitBanner.ts`.
- Changed: `ProfileDialog.ts` (tabs, switch), `Auth.ts` (profile sync, word list), `Game.ts` (spectator wiring),
  `state/types.ts` + `gameStore.ts` (`visiting`), `Terrain.ts` (`removePad`), `Toolbar.ts`, `SidePanel.ts`,
  `BaseSwitcher.ts`, `HUD.ts`, `GarageArrow.ts`, `InputController.ts` (hide/disable while visiting),
  `styles/main.css`.

## Manual step for you

Run `0002_leaderboard.sql` once in the Supabase dashboard → SQL Editor, as with `0001`. The game works
without it: the Leaderboard tab then shows "Leaderboard not available yet".

## Risks

- **Cheating:** client-side simulation means XP can be faked. Admin `hidden` flag is the fallback.
- **Usernames visible to other kids:** word filter + admin hide. Consider a "report name" button later.
- **Scale:** generated columns + indexes keep the board fast into the thousands of players. Beyond that,
  add a materialised view refreshed on a schedule.
