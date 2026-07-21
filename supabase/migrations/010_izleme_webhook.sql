-- AK-FVG-panel: İzleme — "Code'a bağla" (Pine Alert Webhook) entegrasyonu.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001_init.sql sonrası).
--
-- KARAR (görev metninden): İzleme listesi kendisi localStorage'da kalır (AK-080 persistence-
-- gating) — bu tablo TÜM izleme listesinin sunucu aynası DEĞİLDİR. Yalnız kullanıcı "Code'a
-- bağla" dediği (yani bir webhook'a ihtiyaç duyduğu) SEMBOL için opt-in bir satır açılır; sebep,
-- bir webhook'un tarayıcı kapalıyken de token'ı tanıyabilmesi için sunucu tarafı bir kayda ihtiyaç
-- duyması. D16: bu tablo asla trade/prediction/sandbox tablolarına yazmaz — yalnız kendi durumunu
-- günceller (Pine alert tetiklenince tek etki: webhook_status/last_triggered_at/last_payload).

create table if not exists public.izleme_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  sym                text not null,
  -- 12 random byte = 24 hex karakter (~96 bit) — 009_contributors_referrals.sql'deki
  -- generate_referral_code() ile AYNI entropi düzeyi, ayrı fonksiyona bağımlı olmadan.
  webhook_token      text not null unique default encode(gen_random_bytes(12), 'hex'),
  webhook_status     text not null default 'baglandi' check (webhook_status in ('baglanmadi', 'baglandi', 'tetiklendi')),
  last_triggered_at  timestamptz,
  last_payload       text, -- Pine alert body'si, yalnız log/gösterim amaçlı (ilk 4000 karakterle sınırlı, bkz. Edge Function)
  created_at         timestamptz not null default now(),
  unique (user_id, sym)
);

create index if not exists izleme_entries_user_id_idx on public.izleme_entries(user_id);
-- Webhook endpoint token'a göre arar — SERVICE ROLE ile (RLS'i atlar), ama index yine de gerekli.
create index if not exists izleme_entries_webhook_token_idx on public.izleme_entries(webhook_token);

alter table public.izleme_entries enable row level security;

-- Kullanıcı yalnız kendi kayıtlarını görür/oluşturur — başka birinin token'ını listeleyip
-- tahmin etmeye çalışamaz (webhook_token zaten 96 bit rastgele, ama kayıt da public değil).
create policy "izleme_entries yalniz sahibi gorur"
  on public.izleme_entries for select
  using (auth.uid() = user_id);

create policy "kullanici kendi izleme_entries kaydini olusturur"
  on public.izleme_entries for insert
  with check (auth.uid() = user_id);

-- UPDATE policy'si BİLEREK YOK: webhook_status/last_triggered_at yalnız Edge Function'ın
-- kullandığı SERVICE ROLE key ile değişir (RLS'i atlar) — istemci kendi durumunu doğrudan
-- 'tetiklendi' yapamaz, sahte tetiklenme rozeti üretemez.
-- DELETE policy'si de yok — Sicil (D22) ailesindeki "kilit kilittir" ilkesiyle tutarlı.
