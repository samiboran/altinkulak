// render.jsx'i esbuild ile paketleyip çalıştırır (JSX -> node).
// Yol, platformdan bağımsız: os.tmpdir() (Windows'ta C:\tmp diye bir şey yok — ders alındı).
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(tmpdir(), "ak-render-test.cjs");
await build({ entryPoints: ["tests/render.jsx"], bundle: true, platform: "node", outfile: out, loader: { ".js": "jsx" }, jsx: "automatic", logLevel: "error" });
const r = spawnSync(process.execPath, [out], { stdio: ["ignore", "inherit", "pipe"] }); // React SSR uyarılarını sustur
if (r.status !== 0) {
  console.error(String(r.stderr).split("\n").filter(l => !l.includes("useLayoutEffect")).join("\n"));
  process.exit(r.status ?? 1);
}
