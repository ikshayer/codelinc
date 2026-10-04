import { proxyVoice } from "@/lib/server/voice";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyVoice(request, `/api/voice/sessions/${encodeURIComponent(id)}`);
}
