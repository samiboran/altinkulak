-- AK-083: Tahmin Ligi — prediction_questions + predictions (event/append-only, ledger.js ailesi).
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (001/002 sonrası).
--
-- NOT: Bu tabloların şeması bu repo dışında zaten oluşturulmuşsa ve kolon adları burada
-- varsayılanlardan FARKLIYSA, src/lib/predictions.js'teki sorgular güncellenmeli — bu dosya
-- "create table if not exists" olduğu için var olan bir şemanın üzerine yazmaz, ama client
-- kodu (predictions.js) burada tanımlı kolon adlarını (sym, question_text, opens_at, closes_at,
-- resolved, outcome / question_id, user_id, direction, confidence) baz alır.

-- ============================================================
-- prediction_questions — haftanın sorusu. Tek "aktif" (resolved=false, closes_at gelecekte) soru
-- olması beklenir; geçmiş sorular resolved=true + outcome ile arşivde kalır (silinmez).
-- ============================================================
create table if not exists public.prediction_questions (
  id            uuid primary key default gen_random_uuid(),
  sym           text not null,               -- örn. "BTC" — soru neyin yönü hakkında
  question_text text not null,               -- insan-okunur soru metni
  opens_at      timestamptz not null default now(),
  closes_at     timestamptz not null,        -- kilit sonrası tahmin kabul edilmez
  resolved      boolean not null default false,
  outcome       text check (outcome in ('up','down')),  -- yalnız resolved=true iken dolu
  created_at    timestamptz not null default now()
);

create index if not exists prediction_questions_active_idx on public.prediction_questions(resolved, closes_at);

alter table public.prediction_questions enable row level security;

-- Herkese açık (guest de soruyu görür — yalnız kilitlemek giriş ister).
create policy "prediction_questions herkese acik okunur"
  on public.prediction_questions for select
  using (true);

-- Soru oluşturma/çözme v1'de yalnız Supabase Dashboard'tan elle yapılır — istemci INSERT/UPDATE atmaz,
-- bu yüzden bilerek bir insert/update policy'si YOK (RLS varsayılan: policy yoksa erişim reddedilir).

-- ============================================================
-- predictions — kullanıcının kilitlediği tahmin. Bir kere kilitlenir, değiştirilmez/silinmez
-- (ledger.js'in "append-only, silme yok" ilkesiyle aynı aile — kilit gerçek kilittir).
-- ============================================================
create table if not exists public.predictions (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.prediction_questions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  direction   text not null check (direction in ('up','down')),
  confidence  numeric not null check (confidence >= 0.5 and confidence <= 0.95),
  created_at  timestamptz not null default now(),
  unique (question_id, user_id) -- kullanıcı başına soru başına tek kilit
);

create index if not exists predictions_question_id_idx on public.predictions(question_id);
create index if not exists predictions_user_id_idx on public.predictions(user_id);

alter table public.predictions enable row level security;

-- Görünürlük: kendi tahminini HER ZAMAN görürsün (kilitli durumunu göstermek için); başkasının
-- tahminini yalnız sorusu ÇÖZÜLDÜKTEN sonra görürsün (lig tablosu/kalibrasyon eğrisi). Aktif
-- (çözülmemiş) soruda başkasının yönünü/güvenini görmek kopyalamaya açık kapı bırakır — kilitli demek
-- gizli demek olsun.
create policy "predictions kendi + cozulmus sorular herkese acik"
  on public.predictions for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.prediction_questions q
      where q.id = question_id and q.resolved = true
    )
  );

create policy "kullanici kendi tahminini kilitler"
  on public.predictions for insert
  with check (auth.uid() = user_id);

-- Güncelleme/silme YOK — kilit kilittir.
