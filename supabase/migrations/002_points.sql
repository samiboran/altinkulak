-- AK-023-EXT: Kulak Puanı ekonomisi — point_events (event sourcing).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001_init.sql sonrası).

-- ============================================================
-- point_events — tek gerçek kaynak. Bakiye/lifetime HER ZAMAN buradan türetilir (src/lib/points.js),
-- ayrı bir "point_balance" tablosu YOK.
-- ============================================================
create table if not exists public.point_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null,       -- 'streak_7' | 'streak_30' | 'invite_activated' | 'strategy_verified' | 'edu_content' | 'spend'
  amount     numeric not null,    -- kazanımda pozitif, harcamada negatif
  ref_id     text,                -- davet/strateji/harcama kalemi id'si (varsa)
  created_at timestamptz not null default now()
);

create index if not exists point_events_user_id_idx on public.point_events(user_id);
create index if not exists point_events_user_created_idx on public.point_events(user_id, created_at);

alter table public.point_events enable row level security;

-- Herkese açık okunur: contrib rank (Profil.jsx vitrin) BAŞKA kullanıcıların görüntülediği sayfada
-- gösterilir — İstatistik dürüstlüğü ilkesi (puan tablosu herkese açık ve sabit) SELECT'i de kapsar.
create policy "point_events herkese acik okunur"
  on public.point_events for select
  using (true);

-- Yalnız kullanıcı kendi adına event ekleyebilir (src/lib/points.js hem kazanım hem harcamada
-- auth.uid() ile insert eder). v1'de sunucu-taraflı doğrulama YOK (statik SPA, backend fonksiyonu
-- yok) — bu, RLS'in verebileceği en güçlü garanti; ileri seviye XP-farming'e karşı asıl savunma
-- kazanım kurallarının kendisi (yalnız topluluk-yararı davranışları puan verir, işlem hacmi asla).
create policy "kullanici kendi point_event'ini olusturur"
  on public.point_events for insert
  with check (auth.uid() = user_id);

-- Güncelleme/silme YOK (append-only, ledger.js'in "silme fonksiyonu yok" dürüstlük ilkesiyle aynı aile).
