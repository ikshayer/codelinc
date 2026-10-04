import type { ServiceMode } from "@/lib/domain/types";

/** What audio is sent and whether it's kept — shown before the microphone is requested. */
export function VoiceDisclosure({ mode }: { mode: ServiceMode }) {
  return (
    <div className="space-y-3 px-4 py-5 md:px-6">
      <h3 className="text-lg font-semibold">Talk through your treatment plan</h3>
      {mode === "demo" ? (
        <p>
          Play a sample conversation to see how the assistant gathers details. No microphone is needed. You review every fact before comparing.
        </p>
      ) : (
        <>
          <p>
            Your voice is streamed to CareWindow&apos;s voice service so the assistant can hear you and reply. This page doesn&apos;t save audio or
            transcripts in your browser.
          </p>
          <p>
            The service&apos;s retention policy hasn&apos;t been confirmed for this prototype, so assume it may keep audio and transcripts. Use fictional
            details only.
          </p>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {mode === "demo" ? "Test microphone requests access to show your audio level. Audio stays on your device and is never recorded." : "Your browser asks for microphone access only after you select Start conversation. You can type instead at any time."}
      </p>
    </div>
  );
}
