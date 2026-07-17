-- AK-080: bekleme listesi — insert-only, kimlik doğrulama gerektirmez.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır.

-- ============================================================
-- waitlist — Giris.jsx "Bekleme listesi" sekmesi. Hesabı olmayan biri katıldığı için
-- user_id/profiles ilişkisi YOK, yalnız e-posta. Aynı e-posta ikinci kez katılmaya
-- çalışırsa unique constraint hatası verir; src/lib/supabase.js joinWaitlist() bu
-- durumu (code 23505) kullanıcıya sessizce "başarılı" gösterir (zaten listede olduğunu sızdırmaz).
-- ============================================================
create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Herkes (girişsiz dahil) kendi e-postasını ekleyebilir. Okuma/güncelleme/silme politikası
-- yok — bu tablo yalnız Sami'nin Supabase panelinden görüntülemesi için, uygulama hiçbir
-- yerde waitlist'i geri okumaz.
create policy "herkes bekleme listesine katilabilir"
  on public.waitlist for insert
  with check (true);
