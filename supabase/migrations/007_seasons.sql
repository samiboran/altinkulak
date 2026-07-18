-- AK-083-TAMAMLAMA: Sezon iskeleti — yalnız isim + tarih aralığı. Ekstra mekanik YOK (D17).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001_init.sql sonrası).
--
-- Sezon "arşivleme" ayrı bir işlem GEREKTİRMEZ: predictions/point_events/replay_scores zaten
-- append-only + created_at'li (D9) — eski sezon verisi created_at aralığıyla sorgulanarak her
-- zaman erişilebilir kalır. Sezonluk kozmetik rozet dağıtımı da ayrı bir "dağıtım" adımı GEREKTİRMEZ:
-- badges.js/deriveBadges saf türetimdir, sezon içi katılım stats'tan hesaplanır (bkz. seasons.js).
--
-- Yeni soru/soru çözme gibi, yeni sezon oluşturma da v1'de elle: docs/sql/sezon_yeni.sql.

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists seasons_starts_ends_idx on public.seasons(starts_at, ends_at);

alter table public.seasons enable row level security;

-- Herkese açık okunur — hangi sezonun aktif olduğu gizli bir bilgi değil.
create policy "seasons herkese acik okunur"
  on public.seasons for select
  using (true);

-- Yazma policy'si YOK (D20 — bkz. docs/AK_MASTER_REGISTRY.json): sezon oluşturma elle,
-- docs/sql/sezon_yeni.sql ile Sami tarafından yapılır.
