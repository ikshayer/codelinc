"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SAMPLE_INTERVAL_MS = 100;
const LEVEL_GAIN = 4;

function subscribeToMotionPreference(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * Real input level (0 to 1) of the captured stream, so people can see the
 * microphone is on. It measures loudness only — it says nothing about
 * whether anything is being understood.
 */
export function useMicLevel(stream: MediaStream | null, enabled: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || !enabled || typeof AudioContext === "undefined") return;
    let context: AudioContext;
    try {
      context = new AudioContext();
    } catch (error) {
      console.warn("Microphone level display unavailable", error);
      return;
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    context.resume().catch((error: unknown) => console.warn("Microphone level display couldn't start", error));

    const id = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let squares = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        squares += centered * centered;
      }
      setLevel(Math.min(1, Math.sqrt(squares / samples.length) * LEVEL_GAIN));
    }, SAMPLE_INTERVAL_MS);

    return () => {
      clearInterval(id);
      source.disconnect();
      context.close().catch((error: unknown) => console.warn("Audio context didn't close cleanly", error));
    };
  }, [stream, enabled]);

  return stream && enabled ? level : 0;
}
