// Meter failure must not block dictation.
export function createMeter(stream: MediaStream) {
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  function close() {
    try { source?.disconnect(); } catch { /* Continue releasing resources. */ }
    source = null;
    try { analyser?.disconnect(); } catch { /* Continue releasing resources. */ }
    analyser = null;
    try { if (context) void context.close().catch(() => {}); } catch { /* Recording cleanup must continue. */ }
    context = null;
  }
  try {
    if (typeof AudioContext === "undefined") return { sample: () => 0, close };
    context = new AudioContext();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser(); analyser.fftSize = 256;
    source.connect(analyser);
    // Never connect to speakers.
    void context.resume().catch(() => {});
  } catch { close(); }
  const samples = new Float32Array(256);
  return {
    sample: () => {
      if (!analyser || context?.state !== "running") return 0;
      try {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        return Number.isFinite(rms) ? Math.min(1, rms * 5) : 0;
      } catch { return 0; }
    },
    close,
  };
}
