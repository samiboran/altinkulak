-- AK-090: Topluluk Fikirleri — ideas + idea_reactions + idea_reports (event/append-only).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001_init.sql sonrası).
--
-- D21/D19 ruhu: bu bir SİNYAL SERVİSİ DEĞİL — thesis serbest metin ama parametre/kod içermez
-- (o zaten client tarafında engellenir, D3'ün doğal uzantısı). Fikirler DÜZENLENEMEZ/SİLİNEMEZ
-- (ledger.js/predictions.js ailesiyle aynı ilke — paylaşılan bir tez sonradan sessizce değişmez).

-- ============================================================
-- ideas — paylaşılan fikir/tez. thesis zorunlu (client tarafında min uzunluk kontrolü var,
-- burada da NOT NULL ile ikinci savunma katmanı).
-- ============================================================
create table if not exists public.ideas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  symbol             text not null,
  thesis             text not null,
  chart_snapshot_ref text,                    -- v1'de kullanılmıyor (bkz. AK-090 commit notu — Supabase Storage kurulu değil), şema hazır
  created_at         timestamptz not null default now()
);

create index if not exists ideas_user_id_idx on public.ideas(user_id);
create index if not exists ideas_created_at_idx on public.ideas(created_at);

alter table public.ideas enable row level security;

-- Guest de fikirleri görebilir (D6/AK-080: değerin çoğu login'siz açık) — yalnız paylaşmak/tepki
-- vermek giriş ister.
create policy "ideas herkese acik okunur"
  on public.ideas for select
  using (true);

create policy "kullanici kendi ideasini olusturur"
  on public.ideas for insert
  with check (auth.uid() = user_id);

-- Güncelleme/silme YOK — paylaşılan bir tez sessizce değişmez/kaybolmaz.

-- ============================================================
-- idea_reactions — Faydalı / Katılmıyorum. Kullanıcı başına idea başına TEK reaksiyon
-- (unique constraint) — hem "faydalı"yı iki kez basıp puan çiftçiliği yapmayı hem de
-- aynı idea'ya hem faydalı hem katılmıyorum basmayı engeller.
-- ============================================================
create table if not exists public.idea_reactions (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references public.ideas(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  type       text not null check (type in ('faydali', 'katilmiyorum')),
  created_at timestamptz not null default now(),
  unique (idea_id, user_id)
);

create index if not exists idea_reactions_idea_id_idx on public.idea_reactions(idea_id);
create index if not exists idea_reactions_user_id_idx on public.idea_reactions(user_id);

alter table public.idea_reactions enable row level security;

-- Herkese açık okunur: kart üzerindeki Faydalı/Katılmıyorum SAYILARI public (D3 ailesi —
-- sonuç/sayaç public, ama bkz. D21: "en çok katılmıyorum alan" public SIRALAMASI/listesi
-- istemci tarafında kurulmaz, bu yalnızca ham veri erişimidir).
create policy "idea_reactions herkese acik okunur"
  on public.idea_reactions for select
  using (true);

create policy "kullanici kendi reaksiyonunu olusturur"
  on public.idea_reactions for insert
  with check (auth.uid() = user_id);

-- Güncelleme/silme YOK — bir tepki kilitlidir (predictions.js'teki "kilit kilittir" ilkesiyle aynı aile).

-- ============================================================
-- idea_reports — "Bildir" butonu kaydı. v1'de otomatik hiçbir aksiyon almaz — Sami
-- Supabase Dashboard'tan bu tabloya bakar (manuel review kuyruğu, AK-092/admin panel
-- kararıyla AYNI ilke: düşük hacim için ayrı bir moderasyon arayüzü kurulmaz, D20).
-- ============================================================
create table if not exists public.idea_reports (
  id         uuid primary key default gen_random_uuid(),
  idea_id    uuid not null references public.ideas(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists idea_reports_idea_id_idx on public.idea_reports(idea_id);

alter table public.idea_reports enable row level security;

-- Herkese açık okunur DEĞİL — bildirimler yalnız kendi bildirdiğin (şeffaflık: ne bildirdiğini
-- görebilirsin) + Sami'nin Dashboard'tan zaten her şeyi görmesi (service role RLS'i atlar).
create policy "kullanici kendi bildirdigini gorur"
  on public.idea_reports for select
  using (auth.uid() = user_id);

create policy "kullanici bildirim olusturur"
  on public.idea_reports for insert
  with check (auth.uid() = user_id);

-- Güncelleme/silme YOK.
