// AK-FVG-panel: POST /functions/v1/izleme-webhook/:token — TradingView Pine alert hedefi.
// Bu fonksiyon Claude Code tarafından DEPLOY EDİLMEZ (Supabase CLI bağlı değil, bkz.
// supabase/migrations/010_izleme_webhook.sql başlığındaki aynı not). Sami kendisi çalıştırır:
//   supabase functions deploy izleme-webhook
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... (Dashboard > Project Settings > API'den)
// Alert URL'i (kullanıcıya İzleme.jsx'te gösterilen): <proje>.supabase.co/functions/v1/izleme-webhook/<token>
//
// KARAR (D16): Bu fonksiyon SADECE izleme_entries'in kendi durumunu günceller. Hiçbir trade/
// prediction/sandbox tablosuna yazmaz — karar mantığı ../../../src/lib/izlemeWebhookCore.js'te
// (Deno/tarayıcı/Node üçünde de çalışan saf fonksiyon) yaşar, burada yalnız Supabase I/O'su var.
// SERVICE ROLE KEY: RLS'i BİLEREK atlar (010 migration'da istemci için UPDATE policy'si YOK) —
// bu anahtar yalnız bu sunucu tarafı fonksiyonda kalır, istemciye asla gönderilmez.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processWebhookTrigger } from "../../../src/lib/izlemeWebhookCore.js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const rawBody = await req.text().catch(() => "");

  const result = await processWebhookTrigger(token, rawBody, {
    async findByToken(tok: string) {
      const { data } = await supabase
        .from("izleme_entries")
        .select("id, last_triggered_at")
        .eq("webhook_token", tok)
        .maybeSingle();
      return data ? { id: data.id, lastTriggeredAt: data.last_triggered_at } : null;
    },
    async markTriggered(id: string, { triggeredAt, rawBody: body }: { triggeredAt: string; rawBody: string | null }) {
      await supabase
        .from("izleme_entries")
        .update({
          webhook_status: "tetiklendi",
          last_triggered_at: triggeredAt,
          last_payload: body ? body.slice(0, 4000) : null, // log/gösterim amaçlı, sınırlı boyut
        })
        .eq("id", id);
    },
  });

  if (result.status === 404) return new Response("not found", { status: 404 });
  return new Response(result.ignored ? "ignored (rate limit)" : "ok", { status: 200 });
});
