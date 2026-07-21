-- ============================================================
-- AK-098: Sicil (trade ledger) Supabase'e taşınır — D22 kararı
-- Supabase SQL Editor → yapıştır → Run. Tekrar çalıştırılabilir.
-- İlkeler: append-only (UPDATE/DELETE politikası HİÇ YOK = sahibi
-- bile silemez), ±2R tavanı ŞEMADA, public rütbe yalnız edge_stats
-- görünümünden (ham satırlar sadece sahibine), D9 event sourcing.
-- ============================================================

create table if not exists public.ledger_events (
  id uuid primary key,                          -- CLIENT üretir (idempotent migrasyon: aynı id ikinci kez insert edilemez)
  user_id uuid not null references auth.users(id),
  sym text not null,
  setup text not null,                          -- FVG / OB / BOS / ...
  dir smallint not null check (dir in (1, -1)), -- 1 long, -1 short
  risk_r numeric not null check (risk_r > 0),
  result_r numeric not null,                    -- ham sonuç (R katı) — tavansız saklanır, şeffaflık
  capped_r numeric generated always as (least(greatest(result_r, -2), 2)) stored,
                                                -- ±2R tavanı ŞEMADA: hiçbir istemci atlatamaz (anti-gaming, ranks.js kuralı)
  plan_uyum boolean not null default true,      -- plana uydu mu (öz-beyan disiplin metriği)
  client_ts timestamptz not null,               -- kullanıcının cihazındaki işlem zamanı (migrasyonda korunur)
  server_ts timestamptz not null default now()  -- sunucu damgası (geriye-tarihleme tespiti zemini, v1 sadece kayıt)
);

create index if not exists ledger_events_user_ts on public.ledger_events (user_id, client_ts);

alter table public.ledger_events enable row level security;

-- SİLİNEMEZLİK: yalnız insert + kendi satırlarını select.
-- UPDATE/DELETE politikası bilinçli olarak YOK — RLS'te politika yoksa işlem yasaktır.
drop policy if exists "ledger_insert_own" on public.ledger_events;
create policy "ledger_insert_own" on public.ledger_events
  for insert with check (user_id = auth.uid());

drop policy if exists "ledger_select_own" on public.ledger_events;
create policy "ledger_select_own" on public.ledger_events
  for select using (user_id = auth.uid());

-- ============================================================
-- PUBLIC RÜTBE KAYNAĞI: ham sicil sızmaz, yalnız toplulaştırılmış
-- istatistik (lifetime_points deseniyle aynı). t istemcide:
-- t = avg_capped_r / (sd_capped_r / sqrt(n))  — sd null/0 ise t yok.
-- ============================================================
create or replace view public.edge_stats as
  select
    user_id,
    count(*)::int                as n,
    avg(capped_r)::numeric(10,4) as avg_capped_r,
    stddev_samp(capped_r)::numeric(10,4) as sd_capped_r,
    sum(capped_r)::numeric(10,2) as total_capped_r,
    max(client_ts)               as last_trade_at
  from public.ledger_events
  group by user_id;

grant select on public.edge_stats to anon, authenticated;

-- NOT (Code için):
-- 1) Migrasyon: localStorage ak_ledger_v1 kayıtları UUID'leriyle toplu insert edilir;
--    id çakışması = zaten taşınmış → sessiz atla (on conflict do nothing).
-- 2) ranks.js edgeRank() girdisi artık edge_stats satırından beslenir (n, avg, sd) —
--    motor imzası değişmez, sadece veri kaynağı.
-- 3) Sandbox bu tabloya ASLA yazmaz — deneme alanı silinebilir kalır (mevcut ayrım).
