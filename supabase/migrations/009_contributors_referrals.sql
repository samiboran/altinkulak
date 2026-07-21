-- Katkıcı rozet / referral / ayrıcalık sistemi.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001_init.sql ve 004_waitlist.sql sonrası).

create extension if not exists pgcrypto;

-- ============================================================
-- admins — basit admin kontrolü (projede başka admin mantığı varsa is_admin() değiştirilebilir)
-- ============================================================
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  );
$$;

-- ============================================================
-- contributors — görünen rozet + gerçek ayrıcalık seviyesi
-- ============================================================
create table if not exists public.contributors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  title text not null default 'topluluk_uyesi'
    check (title in ('kurucu_katkici', 'cekirdek_katkici', 'katkici', 'topluluk_uyesi')),
  privilege_level text not null default 'standard'
    check (privilege_level in ('founding', 'core', 'standard')),
  contribution_count int not null default 0,
  referral_code text unique not null default substr(md5(random()::text), 1, 8),
  referred_by uuid references public.contributors(id),
  awarded_by uuid references auth.users(id),
  awarded_at timestamptz not null default now(),
  notes text
);

comment on table public.contributors is
  'Rozet (title) ve ayrıcalık seviyesi (privilege_level) burada tutulur. '
  'title = görünen rozet/soy ağacı seviyesi. privilege_level = RLS''in baktığı gerçek yetki.';

-- ============================================================
-- contributor_perks — title -> perk lookup
-- ============================================================
create table if not exists public.contributor_perks (
  title text not null
    check (title in ('kurucu_katkici', 'cekirdek_katkici', 'katkici', 'topluluk_uyesi')),
  perk_key text not null,
  perk_description text,
  primary key (title, perk_key)
);

insert into public.contributor_perks (title, perk_key, perk_description) values
  ('kurucu_katkici', 'core_features_free_forever', 'Temel simülasyon/öğrenim özelliklerine sonsuza kadar ücretsiz erişim'),
  ('kurucu_katkici', 'early_access', 'Yeni özelliklere herkesten önce erişim'),
  ('kurucu_katkici', 'special_badge', 'Profilde "Kurucu Katkıcı" rozeti'),
  ('cekirdek_katkici', 'early_access', 'Yeni özelliklere erken erişim'),
  ('cekirdek_katkici', 'special_badge', 'Profilde "Çekirdek Katkıcı" rozeti'),
  ('katkici', 'special_badge', 'Profilde "Katkıcı" rozeti')
on conflict do nothing;

-- ============================================================
-- waitlist_entries — mail listesi + referral
-- ============================================================
create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  referral_code text unique not null default substr(md5(random()::text), 1, 8),
  referred_by_code text references public.waitlist_entries(referral_code),
  invited_count int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'invited', 'converted')),
  joined_at timestamptz not null default now(),
  invited_at timestamptz
);

comment on table public.waitlist_entries is
  'Mail listesi + referral. Her kişi 2 kişi davet edince status otomatik "invited" olur, '
  'kayıt olduklarında status "converted" ve contributors''a katkıcı adayı olarak düşer.';

create index if not exists waitlist_entries_referred_by_code_idx
  on public.waitlist_entries(referred_by_code);

do $$
begin
  if to_regclass('public.waitlist') is not null then
    insert into public.waitlist_entries (email, joined_at)
    select lower(trim(email)), created_at
    from public.waitlist
    on conflict (email) do nothing;
  end if;
end
$$;

-- ============================================================
-- Otomatik referral sayacı + invited yükseltmesi
-- ============================================================
create or replace function public.bump_referrer_invite_count()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.referred_by_code is not null then
    update public.waitlist_entries
    set invited_count = invited_count + 1
    where referral_code = new.referred_by_code;

    update public.waitlist_entries
    set status = 'invited',
        invited_at = now()
    where referral_code = new.referred_by_code
      and invited_count >= 2
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bump_referrer_invite_count on public.waitlist_entries;
create trigger trg_bump_referrer_invite_count
  after insert on public.waitlist_entries
  for each row execute function public.bump_referrer_invite_count();

-- ============================================================
-- invited waitlist kullanıcısı kayıt olunca converted + contributor aday kaydı
-- ============================================================
create or replace function public.convert_waitlist_invitee_to_contributor()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matched_waitlist_id uuid;
begin
  select id
  into matched_waitlist_id
  from public.waitlist_entries
  where lower(email) = lower(new.email)
    and status = 'invited'
  order by joined_at asc
  limit 1;

  if matched_waitlist_id is null then
    return new;
  end if;

  insert into public.contributors (user_id, notes)
  values (new.id, 'Referral ile invited olduktan sonra kaydoldu.')
  on conflict (user_id) do nothing;

  update public.waitlist_entries
  set status = 'converted'
  where id = matched_waitlist_id;

  return new;
end;
$$;

drop trigger if exists trg_convert_waitlist_invitee_to_contributor on auth.users;
create trigger trg_convert_waitlist_invitee_to_contributor
  after insert on auth.users
  for each row execute function public.convert_waitlist_invitee_to_contributor();

-- ============================================================
-- RLS
-- ============================================================
alter table public.contributors enable row level security;
alter table public.contributor_perks enable row level security;
alter table public.waitlist_entries enable row level security;

drop policy if exists "contributors_select_own_or_admin" on public.contributors;
create policy "contributors_select_own_or_admin"
  on public.contributors for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "contributors_admin_write" on public.contributors;
create policy "contributors_admin_write"
  on public.contributors for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "perks_public_read" on public.contributor_perks;
create policy "perks_public_read"
  on public.contributor_perks for select
  using (true);

drop policy if exists "waitlist_select_own_or_admin" on public.waitlist_entries;
create policy "waitlist_select_own_or_admin"
  on public.waitlist_entries for select
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_admin()
  );

drop policy if exists "waitlist_insert_anyone" on public.waitlist_entries;
create policy "waitlist_insert_anyone"
  on public.waitlist_entries for insert
  with check (true);

drop policy if exists "waitlist_admin_write" on public.waitlist_entries;
create policy "waitlist_admin_write"
  on public.waitlist_entries for update
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- Ayrıcalıklı görünüm
-- ============================================================
create or replace view public.my_privileges
with (security_invoker = true)
as
  select c.title, c.privilege_level, cp.perk_key, cp.perk_description
  from public.contributors c
  join public.contributor_perks cp on cp.title = c.title
  where c.user_id = auth.uid()
    and c.privilege_level <> 'standard';

comment on view public.my_privileges is
  'Kullanıcının kendi title''ına göre sahip olduğu ayrıcalıkları döner. '
  'Frontend''de "ayrıcalıklarım" ekranı için kullanılır, admin paneli değildir.';
