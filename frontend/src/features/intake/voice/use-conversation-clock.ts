"use client";

import { useEffect, useState } from "react";

/** Whole seconds since the conversation connected. Freezes at the moment it ended. */
export function useElapsedSeconds(startedAt: number | null, endedAt: number | null): number {
  const [tick, setTick] = useState<{ since: number; seconds: number } | null>(null);

  useEffect(() => {
    if (startedAt === null || endedAt !== null) return;
    const update = () => setTick({ since: startedAt, seconds: Math.floor((Date.now() - startedAt) / 1000) });
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startedAt, endedAt]);

  if (startedAt === null) return 0;
  if (endedAt !== null) return Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  return tick?.since === startedAt ? tick.seconds : 0;
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
