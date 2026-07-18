-- AK-083-TAMAMLAMA: Replay Ligi — replay_scores (event/append-only, predictions.js ailesiyle aynı desen).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001_init.sql sonrası).
--
-- Senaryo tanımları kodda (src/lib/scenarios.js) sabit — burada yalnız SKOR saklanır.
-- Bir senaryo tekrar oynanabilir (pratik) ama İLK deneme resmi skordur ve değişmez
-- (unique(user_id, scenario_id) + update/delete policy yok — ledger.js/predictions.js ile aynı ilke).
-- D16: bu skor oyun katmanıdır, edge rank'a ASLA akmaz.

create table if not exists public.replay_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  scenario_id text not null,       -- src/lib/scenarios.js SCENARIOS[].id ile eşleşir
  r_score     numeric not null,    -- -1..+2 aralığında (ATR-stop/2R-hedef modeli, Lab.jsx pratik moduyla aynı)
  created_at  timestamptz not null default now(),
  unique (user_id, scenario_id)
);

create index if not exists replay_scores_scenario_id_idx on public.replay_scores(scenario_id);
create index if not exists replay_scores_user_id_idx on public.replay_scores(user_id);

alter table public.replay_scores enable row level security;

-- Herkese açık okunur: percentile hesabı (src/lib/replay.js) TÜM kullanıcıların skorlarına ihtiyaç
-- duyar — tıpkı predictions/point_events'te olduğu gibi (sonuç kartı public, D3 ailesi).
create policy "replay_scores herkese acik okunur"
  on public.replay_scores for select
  using (true);

create policy "kullanici kendi replay_score'unu olusturur"
  on public.replay_scores for insert
  with check (auth.uid() = user_id);

-- Güncelleme/silme YOK — ilk deneme resmi skordur, değişmez.
