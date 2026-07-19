#!/usr/bin/env node
// Deploy öncesi zorunlu env kontrolü — .env eksikse build boş Supabase config ile
// derlenir ve canlıda auth sessizce kırılır. Bu script o durumu build'den ÖNCE durdurur.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

function loadDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const fromDotEnv = loadDotEnv(resolve(process.cwd(), ".env"));
const missing = REQUIRED.filter((key) => !(process.env[key] || fromDotEnv[key]));

if (missing.length) {
  console.error(
    `\nDEPLOY IPTAL: .env eksik — ${missing.join(", ")} tanımsız/boş.\n` +
      `Proje köküne .env oluştur (bkz. .env.example) ve gerçek Supabase değerlerini gir.\n`
  );
  process.exit(1);
}

console.log("check-env: Supabase ortam değişkenleri tamam.");
