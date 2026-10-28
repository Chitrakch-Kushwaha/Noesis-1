// Class-name join (the landing page uses no Tailwind, so no merge step is needed).
type ClassValue = string | number | null | undefined | false | Record<string, boolean> | ClassValue[];
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const v of inputs) {
    if (!v) continue;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) out.push(cn(...v));
    else for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  }
  return out.join(" ");
}
