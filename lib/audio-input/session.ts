import { beginCapture } from "./recorder";
import { AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS, AUDIO_MAX_TEXT, type AudioState, type Capture, type CaptureFactory, type Transcriber } from "./types";

const idle = (): AudioState => ({ phase: "idle", seconds: 0, levels: Array(48).fill(0), text: "", error: "", retryable: false });

export const requestTranscript: Transcriber = async (clip, signal) => {
  const response = await fetch("/api/audio/transcribe", {
    method: "POST", headers: { "Content-Type": clip.type }, body: clip,
    signal: AbortSignal.any([signal, AbortSignal.timeout(50000)]),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "Transcription failed. Retry or record again.");
  if (typeof result?.text !== "string" || !result.text.trim()) throw new Error("No speech was detected. Record again or retry.");
  if (result.text.length > AUDIO_MAX_TEXT) throw new Error("The transcript is too long. Try a shorter recording.");
  return result.text.trim();
};

function captureMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow it in your browser settings, then try again.";
  if (name === "NotFoundError") return "No microphone was found. Connect one or type your message.";
  if (name === "NotReadableError") return "The microphone is unavailable. Close other apps using it and try again.";
  if (name === "TimeoutError") return "Transcription timed out. Retry or record again.";
  return error instanceof Error ? error.message : "Audio input failed. Try again or type your message.";
}

export class AudioSession {
  private state = idle();
  private listeners = new Set<() => void>();
  private generation = 0;
  private controller: AbortController | null = null;
  private capture: Capture | null = null;
  private clip: Blob | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  constructor(private captureFactory: CaptureFactory = beginCapture, private transcriber: Transcriber = requestTranscript) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<AudioState>) { this.state = { ...this.state, ...next }; this.listeners.forEach(listener => listener()); }
  private clearTimer() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // Release owned resources.
  cancel = () => {
    ++this.generation;
    this.clearTimer(); this.controller?.abort(); this.controller = null;
    this.capture?.cancel(); this.capture = null; this.clip = null;
    this.state = idle(); this.listeners.forEach(listener => listener());
  };
  interrupt = () => {
    if (!["permission", "recording", "stopping"].includes(this.state.phase)) return;
    this.cancel(); this.update({ phase: "error", error: "Recording stopped when you left this tab. Record again when you are ready." });
  };

  // Acquire a fresh recording.
  start = async () => {
    if (!["idle", "error"].includes(this.state.phase)) return;
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController(); this.controller = controller;
    this.update({ phase: "permission" });
    try {
      const capture = await this.captureFactory(controller.signal, error => {
        if (generation !== this.generation) return;
        this.cancel(); this.update({ phase: "error", error: captureMessage(error) });
      });
      if (generation !== this.generation) { capture.cancel(); return; }
      this.capture = capture; this.startedAt = Date.now();
      this.update({ phase: "recording" });
      this.timer = setInterval(() => {
        const seconds = Math.min(AUDIO_MAX_SECONDS, Math.floor((Date.now() - this.startedAt) / 1000));
        const level = this.capture?.sample?.() ?? 0;
        this.update({ seconds, levels: [...this.state.levels.slice(1), Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0] });
        if (seconds >= AUDIO_MAX_SECONDS) void this.stop();
      }, 80);
    } catch (error) {
      if (generation !== this.generation) return;
      this.cancel(); this.update({ phase: "error", error: captureMessage(error) });
    }
  };

  // Finish before transcribing.
  stop = async () => {
    if (this.state.phase !== "recording" || !this.capture) return;
    const generation = this.generation;
    const duration = Date.now() - this.startedAt;
    this.clearTimer(); this.update({ phase: "stopping" });
    try {
      const clip = await this.capture.finish();
      if (generation !== this.generation) return;
      this.capture = null;
      if (!clip.size || duration < 400) throw new Error("The recording was too short. Record a little longer.");
      if (clip.size > AUDIO_MAX_BYTES) throw new Error("The recording is too large. Try a shorter recording.");
      this.clip = clip;
      await this.transcribe();
    } catch (error) {
      if (generation === this.generation) {
        this.capture?.cancel(); this.capture = null;
        this.update({ phase: "error", error: captureMessage(error), retryable: !!this.clip });
      }
    }
  };
  private async transcribe() {
    if (!this.clip) return;
    const generation = this.generation;
    this.controller?.abort(); this.controller = new AbortController();
    this.update({ phase: "transcribing", error: "", retryable: false });
    try {
      const text = await this.transcriber(this.clip, this.controller.signal);
      if (generation !== this.generation) return;
      if (!text.trim()) throw new Error("No speech was detected. Record again or retry.");
      if (text.length > AUDIO_MAX_TEXT) throw new Error("The transcript is too long. Try a shorter recording.");
      this.update({ phase: "ready", text: text.trim() });
    } catch (error) {
      if (generation === this.generation) this.update({ phase: "error", error: captureMessage(error), retryable: true });
    }
  }
  retry = async () => { if (this.state.phase === "error" && this.clip) await this.transcribe(); };
  accept = (insert: (text: string) => string | null) => {
    if (this.state.phase !== "ready" || !this.state.text.trim()) return;
    const error = insert(this.state.text.trim());
    if (error) this.update({ phase: "error", error, retryable: false }); else this.cancel();
  };
}
