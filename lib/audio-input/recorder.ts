import { AUDIO_MAX_BYTES, type CaptureFactory } from "./types";
import { createMeter } from "./meter";

const formats = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm"];
const aborted = () => new DOMException("Recording cancelled.", "AbortError");

export const beginCapture: CaptureFactory = async (signal, interrupted) => {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new Error(
      "Recording is unavailable in this browser or connection. You can still type your message.",
    );
  }
  const mimeType = formats.find((format) => MediaRecorder.isTypeSupported(format));
  if (!mimeType)
    throw new Error(
      "This browser cannot record a supported audio format. Try another browser or type your message.",
    );
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  const tracks = stream.getTracks();
  if (signal.aborted) {
    tracks.forEach((track) => track.stop());
    throw aborted();
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96000 });
  } catch (error) {
    tracks.forEach((track) => track.stop());
    throw error;
  }
  const meter = createMeter(stream);
  let chunks: Blob[] = [];
  let size = 0;
  let finished = false;
  let stopping = false;
  let finishTimer: ReturnType<typeof setTimeout> | null = null;
  let resolve!: (blob: Blob) => void;
  let reject!: (error: Error) => void;
  const completion = new Promise<Blob>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void completion.catch(() => {});

  function release() {
    if (finishTimer) clearTimeout(finishTimer);
    finishTimer = null;
    meter.close();
    signal.removeEventListener("abort", cancel);
    for (const track of tracks) {
      track.removeEventListener("ended", disconnected);
      track.stop();
    }
  }
  function fail(error: Error, notify = true) {
    if (finished) return;
    finished = true;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* Release tracks regardless. */
    }
    release();
    chunks = [];
    reject(error);
    if (notify) interrupted(error);
  }
  function cancel() {
    fail(aborted(), false);
  }
  function disconnected() {
    fail(new Error("The microphone disconnected. Record again or type your message."));
  }

  // Collect final encoded chunks.
  recorder.ondataavailable = (event) => {
    if (finished || !event.data.size) return;
    size += event.data.size;
    if (size > AUDIO_MAX_BYTES) {
      fail(new Error("The recording is too large. Try a shorter recording."));
      return;
    }
    chunks.push(event.data);
  };
  recorder.onerror = () =>
    fail(new Error("Recording failed. Check your microphone and try again."));
  recorder.onstop = () => {
    if (finished) return;
    if (!stopping) {
      fail(new Error("Recording was interrupted. Please record again."));
      return;
    }
    finished = true;
    release();
    const blob = new Blob(chunks, { type: (recorder.mimeType || mimeType).split(";")[0] });
    chunks = [];
    resolve(blob);
  };
  signal.addEventListener("abort", cancel, { once: true });
  tracks.forEach((track) => track.addEventListener("ended", disconnected, { once: true }));
  try {
    recorder.start(250);
  } catch (error) {
    cancel();
    throw error;
  }

  return {
    sample: meter.sample,
    finish: () => {
      if (!stopping && !finished) {
        stopping = true;
        try {
          recorder.stop();
        } catch {
          fail(new Error("Could not finish the recording. Please record again."));
        }
        release();
        if (!finished)
          finishTimer = setTimeout(
            () => fail(new Error("Could not finish the recording. Please record again.")),
            3000,
          );
      }
      return completion;
    },
    cancel,
  };
};
