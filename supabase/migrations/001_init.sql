-- AK-053: profiles / follows / strategies temel şeması + RLS.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır.

-- gen_random_uuid() için (Supabase projelerinde genelde hazır gelir, garanti olsun diye)
create extension if not exists pgcrypto;

-- ============================================================
-- profiles — her auth kullanıcısının herkese açık profil satırı
-- ============================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  handle     text not null unique,
  job        text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles herkese acik okunur"
  on public.profiles for select
  using (true);

create policy "kullanici kendi profilini olusturur"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "kullanici kendi profilini gunceller"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "kullanici kendi profilini siler"
  on public.profiles for delete
  using (auth.uid() = id);

-- ============================================================
-- follows — takip ilişkileri (kim kimi takip ediyor)
-- ============================================================
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx on public.follows(following_id);

alter table public.follows enable row level security;

create policy "follows herkese acik okunur"
  on public.follows for select
  using (true);

create policy "kullanici kendi takibini olusturur"
  on public.follows for insert
  with check (auth.uid() = follower_id);

create policy "kullanici kendi takibini siler"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ============================================================
-- strategies — paylaşılan stratejiler (Topluluk/Profil kartları)
-- ============================================================
create table if not exists public.strategies (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  sym        text not null,
  setup      text not null,
  rr         numeric not null,
  win_rate   numeric not null,
  oos_t      numeric not null,
  forks      integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists strategies_user_id_idx on public.strategies(user_id);

alter table public.strategies enable row level security;

create policy "strategies herkese acik okunur"
  on public.strategies for select
  using (true);

create policy "kullanici kendi stratejisini olusturur"
  on public.strategies for insert
  with check (auth.uid() = user_id);

create policy "kullanici kendi stratejisini gunceller"
  on public.strategies for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "kullanici kendi stratejisini siler"
  on public.strategies for delete
  using (auth.uid() = user_id);
