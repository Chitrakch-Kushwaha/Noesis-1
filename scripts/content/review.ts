// npm run content:review — a local, human-only review tool for question templates.
// Shows every review variation of a template in full (text, answers, wrong methods, hints, feedback,
// solutions, flashcards, accessibility) with links to try each one in the live player, and records a
// named reviewer's decision in the template file. It never approves anything by itself.
//
//   npm run content:review            → http://127.0.0.1:4100
//   (run `npm run dev` alongside it to open each variation in the player)
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { check } from "@/src/checking/check";
import { playerChapterFor } from "@/src/content/catalog";
import { instantiate, type QuestionInstance } from "@/src/content/instantiate";
import { TemplateSchema } from "@/src/content/schema";
import { reviewSeedsFor, validateTemplate } from "@/src/content/validate";
import { lessonCues, lessonVariant, LessonSchema, type LessonVariant } from "@/src/content/lessons";
import { validateLesson } from "@/src/content/validateLesson";
import { applyDecision, approvalState, contentHash, LESSONS_PATH, loadLessonFiles, loadTemplateFiles, MANIFEST_PATH, PLAYABLE_PATH, playableChapters, ReviewError, ROOT, validateAll, type TemplateFile } from "./lib";

const PORT = Number(process.env.REVIEW_PORT ?? 4100);
const HOST = "127.0.0.1";
const PLAYER = process.env.PLAYER_URL ?? "http://localhost:3000";
/** Printed only in this terminal: a decision needs it, so nothing else on the machine can post one. */
const TOKEN = randomBytes(4).toString("hex");

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const show = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));

const CSS = `
:root{color-scheme:dark;--bg:#050505;--s:#141517;--t:#f5f5f5;--m:#a5a19e;--b:#515151;--o:#fc710c;--a:#fe9400;--c:#f37f58;--g:#5fd39a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 80px}a{color:var(--a)}h1{font-size:22px}h2{font-size:17px;margin:28px 0 8px}h3{font-size:15px;margin:16px 0 6px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #2a2a2c;padding:8px;text-align:left;vertical-align:top;font-size:14px}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid var(--b)}.tag.approved{border-color:var(--g);color:var(--g)}.tag.in-review{border-color:var(--a);color:var(--a)}.tag.err{border-color:var(--c);color:var(--c)}
.var{border:1px solid var(--b);border-radius:12px;padding:12px 16px;margin:14px 0;background:var(--s)}.var[data-done=true]{border-color:var(--g)}
.muted{color:var(--m)}ol,ul{margin:4px 0;padding-left:22px}code{background:#0d0e10;padding:1px 4px;border-radius:4px;font-size:13px}
.issues li{color:var(--c)}.warn li{color:var(--a)}form{display:grid;gap:10px;max-width:560px;border:1px solid var(--b);border-radius:12px;padding:16px;background:var(--s)}
input[type=text],textarea,select{background:#0d0e10;color:var(--t);border:1px solid var(--b);border-radius:8px;padding:8px;font:inherit}button{background:var(--o);color:#050505;border:0;border-radius:8px;min-height:40px;padding:0 16px;font-weight:600;cursor:pointer}
label{display:flex;gap:8px;align-items:flex-start}.ok{color:var(--g)}.bad{color:var(--c)}`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`;
}

function lessonRows(lessons: TemplateFile[]) {
  return lessons.map((f) => {
    const id = String(f.raw.id);
    const errs = validateLesson(f.raw, { file: f.rel }).issues.filter((i) => i.level === "error").length;
    const state = approvalState(f.raw);
    return `<tr><td><a href="/l/${encodeURIComponent(id)}">${esc(id)}</a><div class="muted">${esc(f.rel)}</div></td>
      <td>${esc(f.raw.kind)}</td><td>${esc((f.raw.widget as { type: string }).type)}</td>
      <td><span class="tag ${esc(f.raw.status)}">${esc(f.raw.status)}</span>${state === "changed-since-approval" ? ` <span class="tag err">changed since approval</span>` : ""}</td>
      <td>${errs ? `<span class="tag err">${errs} errors</span>` : `<span class="ok">valid</span>`}</td></tr>`;
  }).join("");
}

function lessonPage(f: TemplateFile, message = "") {
  const id = String(f.raw.id);
  const v = validateLesson(f.raw, { file: f.rel });
  const errs = v.issues.filter((i) => i.level === "error");
  let body = "";
  try {
    const l = LessonSchema.parse(f.raw);
    const variants: LessonVariant[] = ["main", ...(l.alternate ? ["alternate" as const] : []), ...(l.recap ? ["recap" as const] : [])];
    body = variants.map((name) => {
      const x = lessonVariant(l, name);
      return `<section class="var"><h2>${esc(name)} · ${esc(x.title)}</h2><p class="muted">Widget ${esc(x.widget.type)} · ${esc(x.widget.instructions)}</p>
        <ol>${x.steps.map((st) => `<li>${esc(st.text)}${lessonCues(st.cue).length ? ` <span class="muted">[visual: ${esc(lessonCues(st.cue).map((c) => c.cue).join(", "))}]</span>` : ""}</li>`).join("")}</ol></section>`;
    }).join("") + `<h3>Accessibility</h3><p>${esc(l.accessibility.altText)}</p><p class="muted">${esc(l.accessibility.nonDragAlternative ?? "")}</p>`;
  } catch (e) { body = `<p class="bad">${esc((e as Error).message)}</p>`; }
  const prov = f.raw.provenance as { reviewLog: { at: string; by: string; decision: string; note: string }[] };
  return page(id, `<p><a href="/">← All content</a></p><h1>${esc(id)}</h1>${message}
    <p>Status <span class="tag ${esc(f.raw.status)}">${esc(f.raw.status)}</span> · approval: ${esc(approvalState(f.raw))} · content hash <code>${esc(contentHash(f.raw).slice(0, 19))}…</code></p>
    ${errs.length ? `<h2>Validation errors</h2><ul class="issues">${errs.map((i) => `<li>${esc(i.where)}: ${esc(i.message)}</li>`).join("")}</ul>` : `<p class="ok">Passes lesson validation.</p>`}
    <p class="muted">Play each variant in a session (it opens when a detour or foundation frame starts) to check the visual.</p>
    ${body}
    <h2>Review history</h2><ul>${prov.reviewLog.map((l) => `<li>${esc(l.at)} · ${esc(l.by)} · ${esc(l.decision)} · ${esc(l.note)}</li>`).join("") || "<li class=muted>none yet</li>"}</ul>
    <h2>Record your decision</h2>
    <form method="post" action="/l/${encodeURIComponent(id)}/decision">
      <label>Your name <input type="text" name="reviewer" required autocomplete="name"></label>
      <label>Decision <select name="decision"><option value="changes-requested">Request changes</option><option value="approved">Approve</option></select></label>
      <label>Note <textarea name="note" rows="3"></textarea></label>
      <label><input type="checkbox" name="attested" value="yes"> I personally reviewed every step of every variant and its visual.</label>
      <label>Session code (shown in the terminal running content:review) <input type="text" name="token" required autocomplete="off"></label>
      <button type="submit">Record decision</button>
    </form>`);
}

function index(files: TemplateFile[], lessons: TemplateFile[] = []) {
  const rows = files.map((f) => {
    const id = String(f.raw.id);
    const v = validateTemplate(f.raw, { file: f.rel, seeds: reviewSeeds(f).slice(0, 4) });
    const errs = v.issues.filter((i) => i.level === "error").length;
    const state = approvalState(f.raw);
    return `<tr><td><a href="/t/${encodeURIComponent(id)}">${esc(id)}</a><div class="muted">${esc(f.rel)}</div></td>
      <td>${esc(f.raw.format)}</td><td>${esc((f.raw.widget as { type: string }).type)}</td>
      <td><span class="tag ${esc(f.raw.status)}">${esc(f.raw.status)}</span>${state === "changed-since-approval" ? ` <span class="tag err">changed since approval</span>` : ""}</td>
      <td>${errs ? `<span class="tag err">${errs} errors</span>` : `<span class="ok">valid</span>`}</td></tr>`;
  }).join("");
  return page("Content review", `<h1>Content review</h1>
    <p class="muted">Every template must be reviewed by a person before it can count toward mastery. Open a template, read every variation, try each one in the player, then record your decision.</p>
    <table><thead><tr><th>Template</th><th>Format</th><th>Widget</th><th>Status</th><th>Checks</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Lessons</h2>
    <table><thead><tr><th>Lesson</th><th>Kind</th><th>Widget</th><th>Status</th><th>Checks</th></tr></thead><tbody>${lessonRows(lessons)}</tbody></table>`);
}

const reviewSeeds = (f: TemplateFile) => { try { return reviewSeedsFor(TemplateSchema.parse(f.raw)); } catch { return []; } };

function steps(list: { text: string; cues: { cue: string }[] }[]) {
  return `<ol>${list.map((s) => `<li>${esc(s.text)}${s.cues.length ? ` <span class="muted">[visual: ${esc(s.cues.map((c) => c.cue).join(", "))}]</span>` : ""}</li>`).join("")}</ol>`;
}

function variation(q: QuestionInstance, n: number) {
  const playerUrl = `${PLAYER}/chapter/${playerChapterFor({ chapterId: q.chapterId, primarySkillId: q.skillId })}/try?q=${encodeURIComponent(q.templateId)}&seed=${q.seed}`;
  const correct = q.selfTest.correct.map((c) => `<li><code>${esc(show(c))}</code> → <span class="${check(q.check, c).status === "correct" ? "ok" : "bad"}">${esc(check(q.check, c).status)}</span></li>`).join("");
  const buggy = q.selfTest.buggy.map((b) => { const r = check(q.check, b.input); return `<li><code>${esc(show(b.input))}</code> → ${esc(r.status)} ${r.status === "incorrect" ? `[${esc(r.tags.join(", "))}]` : ""} <span class="muted">expects ${esc(b.tags.join(", "))}</span></li>`; }).join("");
  return `<section class="var" id="seed-${q.seed}" data-seed="${q.seed}">
    <h2>Variation ${n} · seed ${q.seed}</h2>
    <p class="muted">Parameters: <code>${esc(JSON.stringify(q.params))}</code> · <a href="${esc(playerUrl)}" target="_blank" rel="noopener">Open in the player</a></p>
    <p><em>${esc(q.intro)}</em></p>${q.stem.map((p) => `<p><strong>${esc(p)}</strong></p>`).join("")}
    ${q.options ? `<ul>${q.options.map((o) => `<li><code>${esc(o.id)}</code> ${esc(o.text)}${o.cues.length ? ` <span class="muted">[visual: ${esc(o.cues.map((c) => c.cue).join(", "))}]</span>` : ""}</li>`).join("")}</ul>` : ""}
    ${q.items ? `<p>Items: ${q.items.map((i) => esc(i.text)).join(" · ")}</p>` : ""}${q.targets ? `<p>Targets: ${q.targets.map((i) => esc(i.text)).join(" · ")}</p>` : ""}
    <h3>Answer</h3><p>${esc(q.answerText)}</p><ul>${correct}</ul>
    <h3>Wrong answers it recognises</h3><ul>${buggy || "<li class=muted>none</li>"}</ul>
    <h3>Hints</h3>${steps(q.hints)}
    <h3>Misconception feedback</h3><ul>${Object.entries(q.feedback).map(([k, s]) => `<li><code>${esc(k)}</code> ${esc(s.text)}${s.cues.length ? ` <span class="muted">[visual: ${esc(s.cues.map((c) => c.cue).join(", "))}]</span>` : ""}</li>`).join("")}</ul>
    <h3>Consequence of a wrong answer</h3><p class="muted">${esc(q.consequence.map((c) => c.cue).join(", ") || "feedback cues only")}</p>
    <h3>Worked solution</h3>${steps(q.solution)}
    ${q.alternative ? `<h3>Alternative: ${esc(q.alternative.title)}</h3>${steps(q.alternative.steps)}` : ""}
    <h3>Flashcards</h3><ul>${Object.entries(q.flashcards).map(([k, c]) => `<li><code>${esc(k)}</code> <strong>${esc(c.front)}</strong> — ${esc(c.back)}</li>`).join("")}</ul>
    ${q.reasoning ? `<h3>Written reasoning (advisory)</h3><p>${esc(q.reasoning.prompt)}</p><ul>${q.reasoning.rubric.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p class="muted">${esc(q.reasoning.modelAnswer)}</p>` : ""}
    <h3>Accessibility</h3><p>${esc(q.accessibility.altText)}</p><p class="muted">${esc(q.accessibility.nonDragAlternative ?? "")}</p><p class="muted">${esc(q.widget.instructions)}</p>
    <label><input type="checkbox" class="done" value="${q.seed}"> I reviewed this variation, including its visual in the player</label>
  </section>`;
}

function templatePage(f: TemplateFile, message = "") {
  const seeds = reviewSeeds(f);
  const v = validateTemplate(f.raw, { file: f.rel });
  const errs = v.issues.filter((i) => i.level === "error"), warns = v.issues.filter((i) => i.level === "warning");
  let vars = "";
  try { const t = TemplateSchema.parse(f.raw); vars = seeds.map((s, i) => variation(instantiate(t, s), i + 1)).join(""); } catch (e) { vars = `<p class="bad">${esc((e as Error).message)}</p>`; }
  const prov = f.raw.provenance as { reviewedBy: string | null; reviewedAt: string | null; reviewLog: { at: string; by: string; decision: string; note: string }[]; migratedFrom?: string };
  const id = String(f.raw.id);
  return page(id, `<p><a href="/">← All templates</a></p><h1>${esc(id)}</h1>
    ${message}
    <p>Status <span class="tag ${esc(f.raw.status)}">${esc(f.raw.status)}</span> · approval: ${esc(approvalState(f.raw))} · content hash <code>${esc(contentHash(f.raw).slice(0, 19))}…</code></p>
    ${prov.migratedFrom ? `<p class="muted">Migrated from ${esc(prov.migratedFrom)}</p>` : ""}
    ${errs.length ? `<h2>Validation errors</h2><ul class="issues">${errs.slice(0, 30).map((i) => `<li>${esc(i.where)}: ${esc(i.message)}</li>`).join("")}</ul>` : `<p class="ok">Passes content validation.</p>`}
    ${warns.length ? `<ul class="warn">${warns.map((i) => `<li>${esc(i.where)}: ${esc(i.message)}</li>`).join("")}</ul>` : ""}
    <p class="muted">${seeds.length} variations to review.</p>
    ${vars}
    <h2>Review history</h2><ul>${prov.reviewLog.map((l) => `<li>${esc(l.at)} · ${esc(l.by)} · ${esc(l.decision)} · ${esc(l.note)}</li>`).join("") || "<li class=muted>none yet</li>"}</ul>
    <h2>Record your decision</h2>
    <form method="post" action="/t/${encodeURIComponent(id)}/decision">
      <label>Your name <input type="text" name="reviewer" required autocomplete="name"></label>
      <label>Decision <select name="decision"><option value="changes-requested">Request changes</option><option value="approved">Approve</option></select></label>
      <label>Note <textarea name="note" rows="3"></textarea></label>
      <label><input type="checkbox" name="attested" value="yes"> I personally reviewed every variation above and its visual in the player.</label>
      <label>Session code (shown in the terminal running content:review) <input type="text" name="token" required autocomplete="off"></label>
      <input type="hidden" name="reviewed" id="reviewed" value="">
      <button type="submit">Record decision</button>
    </form>
    <script>
      const boxes=[...document.querySelectorAll('.done')],key='review:${esc(id)}:${esc(contentHash(f.raw).slice(7, 19))}';
      let saved=[];try{saved=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
      const sync=()=>{const v=boxes.filter(b=>b.checked).map(b=>b.value);document.getElementById('reviewed').value=v.join(',');boxes.forEach(b=>b.closest('.var').dataset.done=b.checked);try{localStorage.setItem(key,JSON.stringify(v))}catch{}};
      boxes.forEach(b=>{b.checked=saved.includes(b.value);b.addEventListener('change',sync)});sync();
    </script>`);
}

function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 20_000) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => resolve(new URLSearchParams(data)));
  });
}

function send(res: ServerResponse, status: number, html: string) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'", "x-frame-options": "DENY" });
  res.end(html);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
    const files = loadTemplateFiles();
    const lessons = loadLessonFiles();
    if (req.method === "GET" && url.pathname === "/") return send(res, 200, index(files, lessons));
    const lm = /^\/l\/([^/]+)(\/decision)?$/.exec(url.pathname);
    const lf = lm ? lessons.find((x) => x.raw.id === decodeURIComponent(lm[1]!)) : undefined;
    if (lm && !lf) return send(res, 404, page("Not found", "<p>Not found. <a href='/'>All content</a></p>"));
    if (lm && lf && req.method === "GET" && !lm[2]) return send(res, 200, lessonPage(lf));
    if (lm && lf && req.method === "POST" && lm[2]) {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) return send(res, 403, page("Refused", "<p>Decisions can only be recorded from this review tool.</p>"));
      const body = await readBody(req);
      if (body.get("token") !== TOKEN) return send(res, 403, lessonPage(lf, `<p class="bad">The session code doesn't match the one in the terminal. Nothing was recorded.</p>`));
      try {
        const next = applyDecision(lf.raw, {
          reviewer: body.get("reviewer") ?? "", decision: body.get("decision") === "approved" ? "approved" : "changes-requested",
          note: body.get("note") ?? "", attested: body.get("attested") === "yes", reviewedSeeds: [], now: new Date(),
        }, []);
        writeFileSync(lf.file, JSON.stringify(next, null, 2) + "\n");
        const run = validateAll();
        if (!run.issues.some((i) => i.level === "error")) writeFileSync(LESSONS_PATH, JSON.stringify(run.lessons, null, 2) + "\n");
        console.log(`${new Date().toISOString()} ${next.status === "approved" ? "APPROVED" : "changes requested"}: ${String(lf.raw.id)} by ${body.get("reviewer")}`);
        const fresh = loadLessonFiles().find((x) => x.raw.id === lf.raw.id)!;
        return send(res, 200, lessonPage(fresh, `<p class="ok">Decision recorded in ${esc(lf.rel)}. The lesson manifest was regenerated.</p>`));
      } catch (e) {
        if (e instanceof ReviewError) return send(res, 400, lessonPage(lf, `<p class="bad">${esc(e.message)} Nothing was recorded.</p>`));
        throw e;
      }
    }
    const m = /^\/t\/([^/]+)(\/decision)?$/.exec(url.pathname);
    const f = m ? files.find((x) => x.raw.id === decodeURIComponent(m[1]!)) : undefined;
    if (!m || !f) return send(res, 404, page("Not found", "<p>Not found. <a href='/'>All templates</a></p>"));
    if (req.method === "GET" && !m[2]) return send(res, 200, templatePage(f));
    if (req.method === "POST" && m[2]) {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) return send(res, 403, page("Refused", "<p>Decisions can only be recorded from this review tool.</p>"));
      const body = await readBody(req);
      if (body.get("token") !== TOKEN) return send(res, 403, templatePage(f, `<p class="bad">The session code doesn't match the one in the terminal. Nothing was recorded.</p>`));
      try {
        const next = applyDecision(f.raw, {
          reviewer: body.get("reviewer") ?? "", decision: body.get("decision") === "approved" ? "approved" : "changes-requested",
          note: body.get("note") ?? "", attested: body.get("attested") === "yes",
          reviewedSeeds: (body.get("reviewed") ?? "").split(",").filter(Boolean).map(Number), now: new Date(),
        }, reviewSeeds(f));
        writeFileSync(f.file, JSON.stringify(next, null, 2) + "\n");
        const run = validateAll();
        if (!run.issues.some((i) => i.level === "error")) {
          mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
          writeFileSync(MANIFEST_PATH, JSON.stringify(run.manifest, null, 2) + "\n");
          writeFileSync(PLAYABLE_PATH, JSON.stringify(playableChapters(run.manifest)) + "\n");
        }
        console.log(`${new Date().toISOString()} ${next.status === "approved" ? "APPROVED" : "changes requested"}: ${String(f.raw.id)} by ${body.get("reviewer")}`);
        const fresh = loadTemplateFiles().find((x) => x.raw.id === f.raw.id)!;
        return send(res, 200, templatePage(fresh, `<p class="ok">Decision recorded in ${esc(f.rel)}. The student manifest was regenerated.</p>`));
      } catch (e) {
        if (e instanceof ReviewError) return send(res, 400, templatePage(f, `<p class="bad">${esc(e.message)} Nothing was recorded.</p>`));
        throw e;
      }
    }
    return send(res, 405, page("Not allowed", "<p>Not allowed.</p>"));
  } catch (e) {
    send(res, 500, page("Error", `<pre>${esc((e as Error).stack)}</pre>`));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Content review: http://${HOST}:${PORT}  (templates in ${join(ROOT, "content", "templates")})`);
  console.log(`Session code for recording decisions: ${TOKEN}`);
  console.log(`Open variations in the player with "npm run dev" running at ${PLAYER}.`);
});
