"use client";
// Sign in with Google to back up progress to the cloud and restore it on another device. Optional:
// without signing in, progress stays in this browser only, exactly as before.
import { useEffect, useRef, useState } from "react";
import { progressStore, useProgress } from "@/src/persistence/store";
import { backup, hasCloudCopy, restore, signIn, signOutCloud, watchUser, type CloudUser, type SyncState } from "./sync";

const HINT_KEY = "noesis:cloud:signedIn";
const remembered = () => { try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; } };
const remember = (on: boolean) => { try { if (on) localStorage.setItem(HINT_KEY, "1"); else localStorage.removeItem(HINT_KEY); } catch { /* ignore */ } };

export function CloudSync() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [state, setState] = useState<SyncState>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { snapshot, ready } = useProgress();
  const restoring = useRef(false);

  // only load Firebase on start-up if this browser signed in before
  useEffect(() => {
    if (!remembered()) return;
    let stop: (() => void) | undefined;
    void watchUser((u) => { setUser(u); if (!u) remember(false); }).then((s) => { stop = s; }).catch(() => setMsg("Cloud backup is unavailable right now."));
    return () => stop?.();
  }, []);

  // back up a few seconds after progress changes
  useEffect(() => {
    if (!user || !ready || restoring.current) return;
    const t = setTimeout(() => {
      setState("saving");
      backup(user.uid).then(setState).catch(() => setState("error"));
    }, 2500);
    return () => clearTimeout(t);
  }, [user, ready, snapshot]);

  const onSignIn = async () => {
    setBusy(true); setMsg(null);
    try {
      const u = await signIn();
      if (!u) return;
      remember(true);
      // a new device with nothing saved locally picks up the cloud copy
      const empty = progressStore.get().snapshot.attempts.length === 0 && progressStore.get().snapshot.sessions.length === 0;
      if (empty && (await hasCloudCopy(u.uid))) { restoring.current = true; await restore(u.uid); restoring.current = false; setMsg("Your saved progress was restored from the cloud."); }
      setUser(u);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setMsg(code === "auth/popup-closed-by-user" ? "Sign-in was cancelled." : code === "auth/unauthorized-domain" ? "This website isn't allowed to sign in yet (add it under Firebase Authentication → Settings → Authorized domains)." : "Sign-in didn't work. Your progress is still saved in this browser.");
    } finally { setBusy(false); }
  };
  const onRestore = async () => {
    if (!user) return;
    setBusy(true);
    try { restoring.current = true; setMsg((await restore(user.uid)) ? "Restored your cloud copy on this device." : "There's no cloud copy yet."); }
    catch { setMsg("Couldn't restore from the cloud. Nothing on this device changed."); }
    finally { restoring.current = false; setBusy(false); }
  };
  const onSignOut = async () => { await signOutCloud().catch(() => undefined); remember(false); setUser(null); setState("idle"); setMsg("Signed out. Progress stays in this browser."); };

  const status = state === "saving" ? "Backing up…" : state === "saved" ? "Backed up to the cloud." : state === "too-large" ? "Too much progress to back up in one piece; it's still saved in this browser." : state === "error" ? "Cloud backup failed; it will retry when your progress changes." : "";
  return (
    <div className="cloud" data-testid="cloud-sync">
      {!user ? (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Progress is saved in this browser. Sign in to back it up and continue on another device. Only your progress is stored, never your name or email.</p>
          <button className="btn" onClick={() => void onSignIn()} disabled={busy} data-testid="cloud-signin">{busy ? "Signing in…" : "Sign in with Google"}</button>
        </>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13.5 }}>Signed in as {user.label}. <span className="muted" role="status">{status}</span></p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn--small" onClick={() => void onRestore()} disabled={busy} data-testid="cloud-restore">Restore from cloud</button>
            <button className="btn btn--small btn--quiet" onClick={() => void onSignOut()} data-testid="cloud-signout">Sign out</button>
          </div>
        </>
      )}
      {msg && <p role="status" style={{ margin: 0, fontSize: 13 }}>{msg}</p>}
    </div>
  );
}
