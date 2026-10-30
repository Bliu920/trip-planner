export const AUDIO_MAX_BYTES = 3 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 60;
export const AUDIO_MAX_TEXT = 8000;
export const AUDIO_TYPES = ["audio/webm", "audio/mp4"] as const;
export type AudioPhase =
  "idle" | "permission" | "recording" | "stopping" | "transcribing" | "ready" | "error";
export type AudioState = {
  phase: AudioPhase;
  seconds: number;
  levels: number[];
  text: string;
  error: string;
  retryable: boolean;
};
export type Capture = { finish: () => Promise<Blob>; cancel: () => void; sample?: () => number };
export type CaptureFactory = (
  signal: AbortSignal,
  interrupted: (error: Error) => void,
) => Promise<Capture>;
export type Transcriber = (clip: Blob, signal: AbortSignal) => Promise<string>;

export function appendTranscript(draft: string, transcript: string): string | null {
  const text = transcript.trim();
  const combined = draft + (draft && !/\s$/.test(draft) && text ? " " : "") + text;
  return combined.length <= 4000 ? combined : null;
}
