"use client";
// Per-browser settings that are not learning records: the student's class and the reviewer preview flag.
import { CONFIG } from "@/src/domain/config";
import { setPreviewVisible } from "@/src/domain/progress";

const CLASS_KEY = "noesis:class";
const PREVIEW_KEY = "noesis:reviewPreview";
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export type ClassChoice = 11 | 12 | "skip";
/** The stored answer to "Which class are you in?", or null when it has not been asked yet. */
export function storedClass(): ClassChoice | null {
  const v = get(CLASS_KEY);
  return v === "11" ? 11 : v === "12" ? 12 : v === "skip" ? "skip" : null;
}
export const setStoredClass = (c: ClassChoice) => set(CLASS_KEY, String(c));
/** Class used for routing: "Skip" and an unset class are treated as the configured default (11). */
export const effectiveClass = (c: ClassChoice | null): 11 | 12 => (c === 11 || c === 12 ? c : CONFIG.studentClass.defaultWhenUnset);

/** Reviewer preview: in-review content may count inside sessions started while it is on, and those
 *  results show on the map only while it stays on. It is never on unless someone turns it on. */
export function previewOn(): boolean { return get(PREVIEW_KEY) === "on"; }
export function setPreview(on: boolean) { set(PREVIEW_KEY, on ? "on" : null); setPreviewVisible(on); }
/** Read the flag (and a `?preview=review` URL) once on load. */
export function applyPreviewFromUrl(): boolean {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "review") set(PREVIEW_KEY, "on");
  const on = previewOn();
  setPreviewVisible(on);
  return on;
}
