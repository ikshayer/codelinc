import { proxyVoice } from "@/lib/server/voice";
export const runtime = "nodejs";
export async function POST(request: Request) { return proxyVoice(request, "/api/voice/sessions"); }
