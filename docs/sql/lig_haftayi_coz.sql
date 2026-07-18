-- Tahmin Ligi — haftayı çözme scripti (soru resolved=true yapılır, outcome hesaplanır).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ. Sami, DOLDURULACAK alanları
-- güncelleyip Supabase Dashboard > SQL Editor'e yapıştırıp ELLE çalıştırır.
--
-- Çözüm kaynağı TEK NOKTA: Binance kapanış fiyatı (binance.com/en/trade/BTC_USDT, ilgili
-- kapanış zamanındaki mum kapanışı) — elle müdahale/yorum yok, yalnız o değer buraya girilir.
--
-- ÖNEMLİ: outcome burada ELLE yazılmaz — resolved_value > threshold karşılaştırmasını SQL'in
-- kendisi yapar (insan "up"/"down" yazarken ters girebilir, bu hata kaynağını ortadan kaldırır).
-- brier.js/leaderboard/calibrationCurve zaten hesap zamanında (Lig.jsx okurken) türetilir —
-- bu script sadece ham veriyi (resolved_value, outcome, resolved) yazar, skor burada YOK (D9).

-- Değer yalnız BİR YERDE girilir (input CTE'si) — SET listesinde ikinci kez yazmak gerekmez,
-- bu da "aynı sayıyı iki yere yaz" kaynaklı kopyalama hatasını ortadan kaldırır.
with input as (
  select 66120::numeric as val  -- <<< DOLDUR: Binance kapanış fiyatı (yalnız sayı, yorum yok)
)
update public.prediction_questions q
set
  resolved_value = input.val,
  outcome        = case when input.val > q.threshold then 'up' else 'down' end,
  resolved       = true
from input
where q.id = '00000000-0000-0000-0000-000000000000';  -- <<< DOLDUR: docs/sql/lig_yeni_soru.sql çıktısındaki soru id'si

-- Doğrulama: doğru soru mu çözüldü, outcome tutarlı mı?
select id, sym, question_text, threshold, resolved_value, outcome, resolved
from public.prediction_questions
where id = '00000000-0000-0000-0000-000000000000';  -- <<< aynı id
