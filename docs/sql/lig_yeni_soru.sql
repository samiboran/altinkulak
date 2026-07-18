-- Tahmin Ligi — yeni haftalık soru ekleme scripti.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ. Sami, DOLDURULACAK alanları
-- güncelleyip Supabase Dashboard > SQL Editor'e yapıştırıp ELLE çalıştırır.
--
-- Neden admin paneli değil de script: soru hacmi haftada 1 — bir UI/RLS yazma yolu inşa etmek
-- bu hacim için orantısız yeni bir güvenlik yüzeyi olurdu (bkz. docs/AK_MASTER_REGISTRY.json D20).
--
-- Eşik seçimi: sorunun açıldığı andaki fiyata göre ±%3-5 bandı önerilir — çok kolay/çok zor olmasın.
-- Örn. güncel fiyat 65000 ise threshold ~ 63000-67000 arası, sorunun yönüyle tutarlı seçilir.
--
-- ÖNEMLİ: Bir önceki soru henüz resolved=false ise yeni soru açmadan önce onu çöz
-- (docs/sql/lig_haftayi_coz.sql) — predictions.js:fetchActiveQuestion() en yeni "resolved=false
-- + closes_at gelecekte" tek satırı döner; iki tane aktif soru olması kafa karıştırır.

insert into public.prediction_questions (sym, question_text, threshold, opens_at, closes_at)
values (
  'BTC',                                          -- <<< DOLDUR: sembol (örn. 'BTC', 'ETH')
  'BTC bu Cuma kapanışta 65.000 üstünde mi?',      -- <<< DOLDUR: insan-okunur soru metni (eşikle tutarlı olsun)
  65000,                                           -- <<< DOLDUR: eşik değeri (resolved_value bununla kıyaslanacak)
  now(),                                           -- opens_at: şimdi açılıyor
  '2026-07-24 21:00:00+03'                         -- <<< DOLDUR: kilit kapanışı (Cuma 21:00 TSİ gibi, ISO ya da +03 offset ile)
);

-- Doğrulama: aktif soru gerçekten görünüyor mu?
select id, sym, question_text, threshold, opens_at, closes_at, resolved
from public.prediction_questions
where resolved = false
order by opens_at desc
limit 1;
