import type { ServiceMode } from "@/lib/domain/types";

/** What audio is sent and whether it's kept — shown before the microphone is requested. */
export function VoiceDisclosure({ mode }: { mode: ServiceMode }) {
  return (
    <div className="space-y-3 px-4 py-5 md:px-6">
      <h3 className="text-base font-semibold">Before you start</h3>
      {mode === "demo" ? (
        <p>
          Demo mode plays a simulated conversation. Your microphone is used only to show it&apos;s capturing; audio never leaves this device and nothing
          is recorded.
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
        Your browser asks for microphone access only after you select Start conversation. You can type instead at any time.
      </p>
    </div>
  );
}
