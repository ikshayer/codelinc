import { proxyVoice } from "@/lib/server/voice";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  if (action !== "turns" && action !== "speech") return new Response(null, { status: 404 });
  return proxyVoice(request, `/api/voice/sessions/${encodeURIComponent(id)}/${action}`);
}
