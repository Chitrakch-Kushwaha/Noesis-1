// Browser voice building blocks, transport-neutral: push-to-talk recording, playback of approved
// speech, and on-device read-aloud. Each reports its real state, which drives the tutor character
// (listening only while a microphone track is live; speaking only while audio is actually playing).
import { TUTOR_LIMITS } from "./contract";

export type MicError = "unsupported" | "denied" | "no-device" | "blocked" | "failed";

/** Push-to-talk recorder. The microphone is opened on start and released on stop, cancel or close. */
export class PushToTalk {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done: ((b: Blob | null) => void) | null = null;
  constructor(private readonly onState: (s: "idle" | "recording") => void) {}

  static supported() {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  }

  /** Opens the microphone (the browser asks for permission the first time) and starts recording. */
  async start(): Promise<{ ok: true } | { ok: false; error: MicError }> {
    if (!PushToTalk.supported()) return { ok: false, error: "unsupported" };
    if (this.rec) return { ok: true };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const n = (e as DOMException).name;
      return { ok: false, error: n === "NotAllowedError" || n === "SecurityError" ? (n === "SecurityError" ? "blocked" : "denied") : n === "NotFoundError" ? "no-device" : "failed" };
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported?.(t));
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const blob = this.chunks.length ? new Blob(this.chunks, { type: this.rec?.mimeType || "audio/webm" }) : null;
      this.release();
      this.done?.(blob && blob.size <= TUTOR_LIMITS.audioBytes ? blob : null);
      this.done = null;
    };
    this.rec.start(250);
    this.onState("recording");
    // never record longer than the limit
    this.timer = setTimeout(() => { void this.stop(); }, TUTOR_LIMITS.audioSeconds * 1000);
    return { ok: true };
  }

  /** Stops recording, releases the microphone and returns the recording (null if empty or too big). */
  stop(): Promise<Blob | null> {
    if (!this.rec || this.rec.state === "inactive") { this.release(); return Promise.resolve(null); }
    return new Promise((resolve) => { this.done = resolve; this.rec!.stop(); });
  }

  /** Discards the recording and releases the microphone immediately. */
  cancel() {
    this.done = null;
    if (this.rec && this.rec.state !== "inactive") { this.rec.onstop = null; try { this.rec.stop(); } catch { /* already stopped */ } }
    this.release();
  }

  get recording() { return this.rec?.state === "recording"; }

  private release() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    this.chunks = [];
    this.onState("idle");
  }
}

/** Plays approved speech with Web Audio (no media URLs, so the page's CSP is unchanged). */
export class SpeechPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private muted = false;
  constructor(private readonly onState: (s: "idle" | "playing" | "error") => void) {}

  async play(audio: ArrayBuffer): Promise<boolean> {
    this.stop();
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.buffer = await this.ctx.decodeAudioData(audio.slice(0));
      return this.replay();
    } catch {
      this.onState("error");
      return false;
    }
  }

  replay(): boolean {
    if (!this.ctx || !this.buffer) return false;
    this.stop();
    this.gain ??= this.ctx.createGain();
    this.gain.gain.value = this.muted ? 0 : 1;
    this.gain.connect(this.ctx.destination);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.onended = () => { if (this.src === src) { this.src = null; this.onState("idle"); } };
    this.src = src;
    src.start();
    this.onState("playing");
    return true;
  }

  stop() {
    const s = this.src;
    this.src = null;
    if (s) { s.onended = null; try { s.stop(); } catch { /* not started */ } this.onState("idle"); }
  }

  setMuted(m: boolean) { this.muted = m; if (this.gain) this.gain.gain.value = m ? 0 : 1; }
  get hasAudio() { return !!this.buffer; }
  close() { this.stop(); void this.ctx?.close().catch(() => undefined); this.ctx = null; this.gain = null; this.buffer = null; }
}

/** On-device read-aloud for authored text. Only voices the device synthesises locally are used, so no
 *  text leaves the device; if there is none, read-aloud is not offered. */
export const deviceSpeech = {
  voice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.localService && /^en(-|_|$)/i.test(v.lang));
    return voices.find((v) => /en-(IN|GB)/i.test(v.lang)) ?? voices[0] ?? null;
  },
  available() { return !!deviceSpeech.voice(); },
  speak(text: string, on: (s: "playing" | "idle" | "error") => void): boolean {
    const v = deviceSpeech.voice();
    if (!v) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = 0.95;
    u.onstart = () => on("playing");
    u.onend = () => on("idle");
    u.onerror = (e) => on(e.error === "interrupted" || e.error === "canceled" ? "idle" : "error");
    window.speechSynthesis.speak(u);
    return true;
  },
  stop() { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); },
};
