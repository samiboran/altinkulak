-- AK-webhook-teşhis: İzleme webhook'unda reddedilen isteklerin (token eşleşmeyenler hariç —
-- onlar için hangi kayda yazılacağı bilinmiyor) sebebini görünür kılar.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil, bkz. 010_izleme_webhook.sql).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (010_izleme_webhook.sql sonrası).
--
-- SORUN (teşhis notu): önceki bir webhook denemesinin tam olarak neden başarısız olduğu ("fazla
-- satır girildi" gibi bir sebep) gerçek log görülmeden teyit edilemedi. Kod incelemesinde bulunan
-- GERÇEK yapısal sebep: token eşleşme/rate-limit dışında kalan HER ret (ör. çok büyük payload)
-- hiçbir yere kaydedilmiyordu — ne izleme_entries'te ne UI'da bir iz bırakıyordu. Bu migration,
-- Edge Function'ın artık yazdığı last_error/last_failed_at alanlarını ve 'hata' durumunu ekler.

alter table public.izleme_entries
  add column if not exists last_error      text,
  add column if not exists last_failed_at  timestamptz;

-- İnce ayrıntı: 010'da adsız (satır-içi) tanımlanan check constraint, Postgres'in varsayılan
-- adlandırmasıyla izleme_entries_webhook_status_check olarak oluşur — 'hata' durumunu eklemek
-- için yeniden tanımlanır.
alter table public.izleme_entries drop constraint if exists izleme_entries_webhook_status_check;
alter table public.izleme_entries add constraint izleme_entries_webhook_status_check
  check (webhook_status in ('baglanmadi', 'baglandi', 'tetiklendi', 'hata'));
