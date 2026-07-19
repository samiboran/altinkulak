// AK-090: Topluluk Fikirleri — moderasyon yardımcıları. Saf fonksiyonlar, Supabase'e bağımlı
// değil. D19/D21 ruhu: yasaklama değil format zorlama tercih edilir — küfür/topluluk dili
// gerçekten ENGELLER, emir/sinyal dili sadece yumuşak bir uyarı verir (paylaşmayı durdurmaz).

const MIN_THESIS_LEN = 40;

// Türkçe harfler dahil basit kelime-sınırlı tokenizasyon — regex \b JS'te \w'yi ASCII ile
// sınırlar (ı/ş/ç/ğ/ü/ö \w SAYILMAZ), bu yüzden \b tabanlı kelime eşleşmesi Türkçe kelimelerin
// İÇİNDE yanlış sınır bulabilir. Bunun yerine metni harf-olmayan karakterlerden bölüp tam
// kelime karşılaştırması yapıyoruz — daha basit, daha doğru.
function tokenize(text) {
  return (text || "").toLowerCase().split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
}

// Bir tez olmadan paylaşım olmaz — boş/anlamsız geçiştirme engellenir (C1).
export function validateThesis(text) {
  const t = (text || "").trim();
  if (t.length < MIN_THESIS_LEN) {
    return { ok: false, reason: `Bir tez olmadan paylaşım olmaz — neye bakıyorsun, ne görürsen fikrin çürür? (en az ${MIN_THESIS_LEN} karakter, şu an ${t.length})` };
  }
  return { ok: true };
}

// Küçük, temsili bir liste — kapsamlı bir NLP çözümü değil, "basit kelime listesi" (D21).
// Gerçekten ENGELLER (C2/1).
const BANNED_WORDS = ["amk", "aq", "orospu", "piç", "yavşak", "siktir", "göt", "ibne", "puşt"];

export function containsBannedWord(text) {
  const tokens = new Set(tokenize(text));
  return BANNED_WORDS.some((w) => tokens.has(w));
}

// Emir/sinyal dili — ENGELLEMEZ, yalnız yumuşak uyarı tetikler (C2/2). Spec'in kendi
// örnekleri: "alın", "satın", "kesin", "garanti".
const ORDER_WORDS = ["alın", "satın", "kesin", "kesinlikle", "garanti", "garantili"];

export function containsOrderLanguage(text) {
  const tokens = new Set(tokenize(text));
  return ORDER_WORDS.some((w) => tokens.has(w));
}
