-- Sezon iskeleti — yeni sezon açma scripti (v1: yalnız isim + tarih aralığı, D17).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ. Sami, DOLDURULACAK alanları
-- güncelleyip Supabase Dashboard > SQL Editor'e yapıştırıp ELLE çalıştırır.
--
-- Ayrı bir "sezonu kapat/arşivle" adımı YOK: eski sezonun predictions/replay_scores verisi
-- created_at aralığıyla her zaman sorgulanabilir kalır (D9). Yeni sezon açmak eskisini silmez —
-- yalnız src/lib/seasons.js:fetchActiveSeason() artık YENİ sezonu döner (now() iki aralığa
-- birden düşmesin diye eski sezonun ends_at'i yeni sezonun starts_at'inden önce/eşit olmalı).

insert into public.seasons (name, starts_at, ends_at)
values (
  'Sezon 1',                  -- <<< DOLDUR: sezon adı
  '2026-07-20 00:00:00+03',   -- <<< DOLDUR: başlangıç (ISO, +03 TSİ)
  '2026-10-20 00:00:00+03'    -- <<< DOLDUR: bitiş — v1 önerisi: 3 ay (D17)
);

-- Doğrulama
select id, name, starts_at, ends_at
from public.seasons
order by starts_at desc
limit 1;
