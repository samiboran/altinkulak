-- AK-webhook-teşhis-2: "Code'a bağla" insert'i "Bağlantı oluşturulamadı" ile başarısız oluyordu.
-- Bu dosya Claude Code tarafından ÇALIŞTIRILMAZ (Supabase CLI bağlı değil, bkz. 010/011).
-- Sami, Supabase Dashboard > SQL Editor'e yapıştırıp kendisi çalıştırır (010 ve 011 sonrası).
--
-- TEŞHİS: izleme_entries.user_id, 010'da (kodda mevcut TÜM diğer tablolarla aynı gidişatla)
-- public.profiles(id)'ye FOREIGN KEY idi. Ama profiles satırı kullanıcı ilk giriş yaptığında
-- OTOMATİK oluşmuyor — repoda (ne src/ ne migrations/) auth.users insert'inde profiles satırı
-- açan bir trigger/kod YOK. Yani bir kullanıcının auth.users'ta kaydı olsa da public.profiles'ta
-- karşılığı yoksa, izleme_entries'e INSERT foreign key ihlaliyle (23503) sessizce reddediliyordu
-- — istemci tarafı bunu ayrıştırmadan genel "Bağlantı oluşturulamadı" mesajına düşürüyordu
-- (bkz. src/lib/izlemeEntries.js — bu commit'te ayrıca hata mesajları da ayrıştırılıyor).
--
-- İzleme webhook özelliği kullanıcının profil/handle bilgisine hiç ihtiyaç duymaz (sadece
-- kendi webhook kaydını okur/oluşturur) — bu yüzden profiles yerine HER auth kullanıcısında
-- garanti var olan auth.users'a referans vermek daha doğru ve daha az kırılgan (009'daki
-- admins/contributors/referral_credits tabloları zaten aynı sebeple auth.users(id) kullanıyor).

alter table public.izleme_entries drop constraint if exists izleme_entries_user_id_fkey;
alter table public.izleme_entries
  add constraint izleme_entries_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
