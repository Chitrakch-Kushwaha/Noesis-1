#!/usr/bin/env node
// WCAG 2.2 contrast check for the design tokens. Zero dependencies.
// Text pairs need >= 4.5:1 (normal) or >= 3:1 (large/bold >= 18.66px bold or 24px).
// Non-text UI boundaries and graphical objects need >= 3:1 (SC 1.4.11).
// Exit 1 if any pair marked "required" fails.

const tokens = {
  // brief tokens (unchanged)
  "--background": "#050505",
  "--surface": "#141517",
  "--surface-raised": "#2F231A",
  "--accent-orange": "#FC710C",
  "--accent-amber": "#FE9400",
  "--accent-coral": "#F37F58",
  "--highlight-peach": "#F7B198",
  "--text-primary": "#F5F5F5",
  "--text-muted": "#A5A19E",
  "--border-subtle": "#515151",
  // Phase 0 additions (docs/decision-log.md D-021)
  "--text-on-accent": "#050505",
  "--border-strong": "#7C7875",
  "--focus-ring": "#FE9400",
  "--danger": "#FF6B6B",
  "--success": "#5FD39A",
};

const lum = (hex) => {
  const c = hex.replace("#", "").match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(tokens[a]), lum(tokens[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum, use, required]
const pairs = [
  ["--text-primary", "--background", 4.5, "body text on page", true],
  ["--text-primary", "--surface", 4.5, "body text on cards", true],
  ["--text-primary", "--surface-raised", 4.5, "text on raised panels", true],
  ["--text-muted", "--background", 4.5, "secondary text on page", true],
  ["--text-muted", "--surface", 4.5, "secondary text on cards", true],
  ["--text-muted", "--surface-raised", 4.5, "secondary text on raised panels", true],
  ["--text-on-accent", "--accent-orange", 4.5, "label on primary button", true],
  ["--text-on-accent", "--accent-amber", 4.5, "label on amber chip", true],
  ["--text-primary", "--accent-orange", 4.5, "white label on orange (brief's implied default) — REJECTED", false],
  ["--accent-orange", "--background", 4.5, "orange text/links on page", true],
  ["--accent-orange", "--surface", 4.5, "orange text on cards", true],
  ["--accent-amber", "--surface", 4.5, "amber text on cards", true],
  ["--accent-coral", "--surface", 4.5, "coral emphasis text on cards", true],
  ["--highlight-peach", "--surface", 4.5, "peach emphasis text on cards", true],
  ["--border-subtle", "--background", 3, "decorative divider only (not a control boundary)", false],
  ["--border-subtle", "--surface", 3, "decorative divider on cards", false],
  ["--border-strong", "--background", 3, "input / node boundary on page", true],
  ["--border-strong", "--surface", 3, "input boundary on cards", true],
  ["--focus-ring", "--background", 3, "focus indicator", true],
  ["--focus-ring", "--surface", 3, "focus indicator on cards", true],
  ["--danger", "--surface", 4.5, "error text", true],
  ["--success", "--surface", 4.5, "success text", true],
  ["--accent-orange", "--surface-raised", 3, "progress fill vs track", true],
];

let failed = 0;
let md = "| Foreground | Background | Ratio | Needs | Use | Result |\n|---|---|---|---|---|---|\n";
for (const [fg, bg, min, use, required] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok && required) failed++;
  md += `| \`${fg}\` ${tokens[fg]} | \`${bg}\` ${tokens[bg]} | ${r.toFixed(2)}:1 | ${min}:1 | ${use} | ${ok ? "pass" : required ? "**FAIL**" : "fails — not allowed for this use"} |\n`;
}
console.log(md);
process.exit(failed ? 1 : 0);
