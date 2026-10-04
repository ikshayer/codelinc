"use client";

import { motion } from "motion/react";
import { useEffect, useRef, type RefObject } from "react";

import Orb, { type OrbControl, type OrbPalette } from "@/components/Orb";
import { cn } from "@/lib/utils";

import type { VoiceStatus } from "./voice-session-state";

// Lincoln burgundy to horizon orange, passed as the orb's base colors.
const LINCOLN_PALETTE: OrbPalette = ["#B01552", "#FF4F17", "#650030"];

type Drive = "none" | "microphone" | "speech";

interface OrbProfile {
  /** Where the vibration comes from. Only real states drive any: input level, or the assistant speaking. */
  drive: Drive;
  /** Speed of the surface's internal clock. 0 freezes it. */
  timeScale: number;
  /** Swirl in radians per second. */
  spin: number;
  saturation: number;
  brightness: number;
  /** Resting size of the whole orb. */
  scale: number;
  /** Resting opacity. */
  opacity: number;
}

const REST: OrbProfile = { drive: "none", timeScale: 0, spin: 0, saturation: 1, brightness: 1, scale: 1, opacity: 1 };

const PROFILES: Record<VoiceStatus, OrbProfile> = {
  ready: { ...REST, timeScale: 0.1, brightness: 0.95, scale: 0.94 },
  requesting: { ...REST, timeScale: 0.2, scale: 0.94 },
  denied: { ...REST, saturation: 0.1, brightness: 0.6, scale: 0.78 },
  connecting: { ...REST, timeScale: 0.3, scale: 0.96 },
  listening: { ...REST, drive: "microphone", timeScale: 0.35 },
  thinking: { ...REST, timeScale: 0.55, spin: 0.9, scale: 0.97 },
  speaking: { ...REST, drive: "speech", timeScale: 1.1 },
  muted: { ...REST, saturation: 0.08, brightness: 0.6, scale: 0.94 },
  reconnecting: { ...REST, timeScale: 0.3, saturation: 0.5, scale: 0.94, opacity: 0.55 },
  failed: { ...REST, saturation: 0.05, brightness: 0.55, scale: 0.6, opacity: 0.8 },
  ended: { ...REST, saturation: 0.05, brightness: 0.55, scale: 0.6, opacity: 0.8 },
};

const MIN_AUDIBLE_LEVEL = 0.04;
const VIBRATION_SCALE = 0.1;
const JITTER_PX = 3;

/**
 * Deterministic stand-in for the assistant's voice envelope in demo mode:
 * syllable-rate pulses inside slower phrases with pauses between them.
 * It only runs while the assistant is in its speaking state.
 */
function speechAmplitude(seconds: number): number {
  const syllable = Math.abs(Math.sin(seconds * Math.PI * 3.6)) ** 0.7;
  const phrase = 0.6 + 0.4 * Math.sin(seconds * Math.PI * 0.9);
  const pause = Math.sin(seconds * Math.PI * 0.46) > -0.65 ? 1 : 0.12;
  return Math.min(1, (0.2 + 0.7 * syllable * phrase) * pause);
}

interface DriveInputs {
  profile: OrbProfile;
  microphoneLevel: number;
  reducedMotion: boolean;
}

/**
 * Smooths the real signals into the WebGL orb and its vibration transform on
 * every frame, without re-rendering React.
 */
function useOrbDrive(inputs: DriveInputs, vibrationRef: RefObject<HTMLDivElement | null>) {
  const control = useRef<OrbControl>({ level: 0, timeScale: 0.1, spin: 0, saturation: 1, brightness: 1 });
  const latest = useRef(inputs);
  useEffect(() => {
    latest.current = inputs;
  });

  useEffect(() => {
    const start = performance.now();
    let last = start;
    let previousDrive: Drive = "none";
    let frame = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const seconds = (now - start) / 1000;
      const { profile, microphoneLevel, reducedMotion } = latest.current;
      const state = control.current;
      const ease = (rate: number) => (reducedMotion ? 1 : 1 - Math.exp(-rate * dt));

      let drive = 0;
      if (!reducedMotion) {
        if (profile.drive === "microphone") drive = microphoneLevel < MIN_AUDIBLE_LEVEL ? 0 : microphoneLevel;
        else if (profile.drive === "speech") drive = speechAmplitude(seconds);
      }
      // Stop speaking (or any state change) ends the vibration at once.
      if (previousDrive !== profile.drive) state.level = 0;
      previousDrive = profile.drive;
      state.level += (drive - state.level) * ease(drive > state.level ? 16 : 7);

      state.timeScale += ((reducedMotion ? 0 : profile.timeScale) - state.timeScale) * ease(4);
      state.spin += ((reducedMotion ? 0 : profile.spin) - state.spin) * ease(4);
      state.saturation += (profile.saturation - state.saturation) * ease(5);
      state.brightness += (profile.brightness - state.brightness) * ease(5);

      const element = vibrationRef.current;
      if (element) {
        const level = state.level;
        const jitterX = Math.sin(seconds * 41) * level * JITTER_PX;
        const jitterY = Math.cos(seconds * 53) * level * JITTER_PX;
        element.style.transform = `translate(${jitterX.toFixed(2)}px, ${jitterY.toFixed(2)}px) scale(${(1 + level * VIBRATION_SCALE).toFixed(4)})`;
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [vibrationRef]);

  return control;
}

export interface VoiceOrbProps {
  status: VoiceStatus;
  /** Measured input level, 0 to 1. Only used while listening. */
  microphoneLevel: number;
  reducedMotion: boolean;
  /** Makes the orb itself tappable (before the conversation starts). */
  onActivate?: () => void;
  /** Ended or failed: the orb shrinks and the space it leaves closes up. */
  collapsed?: boolean;
  className?: string;
}

/**
 * The hero orb. Every motion maps to real state: input level while listening,
 * the simulated voice envelope while the assistant speaks, a slow swirl while
 * thinking, and stillness otherwise.
 */
export function VoiceOrb({ status, microphoneLevel, reducedMotion, onActivate, collapsed = false, className }: VoiceOrbProps) {
  const profile = PROFILES[status];
  const vibration = useRef<HTMLDivElement>(null);
  const control = useOrbDrive({ profile, microphoneLevel, reducedMotion }, vibration);
  const flicker = status === "reconnecting" && !reducedMotion;

  const surface = (
    <motion.div
      className="size-full"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: profile.scale, opacity: flicker ? [0.9, 0.3, 0.75, 0.25, 0.9] : profile.opacity }}
      transition={{
        scale: { type: "spring", stiffness: 120, damping: 16, mass: 0.9 },
        opacity: flicker ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.5 },
      }}
    >
      <div ref={vibration} className="size-full will-change-transform">
        <Orb controlRef={control} colors={LINCOLN_PALETTE} fill={1} hoverIntensity={0.5} rotateOnHover={false} interactive={false} />
      </div>
    </motion.div>
  );

  const sizing = cn("relative size-[180px] shrink-0 transition-[margin] duration-500 sm:size-[230px] lg:size-[260px]", collapsed && "-my-9 sm:-my-12 lg:-my-14", className);
  const glow = (
    <div aria-hidden className={cn("absolute inset-[8%] rounded-full bg-brand/20 blur-3xl transition-opacity duration-700", (status === "failed" || status === "ended" || status === "muted" || status === "denied") && "opacity-0")} />
  );

  if (onActivate) {
    return (
      <button type="button" tabIndex={-1} aria-hidden onClick={onActivate} className={cn(sizing, "cursor-pointer rounded-full outline-none")}>
        {glow}
        {surface}
      </button>
    );
  }
  return (
    <div aria-hidden className={sizing}>
      {glow}
      {surface}
    </div>
  );
}
