# AK-006 HANDOFF — Supabase Auth + Davet Kodu + Veri Göçü

> Claude Code için. Okuma sırası: CLAUDE.md → BUILD_LOG.md → bu dosya.
> İlke: motor (backtest/stats) HİÇ değişmez. Bu iş yalnız kimlik + depolama katmanı.

## 0) Sami'nin elle yapacakları (kod öncesi, ~10 dk)
1. supabase.com → New project → ad: `altinkulak` (bölge: Frankfurt). Database şifresini kaydet.
2. Project Settings → API'den iki değeri al: **Project URL** ve **anon public key**.
3. Proje köküne `.env` dosyası (git'e girmez, .gitignore'a `.env` eklenecek):
```
VITE_SUPABASE_URL=https://XXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
4. SQL Editor → aşağıdaki şemayı tek seferde çalıştır.
Not: anon key'in client'ta görünmesi NORMALDİR — güvenlik RLS'ten gelir, aşağıda açık.

## 1) SQL şema (Supabase SQL Editor'a yapıştır)
```sql
-- Profiller (auth.users'a 1-1)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_\.]{3,20}$'),
  member_no serial unique,                 -- kaçıncı üye (davet prestiji)
  job text,                                -- meslek (opsiyonel)
  job_public boolean default false,        -- açık etme tercihi
  created_at timestamptz default now()
);

-- Davet kodları
create table invites (
  code text primary key,
  created_by uuid references profiles(id),
  used_by uuid references profiles(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

-- SİCİL — append-only. UPDATE/DELETE politikası BİLEREK YOK.
create table ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  d timestamptz default now(),
  sym text not null,
  setup text not null,
  dir text not null check (dir in ('Long','Short')),
  plan numeric not null check (plan > 0),
  r numeric not null,
  tag text not null check (tag in ('Plana uydu','Erken çıkış','FOMO','İntikam'))
);

-- Sandbox — silinebilir
create table sandbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  d timestamptz default now(),
  sym text not null, setup text not null,
  dir text not null check (dir in ('Long','Short')),
  plan numeric not null check (plan > 0), r numeric not null, tag text not null
);

-- Portföy
create table portfolio (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  sym text not null, tur text not null,
  adet numeric not null, cost numeric not null, manual numeric
);

-- RLS: herkes yalnız KENDİ satırını görür/yazar
alter table profiles enable row level security;
alter table ledger   enable row level security;
alter table sandbox  enable row level security;
alter table portfolio enable row level security;
alter table invites  enable row level security;

create policy "own profile read"  on profiles for select using (true); -- handle/rütbe herkese açık
create policy "own profile write" on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

create policy "ledger own read"   on ledger for select using (auth.uid() = user_id);
create policy "ledger own insert" on ledger for insert with check (auth.uid() = user_id);
-- DİKKAT: ledger'a update/delete politikası YOK = veritabanı seviyesinde silinemez. Sicil ilkesi.

create policy "sandbox all own" on sandbox for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "portfolio all own" on portfolio for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "invite read own" on invites for select using (created_by = auth.uid() or used_by = auth.uid());
-- Davet doğrulama/kullanma client'tan RPC ile:
create or replace function use_invite(p_code text) returns boolean
language plpgsql security definer as $$
declare ok boolean;
begin
  update invites set used_by = auth.uid(), used_at = now()
   where code = p_code and used_by is null;
  get diagnostics ok = row_count;
  return ok::int = 1;
end $$;
```

## 2) Görevler (JSON sözleşmeler)
```json
{ "task_id":"AK-006a","title":"Supabase client + auth akisi",
  "files":[
    {"path":"src/lib/supabase.js","action":"create","role":"createClient(import.meta.env.VITE_SUPABASE_URL, ...ANON_KEY); yoksa null döner (localStorage moduna düşer)"},
    {"path":"src/lib/auth.js","action":"create","role":"signUp(email,pass,handle,inviteCode)->use_invite RPC + profiles insert; signIn; signOut; useUser() hook"},
    {"path":"src/pages/Giris.jsx","action":"edit","role":"mevcut UI'yi gerçek auth'a bağla: davet kodu doğrulama, e-posta+şifre, hata mesajları Türkçe"},
    {"path":".gitignore","action":"edit","role":".env satırı ekle"}],
  "do_not_touch":["backtest.js","stats.js","ranks.js kuralları"],
  "acceptance":["gecersiz davet kodu kayit acamiyor","giris sonrasi navbar'da handle","env yoksa uygulama localStorage moduyla calismaya devam ediyor (CRASH YOK)"] }
```
```json
{ "task_id":"AK-006b","title":"Sicil/Sandbox/Portfoy gocu (localStorage -> Supabase)",
  "files":[
    {"path":"src/lib/ledger.js","action":"edit","role":"girisliyse Supabase (insert/select), girissizse localStorage. SILME FONKSIYONU YINE YOK — tests/motor.test.js garanti ediyor"},
    {"path":"src/lib/sandbox.js","action":"edit","role":"ayni ikili mod; silme yalniz sandbox'ta"},
    {"path":"src/pages/Profil.jsx","action":"edit","role":"portfoy ayni ikili mod"},
    {"path":"src/pages/Ben.jsx","action":"edit","role":"ilk girişte tek seferlik 'yerel kayitlari hesabina tasi?' teklifi (localStorage -> DB, sonra yerel temizlenir)"}],
  "acceptance":["npm test yesil kalir","girissiz mod eskisi gibi calisir","tasima cift kayit olusturmaz"] }
```

## 3) Riskler / kararlar
- **anon key client'ta görünür** → güvenlik RLS'te; service_role key ASLA client'a girmez.
- Ledger'ın silinemezliği artık iki katmanlı: kodda fonksiyon yok (testli) + DB'de politika yok.
- E-posta doğrulama başta KAPALI tutulabilir (Supabase Auth ayarı) — davet kodu zaten kapı.
- İlk davet kodları: Sami SQL'den elle üretir: `insert into invites(code) values ('AK-KURUCU-01');`
