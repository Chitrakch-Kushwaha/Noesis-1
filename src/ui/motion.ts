"use client";
import { useSyncExternalStore } from "react";

/** Student's motion setting (docs/07 §5). "system" follows prefers-reduced-motion. */
export type MotionSetting = "system" | "reduced" | "full";
const KEY = "noesis:motion";

function readSetting(): MotionSetting {
  try {
    const v = localStorage.getItem(KEY);
    return v === "reduced" || v === "full" ? v : "system";
  } catch {
    return "system";
  }
}
const listeners = new Set<() => void>();
export function setMotionSetting(s: MotionSetting) {
  try {
    if (s === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, s);
  } catch {
    /* storage unavailable: setting lasts for this page only */
  }
  document.documentElement.dataset.motion = s;
  listeners.forEach((l) => l());
}
export function applyStoredMotionSetting() {
  document.documentElement.dataset.motion = readSetting();
}

function subscribe(l: () => void) {
  listeners.add(l);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", l);
  return () => {
    listeners.delete(l);
    mq.removeEventListener("change", l);
  };
}
const snapshot = () => {
  const s = readSetting();
  const reduced = s === "reduced" || (s === "system" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return `${s}|${reduced ? 1 : 0}`;
};

export function useMotion(): { setting: MotionSetting; reduced: boolean } {
  const v = useSyncExternalStore(subscribe, snapshot, () => "system|0");
  const [setting, reduced] = v.split("|") as [MotionSetting, string];
  return { setting, reduced: reduced === "1" };
}
