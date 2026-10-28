"use client";
// The tutor panel: authored guidance always, plus live text and voice only when the server reports an
// activated provider (or a labelled developer fixture). Opening the panel is not assistance; the lesson
// player decides how each applied reply counts. Closing it, or leaving the question, cancels obsolete
// work, stops audio and releases the microphone.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuestionInstance } from "@/src/content/instantiate";
import { newRequestId, requestTurn, synthesise, transcribe, tutorFeatures, type ServerReply } from "@/src/tutor/client";
import { AUTHORED_FEATURES, TUTOR_LIMITS, type QuestionKey, type TutorAction, type TutorFeatures, type Turn } from "@/src/tutor/contract";
import { deviceSpeech, PushToTalk, SpeechPlayer, type MicError } from "@/src/tutor/voice";
import { OWL_STATE_LABEL, OwlTutor, type OwlState } from "./OwlTutor";

export interface TutorPlayerView {
  hintsShown: number;
  hintsTotal: number;
  phase: "answering" | "correct" | "exhausted";
  attempts: unknown[];
  hasWrongAttempt: boolean;
}
export type ApplyResult = "applied" | "stale";

interface Message { id: string; role: "student" | "tutor" | "note"; text: string; source?: ServerReply["source"]; fallback?: string; speechToken?: string }

const ACTION_LABEL: Record<Exclude<TutorAction, "ask">, string> = {
  begin: "Help me begin",
  "explain-mistake": "Explain my mistake",
  "guide-visual": "Guide me through the visual",
  "next-hint": "Give me the next hint",
};
const FALLBACK_NOTE: Record<string, string> = {
  timeout: "The live tutor took too long, so this is the lesson's own help.",
  "rate-limited": "The live tutor is busy right now, so this is the lesson's own help.",
  "provider-error": "The live tutor couldn't be reached, so this is the lesson's own help.",
  malformed: "The live tutor's reply couldn't be used, so this is the lesson's own help.",
  "unauthorised-tool": "The live tutor asked for something it isn't allowed to do, so this is the lesson's own help.",
  ungrounded: "The live tutor's reply wasn't grounded in this question, so this is the lesson's own help.",
  "answer-leak": "The live tutor's reply gave too much away, so this is the lesson's own help.",
  "unsafe-text": "The live tutor's reply couldn't be shown, so this is the lesson's own help.",
};
const MIC_ERROR: Record<MicError, string> = {
  unsupported: "This browser can't record audio. You can type instead, or use the buttons above.",
  denied: "Microphone access was not allowed. You can type instead, or use the buttons above. Your lesson is unchanged.",
  "no-device": "No microphone was found. You can type instead, or use the buttons above.",
  blocked: "This page isn't allowed to use the microphone. You can type instead, or use the buttons above.",
  failed: "The microphone couldn't start. You can type instead, or use the buttons above.",
};

const HIDE_OWL_KEY = "noesis:tutor:hideOwl";
const readHide = () => { try { return localStorage.getItem(HIDE_OWL_KEY) === "1"; } catch { return false; } };

export function TutorPanel({ open, onClose, q, questionKey, skillTitle, player, epoch, getSnapshot, onApply, demoActive, reduced, encourageToken, compact }: {
  open: boolean; onClose(): void;
  q: QuestionInstance; questionKey: QuestionKey; skillTitle: string;
  player: TutorPlayerView;
  /** changes whenever the student's answer state changes; replies requested under an older epoch are discarded */
  epoch: string;
  getSnapshot(): unknown;
  onApply(reply: ServerReply, epochAtRequest: string): ApplyResult;
  demoActive: boolean;
  reduced: boolean;
  /** bumps when the student answers correctly */
  encourageToken: number;
  compact: boolean;
}) {
  const [features, setFeatures] = useState<TutorFeatures>(AUTHORED_FEATURES);
  const [messages, setMessages] = useState<Message[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [encouraging, setEncouraging] = useState(false);
  const [hideOwl, setHideOwl] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [mic, setMic] = useState<"idle" | "explain" | "ready" | "recording" | "processing">("idle");
  const [micNote, setMicNote] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [recSeconds, setRecSeconds] = useState(0);
  const [playback, setPlayback] = useState<"idle" | "playing" | "error">("idle");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [voiceKind, setVoiceKind] = useState<"ai" | "fixture" | "device" | null>(null);
  const [muted, setMuted] = useState(false);
  const [deviceVoice, setDeviceVoice] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recorder = useRef<PushToTalk | null>(null);
  const audio = useRef<SpeechPlayer | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const epochRef = useRef(epoch);
  epochRef.current = epoch;

  useEffect(() => { setHideOwl(readHide()); }, []);
  useEffect(() => { if (open) void tutorFeatures().then(setFeatures); }, [open]);
  // on-device voices load asynchronously
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const check = () => setDeviceVoice(deviceSpeech.available());
    check();
    window.speechSynthesis.addEventListener?.("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", check);
  }, []);

  const stopAudio = useCallback(() => { audio.current?.stop(); deviceSpeech.stop(); setPlayback("idle"); setPlayingId(null); }, []);
  /** cancel everything in flight: requests, recording, speech */
  const cancelAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setWaiting(false);
    recorder.current?.cancel();
    setMic((m) => (m === "recording" || m === "processing" ? "ready" : m));
    stopAudio();
  }, [stopAudio]);

  // closing Help cancels obsolete work and releases the microphone
  useEffect(() => { if (!open) cancelAll(); }, [open, cancelAll]);
  // leaving the question (unmount) releases everything
  useEffect(() => () => { abortRef.current?.abort(); recorder.current?.cancel(); audio.current?.close(); deviceSpeech.stop(); }, []);

  // brief encouragement after a correct answer, from the real event
  const lastEncourage = useRef(encourageToken);
  useEffect(() => {
    if (encourageToken === lastEncourage.current) return;
    lastEncourage.current = encourageToken;
    setEncouraging(true);
    const t = setTimeout(() => setEncouraging(false), 1600);
    return () => clearTimeout(t);
  }, [encourageToken]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [messages]);

  const push = (m: Omit<Message, "id">) => setMessages((ms) => [...ms, { ...m, id: newRequestId() }].slice(-24));
  const history = (): Turn[] => messages.filter((m) => m.role !== "note").slice(-TUTOR_LIMITS.historyTurns).map((m) => ({ role: m.role === "student" ? "student" : "tutor", text: m.text.slice(0, TUTOR_LIMITS.messageChars) }));

  const speak = useCallback(async (m: Message) => {
    stopAudio();
    if (m.speechToken && features.voice && m.text.length <= TUTOR_LIMITS.speechChars) {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setWaiting(true);
      const r = await synthesise(m.text, m.speechToken, ctrl.signal).catch(() => ({ ok: false as const }));
      setWaiting(false);
      if (ctrl.signal.aborted) return;
      if (!r.ok) { setUnavailable(true); setPlayback("error"); return; }
      audio.current ??= new SpeechPlayer((s) => { setPlayback(s); if (s !== "playing") setPlayingId(null); if (s === "error") setUnavailable(true); });
      audio.current.setMuted(muted);
      setVoiceKind(features.mode === "fixture" ? "fixture" : r.aiGenerated ? "ai" : "device");
      setPlayingId(m.id);
      const ok = await audio.current.play(r.audio);
      if (!ok) { setUnavailable(true); setPlayingId(null); }
      return;
    }
    // authored text, or no AI voice: the device's own voice, entirely on the device
    setVoiceKind("device");
    setPlayingId(m.id);
    const ok = deviceSpeech.speak(m.text, (s) => { setPlayback(s); if (s !== "playing") setPlayingId(null); if (s === "error") setUnavailable(true); });
    if (!ok) setPlayingId(null);
  }, [features.mode, features.voice, muted, stopAudio]);

  const ask = useCallback(async (action: TutorAction, message?: string, opts: { speakReply?: boolean } = {}) => {
    abortRef.current?.abort();
    stopAudio();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const epochAt = epochRef.current;
    push({ role: "student", text: action === "ask" ? message ?? "" : ACTION_LABEL[action] });
    const networked = features.mode !== "authored" && !(action === "ask" && !features.text);
    if (networked) setWaiting(true);
    let reply: ServerReply;
    try {
      reply = await requestTurn(features, q, questionKey, {
        requestId: newRequestId(), question: questionKey, action, ...(message ? { message: message.slice(0, TUTOR_LIMITS.messageChars) } : {}),
        state: { hintsShown: player.hintsShown, phase: player.phase, attempts: player.attempts.slice(-TUTOR_LIMITS.attempts), snapshot: getSnapshot() },
        history: history(),
      }, skillTitle, ctrl.signal);
    } catch {
      return; // cancelled: the student closed Help, left, or asked again
    } finally {
      if (abortRef.current === ctrl) setWaiting(false);
    }
    if (ctrl.signal.aborted) return;
    const result = onApply(reply, epochAt);
    if (result === "stale") {
      push({ role: "note", text: "Your work changed while I was answering, so I set that reply aside. Ask again if you'd like help with where you are now." });
      return;
    }
    const failed = reply.fallback && ["timeout", "rate-limited", "provider-error"].includes(reply.fallback.reason);
    setUnavailable(!!failed);
    const tutorMsg: Message = { id: newRequestId(), role: "tutor", text: reply.text, source: reply.source, fallback: reply.fallback?.reason, speechToken: reply.speechToken };
    setMessages((ms) => [...ms, tutorMsg].slice(-24));
    if (opts.speakReply) void speak(tutorMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, q, questionKey, player, getSnapshot, onApply, skillTitle, speak, stopAudio, messages]);

  // ----------------------------------------------------------- voice input (only when the server offers it)
  const startRecording = async () => {
    stopAudio(); // interrupting the tutor stops its speech
    setHeard(null);
    setMicNote(null);
    recorder.current ??= new PushToTalk((s) => { if (s === "idle") setRecSeconds(0); });
    const r = await recorder.current.start();
    if (!r.ok) { setMic("ready"); setMicNote(MIC_ERROR[r.error]); return; }
    setMic("recording");
  };
  useEffect(() => {
    if (mic !== "recording") return;
    const t = setInterval(() => {
      setRecSeconds((s) => s + 1);
      // the recorder stops itself at the time limit; follow its real state
      if (!recorder.current?.recording) setMic((m) => (m === "recording" ? "ready" : m));
    }, 1000);
    return () => clearInterval(t);
  }, [mic]);
  const stopRecording = async () => {
    const blob = await recorder.current?.stop();
    if (!blob) { setMic("ready"); setMicNote("I didn't catch anything. Try again, or type instead."); return; }
    setMic("processing");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setWaiting(true);
    const r = await transcribe(blob, ctrl.signal).catch(() => null);
    if (abortRef.current === ctrl) setWaiting(false);
    if (!r || ctrl.signal.aborted) { setMic("ready"); return; }
    setMic("ready");
    if (!r.ok) {
      if (r.error !== "empty") setUnavailable(true);
      setMicNote(r.error === "rate-limited" ? "Voice is busy right now. Type instead, or try again shortly." : r.error === "empty" ? "I didn't catch anything. Try again, or type instead." : "Speech couldn't be turned into text. Type instead, or use the buttons above.");
      return;
    }
    setUnavailable(false);
    setHeard(r.text);
  };

  // ----------------------------------------------------------- what the owl shows, from real events
  const owlState: OwlState = mic === "recording" ? "listening" : playback === "playing" ? "speaking" : waiting ? "waiting"
    : unavailable ? "unavailable" : encouraging ? "encouraging" : demoActive ? "guiding" : "ready";
  const identity = features.mode === "live"
    ? `AI tutor${features.providerName ? ` (${features.providerName})` : ""}. Replies are generated by AI and checked against this lesson before you see them.`
    : features.mode === "fixture" ? "Developer fixture. Not a live tutor: replies are canned test data."
    : "Authored learning assistant. Uses this lesson's own hints and visuals. No AI.";
  const canSpeakAny = features.voice || deviceVoice;
  const lastTutor = useMemo(() => [...messages].reverse().find((m) => m.role === "tutor"), [messages]);
  const answering = player.phase === "answering";

  const modeLabel = features.mode === "live" ? (features.localPreview ? "AI · local preview" : "AI") : features.mode === "fixture" ? "Test fixture" : "Lesson guide";
  const toggleOwl = () => { const v = !hideOwl; setHideOwl(v); try { localStorage.setItem(HIDE_OWL_KEY, v ? "1" : "0"); } catch { /* ignore */ } };
  const sendDraft = () => { const t = draft.trim(); if (t) { setDraft(""); void ask("ask", t); } };
  const greeting = features.mode === "live"
    ? `Hi! I'm your AI tutor for this question. Ask me anything about it, or pick one of the suggestions below. I'll nudge you rather than give the answer away.`
    : "Hi! I can walk you through this question with the lesson's own hints and visuals. Make a prediction first, then pick what would help.";

  if (!open) return null;
  return (
    <aside className="tutor" data-testid="tutor-panel" data-mode={features.mode} data-sheet={compact ? (sheetOpen ? "open" : "closed") : undefined} aria-label="Tutor">
      <header className="tutor__head">
        {!hideOwl && <div className="tutor__owl"><OwlTutor state={owlState} direction={compact ? "up" : "left"} reduced={reduced} size={compact ? 52 : 76} /></div>}
        <div className="tutor__who">
          <h2 className="tutor__title">Owl tutor <span className="tutor__pill" data-mode={features.mode}>{modeLabel}</span></h2>
          <p className="tutor__state" role="status" data-testid="tutor-state" data-state={owlState}>{OWL_STATE_LABEL[owlState]}</p>
          <p className="tutor__mode" data-testid="tutor-identity">{identity}</p>
        </div>
        <div className="tutor__headbtns">
          {compact && <button type="button" className="tutor__iconbtn" onClick={() => setSheetOpen((s) => !s)} aria-expanded={sheetOpen} data-testid="tutor-sheet-toggle">{sheetOpen ? "Minimise" : "Expand"}</button>}
          <button type="button" className="tutor__iconbtn" onClick={toggleOwl} aria-pressed={hideOwl} data-testid="tutor-hide-owl">{hideOwl ? "Show owl" : "Hide owl"}</button>
          <button type="button" className="tutor__iconbtn tutor__close" onClick={onClose} data-testid="tutor-close" aria-label="Close tutor">✕</button>
        </div>
      </header>

      {(!compact || sheetOpen) && (
        <div className="tutor__body">
          {features.mode === "fixture" && <p className="tutor__fixture" data-testid="tutor-fixture-banner">Developer fixture: canned replies and a test tone, for checking the interface. This is not a live tutor.</p>}
          <div className="tutor__log" ref={logRef} aria-live="polite" data-testid="tutor-log">
            <div className="tutor__msg tutor__msg--tutor tutor__msg--greeting"><p>{greeting}</p></div>
            {messages.map((m) => (
              <div key={m.id} className={`tutor__msg tutor__msg--${m.role}`} data-testid={`tutor-msg-${m.role}`} data-source={m.source}>
                {m.role === "tutor" && m.fallback && FALLBACK_NOTE[m.fallback] && <p className="tutor__fallback" data-testid="tutor-fallback" data-reason={m.fallback}>{FALLBACK_NOTE[m.fallback]}</p>}
                <p>{m.text}</p>
                {m.role === "tutor" && playingId === m.id && (
                  <p className="tutor__caption-badge" data-testid="tutor-voice-badge">
                    {voiceKind === "ai" ? "AI-generated voice, not a human." : voiceKind === "fixture" ? "Test tone from the developer fixture, not a voice." : "Read by your device's built-in voice."}
                  </p>
                )}
              </div>
            ))}
            {waiting && <div className="tutor__msg tutor__msg--tutor tutor__typing" aria-label="The tutor is thinking"><i /><i /><i /></div>}
          </div>

          {(playback === "playing" || audio.current?.hasAudio) && voiceKind !== "device" && (
            <div className="tutor__playback" role="group" aria-label="Speech controls">
              <button type="button" className="chip-btn" onClick={stopAudio} disabled={playback !== "playing"} data-testid="tutor-stop">Stop</button>
              <button type="button" className="chip-btn" onClick={() => { const v = !muted; setMuted(v); audio.current?.setMuted(v); }} aria-pressed={muted} data-testid="tutor-mute">{muted ? "Unmute" : "Mute"}</button>
              <button type="button" className="chip-btn" onClick={() => { if (audio.current?.replay()) setPlayingId(lastTutor?.id ?? null); }} disabled={!audio.current?.hasAudio} data-testid="tutor-replay">Replay</button>
            </div>
          )}

          <div className="tutor__actions" role="group" aria-label="Suggestions">
            <button type="button" className="chip-btn" onClick={() => void ask("begin")} data-testid="tutor-begin">{ACTION_LABEL.begin}</button>
            <button type="button" className="chip-btn" onClick={() => void ask("guide-visual")} data-testid="tutor-guide">{ACTION_LABEL["guide-visual"]}</button>
            <button type="button" className="chip-btn" onClick={() => void ask("next-hint")} disabled={!answering || player.hintsShown >= player.hintsTotal} data-testid="tutor-next-hint">{ACTION_LABEL["next-hint"]}</button>
            <button type="button" className="chip-btn" onClick={() => void ask("explain-mistake")} disabled={!player.hasWrongAttempt} data-testid="tutor-explain">{ACTION_LABEL["explain-mistake"]}</button>
            {canSpeakAny && lastTutor && (
              <button type="button" className="chip-btn" onClick={() => (playback === "playing" ? stopAudio() : void speak(lastTutor))} data-testid="tutor-read-aloud">
                {playback === "playing" ? "Stop reading" : "Read this aloud"}
              </button>
            )}
          </div>
          {!answering && <p className="tutor__note">This question has ended, so the tutor won't give new hints. The worked solution is in the lesson.</p>}

          {features.voice && (
            <section className="tutor__voice" aria-label="Voice">
              {mic === "explain" && (
                <div className="tutor__explain" data-testid="tutor-mic-explainer">
                  <p className="small">When you press <strong>Push to talk</strong>, your microphone records until you press Stop (at most {TUTOR_LIMITS.audioSeconds} seconds). The recording goes to our server, is turned into text{features.providerName ? ` by ${features.providerName}` : ""}, and is not stored. You can check and edit the text before it is sent.</p>
                  <div className="answer-row">
                    <button type="button" className="tutor__primary" onClick={() => setMic("ready")} data-testid="tutor-mic-allow">Allow microphone</button>
                    <button type="button" className="chip-btn" onClick={() => setMic("idle")}>Not now</button>
                  </div>
                </div>
              )}
              {(mic === "ready" || mic === "recording" || mic === "processing") && (
                <div className="tutor__mic">
                  {mic !== "recording" ? (
                    <button type="button" className="tutor__primary" onClick={() => void startRecording()} disabled={mic === "processing"} data-testid="tutor-ptt">Push to talk</button>
                  ) : (
                    <button type="button" className="tutor__primary tutor__primary--rec" onClick={() => void stopRecording()} data-testid="tutor-ptt-stop">Stop · recording {recSeconds}s</button>
                  )}
                  {mic === "recording" && <span className="tutor__rec" data-testid="tutor-recording" role="status"><i aria-hidden="true" /> Recording: microphone on</span>}
                  {mic === "processing" && <span className="tutor__note" role="status" data-testid="tutor-processing">Turning your speech into text…</span>}
                </div>
              )}
              {micNote && <p className="tutor__note tutor__note--alert" role="alert" data-testid="tutor-mic-note">{micNote}</p>}
              {heard !== null && (
                <form className="tutor__heard" onSubmit={(e) => { e.preventDefault(); const t = heard.trim(); setHeard(null); if (t) void ask("ask", t, { speakReply: true }); }} data-testid="tutor-heard">
                  <label htmlFor="tutor-heard-text" className="small">I heard this. Edit it if needed, then send:</label>
                  <textarea id="tutor-heard-text" rows={2} maxLength={TUTOR_LIMITS.messageChars} value={heard} onChange={(e) => setHeard(e.target.value)} data-testid="tutor-heard-text" />
                  <div className="answer-row">
                    <button type="submit" className="tutor__primary" data-testid="tutor-heard-send">Send</button>
                    <button type="button" className="chip-btn" onClick={() => setHeard(null)}>Discard</button>
                  </div>
                </form>
              )}
            </section>
          )}

          {features.text ? (
            <form className="tutor__composer" onSubmit={(e) => { e.preventDefault(); sendDraft(); }}>
              <label htmlFor="tutor-text" className="sr-only">Ask about this question</label>
              <textarea
                id="tutor-text" rows={1} maxLength={TUTOR_LIMITS.messageChars} value={draft} placeholder="Ask about this question…"
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDraft(); } }} data-testid="tutor-text"
              />
              {features.voice && mic === "idle" && <button type="button" className="tutor__mic-btn" onClick={() => setMic("explain")} aria-label="Use my voice" data-testid="tutor-voice-start">Voice</button>}
              <button type="submit" className="tutor__send" disabled={!draft.trim()} aria-label="Send" data-testid="tutor-send">↑</button>
            </form>
          ) : (
            <div className="tutor__composer tutor__composer--off">
              <span className="tutor__fake-input" aria-hidden="true">Ask about this question…</span>
              <p className="tutor__note" data-testid="tutor-text-off">Typed and spoken questions need the live tutor, which is turned off. The suggestions above use this lesson's own help.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
