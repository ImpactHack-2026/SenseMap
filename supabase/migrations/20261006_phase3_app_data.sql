-- Phase 3 — app-owned data only (docs/DATA_POLICY.md, decisions D1 / D8).
--
-- Three tables, nothing more:
--   1. google_place_ids  — the ONLY Google-derived data stored: the Place ID
--                          plus first/last-seen timestamps. Never names,
--                          addresses, ratings, photos, or reviews.
--   2. saved_places      — app-owned: which user saved which Place ID.
--   3. user_sensory_feedback — app-owned: the visitor's own sensory note,
--                          stored only with explicit consent.
--
-- Row-level security: ENABLED on every table with ZERO policies for the
-- public roles, which means anon/authenticated are denied by default.
-- All application access goes through the Next.js server using the
-- service-role key (server-only; it bypasses RLS by design).

create table if not exists public.google_place_ids (
  place_id       text primary key,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create table if not exists public.saved_places (
  user_id    uuid not null,
  place_id   text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table if not exists public.user_sensory_feedback (
  id         uuid primary key default gen_random_uuid(),
  place_id   text not null,
  factor     text not null check (factor in ('noise', 'lighting', 'crowding', 'smell', 'seating', 'intensity')),
  note       text,
  visit_time timestamptz,
  consent    boolean not null,
  created_at timestamptz not null default now(),
  constraint user_sensory_feedback_note_len check (note is null or char_length(note) <= 1000)
);

create index if not exists user_sensory_feedback_place_id_idx
  on public.user_sensory_feedback (place_id, created_at desc);

-- RLS: enabled, no policies => public roles see nothing even if granted.
alter table public.google_place_ids      enable row level security;
alter table public.saved_places          enable row level security;
alter table public.user_sensory_feedback enable row level security;

-- Defense in depth: strip table privileges from the public roles entirely.
-- (Guarded so the migration also runs on a plain Postgres without Supabase's
--  predefined roles.) The service_role keeps its grants and bypasses RLS.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.google_place_ids      from anon, authenticated;
    revoke all on public.saved_places          from anon, authenticated;
    revoke all on public.user_sensory_feedback from anon, authenticated;
  end if;
end $$;
