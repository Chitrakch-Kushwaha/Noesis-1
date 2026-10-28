#!/usr/bin/env node
// Enforces U-14 / D-036, extended for the Phase 5 tutor (D-073 to D-082):
// 1) No AI SDK anywhere in the app's dependency tree (package-lock.json).
// 2) Source rules: app code never imports the offline drafting tools; only the generated adapter
//    registry may import a live adapter; browser code never imports server tutor modules; no
//    NEXT_PUBLIC_ variable names a key, secret or token; vendor key names appear only in adapters/
//    and scripts/tutor/.
// 3) If a production build exists: no AI host names or GEMINI_ variables in the browser bundle
//    (.next/static) at all. In the server bundle (.next/server) a vendor host is allowed only when that
//    vendor's adapter is selected in the generated registry AND config/student-ai.json records a
//    complete activation decision for it. If OPENAI_API_KEY is set in this shell, its value must not
//    appear anywhere in the build (the value is never printed). The same holds for GEMINI_API_KEY.
//    The development-only registry (local preview) must never put adapter code into a production build.
// Offline drafting lives in tools/content-drafting/ with its own package.json and is not scanned here.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_PACKAGES = [/^@google\/genai$/, /^@google\/generative-ai$/, /^@google-cloud\/vertexai$/, /^openai$/, /^@anthropic-ai\//, /^@ai-sdk\//, /^ai$/, /^cohere-ai$/, /^@mistralai\//, /^groq-sdk$/];
/** vendor hosts, keyed by the adapter that may legitimately contain them (server bundle only) */
const VENDOR_HOSTS = { openai: ["api.openai.com"], gemini: ["generativelanguage.googleapis.com", "aiplatform.googleapis.com"], anthropic: ["api.anthropic.com"] };
const ALWAYS_FORBIDDEN = ["GEMINI_API_KEY", "GEMINI_", "OPENAI_API_KEY"];
const problems = [];
const rel = (p) => relative(root, p);

// ---------------------------------------------------------------- 1) dependency tree
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
for (const key of Object.keys(lock.packages ?? {})) {
  const name = key.replace(/^.*node_modules\//, "");
  if (name && FORBIDDEN_PACKAGES.some((re) => re.test(name))) problems.push(`AI SDK in dependency tree: ${key}`);
}

const walk = (dir, test, out = []) => {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, test, out);
    else if (test(f) && s.size < 8_000_000) out.push(p);
  }
  return out;
};

// ---------------------------------------------------------------- 2) source rules
const REGISTRY = join(root, "src", "tutor", "server", "adapters.generated.ts");
// development-only registry for the local preview (D-083); its imports must stay behind a NODE_ENV check
const DEV_REGISTRY = join(root, "src", "tutor", "server", "adapters.dev.ts");
const sourceFiles = [...walk(join(root, "src"), (f) => /\.(ts|tsx|mts|js|mjs)$/.test(f)), ...walk(join(root, "app"), (f) => /\.(ts|tsx|mts|js|mjs)$/.test(f))];
const importsOf = (text) => [...text.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  const imports = importsOf(text);
  for (const spec of imports) {
    if (/(^|\/|@\/)tools(\/|$)/.test(spec)) problems.push(`${rel(file)} imports the offline drafting tools (${spec})`);
    if (/(^|\/|@\/)adapters(\/|$)/.test(spec) && file !== REGISTRY && file !== DEV_REGISTRY) problems.push(`${rel(file)} imports a live adapter directly (${spec}); only the generated registry may`);
  }
  if (/^\s*["']use client["']/.test(text) && imports.some((s) => /tutor\/server|(^|\/|@\/)adapters(\/|$)/.test(s))) problems.push(`${rel(file)} is a client component and imports server-only tutor code`);
  if (/NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|OPENAI|GEMINI|ANTHROPIC)/.test(text)) problems.push(`${rel(file)} names a public (browser-visible) credential variable`);
  // activation.ts may test whether a key is present (local preview microphone policy); it never passes the value on
  if (/(\.|\[\s*["'`])(OPENAI|GEMINI|ANTHROPIC)_API_KEY/.test(text) && !(file.endsWith(join("tutor", "server", "activation.ts")) && !/(OPENAI|GEMINI|ANTHROPIC)_API_KEY(?!\?\.trim\(\))/.test(text.replace(/\/\/.*$/gm, "")))) problems.push(`${rel(file)} reads a vendor key; only adapters/ may`);
}
for (const file of [join(root, "next.config.ts"), ...walk(join(root, "adapters"), (f) => /\.(ts|mjs|js)$/.test(f))]) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  if (/NEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|OPENAI|GEMINI|ANTHROPIC)/.test(text)) problems.push(`${rel(file)} names a public (browser-visible) credential variable`);
  if (/\benv\s*:\s*\{/.test(text) && file.endsWith("next.config.ts")) problems.push("next.config.ts inlines env values into the bundle; tutor settings must stay server-side");
}

if (existsSync(DEV_REGISTRY) && !/process\.env\.NODE_ENV !== "development"\) return/.test(readFileSync(DEV_REGISTRY, "utf8"))) problems.push("src/tutor/server/adapters.dev.ts must load adapters only in development");

// which adapters are compiled in, and whether the activation record is complete for the recorded one
const registry = existsSync(REGISTRY) ? readFileSync(REGISTRY, "utf8") : "";
const selectedList = (/SELECTED_ADAPTER: string \| null = "([a-z0-9,-]+)"/.exec(registry)?.[1] ?? "").split(",").filter(Boolean);
const selected = selectedList.length ? selectedList.join(",") : null;
const record = JSON.parse(readFileSync(join(root, "config", "student-ai.json"), "utf8"));
const filled = (s) => typeof s === "string" && s.trim().length > 0;
const recordComplete = selectedList.includes(record.provider) && filled(record.providerDecision) && filled(record.privacyReview) && record.text === true;
if (selected && !recordComplete) console.warn(`NOTE the ${selected} adapter is selected but config/student-ai.json does not record a complete decision for it; the build must not contain its host.`);

// ---------------------------------------------------------------- 3) production build
const built = existsSync(join(root, ".next"));
const buildFile = (f) => /\.(js|mjs|html|json|txt|rsc)$/.test(f);
const secrets = [process.env.OPENAI_API_KEY?.trim(), process.env.GEMINI_API_KEY?.trim()].filter((x) => x && x.length >= 8);
let scanned = 0;
if (built) {
  // only the recorded provider's host may appear, even if more adapters are compiled in
  const allowedHosts = recordComplete ? VENDOR_HOSTS[record.provider] ?? [] : [];
  const allowedKeyNames = recordComplete ? (record.provider === "openai" ? ["OPENAI_API_KEY"] : record.provider === "gemini" ? ["GEMINI_API_KEY", "GEMINI_"] : []) : [];
  for (const [area, files] of [["static", walk(join(root, ".next", "static"), buildFile)], ["server", walk(join(root, ".next", "server"), buildFile)]]) {
    for (const file of files) {
      scanned++;
      const text = readFileSync(file, "utf8");
      for (const s of ALWAYS_FORBIDDEN) if (text.includes(s) && !(area === "server" && allowedKeyNames.includes(s))) problems.push(`"${s}" found in ${rel(file)}`);
      for (const [vendor, hosts] of Object.entries(VENDOR_HOSTS)) {
        for (const h of hosts) {
          if (!text.includes(h)) continue;
          if (area === "static") problems.push(`AI host "${h}" found in the browser bundle: ${rel(file)}`);
          else if (!allowedHosts.includes(h)) problems.push(`AI host "${h}" (${vendor}) found in ${rel(file)} without a selected adapter and complete activation record`);
        }
      }
      if (secrets.some((k) => text.includes(k))) problems.push(`the value of a vendor API key appears in ${rel(file)}`);
    }
  }
}

if (problems.length) {
  for (const p of problems) console.error("ERROR", p);
  process.exit(1);
}
console.log(`No AI SDK in the app's dependency tree (${Object.keys(lock.packages ?? {}).length} packages checked). ` +
  `Source rules hold (${sourceFiles.length} app files; adapter compiled in: ${selected ?? "none"}).` +
  (built ? ` No AI hosts or vendor key names in the production build beyond what activation allows (${scanned} files scanned).` : " No production build to scan yet (run npm run build first)."));
