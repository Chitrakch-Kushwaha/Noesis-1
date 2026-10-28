// Optional cloud backup: a signed-in student's progress (the same JSON as "Export progress") is kept in
// Firestore at users/{uid}. Only learning progress is stored: no name, email or photo is written.
// Progress still lives in the browser first; the cloud copy is a backup that follows the student.
import type { User } from "firebase/auth";
import { progressStore } from "@/src/persistence/store";
import { firebaseApp } from "./firebase";

const MAX_BYTES = 900_000; // Firestore documents are limited to 1 MiB
export interface CloudUser { uid: string; label: string }
export type SyncState = "idle" | "saving" | "saved" | "error" | "too-large";

const auth = async () => { const [{ getAuth }, app] = await Promise.all([import("firebase/auth"), firebaseApp()]); return getAuth(app); };
const db = async () => { const [{ getFirestore }, app] = await Promise.all([import("firebase/firestore"), firebaseApp()]); return getFirestore(app); };
const toUser = (u: User | null): CloudUser | null => (u ? { uid: u.uid, label: u.displayName?.split(" ")[0] || "Signed in" } : null);

export async function signIn(): Promise<CloudUser | null> {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const r = await signInWithPopup(await auth(), new GoogleAuthProvider());
  return toUser(r.user);
}
export async function signOutCloud() { const { signOut } = await import("firebase/auth"); await signOut(await auth()); }

/** Calls back with the signed-in user (or null). Loads Firebase only if a session may already exist. */
export async function watchUser(cb: (u: CloudUser | null) => void): Promise<() => void> {
  const { onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(await auth(), (u) => cb(toUser(u)));
}

export async function backup(uid: string): Promise<SyncState> {
  const data = await progressStore.exportJson();
  if (new Blob([data]).size > MAX_BYTES) return "too-large";
  const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
  await setDoc(doc(await db(), "users", uid), { schema: 2, data, updatedAt: serverTimestamp() });
  return "saved";
}

/** Replaces this browser's progress with the cloud copy. Returns false if there is no cloud copy. */
export async function restore(uid: string): Promise<boolean> {
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(await db(), "users", uid));
  const data = snap.exists() ? (snap.data() as { data?: unknown }).data : undefined;
  if (typeof data !== "string") return false;
  await progressStore.importJson(data);
  return true;
}

export async function hasCloudCopy(uid: string): Promise<boolean> {
  const { doc, getDoc } = await import("firebase/firestore");
  return (await getDoc(doc(await db(), "users", uid))).exists();
}
