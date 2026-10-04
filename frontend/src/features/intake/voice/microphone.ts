// Microphone access. Only called after the person selects "Start conversation".

export type MicFailureKind = "blocked" | "noDevice" | "busy" | "unsupported" | "unknown";

export interface MicFailure {
  kind: MicFailureKind;
  message: string;
}

export type MicrophoneResult = { ok: true; stream: MediaStream } | { ok: false; failure: MicFailure };

function describeMicError(error: unknown): MicFailure {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return { kind: "blocked", message: "Microphone access is blocked for this site." };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return { kind: "noDevice", message: "No microphone was found on this device." };
    case "NotReadableError":
    case "AbortError":
      return { kind: "busy", message: "The microphone couldn't be started. Another app may be using it." };
    default:
      console.warn("Microphone request failed", error);
      return { kind: "unknown", message: "The microphone couldn't be started." };
  }
}

export async function requestMicrophone(): Promise<MicrophoneResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, failure: { kind: "unsupported", message: "This browser can't use a microphone here. Microphone access needs a secure (https) page." } };
  }
  try {
    return { ok: true, stream: await navigator.mediaDevices.getUserMedia({ audio: true }) };
  } catch (error) {
    return { ok: false, failure: describeMicError(error) };
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** A disabled track captures nothing. */
export function setStreamMuted(stream: MediaStream | null, muted: boolean): void {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = !muted;
  });
}
