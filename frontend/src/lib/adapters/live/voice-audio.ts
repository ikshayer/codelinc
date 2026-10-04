/** Complete mono PCM WAVs avoid provider/container problems with recorder fragments. */
export function pcmWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767)), true));
  return bytes;
}
export function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** Silence ends an utterance after 550ms. Recordings are bounded and never stored. */
export function captureUtterances(stream: MediaStream, onAudio: (audio: string) => void, onSpeech: () => void, onError: () => void) {
  const context = new AudioContext(), source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
  analyser.fftSize = 1024; source.connect(analyser);
  const levels = new Float32Array(analyser.fftSize);
  const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
  let recorder: MediaRecorder | null = null, active = true, closed = false, voiced = false;
  let started = 0, lastVoice = 0, voicedFrames = 0, generation = 0;
  const record = () => {
    if (closed || !active || recorder) return;
    const mine = generation, current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks: Blob[] = [];
    recorder = current; started = performance.now(); voiced = false; voicedFrames = 0;
    current.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    current.onerror = onError;
    current.onstop = () => {
      const shouldSend = voiced && voicedFrames >= 3 && mine === generation && !closed && active;
      recorder = null;
      if (shouldSend) {
        active = false;
        void (async () => {
          try {
            const decoded = await context.decodeAudioData(await new Blob(chunks).arrayBuffer());
            const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000), clip = offline.createBufferSource();
            clip.buffer = decoded; clip.connect(offline.destination); clip.start();
            const resampled = await offline.startRendering();
            if (!closed && mine === generation) onAudio(base64(pcmWav(resampled.getChannelData(0), 16000)));
          } catch { if (!closed) onError(); }
        })();
      } else record();
    };
    current.start();
  };
  void context.resume().then(record).catch(onError);
  const timer = setInterval(() => {
    if (!active || closed || !recorder) return;
    analyser.getFloatTimeDomainData(levels);
    const rms = Math.sqrt(levels.reduce((sum, n) => sum + n * n, 0) / levels.length), now = performance.now();
    if (rms > 0.018) { voicedFrames++; lastVoice = now; if (!voiced && voicedFrames >= 3) { voiced = true; onSpeech(); } }
    if ((voiced && now - lastVoice > 550) || now - started > (voiced ? 20_000 : 5000)) { if (recorder.state !== "inactive") recorder.stop(); }
  }, 50);
  return {
    setActive(value: boolean) {
      if (closed || active === value) return;
      active = value;
      if (!value) { generation++; if (recorder?.state === "recording") recorder.stop(); } else record();
    },
    close() {
      closed = true; generation++; clearInterval(timer);
      if (recorder?.state === "recording") recorder.stop();
      source.disconnect(); analyser.disconnect(); void context.close();
    },
  };
}
