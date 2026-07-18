-- AK-083-TAMAMLAMA: prediction_questions'a eşik-bazlı çözüm kolonları eklenir.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (003_predictions.sql sonrası).
--
-- Neden: soru metni "BTC [gelecek Cuma] eşik üstü mü?" biçiminde; çözüm TEK veri kaynağından
-- (Binance kapanışı) gelir ve elle "up"/"down" yazmak yerine SQL'in kendisi eşikle kıyaslayıp
-- outcome'ı türetmesi istenir (insan hatasına kapalı — docs/sql/lig_haftayi_coz.sql bunu kullanır).
-- Additive migration: mevcut satırlar/predictions.js sorguları etkilenmez, iki kolon da nullable.

alter table public.prediction_questions
  add column if not exists threshold      numeric,  -- soru eşiği (örn. kapanış fiyatı)
  add column if not exists resolved_value numeric;   -- çözüm anında girilen gerçek değer (Binance kapanışı)

-- RLS/policy değişikliği yok — 003'teki "herkese açık okunur" select policy bu iki kolonu da kapsar.
-- Yazma policy'si YİNE YOK (003'teki kasıtlı karara uyulur — bkz. docs/AK_MASTER_REGISTRY.json D20):
-- soru oluşturma/çözme docs/sql/ altındaki scriptlerle Sami tarafından elle, Dashboard'tan yapılır.
