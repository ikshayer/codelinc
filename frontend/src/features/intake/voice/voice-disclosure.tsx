import { LincolnAbe } from "@/components/brand/lincoln-logo";
import type { ServiceMode } from "@/lib/domain/types";

/** What audio is sent and whether it's kept — shown before the microphone is requested. */
export function VoiceDisclosure({ mode }: { mode: ServiceMode }) {
  return (
    <div className="mx-auto max-w-md space-y-2 text-center text-pretty">
      <div className="flex items-center justify-center gap-3 text-left">
        <LincolnAbe className="h-10 shrink-0" />
        <p className="max-w-xs text-sm text-muted-foreground">I&apos;m CareWindow&apos;s AI assistant. I can help gather the details from your dentist&apos;s plan and benefits.</p>
      </div>
      <h3 className="pt-1 font-display text-xl font-semibold">Talk through your treatment plan</h3>
      {mode === "demo" ? (
        <p>Play a sample conversation to see how the assistant gathers details. No microphone is needed. You review every fact before comparing.</p>
      ) : (
        <>
          <p>
            Your spoken or typed answers are sent to Google Gemini to gather details. Replies are spoken by Chatterbox on this computer. Review every
            proposed fact before comparing.
          </p>
          <p>
            This prototype keeps the conversation in memory and doesn&apos;t save recordings. Google&apos;s data policies still apply, including use of
            free-tier inputs to improve its products. Use fictional details only.
          </p>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {mode === "demo" ? "Test microphone requests access to show your audio level. Audio stays on your device and is never recorded." : "Your browser asks for microphone access only after you select Start conversation. You can type instead at any time."}
      </p>
    </div>
  );
}
